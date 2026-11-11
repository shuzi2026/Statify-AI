import { expect, it } from "vitest";
import { bounds, newPlan, slotStamp } from "./planning";
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
it.each([
  [2026, 2, 8, 23],
  [2026, 10, 1, 25],
])(
  "local day around %i/%i/%i uses calendar boundaries across DST",
  (year, month, day, laHours) => {
    const at = new Date(year, month, day, 12).getTime(),
      b = bounds("day", at);
    expect(new Date(b.start).getHours()).toBe(0);
    expect(new Date(b.end).getDate()).toBe(day + 1);
    expect(bounds("day", b.end - 1).key).toBe(b.key);
    expect(bounds("day", b.end).key).not.toBe(b.key);
    if (zone === "America/Los_Angeles")
      expect((b.end - b.start) / 3600000).toBe(laHours);
    else if (["UTC", "Asia/Shanghai"].includes(zone))
      expect((b.end - b.start) / 3600000).toBe(24);
  },
);
it("week and month roll over the calendar year and leap day", () => {
  const week = bounds("week", new Date(2026, 0, 1, 12).getTime());
  expect(week.key).toBe("2025-12-29");
  expect(bounds("week", week.end).key).toBe("2026-01-05");
  const feb = bounds("month", new Date(2028, 1, 29, 12).getTime());
  expect(feb.key).toBe("2028-02");
  expect(bounds("month", feb.end).key).toBe("2028-03");
  const p = { ...newPlan(feb.start), period: "month" as const };
  const due = slotStamp(
    p,
    { id: "slot", cardId: "card", day: "31", time: "13:00", minutes: 0 },
    feb.start,
  );
  expect(new Date(due).getDate()).toBe(29);
  expect(new Date(due).getHours()).toBe(13);
});
it("timezone runner actually configures the requested runtime zone", () => {
  if (process.env.STATIFY_CORE_TIMEZONE)
    expect(zone).toBe(process.env.STATIFY_CORE_TIMEZONE);
});
