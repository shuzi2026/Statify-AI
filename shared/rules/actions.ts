/** Settlement validation limits; seconds use elapsed time, not calendar-day arithmetic. */
export const actionRules = {
  minElapsedSeconds: 60,
  maxTargetMinutes: 1440,
  maxSeconds: 31536000,
  maxQuantity: 1000000,
};
export const meterRules = { absoluteLimit: 9999 };
