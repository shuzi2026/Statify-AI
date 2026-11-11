import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { AI_CHAT_DEVELOPER_PATH, AI_CHAT_DEVELOPER_SESSION_PATH, AI_CHAT_PATH, AI_CHAT_STREAM } from "../../shared/ai-chat";
import { streamLines } from "../../shared/text-stream";
import { aiChatPlugin } from "../../scripts/ai-chat-server";
import { developerMemoryFile, prepareDeveloperWorkspace } from "../../scripts/ai-developer-workspace";

const engine = vi.hoisted(() => ({
  list: vi.fn(), workspace: vi.fn(), create: vi.fn(), history: vi.fn(), ask: vi.fn(), close: vi.fn(),
}));
vi.mock("../../scripts/ai-opencode", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../scripts/ai-opencode")>(),
  createOpenCodeAgent: () => engine,
}));

const localFetch = globalThis.fetch;
let server: ViteDevServer;
let origin: string;
const developerPassphrase = "test-developer-passphrase";
const managementToolNames = [
  "manage_meter", "manage_plan", "manage_attribute", "manage_card", "edit_card_rules",
  "manage_journal", "manage_timer", "edit_preferences", "edit_appearance",
];

beforeAll(async () => {
  const walkSkill = await readFile(new URL("../../skills/walk-check-in/SKILL.md", import.meta.url), "utf8");
  server = await createServer({
    configFile: false,
    server: { host: "127.0.0.1", port: 0, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [aiChatPlugin({ apiKey: "test-key", developerPassphrase, developerState: "test-workspace", walkSkill })],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Expected a loopback port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => server?.close());
afterEach(() => vi.unstubAllGlobals());

function post(messages: unknown, requestOrigin = origin, path = AI_CHAT_PATH, token?: string) {
  return localFetch(origin + path, {
    method: "POST",
    headers: { Origin: requestOrigin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(messages),
  });
}

test("passes recent dialogue to Responses and returns only the assistant text", async () => {
  const messages = [
    { role: "user", content: "My name is Jo." },
    { role: "assistant", content: "Nice to meet you, Jo." },
    { role: "user", content: "What is my name?" },
  ];
  const upstream = vi.fn(async (_url: string, request: RequestInit) => {
    expect(request.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "gpt-6.1-sol",
      input: messages,
      instructions: expect.stringContaining("the user's data persona in Statify AI"),
      store: false,
      max_output_tokens: 2048,
    });
    expect(JSON.parse(String(request.body)).instructions).toContain("separate from the user's saved preferences");
    expect(JSON.parse(String(request.body)).tools).toEqual([
      expect.objectContaining({ name: "propose_card", strict: true }),
      expect.objectContaining({ name: "read_profile", strict: true }),
      expect.objectContaining({ name: "edit_profile", strict: true }),
      expect.objectContaining({ name: "edit_card", strict: true }),
      expect.objectContaining({ name: "adjust_status", strict: true }),
      expect.objectContaining({ name: "adjust_initial_levels", strict: true }),
      expect.objectContaining({ name: "read_activity", strict: true }),
      expect.objectContaining({ name: "start_card", strict: true }),
      expect.objectContaining({ name: "record_card", strict: true }),
      expect.objectContaining({ name: "append_journal_note", strict: true }),
      ...managementToolNames.map((name) => expect.objectContaining({ name, strict: true })),
    ]);
    return Response.json({ output: [
      { type: "reasoning", summary: [{ text: "Not displayed" }] },
      { type: "message", phase: "commentary", content: [{ type: "output_text", text: "Checking the conversation." }] },
      { type: "message", phase: "final_answer", content: [{ type: "output_text", text: "Your name is Jo." }] },
    ] });
  });
  vi.stubGlobal("fetch", upstream);

  const status = await localFetch(origin + AI_CHAT_PATH);
  expect(await status.json()).toEqual({ configured: true, model: "gpt-6.1-sol", developerConfigured: true });
  const response = await post(messages);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reply: "Your name is Jo." });
  expect(upstream).toHaveBeenCalledExactlyOnceWith("https://api.openai.com/v1/responses", expect.any(Object));
});

test("lets the model answer identity questions in the visitor's learned style", async () => {
  const messages = [{ role: "user", content: "你到底谁呀？" }];
  const reply = "我是你在 Statify 里的数据人格。你记下来的事，我可以陪你一起回看。";
  const upstream = vi.fn(async (_url: string, request: RequestInit) => {
    const { instructions, input } = JSON.parse(String(request.body));
    expect(input).toEqual(messages);
    expect(instructions).toContain("one or two natural sentences");
    expect(instructions).toContain("short clauses, casual conversational phrasing");
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: reply }] }] });
  });
  vi.stubGlobal("fetch", upstream);
  const response = await post({
    messages, voice: { samples: 5, clauseLength: 10, multiline: 0, casual: 60, polite: 0, expressive: 0 },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reply });
  expect(upstream).toHaveBeenCalledTimes(1);
});

test("accepts a verbatim reflection and rejects model-invented journal text", async () => {
  const upstream = vi.fn<typeof fetch>();
  for (const note of ["It felt easier this time.", "My knee hurt."]) {
    upstream.mockResolvedValueOnce(Response.json({ output: [{
      type: "function_call", name: "append_journal_note",
      arguments: JSON.stringify({ cardName: null, date: null, note }),
    }] }));
  }
  vi.stubGlobal("fetch", upstream);
  const messages = [{ role: "user", content: "Add this to my journal: It felt easier this time." }];
  expect(await (await post(messages)).json()).toEqual({
    operation: { type: "append_journal_note", cardName: null, date: null, note: "It felt easier this time." },
  });
  expect((await post(messages)).status).toBe(502);
});

test("sends visible text before completion, excluding commentary and split credentials", async () => {
  const encoder = new TextEncoder();
  let finish: () => void = () => {};
  const upstream = vi.fn(async (_url, request) => {
    expect(JSON.parse(String(request.body))).toMatchObject({ stream: true });
    const body = new ReadableStream({
      start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
        send({ type: "response.output_item.added", output_index: 0, item: { type: "message", phase: "commentary" } });
        send({ type: "response.output_text.delta", output_index: 0, delta: "internal" });
        send({ type: "response.output_item.added", output_index: 1, item: { type: "message", phase: "final_answer" } });
        send({ type: "response.output_text.delta", output_index: 1, delta: "你好 test-" });
        finish = () => {
          send({ type: "response.output_text.delta", output_index: 1, delta: "key" });
          send({ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "你好 test-key" }] }] } });
          controller.close();
        };
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  });
  vi.stubGlobal("fetch", upstream);
  const response = await localFetch(origin + AI_CHAT_PATH, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", Accept: AI_CHAT_STREAM },
    body: JSON.stringify([{ role: "user", content: "Say hi" }]),
    signal: AbortSignal.timeout(3000),
  });
  expect(response.headers.get("Content-Type")).toContain(AI_CHAT_STREAM);
  const events = streamLines(response.body!);
  try {
    expect(JSON.parse((await events.next()).value!)).toEqual({ type: "text", delta: "你好 " });
  } finally {
    finish();
  }
  expect(JSON.parse((await events.next()).value!)).toEqual({ type: "text", delta: "[redacted]" });
  expect(JSON.parse((await events.next()).value!)).toEqual({ type: "result", status: 200, body: { reply: "你好 [redacted]" } });
  await events.return(undefined);
});

test("provides the walking skill and phase with no local journal identifier", async () => {
  const messages = [{ role: "user", content: "It felt great." }];
  const upstream = vi.fn<typeof fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    expect(request.input).toEqual(messages);
    expect(request.instructions).toContain("name: walk-check-in");
    expect(request.instructions).toContain("The walking reflection target is already selected.");
    return Response.json({ output: [{
      type: "function_call", name: "append_journal_note",
      arguments: JSON.stringify({ cardName: null, date: null, note: "It felt great." }),
    }] });
  });
  vi.stubGlobal("fetch", upstream);
  const response = await post({ messages, walkPhase: "reflection" });
  expect(await response.json()).toEqual({
    operation: { type: "append_journal_note", cardName: null, date: null, note: "It felt great." },
  });
});

const walkDraft = {
  name: "每天散步", category: "Exercise", method: "duration", minutes: 20,
  rewards: [{ id: "attr-body", amount: 15 }], effects: [{ id: "mood", amount: 3 }],
  reason: "轻松走二十分钟，可以用少量体魄经验和心情点数记录。",
};
const walkTiming = "固定计时20分钟";

test.each([
  ["read_profile", { field: "age" }, 200],
  ["edit_profile", { name: "  Sky  ", age: 29 }, 200],
  ["edit_profile", { name: null, age: 121 }, 502],
])("validates %s against local profile limits", async (name, args, status) => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ output: [{
    type: "function_call", name, call_id: "profile", arguments: JSON.stringify(args),
  }] })));
  const response = await post([{ role: "user", content: "Check my local profile." }]);
  expect(response.status).toBe(status);
  if (status === 200) {
    const expected = name === "edit_profile" ? { name: "Sky", age: 29 } : args;
    expect(await response.json()).toMatchObject({ operation: { type: name, ...expected } });
  }
});

test("returns a card draft instead of claiming it was saved", async () => {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ output: [
    { type: "function_call", name: "propose_card", call_id: "call_draft", arguments: JSON.stringify({ ...walkDraft, name: " 每天散步 ", timingEvidence: walkTiming }) },
    { type: "message", content: [{ type: "output_text", text: "Saved!" }] },
  ] }));
  vi.stubGlobal("fetch", upstream);
  const response = await post([{ role: "user", content: `帮我新建一张每天散步的卡，${walkTiming}` }]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ operation: { type: "propose_card", ...walkDraft } });
  expect(upstream).toHaveBeenCalledTimes(1);
});

test("asks about timing when the model tries to draft without a stated preference", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ output: [
    { type: "function_call", name: "propose_card", call_id: "call_draft", arguments: JSON.stringify({ ...walkDraft, timingEvidence: "每天散步" }) },
  ] })));
  const response = await post([{ role: "user", content: "帮我新建一张每天散步的卡" }]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reply: expect.stringContaining("目标时长") });
});

test.each([
  JSON.stringify({ ...walkDraft, timingEvidence: walkTiming, name: " " }),
  JSON.stringify({ ...walkDraft, timingEvidence: walkTiming, minutes: null }),
  JSON.stringify({ ...walkDraft, timingEvidence: walkTiming, effects: [{ id: "mood", amount: 101 }] }),
  JSON.stringify({ ...walkDraft, timingEvidence: walkTiming, rewards: [...walkDraft.rewards, ...walkDraft.rewards] }),
  'not JSON',
])(
  "rejects invalid card arguments %s",
  async (args) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ output: [
      { type: "function_call", name: "propose_card", call_id: "call_draft", arguments: args },
    ] })));
    const response = await post([{ role: "user", content: "Create a walk card" }]);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "invalid_operation" });
  },
);

test.each([
  { prompt: "Find SPAM Classic 340 g", args: { query: "SPAM Classic 340 g", url: null }, endpoint: "search", payload: { query: "SPAM Classic 340 g", limit: 8 } },
  { prompt: "Check https://www.walmart.com/ip/10290926", args: { query: null, url: "https://www.walmart.com/ip/10290926" }, endpoint: "lookup", payload: { url: "https://www.walmart.com/ip/10290926" } },
])("looks up merchant offers for $prompt through Channel3", async ({ prompt, args, endpoint, payload }) => {
  const preview = await createServer({
    configFile: false,
    server: { host: "127.0.0.1", port: 0, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [aiChatPlugin({ apiKey: "test-key", channel3ApiKey: "catalog-test-key" })],
  });
  try {
    await preview.listen();
    const address = preview.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Expected a loopback port");
    const url = `http://127.0.0.1:${address.port}`;
    const call = { type: "function_call", name: "search_products", call_id: "call_1", arguments: JSON.stringify(args) };
    const candidate = { title: "SPAM Classic 340 g", category: null, offers: [
      { domain: "walmart.com", price: { price: 4.14, currency: "USD" }, availability: "InStock", url: "https://www.walmart.com/ip/10290926" },
      { domain: "example.test", price: { price: 3, currency: "USD" }, url: "javascript:alert(1)" },
    ] };
    const upstream = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ output: [call] }))
      .mockResolvedValueOnce(Response.json(endpoint === "lookup" ? { product: candidate } : { products: [candidate] }))
      .mockResolvedValueOnce(Response.json({ output: [{ type: "function_call", name: "select_product_matches", arguments: '{"matches":[{"index":0,"kind":"Luncheon meat"}]}' }] }));
    vi.stubGlobal("fetch", upstream);

    const response = await localFetch(url + AI_CHAT_PATH, {
      method: "POST",
      headers: { Origin: url, "Content-Type": "application/json" },
      body: JSON.stringify([{ role: "user", content: prompt }]),
    });
    expect(await response.json()).toMatchObject({
      comparison: {
        query: "SPAM Classic 340 g",
        offers: [{ merchant: "walmart.com", productTitle: "SPAM Classic 340 g", kind: "Luncheon meat", cents: 414,
          url: "https://www.walmart.com/ip/10290926", quoteToken: "" }],
      },
    });
    expect(upstream.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/responses", `https://api.trychannel3.com/v1/${endpoint}`, "https://api.openai.com/v1/responses",
    ]);
    const [first, search, followup] = upstream.mock.calls.map(([, request]) => request);
    expect(JSON.parse(String(first?.body)).tools).toEqual([
      expect.objectContaining({ name: "propose_card" }),
      expect.objectContaining({ name: "read_profile" }),
      expect.objectContaining({ name: "edit_profile" }),
      expect.objectContaining({ name: "edit_card" }),
      expect.objectContaining({ name: "adjust_status" }),
      expect.objectContaining({ name: "adjust_initial_levels" }),
      expect.objectContaining({ name: "read_activity" }),
      expect.objectContaining({ name: "start_card" }),
      expect.objectContaining({ name: "record_card" }),
      expect.objectContaining({ name: "append_journal_note" }),
      ...managementToolNames.map((name) => expect.objectContaining({ name })),
      expect.objectContaining({ name: "search_products" }),
      expect.objectContaining({ name: "open_dish_soap_shopping_card" }),
    ]);
    expect(search?.headers).toMatchObject({ "x-api-key": "catalog-test-key" });
    expect(JSON.parse(String(search?.body))).toEqual(payload);
    expect(String(first?.body) + String(followup?.body)).not.toContain("catalog-test-key");
    expect(String(followup?.body)).not.toContain("javascript:");
    const followupBody = JSON.parse(String(followup?.body));
    expect(followupBody.tools).toEqual([expect.objectContaining({ name: "select_product_matches", strict: true })]);
    // OpenAI validates JSON Schema patterns without JavaScript's Unicode regex flags.
    const kindPattern = followupBody.tools[0].parameters.properties.matches.items.properties.kind.pattern;
    expect(new RegExp(kindPattern).test("Toothpaste")).toBe(true);
    expect(new RegExp(kindPattern).test("Dish soap")).toBe(true);
    expect(new RegExp(kindPattern).test("https://example.com")).toBe(false);
    expect(followupBody.input.at(-1)).toMatchObject({ type: "function_call_output", call_id: "call_1" });
    expect(JSON.parse(followupBody.input.at(-1).output)).toEqual({
      products: [{ index: 0, title: "SPAM Classic 340 g" }],
    });
  } finally {
    await preview.close();
  }
});

test("routes only unlocked developer requests to OpenCode and reopens its stored threads", async () => {
  const upstream = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", upstream);
  const thread = { id: "ses_test123", title: "Action flow" };
  const ask = { content: "Explain the action flow.", mode: "plan" };
  engine.list.mockResolvedValueOnce([]).mockResolvedValue([thread]);
  engine.workspace.mockResolvedValue("isolated-workspace");
  engine.create.mockResolvedValue(thread);
  engine.ask.mockResolvedValue({ reply: "Checked.", toolsUsed: ["grep", "read"] });
  engine.history.mockResolvedValue([{ role: "user", content: ask.content }, { role: "assistant", content: "Checked." }]);

  expect((await post(ask, origin, AI_CHAT_DEVELOPER_PATH)).status).toBe(401);
  expect((await post({ passphrase: "wrong" }, origin, AI_CHAT_DEVELOPER_SESSION_PATH)).status).toBe(403);
  expect((await post([{ role: "user", content: developerPassphrase }])).status).toBe(400);
  expect(engine.list).not.toHaveBeenCalled();

  const unlocked = await post({ passphrase: developerPassphrase }, origin, AI_CHAT_DEVELOPER_SESSION_PATH);
  expect(unlocked.status).toBe(200);
  const { token, messages } = await unlocked.json();
  expect(messages).toEqual([]);
  expect((await post({ content: developerPassphrase }, origin, AI_CHAT_DEVELOPER_PATH, token)).status).toBe(400);

  const reply = await post(ask, origin, AI_CHAT_DEVELOPER_PATH, token);
  expect(await reply.json()).toEqual({ reply: "Checked.", toolsUsed: ["grep", "read"], thread: thread.id, threads: [thread] });
  expect(engine.ask).toHaveBeenCalledExactlyOnceWith(thread.id, ask.content, "plan", expect.any(AbortSignal));
  expect(upstream).not.toHaveBeenCalled();

  await post({}, origin, AI_CHAT_DEVELOPER_SESSION_PATH, token);
  expect((await post(ask, origin, AI_CHAT_DEVELOPER_PATH, token)).status).toBe(401);
  const unlockedAgain = await post({ passphrase: developerPassphrase }, origin, AI_CHAT_DEVELOPER_SESSION_PATH);
  const resumed = await unlockedAgain.json();
  expect(resumed.thread).toBe(thread.id);
  expect(resumed.messages).toEqual(await engine.history());
  expect(resumed.token).not.toBe(token);

  engine.create.mockResolvedValueOnce({ id: "ses_new456", title: "New session" });
  const created = await post({ action: "new" }, origin, AI_CHAT_DEVELOPER_PATH, resumed.token);
  expect(await created.json()).toMatchObject({ thread: "ses_new456", messages: [] });
});

test("rejects cross-origin and invalid-role requests before contacting OpenAI", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);

  expect((await post([{ role: "user", content: "Hello" }], "https://example.test")).status).toBe(403);
  expect((await post([{ role: "system", content: "Invalid role" }])).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

test("reports exhausted credits without leaking the upstream error or retrying", async () => {
  const upstream = vi.fn(async () => Response.json({
    error: { code: "credit_balance_exhausted", message: "Upstream details" },
  }, { status: 429 }));
  vi.stubGlobal("fetch", upstream);

  const response = await post([{ role: "user", content: "Hello" }]);
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "quota" });
  expect(upstream).toHaveBeenCalledTimes(1);
});

test("copies only project files and refreshes the source without overwriting developer edits or memory", async () => {
  const temp = await mkdtemp(join(tmpdir(), "statify-developer-test-"));
  try {
    const root = join(temp, "project");
    const state = join(temp, "state");
    await mkdir(root);
    execFileSync("git", ["init", "--quiet"], { cwd: root, windowsHide: true });
    const secret = "private-test-value";
    await writeFile(join(root, "source.ts"), "export const version = 1;\n");
    await writeFile(join(root, ".env.local"), secret);
    await writeFile(join(root, "local.md"), secret);
    await writeFile(join(root, "exported-player.json"), '{"version":"0.2.2","profile":{"name":"Test"},"actions":[]}');

    const workspace = await prepareDeveloperWorkspace(root, state, [secret]);
    expect((await readdir(workspace)).sort()).toEqual([".git", developerMemoryFile, "source.ts"].sort());
    await writeFile(join(workspace, developerMemoryFile), "A project decision");
    await writeFile(join(root, "source.ts"), "export const version = 2;\n");
    await prepareDeveloperWorkspace(root, state, [secret]);
    expect(await readFile(join(workspace, "source.ts"), "utf8")).toContain("version = 2");
    expect(await readFile(join(workspace, developerMemoryFile), "utf8")).toBe("A project decision");

    await writeFile(join(workspace, "source.ts"), "export const version = 3;\n");
    await writeFile(join(root, "source.ts"), "export const version = 4;\n");
    await prepareDeveloperWorkspace(root, state, [secret]);
    expect(await readFile(join(workspace, "source.ts"), "utf8")).toContain("version = 3");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("reviews actual workspace diffs and applies only a fresh authenticated selection", async () => {
  const temp = await mkdtemp(join(tmpdir(), "statify-review-test-"));
  let preview: ViteDevServer | undefined;
  try {
    const root = join(temp, "project");
    const state = join(temp, "state");
    await mkdir(root);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8" });
    git("init", "--quiet");
    git("config", "core.autocrlf", "false");
    for (const file of ["selected.ts", "removed.ts", "conflict.ts"]) {
      await writeFile(join(root, file), "export const value = 1;\r\n");
    }
    git("add", "--", ".");
    const indexBefore = git("ls-files", "--stage");
    const workspace = await prepareDeveloperWorkspace(root, state, ["test-key", developerPassphrase]);
    const edit = (file: string, value: number) =>
      writeFile(join(workspace, file), "export const value = " + value + ";\r\n");
    await edit("selected.ts", 2);
    await edit("新增 notes.ts", 2);
    await edit("conflict.ts", 2);
    await unlink(join(workspace, "removed.ts"));
    await writeFile(join(workspace, "private.md"), "test-key");
    await writeFile(join(root, "conflict.ts"), "export const value = 99;\r\n");

    engine.list.mockResolvedValue([]);
    engine.workspace.mockResolvedValue(workspace);
    preview = await createServer({
      root, configFile: false,
      server: { host: "127.0.0.1", port: 0, hmr: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [aiChatPlugin({ apiKey: "test-key", developerPassphrase, developerState: state })],
    });
    await preview.listen();
    const address = preview.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Expected a loopback port");
    const url = "http://127.0.0.1:" + address.port;
    function request(body: object, token?: string, path = AI_CHAT_DEVELOPER_PATH) {
      return localFetch(url + path, {
        method: "POST",
        headers: { Origin: url, "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
        body: JSON.stringify(body),
      });
    }
    expect((await request({ action: "review" })).status).toBe(401);
    const { token } = await (await request({ passphrase: developerPassphrase }, undefined, AI_CHAT_DEVELOPER_SESSION_PATH)).json();
    expect((await request({ action: "apply", review: "a".repeat(48), paths: ["selected.ts"] }, token)).status).toBe(409);
    const review = await (await request({ action: "review" }, token)).json();
    expect(review.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "selected.ts", kind: "modified", state: "ready", diff: expect.stringContaining("+export const value = 2;") }),
      expect.objectContaining({ path: "新增 notes.ts", kind: "added", state: "ready" }),
      expect.objectContaining({ path: "removed.ts", kind: "deleted", state: "ready" }),
      expect.objectContaining({ path: "conflict.ts", state: "conflict" }),
      { path: "private.md", kind: "added", state: "unsupported" },
    ]));
    expect(await readFile(join(root, "selected.ts"), "utf8")).toContain("value = 1");

    await edit("selected.ts", 3);
    const stale = await request({ action: "apply", review: review.id, paths: ["新增 notes.ts", "selected.ts"] }, token);
    expect(await stale.json()).toMatchObject({ error: "review_stale", path: "selected.ts" });
    await expect(readFile(join(root, "新增 notes.ts"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const updated = await (await request({ action: "review" }, token)).json();
    await writeFile(join(root, "removed.ts"), "export const value = 7;\r\n");
    const conflict = await request({ action: "apply", review: updated.id, paths: ["selected.ts", "removed.ts"] }, token);
    expect(await conflict.json()).toMatchObject({ error: "review_conflict", path: "removed.ts" });
    expect(await readFile(join(root, "selected.ts"), "utf8")).toContain("value = 1");

    await writeFile(join(root, "removed.ts"), "export const value = 1;\r\n");
    const fresh = await (await request({ action: "review" }, token)).json();
    const paths = ["selected.ts", "新增 notes.ts", "removed.ts"];
    const applied = await request({ action: "apply", review: fresh.id, paths }, token);
    expect(await applied.json()).toEqual({ applied: paths, baselineUpdated: true });
    expect(await readFile(join(root, "selected.ts"), "utf8")).toBe("export const value = 3;\r\n");
    expect(await readFile(join(root, "新增 notes.ts"), "utf8")).toBe("export const value = 2;\r\n");
    await expect(readFile(join(root, "removed.ts"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(root, "conflict.ts"), "utf8")).toContain("value = 99");
    expect(git("ls-files", "--stage")).toBe(indexBefore);
    const remaining = await (await request({ action: "review" }, token)).json();
    expect(remaining.files.map((file: { path: string }) => file.path)).toEqual(["conflict.ts", "private.md"]);
  } finally {
    await preview?.close();
    await rm(temp, { recursive: true, force: true });
  }
});
