import { expect, it } from "vitest";
import { localDateKey } from "../shared/calendar";
import { dateKey } from "./engine";
import { planDate, bounds } from "./planning";
import { completionDate } from "./storage-format";
it.each([
  [2026, 2, 8],
  [2026, 10, 1],
  [2026, 11, 31],
])(
  "uses calendar boundaries across DST and year transitions (%s/%s/%s)",
  (year, month, day) => {
    const noon = new Date(year, month, day, 12).getTime(),
      midnight = new Date(year, month, day).getTime(),
      next = new Date(year, month, day + 1).getTime();
    expect(bounds("day", noon)).toMatchObject({
      start: midnight,
      end: next,
      key: localDateKey(noon),
    });
    for (const stamp of [midnight - 1, midnight, noon, next - 1, next])
      expect([dateKey(stamp), planDate(stamp), completionDate(stamp)]).toEqual(
        Array(3).fill(localDateKey(stamp)),
      );
    expect(localDateKey(next)).not.toBe(localDateKey(next - 1));
  },
);
it("starts weeks on Monday and advances months by calendar dates", () => {
  const at = new Date(2026, 10, 1, 12).getTime(),
    week = bounds("week", at),
    month = bounds("month", at);
  expect(new Date(week.start).getDay()).toBe(1);
  expect(localDateKey(week.start)).toBe("2026-10-26");
  expect(localDateKey(week.end)).toBe("2026-11-02");
  expect(localDateKey(month.end)).toBe("2026-12-01");
});
