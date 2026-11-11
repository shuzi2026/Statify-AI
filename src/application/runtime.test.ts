import "fake-indexeddb/auto";
import * as storage from "../storage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  db,
  load,
  mutate,
  readState,
  readRevision,
  importSave,
  refreshState,
} from "../storage";
import { saveSnapshot, subscribeSave, publishSave } from "../save-publication";
import { newCard } from "../model";
import { newPlan, savePlan } from "../planning";
import { createApplication } from "./runtime";
import { applyCommand } from "./commands";
import { applyPlanOperation } from "../app/ai-plan";

let at = new Date(2026, 10, 3, 12).getTime();
const ctx = () => ({ now: at, member: false, trial: false });
let app = createApplication(ctx);
let character = 0;
const post = vi.fn(),
  saved = vi.fn(),
  restored = vi.fn();
beforeEach(async () => {
  at = new Date(2026, 10, 3, 12).getTime() + ++character * 1000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      postMessage = post;
      close() {}
    },
  );
  window.addEventListener("statify-save-committed", saved);
  window.addEventListener("statify-cloud-restored", restored);
  await db.delete();
  await db.open();
  await load();
  await mutate((s) => {
    s.profile.onboarded = true;
    s.cards = [
      {
        ...newCard(at),
        id: "card",
        name: "Synthetic action",
        method: "instant",
        evaluate: false,
        settle: false,
      },
    ];
  });
  app = createApplication(ctx);
  vi.clearAllMocks();
});
afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("stages a reported timed check-in and applies growth only after normal settlement", async () => {
  await mutate((s) => {
    Object.assign(s.cards[0], {
      method: "duration", minutes: 20, rewards: [{ id: "attr-body", amount: 20 }],
    });
  });
  const report = {
    type: "record", cardId: "card", method: "duration",
    input: { minutes: 12, quantity: null, note: "Felt easier" },
  } as const;
  const result = await app.execute(report);
  expect(result).toMatchObject({ status: "success", value: { kind: "settlement" } });
  const staged = await readState();
  const action = staged.actions[0];
  expect(action).toMatchObject({ runningSince: null, endedAt: at, elapsed: 720_000, reported: true });
  expect(staged.entries).toHaveLength(0);
  expect(staged.attributes[0].earned).toBe(0);
  expect((await app.execute(report)).status).toBe("error");

  const settlement = {
    type: "settle", actionId: action.id,
    input: { seconds: 720, quantity: 1, rating: 1, counted: false, note: action.draft!.note },
  } as const;
  expect(await app.execute(settlement)).toMatchObject({
    status: "success", value: { reported: true, measured: 720, seconds: 720, counted: false, note: "Felt easier" },
  });
  expect(await app.execute(settlement)).toMatchObject({ status: "success", committed: false });
  const saved = await readState();
  expect(saved.entries).toHaveLength(1);
  expect(saved.entries[0].rewards[0].actual).toBeGreaterThan(0);
  expect(saved.cards[0].count).toBe(0);
});

it("can cancel a reported quantity check-in without recording or starting a timer", async () => {
  await mutate((s) => { s.cards[0].method = "quantity"; });
  await app.execute({
    type: "record", cardId: "card", method: "quantity",
    input: { minutes: null, quantity: 8, note: null },
  });
  const action = (await readState()).actions[0];
  expect(action).toMatchObject({ elapsed: 0, endedAt: at, draft: { quantity: 8 } });
  await app.execute({ type: "cancel-action", actionId: action.id });
  const saved = await readState();
  expect(saved.entries).toHaveLength(0);
  expect(saved.actions).toHaveLength(0);
  expect(saved.cards[0].count).toBe(0);
});
it("coalesces resume reads but performs a trailing read for changes arriving while one is in flight", async () => {
  const state = await readState();
  let finish!: (value: typeof state) => void;
  const read = vi.spyOn(storage,"refreshState")
    .mockImplementationOnce(() => new Promise(r => {finish = r;}))
    .mockResolvedValue(state);
  const stop = app.connect();
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("pageshow"));
  window.dispatchEvent(new Event("focus"));
  expect(read).toHaveBeenCalledOnce();
  finish(state);
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  stop(); window.dispatchEvent(new Event("focus"));
  expect(read).toHaveBeenCalledTimes(2);
});
it("resume reading still works when BroadcastChannel construction is unavailable", async () => {
  vi.stubGlobal("BroadcastChannel",class {constructor() {throw Error("unavailable");}});
  const read = vi.spyOn(storage,"refreshState").mockResolvedValue(await readState());
  const stop = app.connect(); window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce()); stop();
});

it("runs a complete start/settle use case without React or storage", async () => {
  const state = structuredClone(await readState());
  const result = applyCommand(state, { type: "start", cardId: "card" }, ctx());
  expect(result.kind).toBe("completed");
  expect(state.actions).toHaveLength(0);
  expect(state.entries).toHaveLength(1);
  expect((await readState()).entries).toHaveLength(0);
});

it("captures command input before it waits in the queue", async () => {
  const command = { type: "start" as const, cardId: "card" };
  const pending = app.execute(command);
  command.cardId = "changed-after-click";
  expect(await pending).toMatchObject({ status: "success" });
  expect((await readState()).entries[0].cardId).toBe("card");
});

it("deletes an entry and its settlement together, rejecting stale confirmation and repeat writes", async () => {
  await mutate((s) => {
    s.cards[0].rewards = [{ id: s.attributes[0].id, amount: 10 }];
  });
  await app.execute({ type: "start", cardId: "card" });
  const before = await readState();
  const command = { type: "delete-entry", entryId: before.entries[0].id } as const;
  const failed = await app.execute(command);
  if (failed.status !== "confirmation") throw Error("expected confirmation");
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(new Error("failed deletion"));
  expect(await failed.resume(true)).toMatchObject({ status: "error" });
  expect(await readState()).toEqual(before);

  const confirmed = await app.execute(command);
  const stale = await app.execute(command);
  if (confirmed.status !== "confirmation" || stale.status !== "confirmation")
    throw Error("expected confirmation");
  expect(await confirmed.resume(true)).toMatchObject({ status: "success", committed: true });
  expect((await readState()).entries).toEqual([]);
  expect((await readState()).attributes[0]).toMatchObject({ earned: 0, daily: {} });
  const revision = await readRevision();
  expect(await stale.resume(true)).toMatchObject({ status: "error", code: "conflict" });
  expect(await app.execute(command)).toMatchObject({ status: "success", committed: false });
  expect(await readRevision()).toBe(revision);
});

it("keeps unchanged committed history stable while an edited record gets a new snapshot", async () => {
  await app.execute({ type: "start", cardId: "card" });
  const before = saveSnapshot()!.state.entries;
  await app.change(s => { s.profile.name = "unrelated edit"; });
  expect(saveSnapshot()!.state.entries).toBe(before);
  await app.change(s => { s.entries[0].note = "changed record"; });
  expect(saveSnapshot()!.state.entries).not.toBe(before);
  expect(before[0].note).toBe("");
  expect(saveSnapshot()!.state.entries[0].note).toBe("changed record");
  expect((await readState()).entries).toEqual(saveSnapshot()!.state.entries);
  expect(Object.isFrozen(saveSnapshot()!.state.entries[0].rewards)).toBe(true);
});

it("settlement retry keeps the original result and failed preferences roll back with rewards", async () => {
  await mutate((s) => {
    s.cards[0].settle = true;
  });
  await app.execute({ type: "start", cardId: "card" });
  const id = (await readState()).actions[0].id;
  const command = {
    type: "settle" as const,
    actionId: id,
    input: { seconds: 0, quantity: 1, rating: 1, counted: true, note: "first" },
    rememberEarlyCompletion: true,
  };
  const before = await readState();
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(
    new Error("failed settlement"),
  );
  expect(await app.execute(command)).toMatchObject({ status: "error" });
  expect(await readState()).toEqual(before);
  const done = await app.execute(command),
    revision = await readRevision();
  expect(done).toMatchObject({ status: "success", value: { note: "first" } });
  expect(
    await app.execute({
      ...command,
      input: { ...command.input, note: "retry" },
    }),
  ).toMatchObject({
    status: "success",
    committed: false,
    value: { note: "first" },
  });
  expect(await readRevision()).toBe(revision);
  expect((await readState()).entries).toHaveLength(1);
});

it("preserves two legitimate instant actions and publishes once per commit", async () => {
  const notify = vi.fn(),
    stop = subscribeSave(notify),
    revision = await readRevision();
  try {
    const results = await Promise.all([
      app.execute({ type: "start", cardId: "card" }),
      app.execute({ type: "start", cardId: "card" }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["success", "success"]);
    const state = await readState();
    expect(state.entries).toHaveLength(2);
    expect(new Set(state.entries.map((e) => e.id)).size).toBe(2);
    expect(state.cards[0].count).toBe(2);
    expect(saveSnapshot()?.state).toEqual(state);
    expect(await readRevision()).toBe(revision + 2);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
});

it("timed double start is rejected and ending commits freeze plus settlement atomically", async () => {
  await mutate((s) => {
    s.cards[0].method = "timed";
  });
  vi.clearAllMocks();
  const results = await Promise.all([
    app.execute({ type: "start", cardId: "card" }),
    app.execute({ type: "start", cardId: "card" }),
  ]);
  expect(results.map((r) => r.status)).toEqual(["success", "error"]);
  const id = (await readState()).actions[0].id;
  at += 120000;
  vi.setSystemTime(at);
  vi.clearAllMocks();
  const revision = await readRevision();
  const [first, retry] = await Promise.all([
    app.execute({ type: "complete", actionId: id, freeze: true }),
    app.execute({ type: "complete", actionId: id, freeze: true }),
  ]);
  expect(first).toMatchObject({ status: "success", committed: true });
  expect(retry).toMatchObject({ status: "success", committed: false });
  expect((await readState()).entries).toHaveLength(1);
  expect((await readState()).actions).toHaveLength(0);
  expect(await readRevision()).toBe(revision + 1);
  expect(post).toHaveBeenCalledTimes(1);
});

it("failed final writes roll back every table and do not poison the next queued operation", async () => {
  const before = await readState(),
    revision = await readRevision(),
    notify = vi.fn(),
    stop = subscribeSave(notify);
  const put = vi
    .spyOn(db.saves, "put")
    .mockRejectedValueOnce(new Error("synthetic final write failure"));
  try {
    const failed = await app.execute({ type: "start", cardId: "card" });
    expect(failed).toMatchObject({ status: "error", recoverable: true });
    expect(await readState()).toEqual(before);
    expect(await readRevision()).toBe(revision);
    expect(notify).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    put.mockRestore();
    expect(await app.execute({ type: "start", cardId: "card" })).toMatchObject({
      status: "success",
    });
    expect((await readState()).entries).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("rejects an async draft and resumes the queue without publishing it", async () => {
  const result = await app.change(async (s) => {
    s.profile.name = "bad async";
    await Promise.resolve();
    throw Error("late rejection");
  });
  expect(result).toMatchObject({ status: "error" });
  expect(post).not.toHaveBeenCalled();
  expect((await readState()).profile.name).not.toBe("bad async");
  expect(
    await app.change((s) => {
      s.profile.name = "next";
    }),
  ).toMatchObject({ status: "success" });
});

it("rejects an async plan edit before interpreting it as a confirmation request", async () => {
  await mutate((s) =>
    savePlan(
      s,
      { ...newPlan(at), id: "async-plan", cards: [{ id: "card", target: 2 }] },
      at,
      true,
    ),
  );
  at = new Date(2026, 10, 3, 23).getTime();
  vi.setSystemTime(at);
  vi.clearAllMocks();
  const before = await readState();
  const result = await app.change(async (s) => {
    savePlan(s, { ...s.plans[0], cards: [{ id: "card", target: 3 }] }, at);
  });
  expect(result).toMatchObject({ status: "error" });
  expect(await readState()).toEqual(before);
  expect(post).not.toHaveBeenCalled();
});

it("returns confirmation without saving, and a cancelled command leaves no changes", async () => {
  const before = await readState(),
    revision = await readRevision();
  const prompt = await app.execute({
    type: "manage-card",
    cardId: "card",
    operation: "delete",
  });
  expect(prompt.status).toBe("confirmation");
  if (prompt.status !== "confirmation") throw Error("missing confirmation");
  expect(await prompt.resume(false)).toEqual({ status: "cancelled" });
  expect(await readState()).toEqual(before);
  expect(await readRevision()).toBe(revision);
  expect(post).not.toHaveBeenCalled();
});

it("deletes a card and its current plan links in one confirmed commit, retaining history", async () => {
  await app.execute({ type: "start", cardId: "card" });
  await mutate((s) =>
    savePlan(
      s,
      { ...newPlan(at), id: "plan", cards: [{ id: "card", target: 2 }] },
      at,
      true,
    ),
  );
  const before = await readState(),
    revision = await readRevision();
  vi.clearAllMocks();
  const prompt = await app.execute({
    type: "manage-card",
    cardId: "card",
    operation: "delete",
  });
  if (prompt.status !== "confirmation") throw Error("missing confirmation");
  const results = await Promise.all([prompt.resume(true), prompt.resume(true)]);
  expect(results[0]).toMatchObject({ status: "success" });
  expect(results[1]).toBe(results[0]);
  const state = await readState();
  expect(state.cards).toHaveLength(0);
  expect(state.plans[0].cards).toHaveLength(0);
  expect(state.entries).toEqual(before.entries);
  expect(state.attributes).toEqual(before.attributes);
  expect(await readRevision()).toBe(revision + 1);
  expect(post).toHaveBeenCalledTimes(1);
});

it("does not reuse a delete confirmation after local edits", async () => {
  const prompt = await app.execute({
    type: "manage-card",
    cardId: "card",
    operation: "delete",
  });
  if (prompt.status !== "confirmation") throw Error("missing confirmation");
  await app.change((s) => {
    s.cards[0].name = "edited while confirming";
  });
  vi.clearAllMocks();
  expect(await prompt.resume(true)).toMatchObject({
    status: "error",
    code: "conflict",
  });
  expect((await readState()).cards[0].name).toBe("edited while confirming");
  expect(post).not.toHaveBeenCalled();
});

it.each(["manual", "cloud"])(
  "%s replacement invalidates old confirmations and queued page scopes even for the same character ID",
  async (source) => {
    const scope = saveSnapshot()!.scope;
    const prompt = await app.execute(
      { type: "manage-card", cardId: "card", operation: "delete" },
      scope,
    );
    if (prompt.status !== "confirmation") throw Error("missing confirmation");
    const state = await readState();
    state.profile.name = "replacement";
    await app.importSave(
      JSON.stringify(state),
      source === "cloud" ? { source: "cloud", cloudOwner: "synthetic" } : {},
    );
    expect(source === "cloud" ? restored : saved).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(saveSnapshot()?.state.profile.name).toBe("replacement");
    vi.clearAllMocks();
    expect(await prompt.resume(true)).toMatchObject({
      status: "error",
      code: "conflict",
    });
    expect(
      await app.change((s) => {
        s.profile.name = "old page";
      }, scope),
    ).toMatchObject({ status: "error", code: "conflict" });
    expect((await readState()).profile.name).toBe("replacement");
    expect(post).not.toHaveBeenCalled();
  },
);

it("rejects queued edits behind a replacement without blocking the import on confirmation", async () => {
  const state = await readState(),
    scope = saveSnapshot()!.scope,
    revision = await readRevision();
  state.profile.name = "new save";
  const replacement = app.importSave(JSON.stringify(state), {
    expectedRevision: revision,
  });
  const oldEdit = app.change((s) => {
    s.profile.name = "stale edit";
  }, scope);
  await replacement;
  expect(await oldEdit).toMatchObject({ status: "error", code: "conflict" });
  expect((await readState()).profile.name).toBe("new save");
  expect(post).toHaveBeenCalledTimes(1);
});

it("keeps revision checks for competing imports and changed account guards", async () => {
  const text = JSON.stringify(await readState()),
    revision = await readRevision();
  const results = await Promise.allSettled([
    app.importSave(text, { expectedRevision: revision }),
    app.importSave(text, { expectedRevision: revision }),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  expect(post).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  await expect(
    app.importSave(text, {
      source: "cloud",
      guard: () => {
        throw Error("account changed");
      },
    }),
  ).rejects.toThrow("account changed");
  expect(post).not.toHaveBeenCalled();
  expect(restored).not.toHaveBeenCalled();
});

it("detects another tab's persisted revision before its notification arrives", async () => {
  const revision = await readRevision();
  await db.saves.update("main", { revision: revision + 1 });
  const result = await app.change((s) => {
    s.profile.name = "stale tab";
  });
  expect(result).toMatchObject({ status: "error", code: "conflict" });
  expect(saveSnapshot()?.revision).toBe(revision + 1);
  expect((await readState()).profile.name).not.toBe("stale tab");
  expect(post).not.toHaveBeenCalled();
});

it("keeps an open same-page edit valid when calendar maintenance runs first", async () => {
  const scope = saveSnapshot()!.scope;
  const previousDay = (await readState()).days.at(-1)?.date;
  const tomorrow = new Date(at);
  tomorrow.setDate(tomorrow.getDate() + 1);
  vi.setSystemTime(tomorrow);

  const calendar = app.maintainCalendar();
  const edit = app.change((s) => {
    s.profile.name = "same-page edit";
  }, scope);
  await calendar;

  expect(await edit).toMatchObject({ status: "success", committed: true });
  expect(saveSnapshot()?.scope).toBe(scope);
  const state = await readState();
  expect(state.days.at(-1)?.date).not.toBe(previousDay);
  expect(state.profile.name).toBe("same-page edit");
});

it("ignores delayed reads and repeated refreshes without republishing or rebroadcasting", async () => {
  const old = saveSnapshot()!,
    notify = vi.fn(),
    stop = subscribeSave(notify);
  try {
    await app.change((s) => {
      s.profile.name = "newest";
    });
    publishSave(old.state, old.revision, db.name, "refresh", false);
    await refreshState();
    await refreshState();
    expect(saveSnapshot()?.state.profile.name).toBe("newest");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("does not report committed work as failed when a subscriber or channel throws", async () => {
  const stop = subscribeSave(() => {
    throw Error("synthetic observer failure");
  });
  post.mockImplementationOnce(() => {
    throw Error("synthetic channel failure");
  });
  try {
    expect(await app.execute({ type: "start", cardId: "card" })).toMatchObject({
      status: "success",
    });
    expect((await readState()).entries).toHaveLength(1);
    expect(saveSnapshot()?.state.entries).toHaveLength(1);
  } finally {
    stop();
  }
});

it("keeps late-plan decisions outside transactions and preserves current cycle snapshots", async () => {
  await mutate((s) =>
    savePlan(
      s,
      { ...newPlan(at), id: "late", cards: [{ id: "card", target: 2 }] },
      at,
      true,
    ),
  );
  at = new Date(2026, 10, 3, 23).getTime();
  vi.setSystemTime(at);
  vi.clearAllMocks();
  const before = await readState();
  const result = await app.change((s) =>
    savePlan(s, { ...s.plans[0], cards: [{ id: "card", target: 3 }] }, at),
  );
  expect(result).toMatchObject({
    status: "confirmation",
    request: { kind: "late-plan" },
  });
  if (result.status !== "confirmation") throw Error("missing confirmation");
  expect(await readState()).toEqual(before);
  expect(post).not.toHaveBeenCalled();
  expect(
    await result.resume({ day: false, week: true, month: true }),
  ).toMatchObject({ status: "success" });
  const state = await readState();
  expect(state.plans[0].cards[0].target).toBe(3);
  expect(
    state.planCycles.find(
      (c) => c.planId === "late" && c.start <= at && c.end > at,
    )?.cards[0].target,
  ).toBe(2);
  expect(post).toHaveBeenCalledTimes(1);
});

it("requires both the Agent review and the normal late-plan decision before changing a goal", async () => {
  await mutate((s) =>
    savePlan(s, { ...newPlan(at), id: "late", cards: [{ id: "card", target: 2 }] }, at, true),
  );
  at = new Date(2026, 10, 3, 23).getTime();
  vi.setSystemTime(at);
  const before = await readState();
  const propose = () => app.change((state, context, confirmed) => applyPlanOperation(state, {
    type: "manage_plan", action: "set_card", scope: "repeat", period: "day", anchor: null,
    cardName: "Synthetic action", uses: 3, score: null, mode: null, timeline: null,
    targetScore: null, schedule: null, existing: null,
  }, context.now, confirmed, false, at));
  const cancelled = await propose();
  if (cancelled.status !== "confirmation") throw Error("Expected proposal review");
  expect(cancelled.request).toMatchObject({ kind: "card", message: expect.stringContaining("Target: 3") });
  expect(await cancelled.resume(false)).toMatchObject({ status: "cancelled" });
  expect(await readState()).toEqual(before);
  const proposal = await propose();
  if (proposal.status !== "confirmation") throw Error("Expected proposal review");
  const late = await proposal.resume(true);
  if (late.status !== "confirmation") throw Error("Expected late-plan choice");
  expect(late.request.kind).toBe("late-plan");
  expect(await readState()).toEqual(before);
  expect(await late.resume({ day: false, week: true, month: true })).toMatchObject({ status: "success" });
  const after = await readState();
  expect(after.plans[0].cards[0].target).toBe(3);
  expect(after.planCycles.find((cycle) => cycle.planId === "late" && cycle.start <= at && cycle.end > at)
    ?.cards[0].target).toBe(2);
});

it("rejects a late-plan answer after an imported save replaces the same character", async () => {
  await mutate((s) =>
    savePlan(
      s,
      { ...newPlan(at), id: "late", cards: [{ id: "card", target: 2 }] },
      at,
      true,
    ),
  );
  at = new Date(2026, 10, 3, 23).getTime();
  vi.setSystemTime(at);
  const result = await app.change((s) =>
    savePlan(s, { ...s.plans[0], cards: [{ id: "card", target: 3 }] }, at),
  );
  if (result.status !== "confirmation") throw Error("missing confirmation");
  await importSave(JSON.stringify(await readState()));
  vi.clearAllMocks();
  expect(
    await result.resume({ day: true, week: true, month: true }),
  ).toMatchObject({ status: "error", code: "conflict" });
  expect((await readState()).plans[0].cards[0].target).toBe(2);
  expect(post).not.toHaveBeenCalled();
});
