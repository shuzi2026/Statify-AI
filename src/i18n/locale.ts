import { paymentRegion } from "../payments/deployment";
import { displayDefaults } from "../platform/capabilities";
export const { language: uiLanguage, locale: uiLocale } =
  displayDefaults(paymentRegion);
