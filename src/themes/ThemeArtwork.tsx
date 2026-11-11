import { useArtworkReady } from "./image-loading";
import {
  registrationFor,
  subscribeRegistration,
  registrationRevision,
} from "./registration";
import { useId, useSyncExternalStore } from "react";
import type { Card } from "../model";
import { cardArtwork, type ArtworkName, type AppTheme } from "./catalog";
import { subscribeTheme, themeSnapshot } from "./runtime";
/** Accepts a standalone image or an atlas rectangle; page code knows neither. */
export function ThemeArtwork({
  name,
  card,
  label,
  className = "",
  appearance,
  containSource = false,
}: {
  name?: ArtworkName;
  card?: Pick<Card, "name" | "category" | "method" | "sleep"> &
    Partial<Pick<Card, "artwork" | "customArt">>;
  label?: string;
  className?: string;
  appearance?: AppTheme;
  containSource?: boolean;
}) {
  const id = useId(),
    current = useSyncExternalStore(subscribeTheme, themeSnapshot),
    theme = appearance || current,
    key = name || (card ? cardArtwork(card, theme) : "companion"),
    art = card?.customArt
      ? { src: card.customArt, width: 512, height: 512 }
      : theme.artwork[key];
  const ready = useArtworkReady(art?.src);
  useSyncExternalStore(subscribeRegistration, registrationRevision);
  const registration = registrationFor(theme.id, key);
  if (!art) return null;
  const viewBox =
    containSource && art.bleed
      ? `0 0 ${art.width || 512} ${art.height || 512}`
      : art.viewBox || `0 0 ${art.width || 512} ${art.height || 512}`;
  const [x, y, width, height] = viewBox.split(" ").map(Number);
  return (
    <svg
      className={"theme-artwork " + className}
      viewBox={viewBox}
      overflow={registration.bleed ? "visible" : "hidden"}
      preserveAspectRatio="xMidYMid meet"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={!label || undefined}
      focusable="false"
      data-artwork={key}
      data-image-ready={ready}
    >
      <defs>
        <clipPath id={id + "-clip"}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        {art.removeWhite && (
          <filter id={id + "-alpha"} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1.5 -1.5 -1.5 0 4.5"
            />
          </filter>
        )}
        {art.alphaFloor !== undefined && (
          <filter id={id + "-matte"} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncA
                type="linear"
                slope={1 / (1 - art.alphaFloor)}
                intercept={-art.alphaFloor / (1 - art.alphaFloor)}
              />
            </feComponentTransfer>
          </filter>
        )}
      </defs>
      {!ready && (
        <rect
          className="artwork-placeholder"
          x={x + width * 0.2}
          y={y + height * 0.2}
          width={width * 0.6}
          height={height * 0.6}
          rx={width * 0.2}
          fill="var(--theme-lavender)"
          opacity=".35"
        />
      )}
      <g
        className="artwork-paint"
        style={{ opacity: ready ? 1 : 0 }}
        clipPath={registration.bleed ? undefined : `url(#${id}-clip)`}
      >
        <g
          transform={`translate(${x + width * (0.5 + registration.x)} ${y + height * (0.5 + registration.y)}) scale(${registration.scale}) translate(${-x - width * registration.cx} ${-y - height * registration.cy})`}
        >
          <g clipPath={art.bleed ? undefined : `url(#${id}-clip)`}>
            <image
              href={art.src}
              width={art.width || 512}
              height={art.height || 512}
              filter={
                art.alphaFloor !== undefined
                  ? `url(#${id}-matte)`
                  : art.removeWhite
                    ? `url(#${id}-alpha)`
                    : undefined
              }
            />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Fills a layout-owned contour with the same stock used by CSS surfaces. */
export function ThemePaperPath({ d }: { d: string }) {
  const id = useId(),
    theme = useSyncExternalStore(subscribeTheme, themeSnapshot),
    paper = theme.artwork.paper;
  const ready = useArtworkReady(paper?.src);
  useSyncExternalStore(subscribeRegistration, registrationRevision);
  const r = registrationFor(theme.id, "paper");
  if (!paper) return <path d={d} />;
  return (
    <>
      <path d={d} fill="var(--theme-paper)" />
      <defs>
        <pattern
          id={id}
          patternUnits="userSpaceOnUse"
          width={(paper.width || 560) * r.scale}
          height={(paper.height || 560) * r.scale}
          x={(r.x + 0.5 - r.cx) * (paper.width || 560)}
          y={(r.y + 0.5 - r.cy) * (paper.height || 560)}
        >
          <image
            className="theme-paper-texture"
            href={paper.src}
            width={(paper.width || 560) * r.scale}
            height={(paper.height || 560) * r.scale}
            opacity={ready ? 1 : 0}
          />
          <rect
            width="100%"
            height="100%"
            fill="var(--surface)"
            style={{ opacity: "var(--theme-surface-veil)" }}
          />
        </pattern>
      </defs>
      <path d={d} style={{ fill: `url(#${id})` }} />
    </>
  );
}
