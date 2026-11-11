export const artworkSlots = [
  "companion",
  "reading",
  "writing",
  "drinking",
  "walking",
  "sleeping",
  "foliage",
  "brush",
  "ground",
  "paper",
  "card",
  "panel",
  "hud",
  "dialog",
  "button",
  "meter",
  "background",
] as const;
import bundledRegistration from "./artwork-registration.json";
export type ArtworkSlot = (typeof artworkSlots)[number];
export type Registration = {
  scale: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  bleed: boolean;
};
export const defaultRegistration: Registration = {
  scale: 1,
  x: 0,
  y: 0,
  cx: 0.5,
  cy: 0.5,
  bleed: true,
};
type Registry = Record<string, Partial<Record<ArtworkSlot, Registration>>>;
let registry: Registry = {};
const listeners = new Set<() => void>();
let revision = 0;
export const subscribeRegistration = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const registrationRevision = () => revision;
export function registrationFor(theme: string, slot: string): Registration {
  return registry[theme]?.[slot as ArtworkSlot] || defaultRegistration;
}
export function validateRegistration(value: unknown): Registration {
  const v = value as Registration;
  if (
    !v ||
    typeof v !== "object" ||
    typeof v.bleed !== "boolean" ||
    !["scale", "x", "y", "cx", "cy"].every(
      (k) =>
        typeof v[k as keyof Registration] === "number" &&
        Number.isFinite(v[k as keyof Registration]),
    )
  )
    throw Error("Invalid artwork registration");
  if (
    v.scale < 0.5 ||
    v.scale > 1.5 ||
    Math.abs(v.x) > 0.25 ||
    Math.abs(v.y) > 0.25 ||
    v.cx < 0 ||
    v.cx > 1 ||
    v.cy < 0 ||
    v.cy > 1
  )
    throw Error("Artwork registration is outside the preview limits");
  return { scale: v.scale, x: v.x, y: v.y, cx: v.cx, cy: v.cy, bleed: v.bleed };
}
export function setRegistration(
  theme: string,
  slot: ArtworkSlot,
  value: Registration,
) {
  if (!/^[a-z][a-z0-9-]{0,50}$/.test(theme) || !artworkSlots.includes(slot))
    throw Error("Unknown artwork slot");
  registry = {
    ...registry,
    [theme]: { ...registry[theme], [slot]: validateRegistration(value) },
  };
  revision++;
  listeners.forEach((fn) => fn());
}
export function exportRegistrations() {
  return JSON.stringify({ schema: 1, themes: registry }, null, 2);
}
export function importRegistrations(text: string) {
  if (text.length > 100000) throw Error("Configuration is too large");
  const input = JSON.parse(text);
  if (input.schema !== 1 || !input.themes || typeof input.themes !== "object")
    throw Error("Unknown configuration format");
  const next: Registry = {};
  for (const [theme, slots] of Object.entries(input.themes)) {
    if (
      !/^[a-z][a-z0-9-]{0,50}$/.test(theme) ||
      !slots ||
      typeof slots !== "object"
    )
      throw Error("Unknown theme");
    const row: Partial<Record<ArtworkSlot, Registration>> = {};
    for (const [slot, value] of Object.entries(slots)) {
      if (!artworkSlots.includes(slot as ArtworkSlot))
        throw Error("Unknown slot");
      row[slot as ArtworkSlot] = validateRegistration(value);
    }
    next[theme] = row;
  }
  registry = next;
  revision++;
  listeners.forEach((fn) => fn());
}
// Preview exports can replace this one bundled file; player data is never involved.
importRegistrations(JSON.stringify(bundledRegistration));
export function paintRegistration(theme: string) {
  document.documentElement.dataset.artworkSlots = Object.keys(
    registry[theme] || {},
  ).join(" ");
  document.documentElement.dataset.artworkClipped = Object.entries(
    registry[theme] || {},
  )
    .filter(([, value]) => !value.bleed)
    .map(([slot]) => slot)
    .join(" ");
  for (const slot of ["background", "button"] as const) {
    const r = registrationFor(theme, slot);
    document.documentElement.style.setProperty(
      `--art-${slot}-offset-x`,
      String(r.x + (0.5 - r.cx) * r.scale),
    );
    document.documentElement.style.setProperty(
      `--art-${slot}-offset-y`,
      String(r.y + (0.5 - r.cy) * r.scale),
    );
  }
  for (const slot of artworkSlots) {
    const r = registrationFor(theme, slot),
      root = document.documentElement;
    root.style.setProperty(`--art-${slot}-scale`, String(r.scale));
    root.style.setProperty(
      `--art-${slot}-x`,
      (r.x + (0.5 - r.cx) * r.scale) * 100 + "%",
    );
    root.style.setProperty(
      `--art-${slot}-y`,
      (r.y + (0.5 - r.cy) * r.scale) * 100 + "%",
    );
    root.style.setProperty(`--art-${slot}-clip`, r.bleed ? "none" : "inset(0)");
  }
}
/** Development overrides never write the player's save or the production theme choice. */
export function initializeRegistrationPreview(theme: () => string) {
  if (!import.meta.env.DEV) return () => {};
  const repaint = () => paintRegistration(theme());
  const unsubscribe = subscribeRegistration(repaint);
  const receive = (e: MessageEvent) => {
    if (
      e.source !== window.parent ||
      e.origin !== location.origin ||
      window.parent === window
    )
      return;
    try {
      if (e.data?.type === "statify-artwork-registration")
        setRegistration(e.data.theme, e.data.slot, e.data.value);
      else if (e.data?.type === "statify-artwork-import")
        importRegistrations(e.data.text);
      else if (e.data?.type === "statify-artwork-preview") {
        document.documentElement.dataset.simpleTheme = String(!!e.data.simple);
        document.documentElement.dataset.artworkGuides = String(
          !!e.data.guides,
        );
      }
    } catch (error) {
      window.parent.postMessage(
        { type: "statify-artwork-error", message: (error as Error).message },
        location.origin,
      );
    }
  };
  window.addEventListener("message", receive);
  return () => {
    unsubscribe();
    window.removeEventListener("message", receive);
  };
}
