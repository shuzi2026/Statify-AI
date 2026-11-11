import { ruleContext } from "./payments/access";
import { acceptEntitlement } from "./payments/access";
import { describe, it, expect } from "vitest";
import { fresh, newCard, uid } from "./model";
import {
  start,
  pause,
  freeze,
  settle,
  deleteEntry,
  elapsed,
  coefficient,
  correctStatus,
  statusValue,
  execution,
  rollDays,
  dateKey,
  threshold,
  growth,
  unavailable,
  saveCard,
  inWindow,
} from "./engine";
import { migrate, parseImport } from "./migrate";
const at = new Date(2026, 9, 11, 12).getTime();
const fixture = (
  method: "instant" | "duration" | "timed" | "quantity" = "duration",
) => {
  const s = fresh(at, "cn");
  s.cards = [
    {
      ...newCard(at),
      name: "阅读",
      method,
      minutes: 30,
      rewards: [{ id: s.attributes[0].id, amount: 100 }],
    },
  ];
  return s;
};
const input = {
  seconds: 900,
  quantity: 1,
  rating: 1.25,
  counted: false,
  note: "专注了一会",
};
describe("0.2.1 action and settlement", () => {
  it("reverses the applied values of a partial cross-midnight entry and skips removed targets", () => {
    const startAt = new Date(2026, 9, 11, 23, 50).getTime(),
      endAt = startAt + 30 * 60000,
      day = dateKey(startAt),
      s = fixture(),
      [attribute, removed] = s.attributes,
      [card] = s.cards;
    attribute.earned = attribute.daily[day] = 990;
    card.rewards.push({ id: removed.id, amount: 100 });
    card.effects = [{ id: "mood", amount: 20 }];
    s.states.mood = { base: 50, offset: 50, expires: endAt + 1000 };
    s.meters = [
      { id: "kept", name: "积分", unit: "", value: 3, min: 0, max: 9, precision: 0 },
      { id: "gone", name: "精力", unit: "", value: 1, min: null, max: null, precision: 0 },
    ];
    card.values = [{ id: "kept", amount: -8 }, { id: "gone", amount: 8 }];
    const id = start(s, card.id, startAt);
    freeze(s, id, endAt);
    const entry = settle(s, id, { ...input, seconds: 1800, rating: 1 }, ruleContext(endAt));
    expect(entry.rewards[0].actual).toBe(10);
    expect(entry.effects[0]).toMatchObject({ actual: 0, applied: 20 });
    expect(entry.values[0].actual).toBe(-3);
    s.attributes = s.attributes.filter((a) => a !== removed);
    s.meters[1] = { ...s.meters[1], id: "replacement", value: 70 };
    s.meters[0].value = 8;

    expect(deleteEntry(s, id, endAt)).toBe(true);
    expect(s.entries).toHaveLength(0);
    expect(attribute.earned).toBe(990);
    expect(attribute.daily).toEqual({ [day]: 990 });
    expect(s.states.mood).toEqual({ base: 50, offset: 50, expires: endAt + 1000 });
    expect(s.meters.map((m) => m.value)).toEqual([9, 70]);
    expect(card.count).toBe(0);
    expect(deleteEntry(s, id, endAt)).toBe(false);
    expect(attribute.earned).toBe(990);
  });
  it("updates the existing card tally, plan and execution level while keeping other records", () => {
    const s = fixture("instant"), [card] = s.cards;
    const firstId = start(s, card.id, at);
    const first = settle(s, firstId, { ...input, counted: true }, ruleContext(at));
    saveCard(s, { ...card, life: "consumable", uses: 1 }, ruleContext(at + 1));
    const day = dateKey(at);
    const startAt = new Date(day + "T00:00:00").getTime();
    s.planCycles.push({
      id: "cycle", planId: "plan", key: day, start: startAt, startsAt: startAt,
      end: startAt + 86400000, mode: "cards", target: 1,
      cards: [{ id: card.id, target: 1 }], scope: "repeat", period: "day",
    });
    const secondId = start(s, card.id, at + 2);
    s.actions[0].plans = ["plan"];
    const second = settle(s, secondId, { ...input, counted: true }, ruleContext(at + 2));
    expect(s.cards[0]).toMatchObject({ count: 1, state: "archived" });
    expect(s.planCycles[0].doneAt).toBe(at + 2);
    expect(execution(s, at + 2).byPeriod.day).toBe(1);
    expect(deleteEntry(s, first.id, at + 3)).toBe(true);
    expect(s.cards[0].count).toBe(1);
    expect(s.entries).toEqual([second]);
    expect(deleteEntry(s, second.id, at + 3)).toBe(true);
    expect(s.cards[0]).toMatchObject({ count: 0, state: "archived" });
    expect(s.planCycles[0].doneAt).toBeUndefined();
    expect(execution(s, at + 3).byPeriod.day).toBe(0);
  });
  it("freezes time, preserves pause, and prevents another paused timer", () => {
    const s = fixture();
    const id = start(s, s.cards[0].id, at);
    pause(s, id, at + 60000);
    expect(elapsed(s.actions[0], at + 300000)).toBe(60);
    s.cards.push({ ...newCard(Date.now()), name: "第二个", method: "timed" });
    expect(unavailable(s, s.cards[1], at + 300000)).toBe("先结束当前计时");
    pause(s, id, at + 300000);
    freeze(s, id, at + 360000);
    expect(elapsed(s.actions[0], at + 900000)).toBe(120);
  });
  it("partial not-counted result still earns proportional rounded experience and is idempotent", () => {
    const s = fixture();
    const id = start(s, s.cards[0].id, at);
    freeze(s, id, at + 900000);
    const e = settle(s, id, input, ruleContext(at + 900000));
    expect(e.rewards[0].actual).toBe(63);
    expect(s.cards[0].count).toBe(0);
    settle(s, id, input, ruleContext(at + 999999));
    expect(s.entries).toHaveLength(1);
    expect(s.attributes[0].earned).toBe(63);
  });
  it("uses start config/status and start date when completed next day", () => {
    const t = new Date(2026, 9, 11, 23, 50).getTime(),
      s = fixture("timed");
    const id = start(s, s.cards[0].id, t);
    s.cards[0].rewards[0].amount = 500;
    s.states.mood.base = 0;
    freeze(s, id, t + 20 * 60000);
    const e = settle(
      s,
      id,
      { ...input, seconds: 1200, rating: 1, counted: true },
      ruleContext(t + 20 * 60000),
    );
    expect(e.date).toBe("2026-10-11");
    expect(e.coefficient).toBeCloseTo(1);
    expect(e.rewards[0].requested).toBe(2000);
    expect(e.rewards[0].actual).toBe(1000);
  });
  it.each([
    ["timed", 60, 60],
    ["timed", 89, 60],
    ["timed", 90, 120],
    ["duration", 60, 60],
    ["duration", 90, 120],
  ] as const)(
    "rounds %s time at %s seconds to %s seconds",
    (method, seconds, expected) => {
      const s = fixture(method);
      const id = start(s, s.cards[0].id, at);
      freeze(s, id, at + seconds * 1000);
      const e = settle(
        s,
        id,
        { ...input, seconds, rating: 1, counted: true },
        ruleContext(at + seconds * 1000),
      );
      expect(e.seconds).toBe(expected);
      expect(e.counted).toBe(expected > 0);
      expect(Number.isInteger(e.rewards[0].actual)).toBe(true);
      expect(s.actions).toHaveLength(0);
    },
  );
  it("rounds value rewards and never applies sleep or rest for a zero-minute timer", () => {
    const s = fixture("duration");
    s.cards[0].sleep = true;
    s.cards[0].rest = true;
    s.cards[0].effects = [{ id: "sleep", amount: 85 }];
    const id = start(s, s.cards[0].id, at);
    freeze(s, id, at + 29000);
    expect(() =>
      settle(s, id, { ...input, seconds: 29, counted: true }, ruleContext(at + 29000)),
    ).toThrow(/未满一分钟/);
    expect(s.entries).toHaveLength(0);
    expect(s.states.sleep.base).toBe(50);
    expect(s.restUntil).toBe(0);
    const v = fixture("timed");
    v.meters = [
      {
        id: "m",
        name: "量",
        unit: "个",
        precision: 2,
        value: 5,
        min: 0,
        max: 100,
      },
    ];
    v.cards[0].values = [{ id: "m", amount: 3 }];
    const action = start(v, v.cards[0].id, at);
    freeze(v, action, at + 90000);
    const e = settle(v, action, { ...input, seconds: 90 }, ruleContext(at + 90000));
    expect(e.values[0].requested).toBe(8);
    expect(e.values[0].actual).toBe(8);
    expect(v.meters[0].precision).toBe(0);
  });
  it("scales signed state and direct effects, then clamps and rounds", () => {
    const s = fixture("instant");
    s.cards[0].effects = [
      { id: "stress", amount: 8 },
      { id: "vitality", amount: -8 },
    ];
    s.meters = [
      {
        id: "m",
        name: "量",
        unit: "个",
        precision: 2,
        value: 5,
        min: 0,
        max: 10,
      },
    ];
    s.cards[0].values = [{ id: "m", amount: 8 }];
    const id = start(s, s.cards[0].id, at);
    const e = settle(s, id, { ...input, counted: true }, ruleContext(at));
    expect(statusValue(s, "stress", at)).toBe(60);
    expect(statusValue(s, "vitality", at)).toBe(40);
    expect(e.values[0].actual).toBe(5);
  });
  it("scales fixed-duration status effects by completion and rounds them", () => {
    const s = fixture("duration");
    s.cards[0].effects = [{ id: "stress", amount: 5 }];
    const id = start(s, s.cards[0].id, at);
    freeze(s, id, at + 900000);
    const e = settle(s, id, { ...input, rating: 1 }, ruleContext(at + 900000));
    expect(e.effects[0].requested).toBe(3);
    expect(e.effects[0].actual).toBe(3);
    expect(statusValue(s, "stress", at + 900000)).toBe(53);
    const full = fixture("duration");
    full.cards[0].effects = [{ id: "stress", amount: 5 }];
    const fid = start(full, full.cards[0].id, at);
    freeze(full, fid, at + 1800000);
    expect(
      settle(full, fid, { ...input, seconds: 1800, rating: 1 }, ruleContext(at + 1800000))
        .effects[0].requested,
    ).toBe(5);
    expect(statusValue(full, "stress", at + 1800000)).toBe(55);
  });
  it("does not give removed or expired attributes experience", () => {
    const s = fixture("timed");
    s.attributes[0].slot = 4;
    acceptEntitlement({
      member: false,
      trial_ends_at: at + 60000,
      trial_available: false,
      initial_adjustment_until: null,
      initial_adjustment: null,
      valid_until: at + 900000,
    });
    const id = start(s, s.cards[0].id, at);
    freeze(s, id, at + 120000);
    expect(
      settle(s, id, { ...input, seconds: 120 }, ruleContext(at + 120000)).rewards[0].actual,
    ).toBe(0);
    acceptEntitlement(null);
  });
  it("manual correction uses 24h offset; sleep overrides its old offset", () => {
    const s = fixture("instant");
    correctStatus(s, { mood: 80, sleep: 70 }, at);
    s.states.mood.base += 10;
    expect(statusValue(s, "mood", at + 1)).toBe(90);
    expect(statusValue(s, "mood", at + 86400000)).toBe(60);
    s.cards[0].sleep = true;
    s.cards[0].effects = [{ id: "sleep", amount: 85 }];
    const id = start(s, s.cards[0].id, at + 1);
    settle(s, id, { ...input, rating: 1 }, ruleContext(at + 1));
    expect(statusValue(s, "sleep", at + 2)).toBe(85);
  });
  it("rest unlocks at the next 04:00, even after midnight", () => {
    const t = new Date(2026, 9, 11, 1).getTime(),
      s = fixture("instant");
    s.cards[0].sleep = true;
    s.cards[0].rest = true;
    const id = start(s, s.cards[0].id, t);
    settle(s, id, { ...input, rating: 1 }, ruleContext(t));
    expect(s.restUntil).toBe(new Date(2026, 9, 11, 4).getTime());
  });
  it("caps level at100 while accumulating experience", () => {
    const s = fixture();
    s.attributes[0].initial = 100;
    s.attributes[0].earned = 1000000;
    expect(growth(s.attributes[0]).level).toBe(100);
    expect(growth(s.attributes[0]).progress).toBe(1000000);
    expect(threshold(11)).toBe(660);
  });
});
describe("migration and input boundaries", () => {
  it("editing config never overwrites a completion saved while the editor was open", () => {
    const s = fixture("instant"),
      draft = structuredClone(s.cards[0]);
    const id = start(s, draft.id, at);
    settle(s, id, { ...input, counted: true, rating: 1 }, ruleContext(at));
    draft.name = "新的名称";
    saveCard(s, draft, ruleContext(at + 1000));
    expect(s.cards[0].count).toBe(1);
    expect(s.cards[0].name).toBe("新的名称");
  });
  it("rejects future versions and overlapping pending/completed identities", () => {
    expect(() =>
      parseImport({ version: "0.3.0", profile: { name: "未来" } }),
    ).toThrow(/版本/);
    const s = fixture("instant"),
      id = start(s, s.cards[0].id, at),
      a = structuredClone(s.actions[0]);
    settle(s, id, { ...input, rating: 1 }, ruleContext(at));
    s.actions.push(a);
    expect(() => parseImport(s)).toThrow(/同时/);
  });
  it("keeps legacy logs as history without granting new rewards and preserves original payload", () => {
    const raw = {
      profile: { name: "旧玩家", age: 20 },
      attributes: [{ id: "a", name: "体魄", value: 12, score: 20 }],
      status: { health: 65, fatigue: 20 },
      events: [
        {
          id: "c",
          name: "旧任务",
          type: "timed",
          rewards: [{ attrId: "a", points: 5 }],
        },
      ],
      log: [
        {
          eventId: "c",
          eventName: "旧任务",
          startTime: at,
          endTime: at + 10000,
        },
      ],
    };
    const s = migrate(raw, at);
    expect(s.legacy).toEqual(raw);
    expect(s.attributes[0].earned).toBe(20);
    expect(s.entries[0].legacy).toBe(true);
    expect(s.states.vitality.base).toBe(80);
    expect(s.states.comfort.base).toBe(65);
  });
  it("rejects malformed and duplicate identity saves", () => {
    expect(() => parseImport({ foo: "bar" })).toThrow();
    const s = fresh(at, "cn");
    s.attributes.push({ ...s.attributes[0] });
    expect(() => parseImport(s)).toThrow(/重复/);
  });
  it("rejects invalid rating, quantity and non-finite duration", () => {
    const s = fixture("quantity"),
      id = start(s, s.cards[0].id, at);
    expect(() => settle(s, id, { ...input, quantity: 1.5 }, ruleContext(at))).toThrow();
    expect(() => settle(s, id, { ...input, seconds: Infinity }, ruleContext(at))).toThrow();
  });
});
describe("daily execution history", () => {
  it("keeps today plan attribution after pausing it for future days", () => {
    const s = fixture("instant"),
      p = {
        id: uid(),
        name: "每日",
        period: "day" as const,
        mode: "score" as const,
        target: 1,
        cards: [],
        active: true,
        createdAt: at,
      };
    s.plans = [p];
    s.dailyPlan = p.id;
    rollDays(s, at);
    p.active = false;
    const id = start(s, s.cards[0].id, at);
    settle(s, id, { ...input, counted: true, rating: 1 }, ruleContext(at));
    expect(execution(s, at).level).toBe(1);
    expect(
      execution(s, new Date(new Date(at).setHours(23, 0, 0, 0)).getTime())
        .level,
    ).toBe(1);
    rollDays(s, at + 86400000);
    expect(s.days.at(-1)?.enabled).toBe(false);
  });
  it("counted actions keep their grade across later empty days", () => {
    const s = fixture("instant"),
      p = {
        id: uid(),
        name: "每日",
        period: "day" as const,
        mode: "score" as const,
        target: 1,
        cards: [],
        active: true,
        createdAt: at,
      };
    s.plans = [p];
    s.dailyPlan = p.id;
    rollDays(s, at);
    const id = start(s, s.cards[0].id, at);
    settle(s, id, { ...input, counted: true, rating: 1 }, ruleContext(at));
    expect(execution(s, at).level).toBe(1);
    expect(
      execution(s, new Date(new Date(at).setHours(23, 0, 0, 0)).getTime())
        .level,
    ).toBe(1);
    const later = at + 3 * 86400000;
    rollDays(s, later);
    expect(execution(s, later).level).toBe(1);
    rollDays(s, at + 4 * 86400000);
    expect(execution(s, at + 4 * 86400000).level).toBe(1);
  });
  it("neutral coefficient is1 and extremes fit approved range", () => {
    const s = fresh(at, "cn");
    expect(coefficient(s, at)).toBeCloseTo(1);
    s.sleepCycle = dateKey(at);
    for (const key of ["mood", "vitality", "comfort", "sleep"] as const)
      s.states[key].base = 100;
    s.states.stress.base = 0;
    expect(coefficient(s, at)).toBeCloseTo(1.16);
  });
});

describe("under-minute completion boundary", () => {
  it.each([0, 29, 30, 59.999])(
    "does not settle %s seconds, even after minute rounding",
    (seconds) => {
      const s = fixture("timed"),
        id = start(s, s.cards[0].id, at);
      freeze(s, id, at + seconds * 1000);
      const before = JSON.stringify(s);
      expect(() =>
        settle(
          s,
          id,
          { ...input, seconds, counted: true },
          ruleContext(at + seconds * 1000),
        ),
      ).toThrow(/未满一分钟/);
      expect(JSON.stringify(s)).toBe(before);
    },
  );
});

describe("quantity task minimum duration", () => {
  it("starts a running quantity action and blocks a second timer", () => {
    const s = fixture("quantity"),
      id = start(s, s.cards[0].id, at);
    expect(s.actions[0].runningSince).toBe(at);
    expect(s.actions[0].endedAt).toBeNull();
    s.cards.push({ ...newCard(Date.now()), method: "timed" });
    expect(unavailable(s, s.cards[1], at + 1000)).toBe("先结束当前计时");
    pause(s, id, at + 30000);
    expect(elapsed(s.actions[0], at + 90000)).toBe(30);
  });
  it.each([0, 30, 59.999])(
    "rejects quantity completion at %s seconds without mutation",
    (seconds) => {
      const s = fixture("quantity"),
        id = start(s, s.cards[0].id, at);
      freeze(s, id, at + seconds * 1000);
      const before = JSON.stringify(s);
      expect(() =>
        settle(s, id, { ...input, quantity: 2 }, ruleContext(at + seconds * 1000)),
      ).toThrow(/未满一分钟/);
      expect(JSON.stringify(s)).toBe(before);
    },
  );
  it("at sixty seconds rewards quantity rather than minutes", () => {
    const s = fixture("quantity"),
      id = start(s, s.cards[0].id, at);
    freeze(s, id, at + 60000);
    const e = settle(
      s,
      id,
      { ...input, seconds: 60, quantity: 2, rating: 1, counted: true },
      ruleContext(at + 60000),
    );
    expect(e.quantity).toBe(2);
    expect(e.rewards[0].requested).toBe(200);
    expect(e.seconds).toBe(0);
    expect(e.measured).toBe(60);
    expect(s.cards[0].count).toBe(1);
  });
});

describe("multiple allowed time windows", () => {
  const time = (hour: number, minute = 0) =>
    new Date(2026, 9, 11, hour, minute).getTime();
  it("allows any matching window, including one crossing midnight", () => {
    const c = {
      ...newCard(at),
      timeWindows: [
        { start: "09:00", end: "11:00" },
        { start: "22:00", end: "02:00" },
      ],
    };
    for (const hour of [9, 10, 22, 23, 0, 1])
      expect(inWindow(c, time(hour))).toBe(true);
    for (const hour of [2, 8, 11, 12, 21])
      expect(inWindow(c, time(hour))).toBe(false);
  });
  it("keeps legacy windows and enforces the new list when starting", () => {
    const c = {
      ...newCard(at),
      name: "限定任务",
      timeStart: "09:00",
      timeEnd: "11:00",
    };
    expect(inWindow(c, time(10))).toBe(true);
    expect(inWindow(c, time(12))).toBe(false);
    const s = fresh(at, "cn");
    s.cards = [{ ...c, timeWindows: [{ start: "14:00", end: "16:00" }] }];
    expect(() => start(s, c.id, time(10))).toThrow(/可用时段/);
    expect(() => start(s, c.id, time(15))).not.toThrow();
  });
  it("archives an event card after its requested completion count without losing entries", () => {
    const s = fixture("instant");
    s.cards[0].life = "consumable";
    s.cards[0].uses = 2;
    for (let i = 0; i < 2; i++) {
      const id = start(s, s.cards[0].id, at + i);
      settle(s, id, { ...input, counted: true }, ruleContext(at + i));
    }
    expect(s.cards[0].state).toBe("archived");
    expect(s.entries).toHaveLength(2);
  });
});

describe("time window save order", () => {
  it.each([
    [{ start: "14:00", end: "13:00" }],
    [{ start: "14:00", end: "14:00" }],
    [
      { start: "13:00", end: "15:00" },
      { start: "14:00", end: "16:00" },
    ],
  ])("rejects invalid order without changing a saved card", (...windows) => {
    const s = fixture(),
      before = JSON.stringify(s);
    expect(() =>
      saveCard(s, { ...s.cards[0], timeWindows: windows }, ruleContext(at)),
    ).toThrow(/时间|时段/);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("permits a following window beginning at the previous end", () => {
    const s = fixture();
    saveCard(
      s,
      {
        ...s.cards[0],
        timeWindows: [
          { start: "13:00", end: "14:00" },
          { start: "14:00", end: "15:00" },
        ],
      },
      ruleContext(at),
    );
    expect(s.cards[0].timeWindows).toHaveLength(2);
  });
});

it("accepts non-overlapping windows entered in reverse order and saves them chronologically", () => {
  const s = fixture(),
    windows = [
      { start: "13:35", end: "14:35" },
      { start: "12:41", end: "12:45" },
    ];
  saveCard(s, { ...s.cards[0], timeWindows: windows }, ruleContext(at));
  expect(s.cards[0].timeWindows).toEqual([windows[1], windows[0]]);
  expect(windows.map((w) => w.start)).toEqual(["13:35", "12:41"]);
});
it("rejects reverse-order overlap and containment atomically", () => {
  for (const windows of [
    [
      { start: "13:00", end: "15:00" },
      { start: "12:00", end: "14:00" },
    ],
    [
      { start: "13:00", end: "14:00" },
      { start: "12:00", end: "15:00" },
    ],
  ]) {
    const s = fixture(),
      before = JSON.stringify(s);
    expect(() =>
      saveCard(s, { ...s.cards[0], timeWindows: windows }, ruleContext(at)),
    ).toThrow("可完成时段不能重叠");
    expect(JSON.stringify(s)).toBe(before);
  }
});
