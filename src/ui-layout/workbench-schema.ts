/** Shared by the real App, workbench UI and write boundary. No arbitrary CSS/code. */
export const layoutFields = {
  gutter: [0.7, 1.4],
  hud: [0.8, 1.2],
  panelWidth: [0.75, 1.25],
  cardSize: [0.8, 1.2],
  cardRatio: [0.8, 1.2],
  hero: [0.75, 1.2],
  dialogWidth: [0.75, 1.25],
  fontSize: [0.8, 1.3],
  fieldPadding: [0.75, 1.3],
} as const;
export const fonts = {
  system: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif',
  serif: '"Songti SC","SimSun",serif',
  sans: 'Arial,"Microsoft YaHei",sans-serif',
};
export const builtInIds = [
  "raven-wizard",
  "paper-lavender",
  "peach",
  "mouse-balloon",
  "night-sprout",
  "pearl-pistachio",
  "pearl-apricot",
  "bakery-ochre",
];
export const slots = [
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
export const colorNames = [
  "canvas",
  "paper",
  "paper-light",
  "ink",
  "muted",
  "accent",
  "accent-hover",
  "growth",
  "lavender",
  "lavender-light",
  "line",
  "shadow",
  "on-accent",
] as const;
export type Placement = {
  scale: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  bleed: boolean;
};
export type Asset = {
  src: string;
  width: number;
  height: number;
  bounds?: [number, number, number, number];
  align?: "center" | "panel-bottom";
};
export type ThemeDefaults = {
  base?: string;
  name?: string;
  colors?: Partial<Record<(typeof colorNames)[number], string>>;
  registration?: Partial<Record<(typeof slots)[number], Placement>>;
  assets?: Partial<Record<(typeof slots)[number], Asset>>;
};
export type WorkbenchDefaults = {
  schema: 1;
  layout: Partial<Record<keyof typeof layoutFields, number>> & {
    font?: keyof typeof fonts;
  };
  themes: Record<string, ThemeDefaults>;
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Expected object");
  const o = v as Record<string, unknown>;
  if (
    Object.keys(o).some((k) =>
      ["__proto__", "constructor", "prototype"].includes(k),
    )
  )
    throw Error("Unsafe key");
  return o;
}
function keys(v: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw Error("Unknown configuration field");
}
function number(v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error(`Value outside ${min}–${max}`);
  return v;
}
export function validateDefaults(value: unknown): WorkbenchDefaults {
  const v = object(value);
  keys(v, ["schema", "layout", "themes"]);
  if (v.schema !== 1) throw Error("Unknown defaults schema");
  const l = object(v.layout),
    themes = object(v.themes);
  keys(l, [...Object.keys(layoutFields), "font"]);
  if (JSON.stringify(v).length > 180000 || Object.keys(themes).length > 32)
    throw Error("Too many theme defaults");
  for (const [key, val] of Object.entries(l)) {
    if (key === "font") {
      if (typeof val !== "string" || !Object.hasOwn(fonts, val))
        throw Error("Unsupported font");
    } else {
      const range = layoutFields[key as keyof typeof layoutFields];
      number(val, range[0], range[1]);
    }
  }
  for (const [id, raw] of Object.entries(themes)) {
    if (!/^[a-z][a-z0-9-]{0,50}$/.test(id)) throw Error("Invalid theme ID");
    const t = object(raw);
    keys(t, ["base", "name", "colors", "registration", "assets"]);
    if (
      !builtInIds.includes(id) &&
      (!builtInIds.includes(String(t.base)) ||
        typeof t.name !== "string" ||
        !t.name.trim())
    )
      throw Error("New themes require a built-in template and name");
    if (
      t.base !== undefined &&
      (!builtInIds.includes(String(t.base)) ||
        (builtInIds.includes(id) && t.base !== id))
    )
      throw Error("Invalid theme template");
    if (
      t.name !== undefined &&
      (typeof t.name !== "string" ||
        t.name.length > 80 ||
        /[<>\x00-\x1f]/.test(t.name))
    )
      throw Error("Invalid theme name");
    if (t.colors !== undefined) {
      const colors = object(t.colors);
      keys(colors, colorNames);
      for (const c of Object.values(colors))
        if (typeof c !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c))
          throw Error("Colours must be #RRGGBB");
    }
    if (t.registration !== undefined) {
      const reg = object(t.registration);
      keys(reg, slots);
      for (const raw of Object.values(reg)) {
        const r = object(raw);
        keys(r, ["scale", "x", "y", "cx", "cy", "bleed"]);
        number(r.scale, 0.5, 1.5);
        number(r.x, -0.25, 0.25);
        number(r.y, -0.25, 0.25);
        number(r.cx, 0, 1);
        number(r.cy, 0, 1);
        if (typeof r.bleed !== "boolean") throw Error("Invalid clipping");
      }
    }
    if (t.assets !== undefined) {
      const assets = object(t.assets);
      keys(assets, slots);
      for (const raw of Object.values(assets)) {
        const a = object(raw);
        keys(a, ["src", "width", "height", "bounds", "align"]);
        if (
          typeof a.src !== "string" ||
          !/^\/workbench-assets\/[a-f0-9]{64}\.(png|webp|jpg)$/.test(a.src)
        )
          throw Error("Only imported local assets are allowed");
        number(a.width, 1, 8192);
        number(a.height, 1, 8192);
        if (
          !Number.isInteger(a.width) ||
          !Number.isInteger(a.height) ||
          Number(a.width) * Number(a.height) > 24000000
        )
          throw Error("Image dimensions too large");
        if (
          a.align !== undefined &&
          !["center", "panel-bottom"].includes(String(a.align))
        )
          throw Error("Invalid body alignment");
        if (a.bounds !== undefined) {
          if (!Array.isArray(a.bounds) || a.bounds.length !== 4)
            throw Error("Invalid subject bounds");
          const [x, y, w, h] = a.bounds;
          number(x, 0, Number(a.width));
          number(y, 0, Number(a.height));
          number(w, 1, Number(a.width));
          number(h, 1, Number(a.height));
          if (x + w > Number(a.width) || y + h > Number(a.height))
            throw Error("Subject bounds leave image");
        }
      }
    }
  }
  return structuredClone(v) as WorkbenchDefaults;
}
