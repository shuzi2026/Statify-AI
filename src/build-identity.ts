export type BuildIdentity = {
  schema: number;
  productVersion: string;
  region: string;
  platform: string;
  mode: string;
  buildId: string;
  sourceHash: string;
  sourceScope: string;
};
export const buildIdentity: BuildIdentity =
  typeof __STATIFY_BUILD_IDENTITY__ === "undefined"
    ? {
        schema: 1,
        productVersion: "test",
        region: "test",
        platform: "test",
        mode: "test",
        buildId: "test-unbundled",
        sourceHash: "",
        sourceScope: "unbundled test",
      }
    : __STATIFY_BUILD_IDENTITY__;

// Ask the actual controller, not registration.active (which may be a different build).
export async function workerIdentity(): Promise<{
  status: string;
  revision?: string;
  buildId?: string;
}> {
  let worker: ServiceWorker | null | undefined;
  try {
    worker =
      typeof navigator !== "undefined"
        ? navigator.serviceWorker?.controller
        : undefined;
  } catch {
    return { status: "unavailable" };
  }
  if (!worker) return { status: "uncontrolled" };
  if (typeof MessageChannel === "undefined") return { status: "unavailable" };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value: {
      status: string;
      revision?: string;
      buildId?: string;
    }) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(value);
    };
    const timer = setTimeout(
      () => finish({ status: "legacy-or-unresponsive" }),
      800,
    );
    channel.port1.onmessage = (event) => {
      const value = event.data;
      if (!value || !/^[a-f0-9]{20}$/.test(value.revision)) return;
      finish({
        status: value.complete ? "complete" : "incomplete",
        revision: value.revision,
        buildId: /^[a-zA-Z0-9_.-]{1,120}$/.test(value.buildId)
          ? value.buildId
          : "legacy-unknown",
      });
    };
    try {
      worker.postMessage({ type: "STATIFY_BUILD_STATUS" }, [channel.port2]);
    } catch {
      finish({ status: "unavailable" });
    }
  });
}
