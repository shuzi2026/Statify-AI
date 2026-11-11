import type { Card } from "../../shared/save-schema";

/** Seed content and per-card numerical presets; return fresh nested arrays on every call. */
export function starterCardDefinitions(): Partial<Card>[] {
  const defs: Partial<Card>[] = [
    {
      name: "安静读一会儿",
      description: "留一段时间给文字，也给自己。",
      method: "duration",
      minutes: 25,
      category: "学习",
      score: 2,
      rewards: [
        { id: "attr-know", amount: 100 },
        { id: "attr-foc", amount: 40 },
      ],
      effects: [{ id: "stress", amount: -3 }],
    },
    {
      name: "出去走走",
      description: "换一口空气，不必走得很远。",
      method: "timed",
      category: "运动",
      rewards: [{ id: "attr-body", amount: 4 }],
      effects: [],
    },
    {
      name: "喝一杯水",
      description: "照顾自己的小事，也值得记住。",
      method: "instant",
      rewards: [{ id: "attr-body", amount: 30 }],
      effects: [{ id: "comfort", amount: 2 }],
    },
    {
      name: "写下一点收获",
      description: "让今天留下一个小小的印记。",
      method: "quantity",
      unit: "条",
      category: "学习",
      rewards: [{ id: "attr-know", amount: 10 }],
    },
    {
      name: "准备睡了",
      description: "今天就到这里，明天再继续。",
      method: "instant",
      sleep: true,
      rest: true,
      evaluate: true,
      rewards: [{ id: "attr-body", amount: 30 }],
      effects: [{ id: "sleep", amount: 85 }],
    },
  ];
  return defs;
}
