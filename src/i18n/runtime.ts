import english from "./en.json";
import { uiLanguage } from "./locale";
export { uiLocale } from "./locale";
/** Called only for literals in App source, never for user-authored values. */
export function localize(source: string) {
  return uiLanguage === "en"
    ? ((english as Record<string, string>)[source] ?? source)
    : source;
}
