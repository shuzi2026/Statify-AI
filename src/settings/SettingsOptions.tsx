import { ChevronRight } from "lucide-react";
import { canAdjustInitialLevels } from "../attributes/initial-levels";
import { accountBackend, cnAccountBackend } from "../payments/deployment";
import { isGuestPreview } from "../payments/preview-access";
import { hardened } from "./SettingsDeveloper";
import type { SettingsPanel, SettingsProps } from "./types";

export function SettingsOptions({
  s,
  themeName,
  Panel,
  openInitial,
  openGuide,
  openReset,
  openDeveloper,
}: Pick<SettingsProps, "s" | "openInitial" | "openGuide" | "openReset"> & {
  themeName: string;
  Panel: (panel: SettingsPanel) => void;
  openDeveloper: () => void;
}) {
  const guest = isGuestPreview();
  const hasAccounts = accountBackend !== "none";
  return (
    <div className="settings-options">
      <button onClick={() => Panel("theme")}>
        {guest ? "选择皮肤" : "会员专属皮肤"}
        <span>
          {themeName}
          <ChevronRight size={17} />
        </span>
      </button>
      <button onClick={() => Panel("motion")}>
        减少动态效果<ChevronRight size={17} />
      </button>
      <button onClick={openGuide}>
        查看新手引导
        <ChevronRight size={17} />
      </button>
      <button onClick={() => Panel("bug-feedback")}>
        Bug 反馈
        <ChevronRight size={17} />
      </button>
      {!s.initialEdited && (
        <button
          disabled={!canAdjustInitialLevels(s, Date.now())}
          onClick={openInitial}
        >
          重新设定初始属性等级
          <ChevronRight size={17} />
        </button>
      )}
      <button onClick={() => Panel("early")}>
        提前完成任务
        <span>
          {
            { ask: "每次询问", count: "完成一次", record: "只记录投入" }[
              s.preferences.earlyCompletion
            ]
          }
          <ChevronRight size={17} />
        </span>
      </button>
      <button onClick={() => Panel("mode")}>
        计划结算模式
        <span>
          {s.planMode === "cards" ? "卡牌模式" : "积分模式"}
          <ChevronRight size={17} />
        </span>
      </button>
      <button onClick={() => Panel("rewards")}>
        属性奖励滑轨上限
        <ChevronRight size={17} />
      </button>
      {hasAccounts && <button onClick={() => Panel("vote")}>
        内测用户新功能投票
        <ChevronRight size={17} />
      </button>}
      <button onClick={() => Panel("archive")}>
        存档
        <ChevronRight size={17} />
      </button>
      {hasAccounts && !cnAccountBackend && (
        <button onClick={() => Panel("payment")}>
          登录与会员
          <ChevronRight size={17} />
        </button>
      )}
      <button onClick={openDeveloper}>
        开发者模式
        <ChevronRight size={17} />
      </button>
      {!hardened && (
        <button className="danger" onClick={openReset}>
          重置测试数据
          <ChevronRight size={17} />
        </button>
      )}
    </div>
  );
}
