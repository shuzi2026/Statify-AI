import { afterEach, expect, test, vi } from "vitest";
import { observeViewClock } from "./view-clock";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T12:00:10Z"));
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget(),
    changed = vi.fn();
  let expiry = Date.now() + 4500;
  const stop = observeViewClock({
    document,
    window,
    changed,
    read: (now) => [Math.floor(now / 60000), now < expiry],
  });
  return {
    document,
    window,
    changed,
    stop,
    setExpiry: (n: number) => {
      expiry = n;
    },
  };
}

test("only changed display values notify, including non-minute expiry and a backwards clock", () => {
  const f = fixture();
  vi.advanceTimersByTime(4000);
  expect(f.changed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(f.changed).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(44000);
  expect(f.changed).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  expect(f.changed).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date("2026-10-20T12:00:05Z"));
  vi.advanceTimersByTime(1000);
  expect(f.changed).toHaveBeenCalledTimes(3);
  f.stop();
});

test("hidden/pagehide stop polling, resume samples wall time once and repeated signals keep one timer", () => {
  const f = fixture();
  f.document.hidden = true;
  f.document.dispatchEvent(new Event("visibilitychange"));
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(86400000);
  expect(f.changed).not.toHaveBeenCalled();
  f.window.dispatchEvent(new Event("focus"));
  expect(vi.getTimerCount()).toBe(0);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event("visibilitychange"));
  expect(f.changed).toHaveBeenLastCalledWith(Date.now());
  expect(vi.getTimerCount()).toBe(1);
  for (let i = 0; i < 3; i++) f.window.dispatchEvent(new Event("pageshow"));
  expect(vi.getTimerCount()).toBe(1);
  f.window.dispatchEvent(new Event("pagehide"));
  expect(vi.getTimerCount()).toBe(0);
  f.window.dispatchEvent(new Event("focus"));
  expect(vi.getTimerCount()).toBe(0);
  f.window.dispatchEvent(new Event("pageshow"));
  expect(vi.getTimerCount()).toBe(1);
  f.stop();
  f.changed.mockClear();
  f.window.dispatchEvent(new Event("focus"));
  f.document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(60000);
  expect(f.changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
