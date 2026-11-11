import { resolveDeployment } from "../platform/capabilities";
import { isGuestPreview } from "./preview-access";
const deployment = resolveDeployment({
  region: import.meta.env.VITE_STATIFY_REGION,
  environment: import.meta.env.VITE_STATIFY_PAYMENT_ENV,
  backend: isGuestPreview() ? "none" : import.meta.env.VITE_STATIFY_ACCOUNT_BACKEND,
  development: import.meta.env.DEV && !import.meta.env.VITE_STATIFY_REGION,
  previewRegion:
    typeof location === "undefined"
      ? null
      : new URLSearchParams(location.search).get("region"),
});
export const paymentRegion = deployment.region;
export const paymentEnvironment = deployment.environment;
export const accountBackend = deployment.backend;
export const cnAccountBackend = accountBackend === "cn-postgres";
export const globalAppBackend = accountBackend === "global-postgres";
