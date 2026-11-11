import { newCard, type State } from "../model";
import { firstAvailableDate, newPlan } from "../planning";

export type TourScene =
  "home" | "hand" | "navigation" | "warehouse" | "plans" | "timeline";
export const tourPlanSplit = 0.56;
export const tourSteps = [
  {
    title: "执行等级",
    scene: "home",
    selector: ".execution-block",
    copy: "执行等级反映你完成计划的能力。\n\n完成全部每日计划升一级，\n完成每周、每月计划有额外奖励。",
  },
  {
    title: "属性",
    scene: "home",
    selector: ".floating-attributes, .attribute-panel",
    copy: "这里记录你的属性等级，\n以及升每一级需要的分数进度条。",
  },
  {
    title: "状态与成长系数",
    scene: "home",
    selector: ".compact-status, .status-hud",
    copy: "这里记录着你目前的状态。\n你可以点击它，手动记录。\n\n它影响你行动获得的经验值比例。",
  },
  {
    title: "自定义数值",
    scene: "home",
    selector: '[aria-label="自定义数值"]',
    copy: "想记录某项任务的进度、存款等数据？\n\n可以在这里添加自定义数值，\n自动记录你在意的数据。",
  },
  {
    title: "行动卡牌",
    scene: "hand",
    selector: ".fan-hand, .empty-hand, .quick-deck, .tasks .collection-grid",
    copy: "这是由你新建的日常行动做成的卡牌。\n\n它可以是你经常做的行动，\n也可以是某一件你计划完成的事。",
    hint: "左右滑动选择卡牌，向上抽出；打开后点击“开始”或“完成”。",
  },
  {
    title: "页面导航",
    scene: "navigation",
    selector: ".mobile-nav, .desktop-view-controls",
    copy: "用下方导航切换页面：\n\n“计划与卡牌”整理行动、安排计划；\n“记录”回顾行动；\n“设置”调整使用偏好。",
  },
  {
    title: "卡牌仓库",
    scene: "warehouse",
    selector:
      "#workspace-panel-cards .card-grid>div:first-child, #workspace-panel-cards .workspace-pane-tools",
    copy: "“我的卡牌”是你的卡牌仓库。\n\n点击“＋”新建卡牌，\n点击已有卡牌查看或编辑；\n左侧可以按分类查找。",
  },
  {
    title: "计划页面",
    scene: "plans",
    selector: ".workspace-plans",
    copy: "先选每日、每周或每月计划，\n再把下方卡牌拖到上方。\n\n点击“计划完成”设置次数，\n完成卡牌就会计入计划进度。",
    hint: "拖动下方卡牌，放入上方任务框。",
    demo: true,
  },
  {
    title: "时间轴",
    scene: "timeline",
    selector: ".workspace-plans",
    copy: "打开“时间轴”，\n把计划任务拖到上方，再选择日期和时间。\n\n左右滑动查看其他安排；\n拖动中间分隔条，调整上下区域大小。",
    hint: "先拖入并安排时间，再左右滑动查看。",
    demo: true,
  },
] as const satisfies readonly {
  title: string;
  scene: TourScene;
  selector: string;
  copy: string;
  hint?: string;
  demo?: boolean;
}[];

/** Presentation-only data. Never passed to storage, settlement or plan mutation. */
export function tourPlanState(
  state: State,
  now: number,
  timeline: boolean,
): State {
  const available = state.cards.filter((c) => c.state === "active").slice(0, 3);
  const sample = (
    available.length ? available : [{ ...newCard(now), name: "示例行动" }]
  ).map((card, index) => ({
    ...card,
    id: "guide-card-" + index,
    cap: 0,
    count: 0,
  }));
  const plan = {
    ...newPlan(now),
    id: "guide-demo-plan",
    name: "操作演示",
    scope: "repeat" as const,
    period: "day" as const,
    anchor: firstAvailableDate("day", now),
    mode: "cards" as const,
    active: true,
    draft: false,
    startsAt: now,
    timeline,
    cards: sample.map((c) => ({
      id: c.id,
      target: timeline ? Math.ceil(12 / sample.length) : 2,
      score: 1,
    })),
    slots: timeline
      ? Array.from({ length: 12 }, (_, i) => ({
          id: "guide-slot-" + i,
          cardId: sample[i % sample.length].id,
          day: "1",
          time: String(8 + i).padStart(2, "0") + ":00",
          minutes: 0,
          configured: true,
        }))
      : [],
  };
  return {
    ...state,
    cards: sample,
    plans: [plan],
    planCycles: [],
    entries: [],
  };
}
