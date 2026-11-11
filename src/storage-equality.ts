/** Fast proof of equal JSON for validated stored rows. A false result must still
 * use the existing serializer: key order, optional values and legacy shapes can
 * differ without changing persisted JSON. This never replaces save validation. */
export function sameStoredValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if ("toJSON" in a || "toJSON" in b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!sameStoredValue(a[i], b[i])) return false;
    return true;
  }
  if (
    Array.isArray(b) ||
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  )
    return false;
  const keys = Object.keys(a),
    other = Object.keys(b);
  if (keys.length !== other.length) return false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (
      key !== other[i] ||
      !sameStoredValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    )
      return false;
  }
  return true;
}
