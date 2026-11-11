import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { subscribeTheme, themeSnapshot } from "../themes/runtime";
import { fitHomeSceneArtwork } from "../themes/home-scene";
import { setLayoutStyle } from "../ui-layout/style-value";
export function useHomeViewport() {
  const scene = useRef<HTMLDivElement>(null),
    homeRef = useRef<HTMLElement>(null);
  const [windowSize, setWindowSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    fontScale: 1,
  }));

  useLayoutEffect(() => {
    const parent = homeRef.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const width = parent.clientWidth,
        height = parent.clientHeight;
      // Home stays mounted while another tab hides it. A hidden parent's 0×0
      // is not a new viewport: retaining it collapses cards to 1px on return.
      if (!width || !height) return;
      const fontScale =
          Number(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--layout-font-scale",
            ),
          ) || 1;
      setWindowSize((old) =>
        old.width === width &&
        old.height === height &&
        old.fontScale === fontScale
          ? old
          : { width, height, fontScale },
      );
    };
    const resize = new ResizeObserver(measure);
    resize.observe(parent);
    const root = document.documentElement;
    const viewportSettings = () =>
      `${root.style.getPropertyValue("--layout-font-scale")}|${root.dataset.largeText}`;
    let previousSettings = viewportSettings();
    const settings = new MutationObserver(() => {
      // Theme colours and legacy paint tokens also live on <html>. They do not
      // resize the viewport; reading geometry after every token write forces
      // layout in the middle of the legacy paint pass.
      const next = viewportSettings();
      if (next === previousSettings) return;
      previousSettings = next;
      measure();
    });
    settings.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-large-text"],
    });
    measure();
    return () => {
      resize.disconnect();
      settings.disconnect();
    };
  }, []);

  return { scene, homeRef, windowSize };
}
export function useHomeSceneLayout({
  scene,
  homeRef,
  handRef,
  expanded,
  attributeMode,
  attributeCount,
}: {
  scene: RefObject<HTMLDivElement | null>;
  homeRef: RefObject<HTMLElement | null>;
  handRef: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  attributeMode: number;
  attributeCount: number;
}) {
  const currentTheme = useSyncExternalStore(subscribeTheme, themeSnapshot);
  useLayoutEffect(() => {
    const el = scene.current,
      hand = handRef.current?.parentElement,
      attributes = el?.querySelector<HTMLElement>(".floating-attributes"),
      hero = el?.querySelector<HTMLElement>(".quiet-orb"),
      character = el?.querySelector<HTMLElement>(".mobile-character"),
      backdrop = el?.querySelector<HTMLElement>(".mobile-scene-backdrop");
    if (!el || !hand || !attributes) return;
    const measure = () => {
      if (!el.offsetWidth || !el.offsetHeight) return;
      const sceneTop = el.offsetTop;
      // Short screens can put attributes near the hand. Keep the veil below them.
      const stacked = document.documentElement.dataset.largeText === "true";
      const top =
        stacked && character
          ? Math.max(
              attributeMode === 2
                ? 0
                : attributes.getBoundingClientRect().bottom,
              character.getBoundingClientRect().bottom,
            ) -
            hand.getBoundingClientRect().top +
            8
          : attributeMode === 2
            ? -24
            : attributes.getBoundingClientRect().bottom -
              hand.getBoundingClientRect().top +
              8;
      fitHomeSceneArtwork({
        currentTheme,
        el,
        attributes,
        hero,
        character,
        backdrop,
        home: homeRef.current,
        attributeMode,
      });
      // These decorate the backdrop and veil. Their writes do not contribute
      // to the scene measurements and must not interrupt those reads.
      setLayoutStyle(el, "--scene-top", sceneTop + "px");
      setLayoutStyle(hand, "--hand-veil-top", top + "px");
    };
    const owners = new Set([
      el,
      el.parentElement!,
      attributes,
      hand,
      hero,
      character,
    ]);
    const observer = new ResizeObserver(measure);
    for (const node of owners)
      if (node) observer.observe(node);
    // A fan-card's transform/paint transition bubbles through this parent too.
    // It cannot move the scene anchors; avoid forcing scene layout after every
    // hand swipe while retaining updates for actual anchor transitions.
    const transitionEnd = (event: TransitionEvent) => {
      if (event.target instanceof HTMLElement && owners.has(event.target)) measure();
    };
    el.parentElement!.addEventListener("transitionend", transitionEnd);
    measure();
    return () => {
      observer.disconnect();
      el.parentElement?.removeEventListener("transitionend", transitionEnd);
    };
  }, [expanded, attributeMode, attributeCount, currentTheme]);
}
