import { desktopMinWidth } from "../ui-layout/responsive";
import type { AppTheme } from "./catalog";
import { ravenBackdrop, ravenScene } from "./raven-wizard/scene";
import { themeSnapshot } from "./runtime";
import { setLayoutStyle } from "../ui-layout/style-value";
/** Paint-only fitting; common layout owns the measured scene and panels. */
export function fitHomeSceneArtwork({
  currentTheme,
  el,
  attributes,
  hero,
  character,
  backdrop,
  home,
  attributeMode,
}: {
  currentTheme: AppTheme;
  el: HTMLElement;
  attributes: HTMLElement;
  hero: HTMLElement | null | undefined;
  character: HTMLElement | null | undefined;
  backdrop: HTMLElement | null | undefined;
  home: HTMLElement | null;
  attributeMode: number;
}) {
  const art = currentTheme.artwork.companion;
  if (art?.bodyBounds && art.viewBox && hero && character && home) {
    const root = home.getBoundingClientRect(),
      stage = el.getBoundingClientRect(),
      portrait = hero.getBoundingClientRect(),
      panel = attributes.getBoundingClientRect(),
      stacked = document.documentElement.dataset.largeText === "true",
      frame = character.getBoundingClientRect();
    if (root.width < desktopMinWidth && portrait.width > 0) {
      const [vx, vy, vw] = art.viewBox.split(" ").map(Number),
        [bx, by, bw, bh] = art.bodyBounds;
      const homeStyle = getComputedStyle(home),
        widePanel = parseFloat(homeStyle.getPropertyValue("--home-panelWide")),
        targetPanelWidth =
          parseFloat(
            homeStyle.getPropertyValue(
              attributeMode === 0 ? "--home-panelWide" : "--home-panelNarrow",
            ),
          ) || panel.width;
      const unit = portrait.width / vw,
        gap = 8,
        left = stacked
          ? stage.left + gap
          : attributeMode === 2
            ? stage.left
            : Math.max(stage.left, panel.left + targetPanelWidth + gap),
        right = stage.right - (stacked ? gap : 0);
      const center = stacked
        ? stage.left + stage.width / 2
        : attributeMode === 0
          ? (left + right) / 2
          : root.left + root.width / 2;
      const room =
        stacked || attributeMode === 0
          ? right - left
          : 2 * Math.min(center - left, right - center);
      const referenceRoom = stage.width - (stacked ? 0 : widePanel) - gap * 2;
      const fit = Math.max(
        0.1,
        Math.min(
          1,
          referenceRoom / (bw * unit),
          room / (bw * unit),
          ((stacked ? frame.height : stage.height) - gap * 2) / (bh * unit),
        ),
      );
      const bodyCenter = portrait.left + (bx + bw / 2 - vx) * unit,
        bodyY = portrait.top + (by + bh / 2 - vy) * unit;
      const originX = portrait.left + portrait.width / 2,
        originY = portrait.top + portrait.height / 2;
      const targetY = stacked
        ? frame.top + frame.height / 2
        : art.bodyAlign === "panel-bottom"
          ? Math.min(panel.bottom, stage.bottom - gap) - (bh * unit * fit) / 2
          : stage.top + stage.height / 2;
      setLayoutStyle(hero, "--subject-fit", String(fit));
      setLayoutStyle(
        hero,
        "--subject-shift",
        center - originX - (bodyCenter - originX) * fit + "px",
      );
      setLayoutStyle(
        hero,
        "--subject-shift-y",
        targetY - originY - (bodyY - originY) * fit + "px",
      );
    }
  }
  if (
    (themeSnapshot().styleId || themeSnapshot().id) === "raven-wizard" &&
    hero &&
    character &&
    backdrop &&
    home
  ) {
    const root = home.getBoundingClientRect(),
      portrait = hero.getBoundingClientRect(),
      stage = el.getBoundingClientRect(),
      frame = character.getBoundingClientRect(),
      feet = portrait.top + portrait.height * ravenScene.footY;
    const background = ravenBackdrop(root.width, root.height, feet - root.top);
    setLayoutStyle(
      backdrop,
      "--raven-scene-top",
      root.top + background.top - stage.top + "px",
    );
    setLayoutStyle(backdrop, "--raven-scene-height", background.height + "px");
    setLayoutStyle(
      character,
      "--raven-contact-x",
      portrait.left + portrait.width * 0.7 - frame.left + "px",
    );
    setLayoutStyle(character, "--raven-contact-y", feet - frame.top + "px");
    setLayoutStyle(
      character,
      "--raven-shadow-width",
      portrait.width * 0.44 + "px",
    );
    setLayoutStyle(
      character,
      "--raven-shadow-height",
      portrait.height * 0.025 + "px",
    );
  }
}
