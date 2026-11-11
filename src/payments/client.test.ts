import { it, expect, vi, afterEach } from "vitest";
import { refreshPayments, recoverPaymentOrders, startPaymentRefresh } from "./client";
import { memberActive, acceptEntitlement } from "./access";
// These are the legacy PayPal service tests; the standard CN app now uses the
// independent PostgreSQL account service by default.
vi.mock("./deployment", () => ({
  accountBackend: "legacy-payments",
  cnAccountBackend: false,
  globalAppBackend: false,
  paymentRegion: "cn",
  paymentEnvironment: "sandbox",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  acceptEntitlement(null);
});
it("a disposed legacy initializer cannot apply a late membership response or recover its orders", async () => {
  vi.stubGlobal("window", new EventTarget());
  let resolve!: (value: Response) => void;
  const request = vi.fn(async (url: string) => url.endsWith("/config")
    ? Response.json({region:"cn",environment:"sandbox",sales_enabled:false,offer:null})
    : new Promise<Response>(r => {resolve = r;}));
  vi.stubGlobal("fetch",request);
  const stop = startPaymentRefresh();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  stop();
  resolve(Response.json({account:{id:"old",username:"old"},entitlement:{member:true,valid_until:Date.now()+100000}}));
  await new Promise(r => setTimeout(r,0));
  expect(memberActive()).toBe(false);
  expect(request).toHaveBeenCalledTimes(2);
});
it("an older in-flight refresh cannot overwrite a newer verified membership", async () => {
  let resolveOld!: (r: Response) => void,
    calls = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/config"))
      return Response.json({
        region: "cn",
        environment: "sandbox",
        sales_enabled: false,
        offer: null,
      });
    calls++;
    if (calls === 1)
      return new Promise<Response>((resolve) => {
        resolveOld = resolve;
      });
    return Response.json({
      account: { id: "test", username: "tester" },
      entitlement: {
        member: true,
        trial_ends_at: null,
        trial_available: false,
        initial_adjustment_until: null,
        initial_adjustment: null,
        valid_until: Date.now() + 900000,
      },
    });
  });
  const old = refreshPayments();
  await refreshPayments();
  expect(memberActive()).toBe(true);
  resolveOld(Response.json({ account: null, entitlement: null }));
  await old;
  expect(memberActive()).toBe(true);
});
it("returning from checkout captures the original pending order once and refreshes verified membership", async () => {
  let paid = false;
  const captures: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/config"))
      return Response.json({
        region: "cn",
        environment: "sandbox",
        sales_enabled: false,
        offer: null,
      });
    if (url.endsWith("/me"))
      return Response.json({
        account: { id: "alice", username: "alice" },
        entitlement: {
          member: paid,
          trial_ends_at: null,
          trial_available: false,
          initial_adjustment_until: null,
          initial_adjustment: null,
          valid_until: Date.now() + 900000,
        },
      });
    if (url.endsWith("/orders"))
      return Response.json({
        items: [
          { id: "original-order", status: "created" },
          { id: "old-paid-order", status: "completed" },
        ],
        next_cursor: null,
      });
    if (url.endsWith("/capture")) {
      captures.push(url);
      paid = true;
      return Response.json({ status: "completed" });
    }
    throw Error("Unexpected request: " + url);
  });
  await Promise.all([recoverPaymentOrders(), recoverPaymentOrders()]);
  expect(captures).toEqual(["/api/v1/orders/original-order/capture"]);
  expect(memberActive()).toBe(true);
});
it("a mismatched deployment does not recover or capture an order", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith("/config")
        ? {
            region: "global",
            environment: "live",
            sales_enabled: true,
            offer: null,
          }
        : { account: { id: "alice" }, entitlement: null },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  await recoverPaymentOrders();
  expect(
    fetch.mock.calls.every(
      ([url]) => url.endsWith("/config") || url.endsWith("/me"),
    ),
  ).toBe(true);
  expect(memberActive()).toBe(false);
});
