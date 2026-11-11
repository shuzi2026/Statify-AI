/** New input limits. Historical save-name limits remain in save-schema.ts.
 * Units are UTF-16 code units except attributeName (print-width units).
 */
export const textLimits = {
  attributeName: 8,
  meterName: 12,
  unit: 6,
  planName: 24,
  nickname: 30,
  message: 120,
  note: 4000,
} as const;
