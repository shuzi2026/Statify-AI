import { buildIdentity } from "../build-identity";
import {
  accountBackend,
  paymentEnvironment,
  paymentRegion,
} from "../payments/deployment";
import { resolveCapabilities, type Platform } from "./capabilities";
import { nativePlatform } from "./native";
import { isGuestPreview } from "../payments/preview-access";

export function platformCapabilities() {
  const host = nativePlatform();
  // Installation/display-mode does not change the backend or the storage scope.
  const platform: Platform =
    host === "android" || host === "ios"
      ? host
      : host === "web"
        ? buildIdentity.platform === "pwa"
          ? "pwa"
          : "web"
        : "unsupported";
  return resolveCapabilities({
    region: paymentRegion,
    environment: paymentEnvironment,
    backend: accountBackend,
    platform,
    apiPath: import.meta.env.VITE_STATIFY_PAYMENT_API_PATH,
    databaseName: import.meta.env.VITE_STATIFY_DATABASE_NAME,
    storagePrefix: import.meta.env.VITE_STATIFY_STORAGE_PREFIX,
    configuredRegion: import.meta.env.VITE_STATIFY_REGION,
    configuredEnvironment: import.meta.env.VITE_STATIFY_PAYMENT_ENV,
    configuredBackend: isGuestPreview() ? "none" : import.meta.env.VITE_STATIFY_ACCOUNT_BACKEND,
  });
}
