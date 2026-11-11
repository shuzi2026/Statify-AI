import defaults from "./workbench-defaults.json";
import { validateDefaults, type WorkbenchDefaults } from "./workbench-schema";
let current: WorkbenchDefaults = validateDefaults(defaults);
export const workbenchDefaults = () => current;
export function replaceWorkbenchDefaults(next: unknown) {
  current = validateDefaults(next);
}
export const layoutFactor = (
  key: Exclude<keyof WorkbenchDefaults["layout"], "font">,
) => current.layout[key] ?? 1;
