import "fake-indexeddb/auto";
import Dexie, { type EntityTable } from "dexie";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  createPreferenceRepository,
  PreferenceDenied,
} from "./preference-repository";
import { preferenceDefinitions, type Preferences } from "./preferences";

let db: Dexie & {
  preferences: EntityTable<{ id: string; value: unknown }, "id">;
};
let stored: Map<string, string>;
const make = (allowed = true) =>
  createPreferenceRepository<Preferences>(
    db,
    preferenceDefinitions,
    "synthetic-scope",
    async () => allowed,
  );
beforeEach(async () => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  db = new Dexie("synthetic-preferences-" + crypto.randomUUID()) as typeof db;
  db.version(1).stores({ preferences: "id" });
  await db.open();
});
afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("migrates the legacy formats together with their recovery source, leaving unrelated data and legacy keys intact", async () => {
  stored.set("statify-reduce-effects", "true");
  stored.set("statify-desktop-card-float", "off");
  stored.set("statify-plan-split", "0.25");
  stored.set("statify-plan-split-manual", "true");
  stored.set("statify-ui-theme", "peach");
  await db.preferences.put({
    id: "global-sync-owner",
    value: "synthetic-account",
  });
  const repo = make();
  await repo.refresh();
  expect(repo.read("reducedEffects")).toEqual({ status: "value", value: true });
  expect(repo.read("cardFloating").value).toBe(false);
  expect(repo.read("planLayout").value).toEqual({ ratio: 0.25, manual: true });
  expect(repo.read("theme").value).toBe("peach");
  expect(
    (await db.preferences.get("device-preference:planLayout"))?.value,
  ).toMatchObject({
    version: 1,
    data: { ratio: 0.25, manual: true },
    source: ["0.25", "true"],
    original: ["0.25", "true"],
  });
  expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
    "synthetic-account",
  );
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(localStorage.removeItem).not.toHaveBeenCalled();
});
it("commits ratio and manual flag atomically and survives a new repository without using legacy values as truth", async () => {
  const repo = make();
  await repo.refresh();
  expect(await repo.write("planLayout", { ratio: 0.75, manual: true })).toBe(
    "saved",
  );
  const again = make();
  await again.refresh();
  expect(again.read("planLayout").value).toEqual({ ratio: 0.75, manual: true });
  expect(
    await repo.write("planLayout", { ratio: Infinity, manual: true }),
  ).toBe("invalid");
  expect(await repo.write("planLayout", { ratio: 0.6, manual: false })).toBe(
    "saved",
  );
  expect(repo.read("planLayout").value).toEqual({ ratio: 0.6, manual: false });
});
it("aborted migrations keep source and retry, aborted writes do not publish a partial success", async () => {
  stored.set("statify-plan-split", "0.25");
  stored.set("statify-plan-split-manual", "true");
  const fail = () => {
    throw Error("synthetic quota");
  };
  db.preferences.hook("creating", fail);
  const repo = make();
  await repo.refresh();
  expect(await db.preferences.count()).toBe(0);
  expect(repo.read("planLayout").status).toBe("unavailable");
  db.preferences.hook("creating").unsubscribe(fail);
  await repo.refresh();
  db.preferences.hook("updating", fail);
  expect(await repo.write("planLayout", { ratio: 0.7, manual: false })).toBe(
    "unavailable",
  );
  const again = make();
  await again.refresh();
  expect(again.read("planLayout").value).toEqual({ ratio: 0.25, manual: true });
  db.preferences.hook("updating").unsubscribe(fail);
  expect(await repo.write("planLayout", { ratio: 0.7, manual: false })).toBe(
    "saved",
  );
});
it("two pages migrate once and enforce the one-time theme claim inside the write transaction", async () => {
  const a = make(),
    b = make();
  await Promise.all([a.refresh(), b.refresh()]);
  expect(await db.preferences.count()).toBe(4);
  const claim = (current: Preferences["theme"]) => {
    if (current) throw new PreferenceDenied();
  };
  const results = await Promise.allSettled([
    a.write("theme", "raven-wizard", claim),
    b.write("theme", "mouse-balloon", claim),
  ]);
  expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
  await a.refresh();
  await b.refresh();
  expect(a.read("theme").value).toBe(b.read("theme").value);
});
it("unknown or malformed target records are never downgraded or overwritten, even by an explicit selection", async () => {
  const original = { version: 7, scope: "synthetic-scope", data: true };
  await db.preferences.put({
    id: "device-preference:reducedEffects",
    value: original,
  });
  const repo = make();
  await repo.refresh();
  expect(repo.read("reducedEffects").status).toBe("invalid");
  expect(await repo.write("reducedEffects", false)).toBe("unavailable");
  expect(
    (await db.preferences.get("device-preference:reducedEffects"))?.value,
  ).toEqual(original);
});
it("invalid legacy values remain untouched and are not marked migrated", async () => {
  stored.set("statify-plan-split", "");
  stored.set("statify-ui-theme", "unknown");
  const repo = make();
  await repo.refresh();
  expect(repo.read("planLayout").status).toBe("invalid");
  expect(repo.read("theme").status).toBe("invalid");
  expect(
    await db.preferences.get("device-preference:planLayout"),
  ).toBeUndefined();
  expect(stored.get("statify-plan-split")).toBe("");
});
it("old-page changes are reported, never adopted over a committed value; explicit re-selection keeps the original recovery evidence", async () => {
  stored.set("statify-reduce-effects", "false");
  const repo = make();
  await repo.refresh();
  await repo.write("reducedEffects", true);
  stored.set("statify-reduce-effects", "true");
  await repo.refresh();
  expect(repo.read("reducedEffects")).toEqual({
    status: "legacy-changed",
    value: true,
  });
  await repo.write("reducedEffects", false);
  expect(
    (await db.preferences.get("device-preference:reducedEffects"))?.value,
  ).toMatchObject({ data: false, original: ["false"], source: ["true"] });
});
it("ambiguous namespaces are not migrated; scoped adapters cannot read another deployment's source", async () => {
  stored.set("statify-reduce-effects", "true");
  const ambiguous = make(false);
  await ambiguous.refresh();
  expect(ambiguous.read("reducedEffects").status).toBe("ambiguous");
  expect(
    await db.preferences.get("device-preference:reducedEffects"),
  ).toBeUndefined();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get("synthetic-prefix:" + key) ?? null,
  });
  const scoped = make();
  await scoped.refresh();
  expect(scoped.read("reducedEffects").value).toBe(false);
  expect(stored.get("statify-reduce-effects")).toBe("true");
});
it("denied source access cannot masquerade as an absent first theme choice", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("denied");
    },
  });
  const repo = make();
  await repo.refresh();
  expect(repo.read("theme").status).toBe("unavailable");
  expect(await repo.write("theme", "mouse-balloon")).toBe("unavailable");
  expect(await db.preferences.count()).toBe(0);
});

it("a successful theme commit remains claimed when the subsequent readback fails", async () => {
  const repo = make(); await repo.refresh();
  let failRead = false;
  const get = db.preferences.get.bind(db.preferences);
  vi.spyOn(db.preferences, "get").mockImplementation((key) => {
    if (failRead) return Promise.reject(Error("synthetic readback failure")) as ReturnType<typeof get>;
    return get(key);
  });
  const committed = () => { failRead = true; };
  db.preferences.hook("updating", committed);
  expect(await repo.write("theme", "mouse-balloon")).toBe("saved");
  expect(repo.read("theme")).toEqual({ status: "unavailable", value: "mouse-balloon" });
  db.preferences.hook("updating").unsubscribe(committed);
  failRead = false;
  expect((await db.preferences.get("device-preference:theme"))?.value).toMatchObject({ data: "mouse-balloon" });
});
