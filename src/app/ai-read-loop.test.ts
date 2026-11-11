import { afterEach, expect, it, vi } from "vitest";
import { createUserChat } from "../../scripts/user-chat";
import { AI_READ_LIMIT, aiReadObservation } from "../../shared/ai-chat";
import { fresh } from "../model";
import { savePurchasedShoppingCard } from "../cards/shopping-card";
import { continueLocalReads } from "./ai-read-loop";
import { observeLocalRead } from "./ai-read-observation";
import type { SaveScope, SaveSnapshot } from "../save-publication";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const now = new Date(2026, 10, 11, 12).getTime();
const query = { type: "read_activity" as const, view: "purchases" as const, period: "all" as const,
  from: null, to: null, cardName: null, attribute: null, status: null, keyword: null, offset: null };
const tool = (args: object = query, name = "read_activity") => {
  const { type: _type, ...parameters } = args as Record<string, unknown>;
  return Response.json({ output: [{ type: "function_call", name, call_id: `call_${Math.random()}`,
    arguments: JSON.stringify(parameters) }] });
};
const answer = (text: string) => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text }] }] });
function fixture() {
  const state = fresh(now, "global");
  savePurchasedShoppingCard(state, { orderId: "TOOTHPASTE1234", merchant: "shop.example", cents: 599,
    product: { title: "Tom's Toothpaste 4.5oz", kind: "Toothpaste", url: "https://shop.example/paste" } },
  { now, member: false, trial: false });
  const scope: SaveScope = { database: "synthetic", draftEpoch: null, revision: 1 };
  const snapshot: SaveSnapshot = { scope, state, revision: 1 };
  return { state, scope, snapshot };
}
const messages = [{ role: "user", content: "我之前买过什么东西？" }];
const resultBody = (response: { status: number; body: unknown }) => ({ ok: response.status === 200, result: response.body });

it("feeds actual local purchase records to Sol, allows a second lookup, and answers from the observations", async () => {
  const { state, scope, snapshot } = fixture();
  const before = structuredClone(state);
  const fetcher = vi.fn<typeof fetch>()
    .mockImplementationOnce(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "low" } });
      expect(request.instructions).toContain("view=purchases");
      const read = request.tools.find((tool: { name: string }) => tool.name === "read_activity");
      expect(read.parameters.required).toContain("offset");
      return tool();
    })
    .mockImplementationOnce(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual(["read_profile", "read_activity"]);
      const observation = JSON.parse(request.input.at(-1).output);
      expect(observation).toMatchObject({ count: 1, truncated: false });
      expect(observation.rows[0]).toContain("Tom's Toothpaste");
      expect(observation.rows[0]).toContain("US$5.99");
      expect(observation.rows[0]).toContain("https://shop.example/paste");
      return tool({ field: "name" }, "read_profile");
    })
    .mockImplementationOnce(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.input.filter((item: { type: string }) => item.type === "function_call_output")).toHaveLength(2);
      expect(JSON.parse(request.input.at(-1).output).rows[0]).toContain(state.profile.name);
      return answer("你买过一款牙膏，花费 US$5.99。商品链接：https://shop.example/paste");
    });
  vi.stubGlobal("fetch", fetcher);
  const chat = createUserChat({ apiKey: "test-key", protectedValues: [], dailyVisitorLimit: 1 });
  const initial = resultBody(await chat(messages, "visitor-a"));
  const final = await continueLocalReads(initial, { scope, current: () => snapshot, chinese: true, now: () => now,
    send: async (body) => resultBody(await chat(body, "visitor-a")) });
  expect(final.ok).toBe(true);
  expect(final.result.reply).toContain("US$5.99");
  expect(final.local?.context).toContain("Tom's Toothpaste");
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(state).toEqual(before);
  expect(await chat(messages, "visitor-a")).toMatchObject({ status: 429, body: { error: "visitor_daily_limit" } });
});

it("returns no-match evidence so the model can broaden a filter instead of prematurely giving up", async () => {
  const { scope, snapshot } = fixture();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tool({ ...query, keyword: "does not exist" }))
    .mockImplementationOnce(async (_url, init) => {
      expect(JSON.parse(JSON.parse(String(init?.body)).input.at(-1).output).count).toBe(0);
      return tool(query);
    }).mockResolvedValueOnce(answer("查到了牙膏购买记录，US$5.99。"));
  vi.stubGlobal("fetch", fetcher);
  const chat = createUserChat({ apiKey: "test-key", protectedValues: [] });
  const final = await continueLocalReads(resultBody(await chat(messages, "a")), { scope, current: () => snapshot,
    chinese: true, now: () => now, send: async (body) => resultBody(await chat(body, "a")) });
  expect(final.result.reply).toContain("US$5.99");
  expect(final.local?.context).toContain('"count":1');
});

it("binds continuations to their visitor, rejects replay and expired tokens", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(tool()).mockResolvedValueOnce(answer("Done")));
  const chat = createUserChat({ apiKey: "key", protectedValues: [] });
  const first = await chat(messages, "a");
  const observation = observeLocalRead(fixture().state, query, now, true).observation;
  const resume = { continuation: "continuation" in first.body ? first.body.continuation : "", observation };
  expect(await chat(resume, "b")).toMatchObject({ status: 409 });
  expect(await chat(resume, "a")).toMatchObject({ status: 200, body: { reply: "Done" } });
  expect(await chat(resume, "a")).toMatchObject({ status: 409 });
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(tool()));
  const next = await chat(messages, "a");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60_000);
  expect(await chat({ ...resume, continuation: "continuation" in next.body ? next.body.continuation : "" }, "a"))
    .toMatchObject({ status: 409 });
});

it("stops on save replacement and never reads the new character's data", async () => {
  const { scope, snapshot } = fixture();
  let current = snapshot;
  const send = vi.fn(async () => {
    current = { ...snapshot, scope: { ...scope } };
    return { ok: true, result: { operation: { type: "read_profile", field: "both" }, continuation: "a".repeat(43) } };
  });
  await expect(continueLocalReads({ ok: true, result: { operation: query, continuation: "a".repeat(43) } },
    { scope, current: () => current, send, chinese: true })).rejects.toThrow("存档已更新");
  expect(send).toHaveBeenCalledOnce();
});

it("forces an answer after the read budget and rejects attempted writes during a lookup", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init?.body));
    if (calls === AI_READ_LIMIT + 1) {
      expect(request.tools).toBeUndefined();
      return answer("Only a limited subset was checked.");
    }
    return tool();
  }));
  const { scope, snapshot } = fixture();
  const chat = createUserChat({ apiKey: "key", protectedValues: [] });
  expect((await continueLocalReads(resultBody(await chat(messages, "a")), { scope, current: () => snapshot,
    chinese: true, send: async (body) => resultBody(await chat(body, "a")) })).result.reply).toContain("limited subset");
  expect(calls).toBe(AI_READ_LIMIT + 1);
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(tool()).mockResolvedValueOnce(
    tool({ name: "Intruder", age: null }, "edit_profile")));
  const guarded = createUserChat({ apiKey: "key", protectedValues: [] });
  const guardedResult = await continueLocalReads(resultBody(await guarded(messages, "a")), { scope, current: () => snapshot,
    chinese: true, send: async (body) => resultBody(await guarded(body, "a")) });
  expect(guardedResult).toMatchObject({ ok: false, result: { error: "invalid_operation" } });
});

it("pages purchases and identifies truncation without uploading the whole save or card image", () => {
  const { state } = fixture();
  const entry = state.entries[0];
  state.entries = Array.from({ length: 21 }, (_, index) => ({ ...entry, id: `synthetic-${index}` }));
  const first = observeLocalRead(state, query, now, true).observation;
  expect(first).toMatchObject({ count: 21, offset: 0, truncated: true });
  expect(first.rows).toHaveLength(20);
  const second = observeLocalRead(state, { ...query, offset: 20 }, now, true).observation;
  expect(second.rows).toHaveLength(1);
  expect(second.offset).toBe(20);
  expect(aiReadObservation.safeParse(first).success).toBe(true);
  expect(JSON.stringify(first)).not.toContain("data:image");
});

it("finds English purchase records by Chinese product type and excludes ordinary shopping-named check-ins", () => {
  const { state } = fixture();
  state.entries.push({ ...state.entries[0], id: "legacy-check-in", name: "Shopping", purchase: undefined });
  const byKeyword = observeLocalRead(state, { ...query, keyword: "牙膏" }, now, true).observation;
  const byCard = observeLocalRead(state, { ...query, cardName: "牙膏" }, now, true).observation;
  expect(byKeyword.count).toBe(1);
  expect(byCard.count).toBe(1);
  expect(byKeyword.rows[0]).toContain("TOOTHPASTE1234");
  expect(byCard.rows[0]).toContain("https://shop.example/paste");
});
