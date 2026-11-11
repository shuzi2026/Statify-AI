import { useState, useSyncExternalStore } from "react";
import { BugFeedbackPanel } from "./BugFeedbackPanel";
import { WebUpdateNotice } from "./WebUpdateNotice";
import { FeatureVotePanel } from "./FeatureVotePanel";
import {
  SettingsMembership,
  SettingsMembershipSummary,
} from "./settings/SettingsMembership";
import { accountBackend } from "./payments/deployment";
import type { CnMemberTarget } from "./payments/CnMembershipSummary";
import type { GlobalMemberTarget } from "./payments/GlobalMembershipSummary";
import { subscribeTheme, themeSnapshot } from "./themes/runtime";
import { SettingsPreferences } from "./settings/SettingsPreferences";
import { SettingsOptions } from "./settings/SettingsOptions";
import { SettingsArchive } from "./settings/SettingsArchive";
import { useSettingsArchive } from "./settings/useSettingsArchive";
import {
  hardened,
  DeveloperWorkbench,
  SettingsDeveloper,
  useSettingsDeveloper,
} from "./settings/SettingsDeveloper";
import type { SettingsProps, SettingsPanel } from "./settings/types";

export function SettingsPage({
  s,
  run,
  notify,
  error,
  openInitial,
  openGuide,
  openReset,
}: SettingsProps) {
  const [panel, Panel] = useState<SettingsPanel>(null),
    [globalTarget, GlobalTarget] = useState<GlobalMemberTarget>("account"),
    [cnTarget, CnTarget] = useState<CnMemberTarget>("account"),
    theme = useSyncExternalStore(subscribeTheme, themeSnapshot);
  const archive = useSettingsArchive({ notify, error });
  const developer = useSettingsDeveloper();
  const close = () => Panel(null);
  const hasAccounts = accountBackend !== "none";
  if (panel === "ui" && !hardened)
    return <DeveloperWorkbench close={() => Panel("developer")} />;
  if (hasAccounts && panel === "payment")
    return (
      <SettingsMembership
        s={s}
        run={run}
        globalTarget={globalTarget}
        cnTarget={cnTarget}
        openCnAccount={() => CnTarget("account")}
        back={close}
      />
    );
  return (
    <div className="settings-page">
      <h1>设置</h1>
      {hasAccounts && <SettingsMembershipSummary
        openGlobal={(target) => {
          GlobalTarget(target);
          Panel("payment");
        }}
        openCn={(target) => {
          CnTarget(target);
          Panel("payment");
        }}
      />}
      <SettingsOptions
        s={s}
        themeName={theme.name}
        Panel={Panel}
        openInitial={openInitial}
        openGuide={openGuide}
        openReset={openReset}
        openDeveloper={() => {
          developer.Pin("");
          developer.PinError("");
          Panel("developer-pin");
        }}
      />
      <WebUpdateNotice />
      <footer className="settings-version">Statify AI 0.3.0 · <a href="https://github.com/shuzi2026/Statify-AI" target="_blank" rel="noreferrer">Source · AGPL-3.0</a></footer>
      {panel === "bug-feedback" && <BugFeedbackPanel close={close} />}
      <SettingsDeveloper
        panel={panel}
        Panel={Panel}
        state={developer}
        error={error}
      />
      <SettingsPreferences
        s={s}
        run={run}
        notify={notify}
        panel={panel}
        Panel={Panel}
      />
      {hasAccounts && panel === "vote" && (
        <FeatureVotePanel
          close={close}
          login={() => {
            CnTarget("account");
            Panel("payment");
          }}
        />
      )}
      <SettingsArchive panel={panel} Panel={Panel} state={archive} />
    </div>
  );
}
