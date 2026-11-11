import { useEffect, useRef, useState } from "react";
import {
  assertRequestActive,
  isRequestCancelled,
} from "../payments/request-policy";
import { useGlobalAccount } from "../payments/global-account";
import {
  useCloudSync,
  setCloudMode,
  syncNow,
  dismissCloudConflict,
} from "./client";
import { globalAction } from "../payments/global-account";
import { download } from "../storage";
export function CloudPanel() {
  const p = useGlobalAccount(),
    sync = useCloudSync(),
    [error, ErrorText] = useState(""),
    [versions, Versions] = useState<
      { revision: number; updated_at: number }[] | null
    >(null),
    enabled =
      !!p.account &&
      !p.offline &&
      (!!p.entitlement?.member ||
        (p.entitlement?.trial_ends_at || 0) > Date.now());
  const reads = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    reads.current = controller;
    Versions(null);
    ErrorText("");
    return () => controller.abort();
  }, [p.account?.id, p.offline]);
  async function read<T>(path: string): Promise<T> {
    const signal = reads.current.signal;
    const result = await globalAction<T>(path, undefined, { signal });
    assertRequestActive(signal);
    return result;
  }
  const failure = (error: Error) => {
    if (!isRequestCancelled(error)) ErrorText(error.message);
  };
  return (
    <section className="global-cloud membership-block">
      <h2>Cloud sync</h2>
      <p>Membership exclusive · Choose how this device syncs.</p>
      <fieldset disabled={!p.account} data-save-replacement-ignore="">
        <legend>Sync mode</legend>
        {(["off", "manual", "auto"] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="cloud-mode"
              disabled={mode !== "off" && (!enabled || sync.busy)}
              value={mode}
              checked={sync.mode === mode}
              onChange={() =>
                void setCloudMode(mode).catch((e) => ErrorText(e.message))
              }
            />
            {{ off: "Off", manual: "Manual", auto: "Automatic" }[mode]}
          </label>
        ))}
      </fieldset>
      <p className="help">
        {sync.mode === "auto"
          ? sync.coordination
            ? "Live updates and timer coordination run while this device is open and online. Offline tasks are allowed; reconnecting may require a copy choice."
            : "Syncs snapshots while online. Live coordination requires an updated server."
          : sync.mode === "manual"
            ? "Transfers only when you select Sync now."
            : "Login alone does not upload your save."}
      </p>
      <button
        disabled={!enabled || sync.busy || sync.mode === "off"}
        onClick={() => void syncNow()}
      >
        {sync.busy ? "Syncing…" : "Sync now"}
      </button>
      {sync.at && <p>Last synced: {new Date(sync.at).toLocaleString("en")}</p>}
      {!enabled && (
        <p className="help">
          Sign in online with a membership or active trial to use cloud sync.
        </p>
      )}
      <button
        disabled={!enabled || sync.busy}
        onClick={() =>
          void read<{
            items: { revision: number; updated_at: number }[];
          }>("/cloud/versions")
            .then((r) => Versions(r.items))
            .catch(failure)
        }
      >
        Cloud backup history
      </button>
      {versions && (
        <div>
          <p className="help">
            Up to three previous cloud versions are kept. Download a backup
            before restoring it through Saves & backups.
          </p>
          {!versions.length ? (
            <p>No previous cloud versions yet.</p>
          ) : (
            versions.map((v) => (
              <button
                key={v.revision}
                disabled={!enabled || sync.busy}
                onClick={() =>
                  void read<{ snapshot: string }>(
                    "/cloud/versions/" + v.revision,
                  )
                    .then((r) =>
                      download(
                        r.snapshot,
                        "Statify-global-cloud-v" + v.revision + ".json",
                      ),
                    )
                    .catch(failure)
                }
              >
                Download revision {v.revision} ·{" "}
                {new Date(v.updated_at).toLocaleString("en")}
              </button>
            ))
          )}
        </div>
      )}
      {sync.conflict && (
        <div className="cloud-conflict" role="alert">
          <h3>
            {sync.conflict.reason === "account"
              ? "This device save belongs to another account"
              : sync.conflict.reason === "first"
                ? "Choose your first cloud copy"
                : "Both copies have changed"}
          </h3>
          <p>
            {sync.conflict.reason === "account"
              ? "Continuing with the device copy will associate it with your current account. Nothing is uploaded until you choose."
              : "Choose which copy to keep. Downloading keeps a local backup of this device copy."}
          </p>
          <p>
            Cloud revision: {sync.conflict.head.revision}
            {sync.conflict.head.updated_at
              ? " · " +
                new Date(sync.conflict.head.updated_at).toLocaleString("en")
              : " · No cloud save yet"}
          </p>
          {sync.conflict.head.timer && (
            <p>
              Cloud task: {sync.conflict.head.timer.card_name} ·{" "}
              {sync.conflict.head.timer.phase}. Choosing the device copy may
              replace this task; the previous cloud copy remains in backup
              history.
            </p>
          )}
          <div className="button-row">
            <button disabled={sync.busy} onClick={() => void syncNow("device")}>
              Use device copy
            </button>
            <button
              disabled={sync.busy || !sync.conflict.head.snapshot}
              onClick={() => void syncNow("cloud")}
            >
              Use cloud copy
            </button>
            <button disabled={sync.busy} onClick={dismissCloudConflict}>
              Decide later
            </button>
          </div>
        </div>
      )}
      {(error || sync.error) && <p role="alert">{error || sync.error}</p>}
      {sync.message && <p role="status">{sync.message}</p>}
    </section>
  );
}
