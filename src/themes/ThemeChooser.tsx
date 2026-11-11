import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Check } from "lucide-react";
import { Dialog } from "../components";
import { Onboarding, completeGuestProfile } from "../Onboarding";
import type { State } from "../model";
import { MemberNotice, useMemberPrompt } from "../payments/MemberNotice";
import { useMemberFeatures } from "../payments/use-member";
import { isGuestPreview } from "../payments/preview-access";
import {
  selectableThemes,
  isSelectableThemeId,
  defaultTheme,
  type ThemeId,
} from "./catalog";
import {
  chooseTheme,
  chooseInitialTheme,
  setTheme,
  storedThemeChoice,
  subscribeThemeChoice,
  subscribeTheme,
  themeSnapshot,
} from "./runtime";
import { ThemeArtwork } from "./ThemeArtwork";
import { ravenAssets } from "./raven-wizard/assets";
import "./theme-chooser.css";

function ThemeOptions({
  selected,
  select,
}: {
  selected: string;
  select: (id: ThemeId) => void;
}) {
  return (
    <div className="theme-options" role="group" aria-label="可选皮肤">
      {selectableThemes.map((option) => (
        <button
          type="button"
          className="theme-option"
          key={option.id}
          aria-label={option.name}
          aria-pressed={selected === option.id}
          onClick={() => select(option.id as ThemeId)}
        >
          <span
            className="theme-option-art"
            aria-hidden="true"
            style={
              {
                background:
                  option.id === "raven-wizard"
                    ? `url("${ravenAssets.background}") center 58% / cover`
                    : option.tokens["--theme-canvas-background"],
                ...option.tokens,
              } as CSSProperties
            }
          >
            {option.artwork.companion ? (
              <ThemeArtwork name="companion" appearance={option} />
            ) : (
              <span className="theme-option-orb" />
            )}
          </span>
          <span className="theme-option-name">
            <span>{option.name.split(" · ")[0]}</span>
            <strong>{option.name.split(" · ")[1]}</strong>
          </span>
          {selected === option.id && (
            <Check className="theme-option-check" aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  );
}

export function CharacterSetup({
  s,
  run,
}: {
  s: State;
  run: (fn: (s: State) => unknown) => Promise<boolean>;
}) {
  const chosen = useSyncExternalStore(
    subscribeThemeChoice,
    storedThemeChoice,
    () => null,
  );
  return chosen ? <Onboarding s={s} run={run} /> : <InitialThemeChoice run={run} />;
}
function InitialThemeChoice({ run }: {
  run: (fn: (s: State) => unknown) => Promise<boolean>;
}) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot),
    [error, E] = useState(""), [busy, Busy] = useState(false);
  const guest = isGuestPreview();
  useEffect(() => {
    if (!isSelectableThemeId(theme.id)) setTheme(defaultTheme);
  }, [theme.id]);
  async function confirm(asGuest = false) {
    if (busy) return;
    Busy(true);
    try {
      const result = await chooseInitialTheme(theme.id as ThemeId);
      if (result === "saved" && asGuest) await run(completeGuestProfile);
      if (result === "storage-unavailable")
        E("未能保存皮肤选择，请检查设备存储后重试。");
      if (result === "member-required") E("另一页面已确认皮肤，请使用已保存的选择。");
    } finally {
      Busy(false);
    }
  }
  return (
    <Dialog
      title="选择你的第一套皮肤"
      close={() => {}}
      dismissible={false}
      backRoot
      focusTitle
      className="theme-chooser theme-first-choice"
    >
      <p className="theme-chooser-intro">
        {guest ? "访客可直接进入，进度保存在当前浏览器。" : (
          <>首次可免费选择一套。<br />确认后，会员可随时更换皮肤。</>
        )}
      </p>
      <ThemeOptions
        selected={theme.id}
        select={(id) => {
          E("");
          setTheme(id);
        }}
      />
      {error && <p role="alert">{error}</p>}
      <footer className="dialog-actions">
        <button className={guest ? undefined : "primary"} disabled={busy} onClick={() => void confirm()}>
          {guest ? "自定义角色" : "选好皮肤，创建角色"}
        </button>
        {guest && <button className="primary" disabled={busy} onClick={() => void confirm(true)}>
          以访客身份进入
        </button>}
      </footer>
    </Dialog>
  );
}

export function MemberThemeChooser({
  close,
  notify,
}: {
  close: () => void;
  notify: (message: string) => void;
}) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot),
    member = useMemberFeatures(),
    { pulse, prompt } = useMemberPrompt();
  const [busy, Busy] = useState(false);
  async function select(id: ThemeId) {
    if (busy) return;
    Busy(true);
    const result = await chooseTheme(id);
    Busy(false);
    if (result === "member-required") {
      prompt();
      return;
    }
    if (result === "unavailable") {
      notify("这套皮肤已不再提供选择。");
      return;
    }
    if (result === "storage-unavailable") {
      notify("未能保存皮肤选择，请检查设备存储后重试。");
      return;
    }
    close();
  }
  return (
    <Dialog
      title={isGuestPreview() ? "选择皮肤" : "会员专属皮肤"}
      close={close}
      focusTitle
      className="theme-chooser"
    >
      {!member && (
        <MemberNotice pulse={pulse}>
          开通会员后，可随时更换界面皮肤。
        </MemberNotice>
      )}
      <ThemeOptions selected={theme.id} select={select} />
    </Dialog>
  );
}
