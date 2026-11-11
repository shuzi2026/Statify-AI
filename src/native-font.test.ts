import { afterEach, expect, it, vi } from "vitest";
const environment = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: () => ({ environment }),
}));
vi.mock("./themes/runtime", () => ({
  themeSnapshot: () => ({ id: "night-sprout" }),
}));
import { applyNativeFontScale } from "./compatibility";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("a disposed native environment read cannot repaint a new session's font scale", async () => {
  const root = {
    dataset: { largeText: "false" },
    style: { setProperty: vi.fn() },
  };
  vi.stubGlobal("document", { documentElement: root });
  let finish!: (value: { fontScale: number }) => void,
    active = true;
  environment.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = applyNativeFontScale(() => active);
  active = false;
  finish({ fontScale: 2 });
  await pending;
  expect(root.style.setProperty).not.toHaveBeenCalled();
  expect(root.dataset.largeText).toBe("false");
  environment.mockResolvedValueOnce({ fontScale: 1.5 });
  await applyNativeFontScale();
  expect(root.style.setProperty).toHaveBeenCalledWith(
    "--layout-font-scale",
    "1.5",
  );
});
