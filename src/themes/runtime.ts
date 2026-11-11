import { workbenchDefaults } from "../ui-layout/workbench-config";
import { paintThemeTokens } from "./image-loading";
import { nativePlatform } from "../platform/native";
import { webBackgrounds } from "./web-backgrounds";
import {
  paintRegistration,
  initializeRegistrationPreview,
} from "./registration";
import {
  defaultTheme,
  isThemeId,
  isSelectableThemeId,
  themes,
  type ThemeId,
  type AppTheme,
} from "./catalog";
import { memberFeaturesActive } from "../payments/access";
import {
  themePreviewSlot,
} from "../local-data/registered-storage";
import { initializePreferences, readPreference, writePreference, subscribePreferences, usesSharedLegacyPreferences } from "../local-data/preferences";
import { PreferenceDenied } from "../local-data/preference-repository";
let active: ThemeId = defaultTheme;
const listeners = new Set<() => void>();
const choiceListeners = new Set<() => void>();
let notifiedChoice: ThemeId | null = null;
function notifyChoice() {
  const next = storedThemeChoice();
  if (next === notifiedChoice) return;
  notifiedChoice = next;
  for (const listener of choiceListeners) listener();
}
export const subscribeThemeChoice = (fn: () => void) => {
  choiceListeners.add(fn);
  return () => {
    choiceListeners.delete(fn);
  };
};
export function storedThemeChoice() {
  const id = readPreference("theme").value;
  return isThemeId(id) ? id : null;
}
export const subscribeTheme = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const themeSnapshot = (): AppTheme => themes[active];
export type ThemeChoiceResult =
  "saved" | "member-required" | "storage-unavailable" | "unavailable";
/** Only real choices are durable or synced; temporary previews never claim the free choice. */
async function persistTheme(id: ThemeId, guard: (current: ThemeId | null) => void): Promise<ThemeChoiceResult> {
  const repository = await initializePreferences();
  if (["invalid", "ambiguous", "unavailable"].includes(readPreference("theme").status)) await repository.refresh();
  if (["invalid", "ambiguous", "unavailable"].includes(readPreference("theme").status))
    return "storage-unavailable";
  try {
    if (await writePreference("theme", id, guard) !== "saved") return "storage-unavailable";
  } catch (error) {
    if (error instanceof PreferenceDenied) return "member-required";
    return "storage-unavailable";
  }
  setTheme(storedThemeChoice() || id);
  notifyChoice();
  if (window.parent !== window)
    window.parent.postMessage(
      { type: "statify-theme-selected", theme: id },
      location.origin,
    );
  return "saved";
}
/** The free first choice can only be claimed once, before character creation. */
export async function chooseInitialTheme(id: ThemeId): Promise<ThemeChoiceResult> {
  if (!isSelectableThemeId(id)) return "unavailable";
  return persistTheme(id, (current) => {
    if (current !== null && current !== id) throw new PreferenceDenied();
  });
}
/** Recheck the live entitlement at the mutation boundary, including after logout. */
export async function chooseTheme(id: ThemeId): Promise<ThemeChoiceResult> {
  if (!isSelectableThemeId(id)) return "unavailable";
  return persistTheme(id, (current) => {
    if (current !== id && !memberFeaturesActive()) throw new PreferenceDenied();
  });
}
/** Upgrade existing characters without changing their appearance or character save. */
export async function retainExistingTheme(): Promise<ThemeChoiceResult> {
  if (storedThemeChoice()) return "saved";
  let id = active;
  if (!import.meta.env.DEV) {
    const legacy = themePreviewSlot.read().value;
    if (isThemeId(legacy)) id = legacy;
  }
  return persistTheme(id, (current) => {
    if (current !== null && current !== id) throw new PreferenceDenied();
  });
}
/** Paint only. Used by the first-choice preview and development tools; does not save a choice. */
export function setTheme(id: ThemeId) {
  for (const key of Object.keys(themes[active]?.tokens || {}))
    document.documentElement.style.removeProperty(key);
  active = id;
  document.documentElement.dataset.theme =
    workbenchDefaults().themes[id]?.base || id;
  document.documentElement.dataset.themeChoice = id;
  document.documentElement.toggleAttribute(
    "data-workbench-companion",
    !!workbenchDefaults().themes[id]?.assets?.companion,
  );
  document.documentElement.dataset.skin = (themes[id] as AppTheme).skin || "";
  document.documentElement.dataset.illustrated = String(themes[id].illustrated);
  document.documentElement.dataset.cardSurface =
    (themes[id] as AppTheme).cardSurface || "css";
  try {
    paintThemeTokens(
      themes[id].tokens,
      nativePlatform() === "web" ? { background: webBackgrounds[id] } : undefined,
    );
  } catch {
    /* Colours and layout must survive any artwork pipeline failure. */
  }
  try {
    paintRegistration(id);
  } catch {}
  if (import.meta.env.DEV) themePreviewSlot.write(id);
  for (const listener of listeners) listener();
}
export function applyStoredTheme() {
  const requested: unknown[] = [];
  if (import.meta.env.DEV) {
    requested.push(new URLSearchParams(location.search).get("theme"));
    if (!usesSharedLegacyPreferences()) requested.push(themePreviewSlot.read().value);
  }
  requested.push(storedThemeChoice());
  setTheme(requested.find(isThemeId) || defaultTheme);
}
export function initializeTheme() {
  const disposeRegistration = initializeRegistrationPreview(() => active);
  applyStoredTheme();
  let previous = storedThemeChoice();
  const stopPreferences = subscribePreferences(() => {
    const next = storedThemeChoice();
    if (next === previous) return;
    previous = next;
    if (next) setTheme(next);
    notifyChoice();
  });
  const receive = (event: MessageEvent) => {
    if (
      import.meta.env.DEV &&
      window.parent !== window &&
      event.source === window.parent &&
      event.origin === location.origin &&
      event.data?.type === "statify-preview-theme" &&
      isThemeId(event.data.theme)
    )
      setTheme(event.data.theme);
  };
  window.addEventListener("message", receive);
  return () => {
    disposeRegistration();
    window.removeEventListener("message", receive);
    stopPreferences();
  };
}
