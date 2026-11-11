/** Status units are points; durations are milliseconds; resetHour is local wall time. */
export const statusRules = {
  min: 0,
  max: 100,
  midpoint: 50,
  sleepResetHour: 4,
  correctionDurationMs: 24 * 60 * 60 * 1000,
  neutralCoefficient: 1,
  baseCoefficient: 0.8,
  coefficientSpan: 0.4,
  stressPenalty: 0.2,
};
