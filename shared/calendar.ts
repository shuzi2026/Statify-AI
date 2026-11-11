/** Local calendar day; callers choose start vs completion timestamp explicitly.
 * Keep calendar increments in Date.setDate/setMonth, not fixed 24-hour additions.
 */
export function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
