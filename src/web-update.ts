export type UpdateStatus =
  | "unsupported"
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "current"
  | "failed";

// Checking only downloads a candidate. Adoption belongs to the browser lifecycle:
// no skipWaiting, controller takeover, reload or access to application saves.
export function createUpdateMonitor() {
  let status: UpdateStatus = "unsupported";
  const listeners = new Set<() => void>();
  let registration: ServiceWorkerRegistration | undefined;
  let pending: Promise<void> | undefined;
  let disposed = false;
  let generation = 0;
  let retryRegistration: (() => Promise<ServiceWorkerRegistration>) | undefined;
  let removeRegistrationListener = () => {};
  let removeWorkerListener = () => {};
  let observed: ServiceWorker | undefined;
  function set(next: UpdateStatus) {
    if (disposed || status === next) return;
    status = next;
    listeners.forEach((listener) => listener());
  }
  function watch(worker: ServiceWorker) {
    if (disposed || observed === worker) return;
    removeWorkerListener();
    observed = worker;
    const changed = () => {
      if (worker.state === "redundant") {
        // A failed first install can remove its registration entirely.
        if (!registration?.active) registration = undefined;
        set("failed");
      } else if (worker.state === "installed")
        set(registration?.active ? "ready" : "current");
      else if (worker.state === "activated") set("current");
      else set("downloading");
    };
    worker.addEventListener("statechange", changed);
    removeWorkerListener = () =>
      worker.removeEventListener("statechange", changed);
    changed();
  }
  async function start(
    result: Promise<ServiceWorkerRegistration>,
    retry?: () => Promise<ServiceWorkerRegistration>,
  ) {
    const started = ++generation;
    retryRegistration = retry;
    set("checking");
    try {
      const value = await result;
      if (disposed || started !== generation) return;
      removeRegistrationListener();
      removeWorkerListener();
      observed = undefined;
      registration = value;
      const found = () => {
        if (value.installing) watch(value.installing);
      };
      value.addEventListener("updatefound", found);
      removeRegistrationListener = () =>
        value.removeEventListener("updatefound", found);
      if (value.waiting) set("ready");
      else if (value.installing) watch(value.installing);
      else set("idle");
    } catch {
      if (started === generation) set("failed");
    }
  }
  function check() {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    if (!registration) {
      if (!retryRegistration) return Promise.resolve();
      pending = start(retryRegistration(), retryRegistration).finally(() => {
        pending = undefined;
      });
      return pending;
    }
    const value = registration;
    const started = generation;
    set("checking");
    pending = value
      .update()
      .then(
        () => {
          if (disposed || started !== generation) return;
          if (value.installing) watch(value.installing);
          else set(value.waiting ? "ready" : "current");
        },
        () => {
          if (started === generation) set(value.waiting ? "ready" : "failed");
        },
      )
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }
  return {
    start,
    check,
    snapshot: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      removeRegistrationListener();
      removeWorkerListener();
      listeners.clear();
    },
  };
}

export let webUpdates = createUpdateMonitor();
let initialized = false;
export function disposeWebUpdates() {
  webUpdates.dispose();
  webUpdates = createUpdateMonitor();
  initialized = false;
}

declare global {
  interface Window {
    __statifyWorkerRegistration?: Promise<ServiceWorkerRegistration>;
  }
}

export function initializeWebUpdates() {
  if (
    initialized ||
    !/^https?:$/.test(location.protocol) ||
    !("serviceWorker" in navigator)
  )
    return;
  initialized = true;
  // Reuse the early PWA registration even if the main module arrived much later.
  const registration =
    window.__statifyWorkerRegistration ??
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", {
      updateViaCache: "none",
    });
  window.__statifyWorkerRegistration = registration;
  void webUpdates.start(registration, () =>
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", {
      updateViaCache: "none",
    }),
  );
}
