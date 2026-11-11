import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../tests/fixtures/storage-baseline.json";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it.each(["cn", "global"])(
  "%s uses its own database, keeps same-region backups and rejects the other region",
  async (region) => {
    vi.resetModules();
    vi.stubEnv("VITE_STATIFY_REGION", region);
    vi.stubGlobal("localStorage", { getItem: () => null });
    const storage = await import("./storage");
    const { db } = storage;
    expect(db.name).toBe(
      region === "cn" ? "LifeRPG-0.2" : "Statify-global-0.2",
    );
    await db.delete();
    await db.open();
    try {
      const value = { ...fixture.expected, region };
      await storage.importSave(JSON.stringify(value));
      expect(await storage.readState()).toEqual(value);
      const count = await db.backups.count();
      await expect(
        storage.importSave(
          JSON.stringify({
            ...value,
            region: region === "cn" ? "global" : "cn",
          }),
        ),
      ).rejects.toThrow(/区域/);
      expect(await storage.readState()).toEqual(value);
      expect(await db.backups.count()).toBe(count);
    } finally {
      await db.delete();
    }
  },
);

it("global first launch refuses a legacy mainland localStorage save without creating a database save", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_STATIFY_REGION", "global");
  const raw = JSON.stringify(fixture.legacy);
  vi.stubGlobal("localStorage", { getItem: () => raw });
  const { db, load, recoveryBackup } = await import("./storage");
  await db.delete();
  await db.open();
  try {
    await expect(load()).rejects.toThrow(/国内/);
    expect(await db.saves.count()).toBe(0);
    expect(await db.backups.count()).toBe(0);
    expect(await recoveryBackup()).toBe(raw);
  } finally {
    await db.delete();
  }
});

it("honors an explicit build database name without copying any existing regional data", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_STATIFY_DATABASE_NAME", "statify-test-isolated-003");
  vi.stubGlobal("localStorage", { getItem: () => null });
  const { db, load } = await import("./storage");
  expect(db.name).toBe("statify-test-isolated-003");
  await db.delete();
  await db.open();
  try {
    expect((await load()).entries).toEqual([]);
  } finally {
    await db.delete();
  }
});
