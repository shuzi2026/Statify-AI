import { createServer } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import { AI_CHAT_PATH, GUEST_TEST_RESET_PATH } from "../../shared/ai-chat";
import { SHOPPING_DEMO_PATH } from "../../shared/shopping-demo";
import { createHostedApi } from "../../scripts/hosted-api";
import { createUserChat } from "../../scripts/user-chat";

const localFetch = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("only explicit preference commands write memory and recall and clear use the server visitor identity", async () => {
  const remember = vi.fn(async () => "saved" as const);
  const recall = vi.fn(async () => ["I like walks after dinner."]);
  const clear = vi.fn(async () => {});
  const upstream = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)).input.at(-1).content;
    const output = input.startsWith("What")
      ? [{ type: "function_call", name: "recall_preferences", arguments: JSON.stringify({ query: "walks", next: "show_preferences" }) }]
      : [{ type: "message", content: [{ type: "output_text", text: "Nice." }] }];
    return Response.json({ output });
  });
  vi.stubGlobal("fetch", upstream);
  const chat = createUserChat({
    apiKey: "api-key", protectedValues: ["api-key"], memory: { remember, recall, clear },
  });
  const ask = (content: string, visitor: string) => chat([{ role: "user", content }], visitor);
  await ask("I like walks after dinner.", "one");
  expect(remember).not.toHaveBeenCalled();
  expect((await ask("Remember that I like walks after dinner.", "one")).status).toBe(200);
  expect(remember).toHaveBeenCalledExactlyOnceWith("one", "I like walks after dinner.");
  expect((await ask("Remember api-key", "one")).status).toBe(400);
  expect(remember).toHaveBeenCalledTimes(1);
  expect((await ask("What do you remember about my walks?", "one")).body).toMatchObject({ reply: expect.stringContaining("after dinner") });
  expect(recall).toHaveBeenCalledExactlyOnceWith("one", "walks");
  await ask("Clear all my preferences.", "two");
  expect(clear).toHaveBeenCalledExactlyOnceWith("two");
  expect(upstream).toHaveBeenCalledTimes(2);
});

const walkPreference = "I prefer a 20 minute fixed timer for walking cards.";
const draft = {
  name: "Evening walk", category: "Exercise", method: "duration", minutes: 20,
  rewards: [], effects: [], reason: "The draft uses your usual walking timer.",
  timingEvidence: "20 minute fixed timer",
};
const existingToolCases = [
  ["propose_card", draft],
  ["edit_card", { cardName: "Evening walk", name: null, category: "Exercise", method: null, minutes: null, unit: null, message: null }],
  ["adjust_status", { changes: [{ id: "mood", mode: "set", value: 60 }] }],
  ["adjust_initial_levels", { changes: [{ attribute: "attr-body", value: 40 }] }],
  ["read_activity", { view: "check_ins", period: "all", from: null, to: null, cardName: "Evening walk", attribute: null, status: null, keyword: null }],
  ["start_card", { cardName: "Evening walk" }],
  ["record_card", { cardName: "Evening walk", minutes: 20, quantity: null, note: null, measurementEvidence: "20 minute fixed timer" }],
  ["append_journal_note", { cardName: "Evening walk", date: null, note: "It felt easy." }],
  ["open_dish_soap_shopping_card", {}],
] as const;

function toolResponse(name: string, args: unknown) {
  return Response.json({ output: [{ type: "function_call", name, call_id: `call_${name}`, arguments: JSON.stringify(args) }] });
}

test.each(existingToolCases)("hands recalled preferences to %s through the existing route", async (name, args) => {
  const recall = vi.fn(async () => [walkPreference, "old secret"]);
  const chat = createUserChat({ apiKey: "test", channel3ApiKey: "catalog", protectedValues: ["old secret"],
    memory: { recall, remember: async () => "saved", clear: async () => {} } });
  const upstream = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(toolResponse("recall_preferences", { query: "walk preference", next: name }))
    .mockImplementationOnce(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.tools.map(({ name }: { name: string }) => name)).toEqual([name]);
      expect(request.input.at(-1)).toEqual({
        type: "function_call_output", call_id: "call_recall_preferences",
        output: JSON.stringify({ preferences: [walkPreference] }),
      });
      return toolResponse(name, args);
    });
  vi.stubGlobal("fetch", upstream);
  const messages = [{ role: "user", content: "Use my usual preferences for this request. It felt easy." }];
  const response = await chat(messages, "visitor-1");
  expect(response.status).toBe(200);
  if (name === "open_dish_soap_shopping_card") expect(response.body).toHaveProperty("openShoppingCard");
  else if (name === "record_card") expect(response.body).toEqual({
    operation: { type: "record_card", cardName: "Evening walk", minutes: null, quantity: null, note: null },
  });
  else expect(response.body).toMatchObject({ operation: { type: name } });
  expect(recall).toHaveBeenCalledExactlyOnceWith("visitor-1", "walk preference");
  expect(upstream).toHaveBeenCalledTimes(2);
});

test("uses a preference for merchant keywords while keeping the tool call chain intact", async () => {
  const preference = "I prefer Dawn Ultra Original 18 fl oz.";
  const chat = createUserChat({ apiKey: "test", channel3ApiKey: "catalog", protectedValues: ["catalog"],
    memory: { recall: async () => [preference], remember: async () => "saved", clear: async () => {} } });
  const product = "Dawn Ultra Original 18 fl oz";
  const upstream = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(toolResponse("recall_preferences", { query: "dish soap", next: "search_products" }))
    .mockResolvedValueOnce(toolResponse("search_products", { query: product, url: null }))
    .mockImplementationOnce(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ query: product, limit: 8 });
      return Response.json({ products: [{ title: product, offers: [{
        domain: "example.com", price: { price: 3.49, currency: "USD" }, availability: "InStock", url: "https://example.com/soap",
      }] }] });
    })
    .mockImplementationOnce(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.tools).toEqual([expect.objectContaining({ name: "select_product_matches" })]);
      expect(request.input.filter(({ type }: { type?: string }) => type === "function_call_output")
        .map(({ call_id }: { call_id: string }) => call_id)).toEqual(["call_recall_preferences", "call_search_products"]);
      return toolResponse("select_product_matches", { matches: [] });
    });
  vi.stubGlobal("fetch", upstream);
  expect((await chat([{ role: "user", content: "Look up prices for my usual dish soap." }], "visitor-1")).body)
    .toEqual({ reply: "I couldn't find an in-stock product matching your request." });
  expect(upstream).toHaveBeenCalledTimes(4);
});

test("rejects an action chosen only after recall and asks about timing without permission to reuse a preference", async () => {
  const chat = createUserChat({ apiKey: "test", protectedValues: [],
    memory: { recall: async () => [walkPreference], remember: async () => "saved", clear: async () => {} } });
  const upstream = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(toolResponse("recall_preferences", { query: "walk", next: "reply" }))
    .mockResolvedValueOnce(toolResponse("start_card", { cardName: "Evening walk" }))
    .mockResolvedValueOnce(toolResponse("recall_preferences", { query: "walk", next: "propose_card" }))
    .mockResolvedValueOnce(toolResponse("propose_card", draft));
  vi.stubGlobal("fetch", upstream);
  expect((await chat([{ role: "user", content: "Give me some advice about walking." }], "visitor-1")).body)
    .toEqual({ error: "invalid_operation" });
  expect((await chat([{ role: "user", content: "Make a walking card." }], "visitor-1")).body)
    .toMatchObject({ reply: expect.stringContaining("fixed time goal") });
});

test("visitors can chat concurrently and have independent daily quotas that do not limit shopping", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const upstream = vi.fn(async (_url: string, init: RequestInit) => {
    await waiting;
    const content = JSON.parse(String(init.body)).input[0].content;
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: content }] }] });
  });
  vi.stubGlobal("fetch", upstream);
  let api: ReturnType<typeof createHostedApi>;
  const server = createServer((request, response) => {
    void api.handle(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local server");
  const origin = `http://127.0.0.1:${address.port}`;
  api = createHostedApi({ origin: new URL(origin), signingKey: "test-signing-key", apiKey: "test-openai-key", dailyVisitorLimit: 1,
    channel3ApiKey: "test-channel3-key", paypal: { clientId: "test-client", secret: "test-secret" } });
  const url = origin + AI_CHAT_PATH;
  const post = (cookie: string, content: string, from = origin) => localFetch(url, {
    method: "POST", headers: { Cookie: cookie, Origin: from, "Content-Type": "application/json" },
    body: JSON.stringify([{ role: "user", content }]),
  });
  try {
    const newVisitor = async () => (await localFetch(url)).headers.get("set-cookie")?.split(";")[0] ?? "";
    const [first, second] = await Promise.all([newVisitor(), newVisitor()]);
    expect(first).toMatch(/^statify_demo_visitor=/);
    expect(second).not.toBe(first);
    expect((await post("", "no session")).status).toBe(403);
    expect((await post(first, "wrong origin", "https://example.com")).status).toBe(403);
    const one = post(first, "first visitor");
    const two = post(second, "second visitor");
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
    const duplicate = await post(first, "duplicate");
    expect(duplicate.status).toBe(429);
    expect(await duplicate.json()).toEqual({ error: "busy" });
    release();
    expect(await (await one).json()).toEqual({ reply: "first visitor" });
    expect(await (await two).json()).toEqual({ reply: "second visitor" });
    const exhausted = await post(first, "over the limit");
    expect(exhausted.status).toBe(429);
    expect(Number(exhausted.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await exhausted.json()).toEqual({ error: "visitor_daily_limit" });
    expect(upstream).toHaveBeenCalledTimes(2);
    const shopping = await localFetch(origin + SHOPPING_DEMO_PATH, {
      method: "POST", headers: { Cookie: first, Origin: origin, "Content-Type": "application/json" }, body: "{}",
    });
    expect(await shopping.json()).toEqual({ error: "invalid_shopping_request" });
    expect((await localFetch(origin + GUEST_TEST_RESET_PATH, { method: "POST", headers: { Origin: origin } })).status).toBe(404);
    const dayMs = 86_400_000;
    vi.spyOn(Date, "now").mockReturnValue((Math.floor(Date.now() / dayMs) + 1) * dayMs);
    expect(await (await post(first, "next day")).json()).toEqual({ reply: "next day" });
  } finally {
    release();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
