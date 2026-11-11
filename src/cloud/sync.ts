import { z } from "zod";
import { db, readCloudSnapshot } from "../storage";
import {
  application,
  type CommandCoordinator,
  type Result,
} from "../application/runtime";
import { canonical } from "../storage-format";
import { cloudTiming } from "../../shared/rules/storage";
import { sharedService } from "../application/lifecycle";
import {
  requestScope,
  linkRequestSignals,
  PaymentRequestError,
  type RequestOptions,
} from "../payments/request-policy";
import { assertSaveScope, saveSnapshot } from "../save-publication";
import { cloudContent } from "./content";
import { ReplacementCancelled } from "../application/save-replacement";

/** Account/transport wiring stays with its regional service; no implicit login or network endpoint here. */
export type CloudPorts = {
  enabled: boolean;
  getAccount: () => {
    account: { id: string } | null;
    offline: boolean;
    entitlement: { member: boolean; trial_ends_at: number | null } | null;
  };
  subscribeAccount: (listener: () => void) => () => void;
  request: <T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ) => Promise<T>;
};
export type Mode = "off" | "manual" | "auto";
type Meta = {
  mode: Mode;
  revision: number;
  digest: string | null;
  contentDigest?: string;
  at: number | null;
};
type Head = {
  revision: number;
  snapshot: string | null;
  digest: string | null;
  updated_at: number | null;
  coordination_version?: 1;
  timer?: {
    action_id: string;
    device_id: string | null;
    card_name: string;
    phase: "running" | "paused" | "settlement";
  } | null;
};
type Conflict = {
  head: Head;
  localRevision: number;
  localDigest: string;
  reason: "first" | "conflict" | "account";
};
export type Snapshot = {
  mode: Mode;
  busy: boolean;
  error: string;
  message: string;
  conflict: Conflict | null;
  at: number | null;
  owner: string | null;
  coordination: boolean;
  remoteTimerIds: readonly string[];
};
export function createCloudSync(ports: CloudPorts) {
  const {
    getAccount: getGlobalAccount,
    subscribeAccount: subscribeGlobalAccount,
    request: globalAction,
  } = ports;
  let snapshot: Snapshot = {
    mode: "off",
    busy: false,
    error: "",
    message: "",
    conflict: null,
    at: null,
    owner: null,
    coordination: false,
    remoteTimerIds: [],
  };
  let meta: Meta = { mode: "off", revision: 0, digest: null, at: null },
    accountId: string | null = null,
    epoch = 0,
    pending = false,
    rerun = false;
  let lastHead: Head | undefined, syncFailure: unknown;
  let syncSettled = Promise.resolve();
  let reservation: { id: string; account: string; epoch: number } | undefined;
  let commandTail: Promise<unknown> = Promise.resolve();
  async function deviceId() {
    return db.transaction("rw", db.preferences, async () => {
      const stored = await db.preferences.get("global-sync-device");
      if (typeof stored?.value === "string") return stored.value;
      const id = crypto.randomUUID();
      await db.preferences.put({ id: "global-sync-device", value: id });
      return id;
    });
  }
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const requests = requestScope();
  const invalidate = () => {
    ++epoch;
    requests.invalidate();
    pending = false;
    rerun = false;
    clearTimeout(retryTimer);
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((fn) => fn());
  };
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const getSnapshot = () => snapshot;
  function remoteTimers(timer: Head["timer"], mine: string | null) {
    if (meta.mode !== "auto") return [];
    // The new cloud head can arrive before its save is loaded. Keep the
    // existing remote timer read-only while that action is still on screen.
    const current = saveSnapshot()?.state.actions.find(
      (action) => snapshot.remoteTimerIds.includes(action.id),
    );
    const ids =
      current && (timer?.action_id !== current.id || !timer.device_id)
        ? [current.id]
        : [];
    if (timer?.device_id && timer.device_id !== mine)
      ids.push(timer.action_id);
    return ids;
  }
  const hash = async (s: string) => {
    if (!crypto.subtle)
      throw Error(
        "This device or connection lacks secure hashing (HTTPS is required). Cloud sync is unavailable.",
      );
    return Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
      ),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
  };
  async function local(expectedRevision?: number, cloudWriter?: string) {
    const current = await readCloudSnapshot(expectedRevision),
      raw = JSON.parse(current.text);
    delete raw.exportedAt;
    // Attribute cloud updates without changing character data or its digest.
    if (cloudWriter) raw.cloudWriter = cloudWriter;
    const text = canonical(raw);
    return {
      text,
      digest: await hash(text),
      contentDigest: await hash(cloudContent(text)),
      revision: current.revision,
    };
  }
  const active = () => {
    if (!ports.enabled) return false;
    const p = getGlobalAccount(),
      e = p.entitlement;
    return (
      !!p.account &&
      !p.offline &&
      !!e &&
      (e.member || (e.trial_ends_at || 0) > Date.now())
    );
  };
  async function saveMeta(
    id: string,
    requestEpoch: number,
    value: Meta,
    owner = false,
  ) {
    await db.transaction("rw", db.preferences, async () => {
      assertIdentity(id, requestEpoch);
      if (owner)
        await db.preferences.put({ id: "global-sync-owner", value: id });
      await db.preferences.put({ id: "global-sync:" + id, value });
      assertIdentity(id, requestEpoch);
    });
    assertIdentity(id, requestEpoch);
    meta = value;
  }
  function assertIdentity(id: string, requestEpoch: number) {
    if (
      id !== accountId ||
      requestEpoch !== epoch ||
      id !== getGlobalAccount().account?.id
    )
      throw Error(
        "The account or sync mode changed. Review the current save before trying again.",
      );
  }
  async function pull(
    head: Head,
    id: string,
    requestEpoch: number,
    localRevision: number,
  ) {
    if (!head.snapshot) throw Error("There is no cloud save to download.");
    if ((await hash(head.snapshot)) !== head.digest)
      throw Error("Cloud save checksum failed.");
    const writer = z.uuid().safeParse(JSON.parse(head.snapshot).cloudWriter);
    const fromOtherDevice = writer.success && writer.data !== (await deviceId());
    assertIdentity(id, requestEpoch);
    await application.importSave(head.snapshot, {
      expectedRevision: localRevision,
      source: "cloud",
      cloudOwner: id,
      cloudFromOtherDevice: fromOtherDevice,
      guard: () => assertIdentity(id, requestEpoch),
    });
    assertIdentity(id, requestEpoch);
    const current = await local(localRevision + 1);
    assertIdentity(id, requestEpoch);
    await saveMeta(id, requestEpoch, {
      ...meta,
      revision: head.revision,
      digest: current.digest,
      contentDigest: current.contentDigest,
      at: Date.now(),
    });
    publish({
      owner: id,
      at: meta.at,
      conflict: null,
      message:
        "Cloud save downloaded. Your previous device save is kept in Backups.",
    });
  }
  async function push(
    head: Head,
    id: string,
    requestEpoch: number,
    expectedDigest?: string,
    replaceTimer = false,
  ) {
    const mine = await deviceId(),
      current = await local(undefined, mine);
    assertIdentity(id, requestEpoch);
    if (expectedDigest && current.contentDigest !== expectedDigest)
      throw Error("Your device save changed. Review the copies again.");
    const result = await globalAction<{
      revision: number;
      digest: string;
      timer?: Head["timer"];
    }>(
      "/cloud/sync",
      {
        operation_id: crypto.randomUUID(),
        base_revision: head.revision,
        snapshot: current.text,
        ...(head.coordination_version === 1
          ? {
              coordination: {
                device_id: mine,
                ...(reservation?.account === id &&
                reservation.epoch === requestEpoch
                  ? { reservation_id: reservation.id }
                  : {}),
                ...(replaceTimer ? { replace_timer: true as const } : {}),
              },
            }
          : {}),
      },
      { signal: requests.signal },
    );
    assertIdentity(id, requestEpoch);
    if (result.timer !== undefined) {
      lastHead = {
        ...head,
        revision: result.revision,
        snapshot: current.text,
        digest: result.digest,
        timer: result.timer,
      };
      publish({
        remoteTimerIds: remoteTimers(result.timer, mine),
      });
    }
    if (reservation?.account === id && reservation.epoch === requestEpoch)
      reservation = undefined;
    await saveMeta(
      id,
      requestEpoch,
      {
        ...meta,
        revision: result.revision,
        digest: result.digest,
        contentDigest: current.contentDigest,
        at: Date.now(),
      },
      true,
    );
    publish({
      owner: id,
      at: meta.at,
      conflict: null,
      message: "Cloud sync complete.",
    });
    if ((await local()).contentDigest !== current.contentDigest) rerun = true;
  }
  async function syncNow(choice?: "device" | "cloud") {
    if (pending) {
      rerun = true;
      await syncSettled;
      if (choice) await syncNow(choice);
      return;
    }
    const id = accountId,
      requestEpoch = epoch;
    if (!id || !active()) {
      publish({
        error: "Sign in online with an active membership or trial to sync.",
      });
      return;
    }
    pending = true;
    let finish!: () => void;
    syncSettled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    syncFailure = undefined;
    publish({ busy: true, error: "", message: "" });
    try {
      const head = await globalAction<Head>("/cloud", undefined, {
          signal: requests.signal,
        }),
        current = await local();
      assertIdentity(id, requestEpoch);
      lastHead = head;
      const mine = head.timer?.device_id ? await deviceId() : null;
      assertIdentity(id, requestEpoch);
      publish({
        coordination: head.coordination_version === 1,
        remoteTimerIds: remoteTimers(head.timer, mine),
      });
      if (head.snapshot && (await hash(head.snapshot)) !== head.digest)
        throw Error("Cloud save checksum failed.");
      const cloudDigest = head.snapshot
        ? await hash(cloudContent(head.snapshot))
        : null;
      const [stored, owner] = await db.transaction("r", db.preferences, () =>
        Promise.all([
          db.preferences.get("global-sync:" + id),
          db.preferences.get("global-sync-owner"),
        ]),
      );
      assertIdentity(id, requestEpoch);
      const shared = stored?.value as Meta | undefined;
      // Another tab can have uploaded this device's save since this tab last
      // synced. Use its baseline only if it describes the verified cloud head.
      const baseline =
        owner?.value === id &&
        shared?.revision === head.revision &&
        shared.contentDigest &&
        shared.contentDigest === cloudDigest
          ? shared
          : meta;
      const unchanged = baseline.contentDigest
        ? current.contentDigest === baseline.contentDigest
        : current.digest === baseline.digest;
      if (choice) {
        const conflict = snapshot.conflict;
        if (
          !conflict ||
          conflict.head.revision !== head.revision ||
          conflict.localDigest !== current.contentDigest
        ) {
          publish({
            conflict: {
              head,
              localRevision: current.revision,
              localDigest: current.contentDigest,
              reason: "conflict",
            },
          });
          throw Error(
            "A copy changed while you were reviewing. Review both copies again.",
          );
        }
        if (choice === "cloud")
          await pull(head, id, requestEpoch, current.revision);
        else await push(head, id, requestEpoch, current.contentDigest, true);
        return;
      }
      if (owner?.value && owner.value !== id) {
        publish({
          owner: owner.value,
          conflict: {
            head,
            localRevision: current.revision,
            localDigest: current.contentDigest,
            reason: "account",
          },
        });
        return;
      }
      if (cloudDigest === current.contentDigest) {
        await saveMeta(
          id,
          requestEpoch,
          {
            ...meta,
            revision: head.revision,
            digest: current.digest,
            contentDigest: current.contentDigest,
            at: Date.now(),
          },
          true,
        );
        publish({
          owner: id,
          at: meta.at,
          message: "Both copies are up to date.",
          conflict: null,
        });
        return;
      }
      if (!baseline.digest) {
        publish({
          conflict: {
            head,
            localRevision: current.revision,
            localDigest: current.contentDigest,
            reason: "first",
          },
        });
        return;
      }
      if (unchanged && head.revision !== baseline.revision && head.snapshot) {
        await pull(head, id, requestEpoch, current.revision);
        return;
      }
      if (head.revision === baseline.revision) {
        if (!unchanged) await push(head, id, requestEpoch);
        else publish({ message: "Both copies are up to date." });
        return;
      }
      publish({
        conflict: {
          head,
          localRevision: current.revision,
          localDigest: current.contentDigest,
          reason: "conflict",
        },
      });
    } catch (e) {
      if (requestEpoch === epoch) {
        syncFailure = e;
        if (e instanceof ReplacementCancelled && lastHead) {
          const current = await local();
          if (requestEpoch === epoch) publish({
            error: "",
            message: "Replacement cancelled. Your device save and unfinished inputs are kept. Review the copies when ready.",
            conflict: { head: lastHead, localRevision: current.revision, localDigest: current.contentDigest, reason: "conflict" },
          });
        } else if (
          (e as { details?: { code?: string } })?.details?.code ===
          "cloud_conflict"
        ) {
          publish({
            error: "The cloud save changed. Both copies are preserved.",
            conflict: null,
          });
          rerun = true;
        } else if (
          (e as { details?: { code?: string } })?.details?.code ===
            "cloud_timer_busy" &&
          lastHead
        ) {
          const current = await local();
          if (requestEpoch === epoch)
            publish({
              error: (e as Error).message,
              conflict: {
                head: lastHead,
                localRevision: current.revision,
                localDigest: current.contentDigest,
                reason: "conflict",
              },
            });
        } else publish({ error: (e as Error).message });
      }
    } finally {
      finish();
      if (requestEpoch === epoch) {
        pending = false;
        if (requestEpoch === epoch) publish({ busy: false });
        if (rerun) {
          rerun = false;
          if (
            requestEpoch === epoch &&
            meta.mode === "auto" &&
            !snapshot.conflict
          )
            retryTimer = setTimeout(() => {
              if (
                requestEpoch === epoch &&
                meta.mode === "auto" &&
                !snapshot.conflict
              )
                void syncNow();
            }, cloudTiming.retryMs);
        }
      }
    }
  }

  const coordinateCommand: CommandCoordinator = (command, scope, perform) => {
    const work = commandTail.then(async () => {
      const id = accountId,
        requestEpoch = epoch;
      if (
        !ports.enabled ||
        meta.mode !== "auto" ||
        !id ||
        !meta.digest ||
        snapshot.owner !== id
      )
        return perform();
      const state = saveSnapshot()?.state;
      const card =
        command.type === "start" || command.type === "record"
          ? state?.cards.find((c) => c.id === command.cardId)
          : "actionId" in command
            ? state?.actions.find((a) => a.id === command.actionId)?.card
            : undefined;
      if (!card || card.method === "instant") return perform();
      const fail = (message: string): Result<never> => ({
        status: "error",
        code: "conflict",
        message,
        recoverable: true,
      });
      const mine = await deviceId();
      assertIdentity(id, requestEpoch);
      const foreign = () =>
        lastHead?.timer?.device_id && lastHead.timer.device_id !== mine;
      const targetsRemote = () =>
        "actionId" in command &&
        (snapshot.remoteTimerIds.includes(command.actionId) ||
          (foreign() && command.actionId === lastHead?.timer?.action_id));
      const offline = () => {
        if (targetsRemote())
          return Promise.resolve(
            fail(
              "This timer belongs to another device. Reconnect to review its latest state.",
            ),
          );
        return perform();
      };
      if (!active()) {
        if (targetsRemote())
          return fail(
            "This timer belongs to another device. Reconnect to review its latest state.",
          );
        publish({
          message:
            "Working offline. Changes stay on this device and may need a choice after reconnecting.",
        });
        return offline();
      }
      await syncNow();
      assertIdentity(id, requestEpoch);
      if (
        syncFailure instanceof PaymentRequestError &&
        ["network", "timeout"].includes(syncFailure.kind)
      ) {
        publish({
          message:
            "Live coordination could not be confirmed. Continuing on this device; reconnect to review any conflicts.",
        });
        return offline();
      }
      if (snapshot.error || snapshot.conflict)
        return fail(
          snapshot.error ||
            "The cloud copies differ. Review them in Cloud sync before continuing online.",
        );
      if (!snapshot.coordination)
        return fail(
          "This server does not support live coordination yet. Use Manual backups until it is updated.",
        );
      if (foreign() || targetsRemote())
        return fail(
          "Another device is using the timer. Finish that task there before starting or changing a timed task here.",
        );
      assertSaveScope(scope);
      if (command.type !== "start" && command.type !== "record") {
        const result = await perform();
        if (result.status === "success") await syncNow();
        return result;
      }
      // The engine retains local availability checks; a pending local timer is
      // never turned into a second reservation or a second action.
      if (
        saveSnapshot()?.state.actions.some((a) => a.card.method !== "instant")
      )
        return perform();
      let claim: { reservation_id: string; expires_at: number };
      const claimId = crypto.randomUUID();
      try {
        claim = await globalAction(
          "/cloud/timer-reservations",
          {
            device_id: mine,
            request_id: claimId,
            base_revision: meta.revision,
          },
          { signal: requests.signal },
        );
      } catch (error) {
        assertIdentity(id, requestEpoch);
        if (
          error instanceof PaymentRequestError &&
          ["network", "timeout"].includes(error.kind)
        ) {
          reservation = { id: claimId, account: id, epoch: requestEpoch };
          publish({
            message:
              "Timer coordination could not be confirmed. This start is kept locally; reconnect to review any conflicts.",
          });
          return offline();
        }
        throw error;
      }
      assertIdentity(id, requestEpoch);
      reservation = {
        id: claim.reservation_id,
        account: id,
        epoch: requestEpoch,
      };
      let committed = false;
      try {
        assertSaveScope(scope);
        if (Date.now() >= claim.expires_at)
          return fail("The timer reservation expired. Please start again.");
        const result = await perform();
        committed = result.status === "success" && result.committed;
        if (committed) await syncNow();
        return result;
      } finally {
        if (!committed && id === accountId && requestEpoch === epoch)
          await globalAction(
            "/cloud/timer-reservations/" +
              claim.reservation_id +
              "/cancellation",
            { device_id: mine },
            { signal: requests.signal },
          ).catch(() => {});
        if (reservation?.id === claim.reservation_id) reservation = undefined;
      }
    });
    commandTail = work.catch(() => {});
    return work;
  };
  async function setCloudMode(mode: Mode) {
    if (!accountId || (mode !== "off" && !active()))
      throw Error("Sign in online with an active membership or trial first.");
    if (mode !== meta.mode || mode === "off") invalidate();
    const id = accountId,
      requestEpoch = epoch,
      previous = meta;
    meta = { ...meta, mode };
    publish({
      mode,
      ...(mode !== "auto" ? { remoteTimerIds: [] } : {}),
      ...(mode === "off" ? { conflict: null } : {}),
      busy: true,
      error: "",
      message:
        mode === "off" ? "Cloud sync is off. Your device save is kept." : "",
    });
    try {
      await saveMeta(id, requestEpoch, meta);
      assertIdentity(id, requestEpoch);
    } catch (e) {
      if (requestEpoch === epoch) {
        meta = previous;
        publish({ mode: previous.mode });
      }
      throw e;
    } finally {
      if (requestEpoch === epoch) publish({ busy: false });
    }
    if (mode !== "off") await syncNow();
  }
  function dismissCloudConflict() {
    publish({ conflict: null, error: "", message: "No copy was changed." });
  }
  const startCloudSync = sharedService(() => {
    if (!ports.enabled) return;
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    let watch: AbortController | undefined,
      watchTimer: ReturnType<typeof setTimeout> | undefined;
    const watchChanges = () => {
      const eligible =
        !disposed &&
        meta.mode === "auto" &&
        active() &&
        snapshot.coordination &&
        !snapshot.conflict &&
        !!meta.digest &&
        (typeof document === "undefined" ||
          document.visibilityState === "visible");
      if (!eligible) {
        watch?.abort();
        clearTimeout(watchTimer);
        return;
      }
      if (watch || pending) return;
      const controller = new AbortController(),
        requestEpoch = epoch;
      watch = controller;
      const signal = linkRequestSignals(controller.signal, requests.signal);
      let delay = 100;
      void globalAction<{ revision: number }>(
        "/cloud/changes?after=" + meta.revision,
        undefined,
        { signal: signal.signal, timeoutMs: 12000 },
      )
        .then(async (head) => {
          if (
            !signal.signal.aborted &&
            requestEpoch === epoch &&
            head.revision !== meta.revision
          )
            await syncNow();
        })
        .catch(() => {
          delay = 5000;
        })
        .finally(() => {
          signal.dispose();
          if (watch === controller) watch = undefined;
          if (!disposed) watchTimer = setTimeout(watchChanges, delay);
        });
    };
    const stopWatching = subscribe(watchChanges);
    const accountChanged = async () => {
      if (disposed) return;
      const id = getGlobalAccount().account?.id || null;
      if (id === accountId) {
        if (!active() && pending) {
          invalidate();
          publish({ busy: false });
        }
        return;
      }
      invalidate();
      const requestEpoch = epoch;
      accountId = id;
      lastHead = undefined;
      reservation = undefined;
      meta = { mode: "off", revision: 0, digest: null, at: null };
      publish({
        mode: "off",
        at: null,
        busy: false,
        error: "",
        message: "",
        conflict: null,
        coordination: false,
        remoteTimerIds: [],
      });
      if (!id) return;
      const [stored, owner] = await Promise.all([
        db.preferences.get("global-sync:" + id),
        db.preferences.get("global-sync-owner"),
      ]);
      if (disposed || requestEpoch !== epoch) return;
      if (
        stored?.value &&
        ["off", "manual", "auto"].includes(stored.value.mode)
      )
        meta = stored.value;
      publish({ mode: meta.mode, at: meta.at, owner: owner?.value || null });
      if (meta.mode === "auto" && active()) void syncNow();
    };
    const changed = () => {
        if (disposed || meta.mode !== "auto" || snapshot.conflict) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!disposed && meta.mode === "auto" && !snapshot.conflict)
            void syncNow();
        }, cloudTiming.saveDebounceMs);
      },
      online = () => {
        if (!disposed && meta.mode === "auto" && active() && !snapshot.conflict)
          void syncNow();
      };
    const unsubscribe = subscribeGlobalAccount(() => {
      void accountChanged()
        .then(() => {
          online();
          watchChanges();
        })
        .catch((error) => {
          if (!disposed) publish({ error: (error as Error).message });
        });
    });
    void accountChanged().catch((error) => {
      if (!disposed) publish({ error: (error as Error).message });
    });
    const visible = () => {
      if (document.visibilityState === "visible") online();
      watchChanges();
    };
    window.addEventListener("statify-save-committed", changed);
    window.addEventListener("online", online);
    window.addEventListener("focus", online);
    window.addEventListener("pageshow", online);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visible);
    const poll = setInterval(online, cloudTiming.pollMs);
    return () => {
      disposed = true;
      watch?.abort();
      clearTimeout(watchTimer);
      stopWatching();
      invalidate();
      accountId = null;
      unsubscribe();
      clearInterval(poll);
      clearTimeout(timer);
      clearTimeout(retryTimer);
      window.removeEventListener("statify-save-committed", changed);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", online);
      window.removeEventListener("pageshow", online);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visible);
    };
  });

  return {
    getSnapshot,
    subscribe,
    syncNow,
    setCloudMode,
    dismissCloudConflict,
    startCloudSync,
    coordinateCommand,
  };
}
