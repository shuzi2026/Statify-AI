import { useLayoutEffect, useRef } from "react";
import {
  BookOpen,
  Home,
  Layers,
  Settings,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import { PlanBell } from "../PlanHUD";
import { SimulatorDashboard } from "../SimulatorDashboard";
import { DesktopStatus, DesktopValues } from "../home/HomeStatus";
import type { AppViewProps } from "./types";
import { setLayoutStyle } from "../ui-layout/style-value";

const desktopPages = [
  { id: "ai", label: "AI" },
  { id: "today", label: "卡牌" },
  { id: "journal", label: "记录" },
  { id: "settings", label: "设置" },
] as const;

export function AppSidebar({ s, mobile, controls, activity, navigation }: AppViewProps) {
  const { M, now } = controls;
  const { level } = activity;
  return (
    <>
      {!mobile && !(controls.tab === "workspace" && navigation.workspacePanel === "plans") && (
        <aside className="sidebar desktop-sidebar">
          <SimulatorDashboard
            part="identity"
            s={s}
            now={now}
            executionLevel={level.level}
            openStatus={() => M({ kind: "status" })}
            openAttributes={() => M({ kind: "attributes" })}
            openMeter={(id) => M({ kind: "meter", id })}
          />
          <SimulatorDashboard
            part="attributes"
            s={s}
            now={now}
            executionLevel={level.level}
            openStatus={() => M({ kind: "status" })}
            openAttributes={() => M({ kind: "attributes" })}
            openMeter={(id) => M({ kind: "meter", id })}
          />
        </aside>
      )}
    </>
  );
}
export function AppHeader({
  activity,
  s,
  mobile,
  controls,
  actions,
  navigation,
}: AppViewProps) {
  const { tab, M, now } = controls;
  const { saving } = actions;
  const { workspacePanel, desktopView, navigate } = navigation;
  const { dailyProgress } = activity;
  const desktopPage = tab === "workspace" ? "today" : tab;
  return (
    <>
      {mobile && tab !== "journal" && (
        <header className="topbar">
          <span>
            {new Date(now).toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>
          <div>
            <span className="local-dot" />
            {saving ? "正在保存…" : "已保存到此设备"}
            <button
              className="icon-button"
              aria-label="调整当前状态"
              onClick={() => M({ kind: "status" })}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
        </header>
      )}
      {!mobile && (
        <div className="desktop-status">
          <DesktopStatus s={s} now={now} openStatus={() => M({ kind: "status" })} />
          <div className="desktop-view-controls">
            <PlanBell
              s={s}
              now={now}
              progress={dailyProgress}
              open={() => M({ kind: "messages" })}
            />
            <nav
              className="desktop-page-switch"
              aria-label="主导航"
              style={
                {
                  "--page-index": desktopPages.findIndex((page) => page.id === desktopPage),
                  "--page-count": desktopPages.length,
                } as React.CSSProperties
              }
            >
              <i aria-hidden="true" />
              {desktopPages.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  aria-current={desktopPage === n.id ? "page" : undefined}
                  onClick={() =>
                    n.id === "today" ? desktopView("cards") : navigate(n.id)
                  }
                >
                  {n.label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              role="switch"
              aria-checked={tab === "workspace" && workspacePanel === "plans"}
              aria-label="计划视图"
              className="desktop-view-switch"
              onClick={() =>
                desktopView(
                  tab === "workspace" && workspacePanel === "plans"
                    ? "cards"
                    : "plans",
                )
              }
            >
              <span>计划</span>
              <i aria-hidden="true">
                <b />
              </i>
            </button>
          </div>
          <DesktopValues s={s} openMeter={(id) => M({ kind: "meter", id })} />
        </div>
      )}
    </>
  );
}
export function AppNavigation({ mobile, controls, navigation }: AppViewProps) {
  const { tab } = controls;
  const { navigate } = navigation;
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = bar.current;
    const shell = node?.parentElement;
    if (!mobile || !node || !shell) return;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) setLayoutStyle(shell, "--mobile-nav-height", `${height}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    if (!observer) window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", measure);
      shell.style.removeProperty("--mobile-nav-height");
    };
    // The same bar stays mounted across tabs. ResizeObserver handles changes
    // in its actual height; switching tabs must not clear/re-measure it first.
  }, [mobile]);
  const nav = [
    ...(import.meta.env.VITE_STATIFY_AI_CHAT === "1" ? [{ id: "ai", label: "AI", icon: Terminal }] : []),
    { id: "today", label: "首页", icon: Home },
    { id: "workspace", label: "计划与卡牌", icon: Layers },
    { id: "journal", label: "记录", icon: BookOpen },
    { id: "settings", label: "设置", icon: Settings },
  ];
  return (
    <>
      <nav
        ref={bar}
        className="mobile-nav"
        data-ai={import.meta.env.VITE_STATIFY_AI_CHAT === "1" || undefined}
        data-workspace={tab === "workspace" || undefined}
        aria-label="移动导航"
      >
        {nav.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
