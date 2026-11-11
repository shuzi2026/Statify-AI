import "fake-indexeddb/auto";
import { db } from "../storage";
import { initializePreferences } from "../local-data/preferences";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const access = vi.hoisted(() => ({ member: false }));
vi.mock("../payments/access", () => ({
  memberFeaturesActive: () => access.member,
}));
import {
  chooseInitialTheme,
  chooseTheme,
  storedThemeChoice,
  themeSnapshot,
  setTheme,
  retainExistingTheme,
  initializeTheme,
  subscribeThemeChoice,
} from "./runtime";

let store: Map<string, string>,
  session: Map<string, string>,
  events: Map<string, (event: any) => void>;
beforeEach(async () => {
  access.member = false;
  store = new Map();
  session = new Map();
  events = new Map();
  vi.stubEnv("DEV", true);
  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) || null,
    setItem: (key: string, value: string) => map.set(key, value),
  });
  vi.stubGlobal("localStorage", storage(store));
  vi.stubGlobal("sessionStorage", storage(session));
  vi.stubGlobal("document", {
    documentElement: {
      dataset: {},
      toggleAttribute: vi.fn(),
      style: { removeProperty: () => {}, setProperty: () => {} },
    },
  });
  vi.stubGlobal("location", { search: "", origin: "http://127.0.0.1:5173" });
  const win: any = {
    addEventListener: (name: string, fn: any) => events.set(name, fn),
    removeEventListener: (name: string) => events.delete(name),
  };
  win.parent = win;
  vi.stubGlobal("window", win);
  setTheme("raven-wizard");
  session.clear();
  await db.open();
  await db.preferences.clear();
  await (await initializePreferences()).refresh();
});
afterEach(async () => {
  await db.preferences.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("durable skin choices", async () => {
  it("never offers or newly selects retired skins, including for members", async () => {
    expect(await chooseInitialTheme("peach")).toBe("unavailable");
    access.member = true;
    expect(await chooseTheme("paper-lavender")).toBe("unavailable");
    expect(storedThemeChoice()).toBeNull();
  });
  it("lets a free first-time user choose any skin once, independently of temporary previews", async () => {
    setTheme("mouse-balloon");
    expect(storedThemeChoice()).toBeNull();
    expect(await chooseInitialTheme("pearl-apricot")).toBe("saved");
    expect(await chooseInitialTheme("night-sprout")).toBe("member-required");
    expect(await chooseTheme("mouse-balloon")).toBe("member-required");
    expect(storedThemeChoice()).toBe("pearl-apricot");
    expect(themeSnapshot().id).toBe("pearl-apricot");
  });
  it("blocks ordinary switching even when a first choice has not yet been recorded", async () => {
    expect(await chooseTheme("mouse-balloon")).toBe("member-required");
    expect(storedThemeChoice()).toBeNull();
  });
  it("rechecks membership on every saved change and retains the last skin on logout", async () => {
    await chooseInitialTheme("mouse-balloon");
    access.member = true;
    expect(await chooseTheme("night-sprout")).toBe("saved");
    access.member = false;
    expect(await chooseTheme("mouse-balloon")).toBe("member-required");
    expect(themeSnapshot().id).toBe("night-sprout");
    expect(storedThemeChoice()).toBe("night-sprout");
    expect(await chooseTheme("night-sprout")).toBe("saved");
  });
  it("adopts an existing character appearance once without overriding an established choice", async () => {
    setTheme("paper-lavender");
    await retainExistingTheme();
    expect(storedThemeChoice()).toBe("paper-lavender");
    setTheme("peach");
    await retainExistingTheme();
    expect(storedThemeChoice()).toBe("paper-lavender");
  });
  it("preserves a legacy installed character skin during the one-time migration", async () => {
    vi.stubEnv("DEV", false);
    session.set("statify-preview-theme", "pearl-pistachio");
    await retainExistingTheme();
    expect(storedThemeChoice()).toBe("pearl-pistachio");
    expect(themeSnapshot().id).toBe("pearl-pistachio");
  });
  it("adopts committed database choices but preserves them when an old page changes the legacy key", async () => {
    const changed = vi.fn(),
      unsubscribe = subscribeThemeChoice(changed),
      stop = initializeTheme();
    const repo = await initializePreferences();
    await repo.write("theme", "bakery-ochre");
    expect(themeSnapshot().id).toBe("bakery-ochre");
    expect(changed).toHaveBeenCalledOnce();
    store.set("statify-ui-theme", "peach");
    await repo.refresh();
    expect(repo.read("theme").status).toBe("legacy-changed");
    expect(themeSnapshot().id).toBe("bakery-ochre");
    expect(changed).toHaveBeenCalledOnce();
    expect(await chooseInitialTheme("mouse-balloon")).toBe("member-required");
    unsubscribe();
    stop();
  });
  it("does not switch or advance if storage fails, and notifies choice observers only on success", async () => {
    const changed = vi.fn(),
      stop = subscribeThemeChoice(changed);
    const fail = () => { throw Error("synthetic quota"); };
    db.preferences.hook("updating", fail);
    expect(await chooseInitialTheme("mouse-balloon")).toBe("storage-unavailable");
    expect(themeSnapshot().id).toBe("raven-wizard");
    expect(changed).not.toHaveBeenCalled();
    db.preferences.hook("updating").unsubscribe(fail);
    expect(await chooseInitialTheme("mouse-balloon")).toBe("saved");
    expect(changed).toHaveBeenCalledOnce();
    stop();
  });
  it("production ignores URL/session and parent preview overrides, keeping the saved skin", async () => {
    vi.stubEnv("DEV", false);
    store.set("statify-ui-theme", "paper-lavender");
    await db.preferences.delete("device-preference:theme");
    await (await initializePreferences()).refresh();
    session.set("statify-preview-theme", "peach");
    location.search = "?theme=night-sprout";
    const stop = initializeTheme();
    expect(themeSnapshot().id).toBe("paper-lavender");
    expect(session.get("statify-preview-theme")).toBe("peach");
    const parent = {};
    window.parent = parent as any;
    events.get("message")!({
      source: parent,
      origin: location.origin,
      data: { type: "statify-preview-theme", theme: "mouse-balloon" },
    });
    expect(themeSnapshot().id).toBe("paper-lavender");
    stop();
  });
  it("development overrides stay separate from the chosen free skin", async () => {
    store.set("statify-ui-theme", "pearl-apricot");
    await db.preferences.delete("device-preference:theme");
    await (await initializePreferences()).refresh();
    location.search = "?theme=peach";
    const stop = initializeTheme();
    expect(themeSnapshot().id).toBe("peach");
    expect(storedThemeChoice()).toBe("pearl-apricot");
    stop();
  });
});
