/** Deployment facts, not account entitlements or proof that a server is online. */
export type Region = "cn" | "global";
export type PaymentEnvironment = "sandbox" | "live";
export type AccountBackend =
  "cn-postgres" | "global-postgres" | "legacy-payments" | "none";
export type Platform = "web" | "pwa" | "android" | "ios" | "unsupported";
export type Language = "zh-CN" | "en";

export function resolveDeployment(input: {
  region?: string;
  environment?: string;
  backend?: string;
  development?: boolean;
  previewRegion?: string | null;
}) {
  const region: Region =
    (input.development && input.previewRegion === "global") ||
    input.region === "global"
      ? "global"
      : "cn";
  const environment: PaymentEnvironment =
    input.environment === "live" ? "live" : "sandbox";
  const backend: AccountBackend =
    input.backend === "legacy-payments" || input.backend === "none"
      ? input.backend
      : region === "global"
        ? "global-postgres"
        : environment === "sandbox"
          ? "cn-postgres"
          : "legacy-payments";
  return { region, environment, backend };
}

/** Display choices never feed account routing, namespaces or license verification. */
export function displayDefaults(region: Region): {
  language: Language;
  locale: "en" | undefined;
};
export function displayDefaults(
  region: Region,
  language: Language | undefined,
  locale: string | undefined,
): { language: Language; locale: string | undefined };
export function displayDefaults(
  region: Region,
  language?: Language,
  locale?: string,
) {
  return {
    language: language ?? (region === "global" ? "en" : "zh-CN"),
    locale: locale ?? (region === "global" ? "en" : undefined),
  };
}

export function dataScope(
  region: Region,
  environment: PaymentEnvironment,
  databaseName?: string,
  storagePrefix?: string,
) {
  return {
    region,
    databaseName:
      databaseName || (region === "cn" ? "LifeRPG-0.2" : "Statify-global-0.2"),
    storagePrefix: storagePrefix || "",
    offlineAccountKey:
      region === "global"
        ? `statify-global-${environment}-account-v1`
        : "statify-cn-test-account-v1",
  };
}

export function resolveCapabilities(input: {
  region: Region;
  environment: PaymentEnvironment;
  backend: AccountBackend;
  platform: Platform;
  apiPath?: string;
  databaseName?: string;
  storagePrefix?: string;
  language?: Language;
  locale?: string;
  configuredRegion?: string;
  configuredEnvironment?: string;
  configuredBackend?: string;
}) {
  const { region, environment, backend, platform } = input;
  const issues: string[] = [];
  if (
    input.configuredRegion &&
    !["cn", "global"].includes(input.configuredRegion)
  )
    issues.push("unknown-region");
  if (
    input.configuredEnvironment &&
    !["sandbox", "live"].includes(input.configuredEnvironment)
  )
    issues.push("unknown-environment");
  if (input.configuredBackend && input.configuredBackend !== backend)
    issues.push("account-backend-mismatch");
  if (
    (backend === "cn-postgres" &&
      (region !== "cn" || environment !== "sandbox")) ||
    (backend === "global-postgres" && region !== "global")
  )
    issues.push("account-region-mismatch");
  const nativeApiPath =
    backend === "none"
      ? ""
      : backend === "global-postgres"
      ? environment === "live"
        ? "/global-live/api/v1"
        : "/global-test/api/v1"
      : backend === "cn-postgres"
        ? "/cn-test/api/v1"
        : "/api/v1";
  // Only the existing international legacy Web deployment has a route override.
  const webApiPath =
    backend === "legacy-payments" &&
    region === "global" &&
    environment === "live" &&
    input.apiPath === "/global-live/api/v1"
      ? input.apiPath
      : nativeApiPath;
  if (backend !== "none" && input.apiPath && input.apiPath !== webApiPath)
    issues.push("unsupported-api-path");
  const data = dataScope(
    region,
    environment,
    input.databaseName,
    input.storagePrefix,
  );
  if (platform === "pwa") {
    const market = region === "cn" ? "mainland" : "international";
    if (
      (region === "cn" ? backend !== "cn-postgres" : !["global-postgres", "legacy-payments"].includes(backend)) ||
      environment !== (region === "cn" ? "sandbox" : "live")
    )
      issues.push("pwa-backend-mismatch");
    if (
      webApiPath !==
      (region === "cn" ? "/cn-test/api/v1" : "/global-live/api/v1")
    )
      issues.push("pwa-api-mismatch");
    if (
      data.databaseName !== `Statify-${market}-web-preview` ||
      data.storagePrefix !== `statify-${market}-preview:`
    )
      issues.push("pwa-storage-mismatch");
  }
  if (platform === "ios") issues.push("ios-unimplemented");
  if (platform === "unsupported") issues.push("unsupported-platform");
  const supported = platform !== "ios" && platform !== "unsupported";
  const accountSupported = supported && backend !== "none";
  return {
    region,
    environment,
    platform,
    backend,
    status: supported ? ("implemented" as const) : ("unimplemented" as const),
    display: displayDefaults(region, input.language, input.locale),
    api: {
      transport: !accountSupported
        ? ("unimplemented" as const)
        : platform === "android"
          ? ("android-bridge" as const)
          : ("same-origin-fetch" as const),
      path: platform === "android" ? nativeApiPath : webApiPath,
      webPath: webApiPath,
      nativePath: nativeApiPath,
    },
    payment: !accountSupported
      ? ("unimplemented" as const)
      : backend === "cn-postgres"
        ? ("redemption-code" as const)
        : ("paypal" as const),
    license: !accountSupported
      ? ("unimplemented" as const)
      : backend === "cn-postgres"
        ? ("cn-signed-license" as const)
        : backend === "global-postgres"
          ? ("global-signed-offline-receipt" as const)
          : ("legacy-online-entitlement" as const),
    // This only permits the controller to start; opt-in, session, entitlement and
    // revision/ownership checks remain in the account/cloud implementations.
    cloud:
      supported &&
      issues.length === 0 &&
      backend === "global-postgres",
    native: {
      device: platform === "android",
      payments: accountSupported && platform === "android",
      accountStorage: !accountSupported
        ? ("unimplemented" as const)
        : platform === "android"
          ? ("encrypted-native" as const)
          : ("browser-local" as const),
    },
    data,
    issues,
  };
}
