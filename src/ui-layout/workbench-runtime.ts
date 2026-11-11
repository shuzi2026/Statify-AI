import bundledRegistration from "../themes/artwork-registration.json";
import {
  defaultTheme,
  isThemeId,
  rebuildWorkbenchThemes,
} from "../themes/catalog";
import { importRegistrations } from "../themes/registration";
import { setTheme, themeSnapshot } from "../themes/runtime";
import {
  replaceWorkbenchDefaults,
  workbenchDefaults,
} from "./workbench-config";
import { fonts } from "./workbench-schema";
export function paintWorkbenchDefaults() {
  const config = workbenchDefaults(),
    root = document.documentElement;
  for (const key of ["dialogWidth", "fontSize", "fieldPadding"] as const)
    root.style.setProperty("--wb-" + key, String(config.layout[key] ?? 1));
  root.toggleAttribute(
    "data-workbench-font",
    config.layout.fontSize !== undefined,
  );
  root.toggleAttribute(
    "data-workbench-field",
    config.layout.fieldPadding !== undefined,
  );
  root.toggleAttribute(
    "data-workbench-dialog",
    config.layout.dialogWidth !== undefined,
  );
  if (config.layout.font)
    root.style.setProperty("--font-ui", fonts[config.layout.font]);
  else root.style.removeProperty("--font-ui");
  const registry: Record<string, unknown> = { ...bundledRegistration.themes };
  for (const [id, t] of Object.entries(config.themes))
    registry[id] = {
      ...(bundledRegistration.themes as Record<string, object>)[t.base || id],
      ...t.registration,
    };
  importRegistrations(JSON.stringify({ schema: 1, themes: registry }));
}
export function initializeWorkbenchDefaults() {
  paintWorkbenchDefaults();
  const receive = (event: MessageEvent) => {
    if (
      !import.meta.env.DEV ||
      parent === window ||
      event.source !== parent ||
      event.origin !== location.origin ||
      event.data?.type !== "statify-workbench-draft"
    )
      return;
    try {
      replaceWorkbenchDefaults(event.data.document);
      rebuildWorkbenchThemes();
      paintWorkbenchDefaults();
      const requested = event.data.theme || themeSnapshot()?.id;
      setTheme(isThemeId(requested) ? requested : defaultTheme);
      parent.postMessage(
        { type: "statify-workbench-applied", sequence: event.data.sequence },
        location.origin,
      );
    } catch (error) {
      parent.postMessage(
        { type: "statify-workbench-error", message: (error as Error).message },
        location.origin,
      );
    }
  };
  window.addEventListener("message", receive);
  return () => window.removeEventListener("message", receive);
}
