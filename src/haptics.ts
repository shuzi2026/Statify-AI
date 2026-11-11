import { deviceBridge as device, hasAndroidBridge } from "./platform/native";
let lastTick = -Infinity;
/** Selection boundaries only; native feedback respects the user's system setting. */
export function selectionTick() {
  if (!hasAndroidBridge() || document.hidden) return;
  const now = performance.now();
  if (now - lastTick < 90) return;
  lastTick = now;
  void device.selectionTick().catch(() => {});
}
