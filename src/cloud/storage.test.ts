import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, load, mutate, readState, backup, importSave } from "../storage";
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  await db.delete();
  await db.open();
  await load();
});
afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
});
async function copies() {
  await mutate((s) => {
    s.profile.name = "Cloud A";
  });
  const cloud = await backup();
  await mutate((s) => {
    s.profile.name = "Device B";
  });
  await db.preferences.put({ id: "global-sync-owner", value: "account-b" });
  return cloud;
}
it("cloud restore commits its save and owning account in the same transaction", async () => {
  const cloud = await copies();
  await importSave(cloud, { source: "cloud", cloudOwner: "account-a" });
  expect((await readState()).profile.name).toBe("Cloud A");
  expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
    "account-a",
  );
  expect(
    (await db.backups.toArray()).some((row) => row.raw?.includes("Device B")),
  ).toBe(true);
});
it("an account switch while restore is writing rolls back both the save and its owner", async () => {
  const cloud = await copies();
  let checks = 0;
  await expect(
    importSave(cloud, {
      source: "cloud",
      cloudOwner: "account-a",
      guard: () => {
        if (++checks === 2) throw Error("Account changed");
      },
    }),
  ).rejects.toThrow("Account changed");
  expect((await readState()).profile.name).toBe("Device B");
  expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
    "account-b",
  );
});
