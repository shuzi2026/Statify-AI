import { afterEach, expect, it, vi } from "vitest";
const host = vi.hoisted(() => ({
  platform: "web",
  build: "web-runtime",
  backend: "cn-postgres",
  region: "cn",
  environment: "sandbox",
  register: vi.fn(() => ({})),
  registrations: [] as string[],
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => host.platform },
  registerPlugin: (name: string) => {
    host.registrations.push(name);
    return host.register();
  },
}));
vi.mock("../build-identity", () => ({
  buildIdentity: {
    get platform() {
      return host.build;
    },
  },
}));
vi.mock("../payments/deployment", () => ({
  get accountBackend() {
    return host.backend;
  },
  get paymentRegion() {
    return host.region;
  },
  get paymentEnvironment() {
    return host.environment;
  },
  get cnAccountBackend() {
    return host.backend === "cn-postgres";
  },
  get globalAppBackend() {
    return host.backend === "global-postgres";
  },
}));
import { platformCapabilities } from "./runtime";
import {
  paymentRequest,
  readOfflineAccount,
  openPaymentCheckout,
} from "../payments/transport";
import { runtimeIssues } from "../runtime-diagnostics";
afterEach(() => {
  host.platform = "web";
  host.build = "web-runtime";
  host.backend = "cn-postgres";
  host.region = "cn";
  host.environment = "sandbox";
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("keeps the guest app supported without sending account requests or reading licences", async () => {
  host.region = "global";
  host.backend = "none";
  vi.stubEnv("VITE_STATIFY_ACCOUNT_BACKEND", "none");
  const fetch = vi.fn(), getItem = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("localStorage", { getItem });
  expect(platformCapabilities()).toMatchObject({
    status: "implemented", backend: "none", cloud: false, issues: [],
    api: { transport: "unimplemented" },
  });
  await expect(paymentRequest("/auth/login", {})).rejects.toMatchObject({ kind: "configuration" });
  await expect(readOfflineAccount()).resolves.toBe("");
  expect(fetch).not.toHaveBeenCalled();
  expect(getItem).not.toHaveBeenCalled();
});

it("registers each native proxy once across device/transport consumers", async () => {
  await import("../haptics");
  await import("../compatibility");
  await import("../system-bars");
  expect(host.registrations).toEqual(["StatifyDevice", "StatifyPayments"]);
});
it("uses build identity for PWA; display mode and browser language cannot switch data or account", () => {
  const before = platformCapabilities();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("navigator", { language: "en-US" });
  expect(platformCapabilities()).toEqual(before);
  host.build = "pwa";
  expect(platformCapabilities().platform).toBe("pwa");
  expect(platformCapabilities().issues).toContain("pwa-storage-mismatch");
});
it("rejects a misconfigured route before either transport and records a safe configuration diagnostic", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv(
    "VITE_STATIFY_PAYMENT_API_PATH",
    "https://private.invalid/token-secret",
  );
  await expect(paymentRequest("/me")).rejects.toMatchObject({
    kind: "configuration",
    mayHaveSucceeded: false,
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(
    runtimeIssues().some((issue) => issue.category === "configuration"),
  ).toBe(true);
  expect(JSON.stringify(runtimeIssues())).not.toContain("token-secret");
});
it("keeps international PWA on legacy fetch with cloud disabled", async () => {
  host.build = "pwa";
  host.region = "global";
  host.environment = "live";
  host.backend = "legacy-payments";
  vi.stubEnv("VITE_STATIFY_PAYMENT_API_PATH", "/global-live/api/v1");
  vi.stubEnv("VITE_STATIFY_DATABASE_NAME", "Statify-international-web-preview");
  vi.stubEnv("VITE_STATIFY_STORAGE_PREFIX", "statify-international-preview:");
  const fetch = vi.fn().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", fetch);
  expect(platformCapabilities()).toMatchObject({
    cloud: false,
    backend: "legacy-payments",
    issues: [],
  });
  await paymentRequest("/me");
  expect(fetch.mock.calls[0][0]).toBe("/global-live/api/v1/me");
});
it("iOS does not fall back to Web credentials, payments or cloud", async () => {
  host.platform = "ios";
  host.region = "global";
  host.backend = "global-postgres";
  const fetch = vi.fn(),
    getItem = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("localStorage", { getItem });
  expect(platformCapabilities().cloud).toBe(false);
  await expect(paymentRequest("/me")).rejects.toMatchObject({
    kind: "configuration",
  });
  await expect(
    openPaymentCheckout("https://www.sandbox.paypal.com/", "sandbox"),
  ).rejects.toMatchObject({ kind: "configuration" });
  expect(await readOfflineAccount()).toBe("");
  expect(fetch).not.toHaveBeenCalled();
  expect(getItem).not.toHaveBeenCalled();
});
