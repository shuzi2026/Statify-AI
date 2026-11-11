export type Dispose = () => void;
type Setup = () => void | Dispose;
/** Multiple consumers share resources; only the last release destroys them. */
export function sharedService(start: Setup): () => Dispose {
  let owners = 0;
  let stop: void | Dispose;
  return () => {
    if (owners === 0) stop = start();
    owners++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--owners === 0) {
        const cleanup = stop;
        stop = undefined;
        cleanup?.();
      }
    };
  };
}
export type StartupSnapshot = {
  phase: "idle" | "loading" | "ready" | "failed";
  error: unknown;
};

/** One owner for process resources; React remounts only subscribe to readiness. */
export function createApplicationLifecycle(ports: {
  prepare: readonly Setup[];
  load: () => Promise<unknown>;
  online: readonly Setup[];
  afterLocal: readonly Setup[];
  report: (error: unknown) => void;
}) {
  let snapshot: StartupSnapshot = { phase: "idle", error: null };
  let owners = 0,
    epoch = 0;
  let loading: Promise<unknown> | undefined;
  let cleanup: Dispose[] = [];
  const listeners = new Set<() => void>();
  const report = (error: unknown) => {
    try {
      ports.report(error);
    } catch {
      /* Diagnostics cannot prevent cleanup. */
    }
  };
  const publish = (next: StartupSnapshot) => {
    snapshot = next;
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        report(error);
      }
    }
  };
  const setup = (start: Setup) => {
    try {
      const stop = start();
      if (stop) cleanup.push(stop);
    } catch (error) {
      report(error);
    }
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (owners++ === 0) {
        const started = ++epoch;
        publish({ phase: "loading", error: null });
        ports.prepare.forEach(setup);
        // Loading is shared while in flight, including dispose/re-enter. Storage
        // owns its atomic transaction; a disposed session cannot publish readiness.
        if (!loading) {
          const pending = Promise.resolve().then(ports.load);
          loading = pending;
          void pending.then(
            () => {
              if (loading === pending) loading = undefined;
            },
            () => {
              if (loading === pending) loading = undefined;
            },
          );
        }
        void loading.then(
          () => {
            if (!owners || started !== epoch) return;
            ports.afterLocal.forEach(setup);
            publish({ phase: "ready", error: null });
          },
          (error) => {
            if (!owners || started !== epoch) return;
            report(error);
            publish({ phase: "failed", error });
          },
        );
        // Neither network nor optional device capabilities block local storage.
        ports.online.forEach(setup);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--owners !== 0) return;
        ++epoch;
        const stops = cleanup;
        cleanup = [];
        for (const stop of stops.reverse()) {
          try {
            stop();
          } catch (error) {
            report(error);
          }
        }
        publish({ phase: "idle", error: null });
      };
    },
  };
}
