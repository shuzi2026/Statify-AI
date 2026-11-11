import { it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  platform: "web",
  tick: vi.fn(async () => {}),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => mock.platform },
  registerPlugin: () => ({ selectionTick: mock.tick }),
}));
it("ticks only on Android, throttles repeated selections and ignores hidden pages", async () => {
  const visibility = { hidden: false };
  vi.stubGlobal("document", visibility);
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const { selectionTick } = await import("./haptics");
  selectionTick();
  expect(mock.tick).toHaveBeenCalledTimes(0);
  mock.platform = "android";
  selectionTick();
  selectionTick();
  expect(mock.tick).toHaveBeenCalledTimes(1);
  now += 90;
  selectionTick();
  expect(mock.tick).toHaveBeenCalledTimes(2);
  visibility.hidden = true;
  now += 100;
  selectionTick();
  expect(mock.tick).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
