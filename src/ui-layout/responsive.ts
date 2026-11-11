/** CSS keeps native media queries for old WebViews; responsive.test.ts guards parity. */
export const desktopMinWidth = 760;
export const mobileMaxWidth = desktopMinWidth - 1;
export const layoutMedia = {
  mobile: `(max-width:${mobileMaxWidth}px)`,
  desktop: `(min-width:${desktopMinWidth}px)`,
} as const;
