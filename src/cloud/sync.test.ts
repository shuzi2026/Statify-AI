import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCloudSync, type CloudPorts } from "./sync";
import {
  db,
  load,
  mutate,
  readState,
  readCloudSnapshot,
  importSave,
} from "../storage";
import { canonical } from "../storage-format";
import { unpackState } from "../storage-format";
import { createApplication } from "../application/runtime";
import {
  PaymentApiError,
  PaymentRequestError,
} from "../payments/request-policy";
import { newCard } from "../model";
import { registerSaveReplacement } from "../application/save-replacement";
import { saveSnapshot } from "../save-publication";
let dispose: (() => void) | undefined;
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
async function localHead(revision = 1) {
  const text = canonical(JSON.parse((await readCloudSnapshot()).text));
  return { revision, snapshot: text, digest: await hash(text), updated_at: 1 };
}
async function setup(coordinated = false) {
  let account: ReturnType<CloudPorts["getAccount"]> = {
    account: { id: "account-a" },
    offline: false,
    entitlement: { member: true, trial_ends_at: null },
  };
  let listener = () => {};
  let head: {
    revision: number;
    snapshot: string | null;
    digest: string | null;
    updated_at: number | null;
    coordination_version?: 1;
    timer?: {
      action_id: string;
      device_id: string | null;
      card_name: string;
      phase: "running" | "paused" | "settlement";
    } | null;
  } = {
    revision: 0,
    snapshot: null as string | null,
    digest: null as string | null,
    updated_at: null as number | null,
    ...(coordinated ? { coordination_version: 1 as const, timer: null } : {}),
  };
  const request = vi.fn(
    async (
      path: string,
      body?: unknown,
      options?: { signal?: AbortSignal },
    ): Promise<unknown> => {
      if (path === "/cloud") return head;
      if (path.startsWith("/cloud/changes?"))
        return new Promise((_resolve, reject) => {
          const abort = () => reject(new PaymentRequestError("cancelled"));
          if (options?.signal?.aborted) abort();
          else
            options?.signal?.addEventListener("abort", abort, { once: true });
        });
      if (path === "/cloud/timer-reservations")
        return {
          reservation_id: (body as { request_id: string }).request_id,
          expires_at: Date.now() + 30000,
        };
      if (path.endsWith("/cancellation")) return { cancelled: true };
      const value = body as { snapshot: string; base_revision: number };
      head = {
        ...head,
        revision: value.base_revision + 1,
        snapshot: value.snapshot,
        digest: await hash(value.snapshot),
        updated_at: 1,
      };
      if (coordinated) {
        const action = unpackState(
          JSON.parse(value.snapshot).data,
        ).actions.find((a) => a.card.method !== "instant");
        head.timer = action
          ? {
              action_id: action.id,
              device_id:
                (body as { coordination?: { device_id: string } }).coordination
                  ?.device_id || null,
              card_name: action.card.name,
              phase:
                action.endedAt !== null
                  ? "settlement"
                  : action.runningSince === null
                    ? "paused"
                    : "running",
            }
          : null;
      }
      return head;
    },
  );
  const sync = createCloudSync({
    enabled: true,
    getAccount: () => account,
    subscribeAccount: (fn) => {
      listener = fn;
      return () => {};
    },
    request: request as CloudPorts["request"],
  });
  await db.preferences.put({ id: "global-sync-owner", value: "account-a" });
  dispose = sync.startCloudSync();
  await vi.waitFor(() => expect(sync.getSnapshot().owner).toBe("account-a"));
  return {
    sync,
    request,
    setHead: (value: typeof head) => {
      head = value;
    },
    getHead: () => head,
    switchAccount: () => {
      account = { ...account, account: { id: "account-b" } };
      listener();
    },
    offline: () => {
      account = { ...account, offline: true };
    },
  };
}
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      postMessage() {}
      close() {}
    },
  );
  await db.delete();
  await db.open();
  await load();
});

async function coordinatedFixture() {
  await mutate((s) => {
    s.profile.onboarded = true;
    s.cards = [
      {
        ...newCard(Date.now()),
        name: "Synthetic timer",
        method: "timed",
        evaluate: false,
        settle: false,
      },
    ];
  });
  const f = await setup(true);
  await f.sync.setCloudMode("auto");
  await f.sync.syncNow("device");
  const app = createApplication(() => ({
    now: Date.now(),
    member: true,
    trial: false,
  }));
  app.coordinateCommands(f.sync.coordinateCommand);
  const card = (await readState()).cards[0];
  return { ...f, app, card };
}

it("a rejected edit and cache reload do not manufacture a local cloud change", async () => {
  const f = await coordinatedFixture();
  // Two differently ordered IDs make IndexedDB's key order differ from the
  // submitted business order. A failed transaction drops the storage cache.
  await mutate((s) => {
    s.cards = [
      { ...s.cards[0], id: "z-card" },
      { ...s.cards[0], id: "a-card" },
    ];
  });
  await f.sync.syncNow();
  const before = await readState();
  await expect(
    mutate(() => {
      throw Error("Synthetic rejected draft");
    }),
  ).rejects.toThrow("rejected draft");
  expect(await readState()).toEqual(before);
  f.request.mockClear();
  await f.sync.syncNow();
  expect(f.request.mock.calls.some(([path]) => path === "/cloud/sync")).toBe(
    false,
  );
  expect(f.sync.getSnapshot().conflict).toBeNull();
});

it("automatic starts reserve before local commit and immediately publish the one timer", async () => {
  const f = await coordinatedFixture();
  const started = await f.app.execute({ type: "start", cardId: f.card.id });
  expect(started.status).toBe("success");
  expect((await readState()).actions).toHaveLength(1);
  const claimIndex = f.request.mock.calls.findIndex(
    ([p]) => p === "/cloud/timer-reservations",
  );
  const uploads = f.request.mock.calls
    .map(([p], i) => (p === "/cloud/sync" ? i : -1))
    .filter((i) => i >= 0);
  expect(claimIndex).toBeGreaterThan(uploads[0]);
  expect(uploads.at(-1)).toBeGreaterThan(claimIndex);
  expect(f.getHead().timer?.action_id).toBe((await readState()).actions[0].id);
  const again = await f.app.execute({ type: "start", cardId: f.card.id });
  expect(again.status).toBe("error");
  expect(
    f.request.mock.calls.filter(([p]) => p === "/cloud/timer-reservations"),
  ).toHaveLength(1);
});

it("completion cannot settle a timer reserved by another device", async () => {
  const f = await coordinatedFixture();
  expect((await f.app.execute({ type: "start", cardId: f.card.id })).status).toBe("success");
  const action = (await readState()).actions[0];
  f.setHead({
    ...f.getHead(),
    timer: {
      action_id: action.id,
      device_id: "another-device",
      card_name: action.card.name,
      phase: "running",
    },
  });

  const result = await f.app.execute({
    type: "complete",
    actionId: action.id,
  });
  expect(result.status).toBe("error");
  expect((await readState()).actions[0]).toMatchObject({ id: action.id, endedAt: null });
});

it("a server timer refusal never falls back to an offline start", async () => {
  const f = await coordinatedFixture(),
    request = f.request.getMockImplementation()!;
  f.request.mockImplementation((path, body, options) =>
    path === "/cloud/timer-reservations"
      ? Promise.reject(
          new PaymentApiError(409, {
            code: "cloud_timer_busy",
            title: "Another device is using the timer.",
          }),
        )
      : request(path, body, options),
  );
  const before = await readState();
  const result = await f.app.execute({ type: "start", cardId: f.card.id });
  expect(result.status).toBe("error");
  expect(await readState()).toEqual(before);
});

it("an unconfirmed network claim permits a local start without reporting cloud success", async () => {
  const f = await coordinatedFixture(),
    request = f.request.getMockImplementation()!;
  f.request.mockImplementation((path, body, options) =>
    path === "/cloud/timer-reservations"
      ? Promise.reject(new PaymentRequestError("timeout", true))
      : request(path, body, options),
  );
  const result = await f.app.execute({ type: "start", cardId: f.card.id });
  expect(result.status).toBe("success");
  expect((await readState()).actions).toHaveLength(1);
  expect(f.getHead().timer).toBeNull();
  expect(f.sync.getSnapshot().message).toContain("kept locally");
});

it("offline and manual modes allow local timers without reserving an online slot", async () => {
  const f = await coordinatedFixture();
  await f.sync.setCloudMode("manual");
  f.request.mockClear();
  expect(
    (await f.app.execute({ type: "start", cardId: f.card.id })).status,
  ).toBe("success");
  expect(f.request).not.toHaveBeenCalled();
  await mutate((s) => {
    s.actions = [];
  });
  await f.sync.setCloudMode("auto");
  f.offline();
  f.request.mockClear();
  expect(
    (await f.app.execute({ type: "start", cardId: f.card.id })).status,
  ).toBe("success");
  expect(f.request).not.toHaveBeenCalled();
});

it("a failed local timer commit releases its reservation and preserves the save", async () => {
  const f = await coordinatedFixture(),
    before = await readState();
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(
    Error("Synthetic timer write failure"),
  );
  expect(
    (await f.app.execute({ type: "start", cardId: f.card.id })).status,
  ).toBe("error");
  expect(await readState()).toEqual(before);
  expect(
    f.request.mock.calls.some(([path]) => path.endsWith("/cancellation")),
  ).toBe(true);
});

it.each(["off", "manual", "account"] as const)(
  "a late timer claim cannot start after %s changes",
  async (change) => {
    const f = await coordinatedFixture(),
      request = f.request.getMockImplementation()!;
    let finish!: (value: unknown) => void;
    f.request.mockImplementation((path, body, options) =>
      path === "/cloud/timer-reservations"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : request(path, body, options),
    );
    const pending = f.app.execute({ type: "start", cardId: f.card.id });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    if (change !== "account") await f.sync.setCloudMode(change);
    else f.switchAccount();
    finish({
      reservation_id: crypto.randomUUID(),
      expires_at: Date.now() + 30000,
    });
    expect((await pending).status).toBe("error");
    expect((await readState()).actions).toHaveLength(0);
    expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
      "account-a",
    );
  },
);

it("manual mode cancels its live wait and does not start another one", async () => {
  const f = await coordinatedFixture();
  await vi.waitFor(() =>
    expect(
      f.request.mock.calls.some(([p]) => p.startsWith("/cloud/changes?")),
    ).toBe(true),
  );
  const calls = f.request.mock.calls.filter(([p]) =>
    p.startsWith("/cloud/changes?"),
  );
  await f.sync.setCloudMode("manual");
  expect(calls.at(-1)?.[2]?.signal?.aborted).toBe(true);
  expect(
    f.request.mock.calls.filter(([p]) => p.startsWith("/cloud/changes?")),
  ).toHaveLength(calls.length);
});
afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await db.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("repeated cloud owners share listeners and a disposed metadata failure cannot publish into a restart", async () => {
  const f = await setup();
  const attach = vi.spyOn(window, "addEventListener");
  const other = f.sync.startCloudSync();
  expect(attach).not.toHaveBeenCalled();
  other?.();
  dispose?.();
  dispose = undefined;
  vi.spyOn(db.preferences, "get").mockRejectedValueOnce(Error("old read"));
  const stop = f.sync.startCloudSync();
  stop?.();
  await new Promise((r) => setTimeout(r, 0));
  expect(f.sync.getSnapshot().error).toBe("");
  expect(f.request).not.toHaveBeenCalled();
});

it("defaults to off, then asks before any first upload and leaves copies untouched on dismissal", async () => {
  const { sync, request } = await setup();
  expect(sync.getSnapshot().mode).toBe("off");
  expect(request).not.toHaveBeenCalled();
  await sync.setCloudMode("manual");
  expect(sync.getSnapshot().conflict?.reason).toBe("first");
  expect(request.mock.calls.every(([path]) => path === "/cloud")).toBe(true);
  const before = await readState();
  sync.dismissCloudConflict();
  expect(sync.getSnapshot().conflict).toBeNull();
  expect(await readState()).toEqual(before);
});

it("turning cloud off aborts waiting and ignores the late head without replacing the local save", async () => {
  const { sync, request } = await setup();
  let finish!: (value: unknown) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const before = await readCloudSnapshot();
  const pending = sync.setCloudMode("manual");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const signal = (
    request.mock.calls[0] as unknown as [
      string,
      unknown,
      { signal: AbortSignal },
    ]
  )[2].signal;
  await sync.setCloudMode("off");
  expect(signal.aborted).toBe(true);
  finish(await localHead());
  await pending;
  expect(sync.getSnapshot()).toMatchObject({
    mode: "off",
    busy: false,
    conflict: null,
    error: "",
  });
  expect((await readCloudSnapshot()).revision).toBe(before.revision);
  expect(request).toHaveBeenCalledOnce();
});
it("a cancelled old cloud request cannot clear a new account request's busy state", async () => {
  const f = await setup();
  let finishOld!: (value: unknown) => void,
    finishNew!: (value: unknown) => void;
  f.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finishOld = r;
      }),
  );
  const old = f.sync.syncNow();
  await vi.waitFor(() => expect(finishOld).toBeTypeOf("function"));
  f.switchAccount();
  await new Promise((r) => setTimeout(r, 10));
  f.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finishNew = r;
      }),
  );
  const next = f.sync.syncNow();
  await vi.waitFor(() => expect(finishNew).toBeTypeOf("function"));
  finishOld(await localHead());
  await old;
  expect(f.sync.getSnapshot().busy).toBe(true);
  finishNew(await localHead());
  await next;
  expect(f.sync.getSnapshot().busy).toBe(false);
});
it("uploads only after a reviewed choice and uses the cloud revision and an operation identity", async () => {
  const { sync, request } = await setup();
  await sync.setCloudMode("manual");
  await sync.syncNow("device");
  expect(
    request.mock.calls.find(([path]) => path === "/cloud/sync")?.[1],
  ).toMatchObject({ base_revision: 0, operation_id: expect.any(String) });
  expect(sync.getSnapshot().conflict).toBeNull();
  expect(
    (await db.preferences.get("global-sync:account-a"))?.value.revision,
  ).toBe(1);
});
it("syncs journal deletion and the reversed values as one versioned snapshot", async () => {
  await mutate((s) => {
    s.cards = [{
      ...newCard(Date.now()),
      name: "Synthetic journal record",
      method: "instant",
      evaluate: false,
      settle: false,
      rewards: [{ id: s.attributes[0].id, amount: 20 }],
    }];
  });
  const app = createApplication();
  const [card] = (await readState()).cards;
  expect(await app.execute({ type: "start", cardId: card.id })).toMatchObject({ status: "success" });
  const before = await readState();
  expect(before.attributes[0].earned).toBeGreaterThan(0);
  const { sync, getHead, request } = await setup();
  await sync.setCloudMode("manual");
  await sync.syncNow("device");
  const deletion = await app.execute({ type: "delete-entry", entryId: before.entries[0].id });
  if (deletion.status !== "confirmation") throw Error("expected confirmation");
  expect(await deletion.resume(true)).toMatchObject({ status: "success" });
  await sync.syncNow();
  const cloud = unpackState(JSON.parse(getHead().snapshot!).data);
  expect(cloud.entries).toEqual([]);
  expect(cloud.attributes[0]).toMatchObject({ earned: 0, daily: {} });
  expect(cloud.cards[0].count).toBe(0);
  expect(request.mock.calls.filter(([path]) => path === "/cloud/sync").at(-1)?.[1])
    .toMatchObject({ base_revision: 1 });
  expect(sync.getSnapshot().conflict).toBeNull();
});
it("uses a sync baseline committed by another tab before uploading the shared save", async () => {
  const { sync, request, getHead } = await setup();
  await sync.setCloudMode("manual");
  await sync.syncNow("device");
  const tab = createCloudSync({
    enabled: true,
    getAccount: () => ({
      account: { id: "account-a" },
      offline: false,
      entitlement: { member: true, trial_ends_at: null },
    }),
    subscribeAccount: () => () => {},
    request: request as CloudPorts["request"],
  });
  const stop = tab.startCloudSync();
  try {
    await vi.waitFor(() => expect(tab.getSnapshot().mode).toBe("manual"));
    await mutate((s) => { s.profile.name = "first tab"; });
    await sync.syncNow();
    expect(getHead().revision).toBe(2);
    await mutate((s) => { s.profile.name = "second tab"; });
    await tab.syncNow();
    expect(tab.getSnapshot().conflict).toBeNull();
    expect(getHead().revision).toBe(3);
    expect(getHead().snapshot).toContain("second tab");
  } finally {
    stop?.();
  }
});
it("refuses a choice if the device changed while the conflict was open", async () => {
  const { sync, request } = await setup();
  await sync.setCloudMode("manual");
  await mutate((s) => {
    s.profile.name = "new local";
  });
  await sync.syncNow("device");
  expect(sync.getSnapshot().error).toMatch(/changed/);
  expect(request.mock.calls.some(([path]) => path === "/cloud/sync")).toBe(
    false,
  );
  expect((await readState()).profile.name).toBe("new local");
});
it("validates cloud checksum before import and retains the device save on corruption", async () => {
  const { sync, setHead } = await setup();
  setHead({ revision: 2, snapshot: "{}", digest: "wrong", updated_at: 2 });
  await sync.setCloudMode("manual");
  await sync.syncNow("cloud");
  expect(sync.getSnapshot().error).toMatch(/checksum/);
  expect((await readState()).profile.name).toBe("朋友");
  expect(await db.backups.count()).toBe(0);
});
it.each(["legacy", "same device", "other device"])(
  "downloads the chosen %s cloud save and attributes stale edits only when the writer is different",
  async (source) => {
    await mutate((s) => {
      s.profile.name = "cloud copy";
    });
    const cloud = await localHead(5);
    const device = crypto.randomUUID();
    await db.preferences.put({ id: "global-sync-device", value: device });
    if (source !== "legacy") {
      cloud.snapshot = canonical({
        ...JSON.parse(cloud.snapshot),
        cloudWriter: source === "same device" ? device : crypto.randomUUID(),
      });
      cloud.digest = await hash(cloud.snapshot);
    }
    await mutate((s) => {
      s.profile.name = "device copy";
    });
    const scope = saveSnapshot()!.scope;
    const { sync, setHead } = await setup();
    setHead(cloud);
    await sync.setCloudMode("manual");
    await sync.syncNow("cloud");
    expect(sync.getSnapshot().error).toBe("");
    expect((await readState()).profile.name).toBe("cloud copy");
    expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
      "account-a",
    );
    expect(
      (await db.backups.toArray()).some((row) =>
        row.raw?.includes("device copy"),
      ),
    ).toBe(true);
    expect(
      await createApplication().change((s) => {
        s.profile.name = "stale edit";
      }, scope),
    ).toMatchObject({
      status: "error",
      code: "conflict",
      message:
        source === "other device"
          ? "当前存档已在其他设备发生变化，本次更改未保存。请核对当前内容后重试。"
          : "当前存档已更新，本次更改未保存。请核对当前内容后重试。",
    });
    expect((await readState()).profile.name).toBe("cloud copy");
  },
);
it("does not turn a post-download local edit into an already-synced baseline", async () => {
  await mutate((s) => {
    s.profile.name = "cloud";
  });
  const cloud = await localHead(3);
  await mutate((s) => {
    s.profile.name = "local";
  });
  const { sync, setHead } = await setup();
  setHead(cloud);
  await sync.setCloudMode("manual");
  let edit: Promise<unknown> | undefined;
  window.addEventListener(
    "statify-cloud-restored",
    () => {
      edit = mutate((s) => {
        s.profile.name = "edited after download";
      });
    },
    { once: true },
  );
  await sync.syncNow("cloud");
  await edit;
  expect((await readState()).profile.name).toBe("edited after download");
  expect(sync.getSnapshot().error).toMatch(/changed/);
  expect(
    (await db.preferences.get("global-sync:account-a"))?.value.digest,
  ).toBeNull();
});
it("requires a fresh account choice and rejects a response belonging to the previous account", async () => {
  const { sync, request, switchAccount } = await setup();
  await sync.setCloudMode("manual");
  let resolve!: (head: unknown) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const task = sync.syncNow("device");
  switchAccount();
  resolve({ revision: 0, snapshot: null, digest: null, updated_at: null });
  await task;
  expect(request.mock.calls.some(([path]) => path === "/cloud/sync")).toBe(
    false,
  );
  expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
    "account-a",
  );
  await vi.waitFor(() => expect(sync.getSnapshot().mode).toBe("off"));
  await sync.setCloudMode("manual");
  expect(sync.getSnapshot().conflict?.reason).toBe("account");
});
it("makes no transport request without online membership", async () => {
  const { sync, request, offline } = await setup();
  offline();
  await expect(sync.setCloudMode("manual")).rejects.toThrow(/online/);
  await sync.syncNow();
  expect(request).not.toHaveBeenCalled();
});
it("updates only metadata when both copies already match", async () => {
  const head = await localHead(4);
  const { sync, request, setHead } = await setup();
  setHead(head);
  await sync.setCloudMode("manual");
  expect(sync.getSnapshot().conflict).toBeNull();
  expect(await db.backups.count()).toBe(0);
  expect(request.mock.calls.some(([path]) => path === "/cloud/sync")).toBe(
    false,
  );
  expect(
    (await db.preferences.get("global-sync:account-a"))?.value.digest,
  ).toBe(head.digest);
});

it("rolls back sync metadata if the account switches while ownership is being recorded", async () => {
  const { sync, switchAccount } = await setup();
  await sync.setCloudMode("manual");
  const original = db.preferences.put.bind(db.preferences);
  let switched = false;
  vi.spyOn(db.preferences, "put").mockImplementation((row) => {
    if (row.id === "global-sync-owner" && !switched) {
      switched = true;
      switchAccount();
    }
    return original(row);
  });
  await sync.syncNow("device");
  expect(
    (await db.preferences.get("global-sync:account-a"))?.value.revision,
  ).toBe(0);
  expect(sync.getSnapshot().at).toBeNull();
  expect(sync.getSnapshot().mode).toBe("off");
});

it("does not fire a queued automatic sync after the user switches the mode off", async () => {
  const head = await localHead();
  const { sync, request, setHead } = await setup();
  setHead(head);
  await sync.setCloudMode("auto");
  request.mockClear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  window.dispatchEvent(new Event("statify-save-committed"));
  await sync.setCloudMode("off");
  await vi.advanceTimersByTimeAsync(800);
  expect(request).not.toHaveBeenCalled();
});

it.each(["edit", "import", "account"] as const)(
  "a concurrent %s during cloud checksum verification cannot be overwritten by the old download",
  async (operation) => {
    await mutate((s) => {
      s.profile.name = "cloud copy";
    });
    const cloud = await localHead(5);
    await mutate((s) => {
      s.profile.name = "device copy";
    });
    const { sync, setHead, switchAccount } = await setup();
    setHead(cloud);
    await sync.setCloudMode("manual");
    const oldCount = await db.backups.count(),
      restored = vi.fn();
    window.addEventListener("statify-cloud-restored", restored);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let intervened = false;
    vi.spyOn(crypto.subtle, "digest").mockImplementation(
      async (algorithm, data) => {
        if (
          !intervened &&
          new TextDecoder().decode(data).includes('"cloud copy"')
        ) {
          intervened = true;
          if (operation === "account") switchAccount();
          else if (operation === "edit")
            await mutate((s) => {
              s.profile.name = "new local";
            });
          else {
            const state = await readState();
            state.profile.name = "new import";
            await importSave(JSON.stringify(state));
          }
        }
        return digest(algorithm, data);
      },
    );
    await sync.syncNow("cloud");
    expect(intervened).toBe(true);
    expect((await readState()).profile.name).toBe(
      operation === "account"
        ? "device copy"
        : operation === "edit"
          ? "new local"
          : "new import",
    );
    expect(await db.backups.count()).toBe(
      oldCount + (operation === "import" ? 2 : 0),
    );
    expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
      "account-a",
    );
    expect(
      (await db.preferences.get("global-sync:account-a"))?.value.revision,
    ).toBe(0);
    expect(restored).not.toHaveBeenCalled();
  },
);

it("cancelled cloud draft replacement retains the device and pauses automatic updates until a deliberate copy choice", async () => {
  const { sync, setHead } = await setup(true);
  await sync.setCloudMode("auto"); await sync.syncNow("device");
  const before = await readState();
  await mutate((s) => { s.profile.name = "synthetic cloud name"; });
  const cloud = await localHead(2);
  await mutate((s) => { s.profile.name = before.profile.name; });
  setHead(cloud);
  const ask = vi.fn(async () => false), stop = registerSaveReplacement(ask);
  try {
    await sync.syncNow();
    expect(sync.getSnapshot().conflict?.reason).toBe("conflict");
    expect(sync.getSnapshot().message).toContain("cancelled");
    expect((await readState()).profile.name).toBe(before.profile.name);
    expect(ask).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ask).toHaveBeenCalledOnce();
    ask.mockResolvedValue(true);
    await sync.syncNow("cloud");
    expect(sync.getSnapshot().conflict).toBeNull();
    expect((await readState()).profile.name).toBe("synthetic cloud name");
  } finally { stop(); }
});
