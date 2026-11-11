import { expect, it } from "vitest";
import {
  resolveCapabilities,
  resolveDeployment,
  type Platform,
} from "./capabilities";

const profiles = [
  {
    name: "CN Web",
    platform: "web",
    region: "cn",
    environment: "sandbox",
    backend: "cn-postgres",
    path: "/cn-test/api/v1",
    database: "LifeRPG-0.2",
    prefix: "",
    payment: "redemption-code",
    license: "cn-signed-license",
    cloud: false,
  },
  {
    name: "CN Android",
    platform: "android",
    region: "cn",
    environment: "sandbox",
    backend: "cn-postgres",
    path: "/cn-test/api/v1",
    database: "LifeRPG-0.2",
    prefix: "",
    payment: "redemption-code",
    license: "cn-signed-license",
    cloud: false,
  },
  {
    name: "Global Web",
    platform: "web",
    region: "global",
    environment: "sandbox",
    backend: "global-postgres",
    path: "/global-test/api/v1",
    database: "Statify-global-0.2",
    prefix: "",
    payment: "paypal",
    license: "global-signed-offline-receipt",
    cloud: true,
  },
  {
    name: "Global Android live",
    platform: "android",
    region: "global",
    environment: "live",
    backend: "global-postgres",
    path: "/global-live/api/v1",
    database: "Statify-global-0.2",
    prefix: "",
    payment: "paypal",
    license: "global-signed-offline-receipt",
    cloud: true,
  },
  {
    name: "CN PWA",
    platform: "pwa",
    region: "cn",
    environment: "sandbox",
    backend: "cn-postgres",
    path: "/cn-test/api/v1",
    database: "Statify-mainland-web-preview",
    prefix: "statify-mainland-preview:",
    payment: "redemption-code",
    license: "cn-signed-license",
    cloud: false,
  },
  {
    name: "Global PWA legacy",
    platform: "pwa",
    region: "global",
    environment: "live",
    backend: "legacy-payments",
    path: "/global-live/api/v1",
    database: "Statify-international-web-preview",
    prefix: "statify-international-preview:",
    payment: "paypal",
    license: "legacy-online-entitlement",
    cloud: false,
  },
  {
    name: "Global PWA signed account and opt-in cloud",
    platform: "pwa", region: "global", environment: "live", backend: "global-postgres",
    path: "/global-live/api/v1", database: "Statify-international-web-preview",
    prefix: "statify-international-preview:", payment: "paypal",
    license: "global-signed-offline-receipt", cloud: true,
  },
] as const;

it.each(profiles)(
  "$name retains the independently specified deployment contract",
  (profile) => {
    const result = resolveCapabilities({
      ...profile,
      apiPath: profile.path,
      databaseName: profile.database,
      storagePrefix: profile.prefix,
    });
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({
      backend: profile.backend,
      payment: profile.payment,
      license: profile.license,
      cloud: profile.cloud,
      display: {
        language: profile.region === "cn" ? "zh-CN" : "en",
        locale: profile.region === "cn" ? undefined : "en",
      },
      api: {
        path: profile.path,
        transport:
          profile.platform === "android"
            ? "android-bridge"
            : "same-origin-fetch",
      },
      data: {
        region: profile.region,
        databaseName: profile.database,
        storagePrefix: profile.prefix,
        offlineAccountKey:
          profile.region === "cn"
            ? "statify-cn-test-account-v1"
            : `statify-global-${profile.environment}-account-v1`,
      },
    });
  },
);

it.each(profiles)(
  "$name cannot change identity or data scope through display choices",
  (profile) => {
    const input = {
      ...profile,
      apiPath: profile.path,
      databaseName: profile.database,
      storagePrefix: profile.prefix,
    };
    const { display: original, ...before } = resolveCapabilities(input);
    const { display, ...after } = resolveCapabilities({
      ...input,
      language: profile.region === "cn" ? "en" : "zh-CN",
      locale: "de-DE",
    });
    expect(display).not.toEqual(original);
    expect(after).toEqual(before);
  },
);

it("only DEV region preview may override the configured region", () => {
  expect(
    resolveDeployment({ previewRegion: "global", development: false }),
  ).toEqual({ region: "cn", environment: "sandbox", backend: "cn-postgres" });
  expect(
    resolveDeployment({ previewRegion: "global", development: true }).region,
  ).toBe("global");
  expect(resolveDeployment({ region: "cn", environment: "live" }).backend).toBe(
    "legacy-payments",
  );
});

it.each(["ios", "unsupported"] as Platform[])(
  "%s remains unimplemented without claiming native or cloud support",
  (platform) => {
    const result = resolveCapabilities({
      region: "global",
      environment: "live",
      backend: "global-postgres",
      platform,
    });
    expect(result.status).toBe("unimplemented");
    expect(result.api.transport).toBe("unimplemented");
    expect(result.native.device).toBe(false);
    expect(result.native.payments).toBe(false);
    expect(result.cloud).toBe(false);
    expect(result.issues).not.toEqual([]);
  },
);

it("retains the legacy native /api/v1 route even when the Web bundle has the international override", () => {
  const result = resolveCapabilities({
    region: "global",
    environment: "live",
    backend: "legacy-payments",
    platform: "android",
    apiPath: "/global-live/api/v1",
  });
  expect(result.api).toEqual({
    path: "/api/v1",
    nativePath: "/api/v1",
    webPath: "/global-live/api/v1",
    transport: "android-bridge",
  });
  expect(result.issues).toEqual([]);
});

it.each([
  { configuredRegion: "bad", issue: "unknown-region" },
  { configuredEnvironment: "production", issue: "unknown-environment" },
  { configuredBackend: "global-postgres", issue: "account-backend-mismatch" },
  { apiPath: "https://example.invalid/api", issue: "unsupported-api-path" },
  { apiPath: "/global-live/api/v1", issue: "unsupported-api-path" },
])(
  "reports $issue without echoing raw configuration",
  ({ issue, ...invalid }) => {
    const result = resolveCapabilities({
      region: "cn",
      environment: "sandbox",
      backend: "cn-postgres",
      platform: "web",
      ...invalid,
    });
    expect(result.issues).toEqual([issue]);
    expect(result.api.path).toBe("/cn-test/api/v1");
    expect(result.cloud).toBe(false);
  },
);

it("does not enable PWA cloud with an unscoped database", () => {
  const result = resolveCapabilities({
    region: "global",
    environment: "live",
    backend: "global-postgres",
    platform: "pwa",
  });
  expect(result.issues).toEqual([
    "pwa-storage-mismatch",
  ]);
  expect(result.cloud).toBe(false);
});
