import { it, expect, vi, afterEach } from "vitest";
vi.mock("./deployment", () => ({
  accountBackend: "global-postgres",
  globalAppBackend: true,
  cnAccountBackend: false,
  paymentRegion: "global",
  paymentEnvironment: "sandbox",
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "web" },
  registerPlugin: () => ({}),
}));
import { openPaymentCheckout } from "./transport";
afterEach(() => vi.unstubAllGlobals());
it("international web checkout navigates reliably without depending on an async popup", async () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  const url = "https://www.sandbox.paypal.com/checkoutnow?token=test";
  await openPaymentCheckout(url, "sandbox");
  expect(assign).toHaveBeenCalledWith(url);
});
it("checkout rejects credentials, ports and another environment before navigation", async () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  for (const url of [
    "https://www.paypal.com/checkoutnow",
    "https://evil.invalid/",
    "https://user@www.sandbox.paypal.com/",
    "https://www.sandbox.paypal.com:123/",
  ])
    await expect(openPaymentCheckout(url, "sandbox")).rejects.toThrow();
  expect(assign).not.toHaveBeenCalled();
});
