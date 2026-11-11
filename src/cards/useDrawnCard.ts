import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMemberPrompt } from "../payments/MemberNotice";
import { useMemberFeatures } from "../payments/use-member";
import type { Entry } from "../model";
import { cardDepartureMs, waitForCardExit } from "../themes/motion";
import { animateSafely } from "../ui-layout/animation";
import { sizeLegacyCard } from "../ui-layout/legacy-card-size";
import type { DrawnCardProps } from "./types";
export function useDrawnCard({
  source,
  close,
  begin,
  instant,
  blocked,
  hasFollowup,
}: DrawnCardProps) {
  const canViewHistory = useMemberFeatures(),
    memberPrompt = useMemberPrompt(),
    exitMs = cardDepartureMs(instant);
  const ref = useRef<HTMLDialogElement>(null),
    paper = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(!source),
    [flipped, Flip] = useState(false),
    touchStart = useRef<{ x: number; y: number } | null>(null),
    tap = useRef<{ at: number; x: number; y: number } | null>(null),
    touchFlip = useRef(0),
    opened = useRef(performance.now());
  const [leaving, Leave] = useState<"instant" | "focus" | null>(null),
    [held, Held] = useState(false),
    [completed, Completed] = useState<Entry | null>(null),
    [completionClosing, CompletionClosing] = useState(false),
    starting = useRef(false),
    dismissing = useRef(false),
    departure = useRef<AbortController | null>(null),
    sourceVisibility = useRef("");
  async function dismissCompletion() {
    if (dismissing.current) return;
    dismissing.current = true;
    CompletionClosing(true);
    const signal = departure.current?.signal;
    if (signal) await waitForCardExit(200, signal);
    if (!signal?.aborted) close();
  }
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => void dismissCompletion(), 1600);
    return () => clearTimeout(timer);
  }, [completed]);
  useLayoutEffect(() => {
    if (completed && source?.isConnected)
      source.style.visibility = sourceVisibility.current;
  }, [completed, source]);
  const showBack = flipped;
  useEffect(() => {
    tap.current = null;
    touchStart.current = null;
    touchFlip.current = 0;
  }, [canViewHistory]);
  useEffect(() => {
    if (!flipped || canViewHistory) return;
    let canceled = false;
    const inner = paper.current?.querySelector<HTMLElement>(".card-flip-inner");
    const animations =
      inner && typeof inner.getAnimations === "function"
        ? inner.getAnimations()
        : [];
    void Promise.all(animations.map((a) => a.finished.catch(() => {}))).then(
      () => {
        if (!canceled) memberPrompt.prompt();
      },
    );
    return () => {
      canceled = true;
    };
  }, [flipped, canViewHistory]);
  function flip() {
    if (ready && !starting.current) {
      memberPrompt.reset();
      Flip((v) => !v);
    }
  }
  async function proceed() {
    if (starting.current || !ready || blocked) return;
    starting.current = true;
    const controller = new AbortController();
    departure.current = controller;
    const el = paper.current;
    if (el) {
      const box = el.getBoundingClientRect();
      el.style.setProperty(
        "--card-focus-scale",
        String(
          Math.max(innerWidth / box.width, innerHeight / box.height) * 1.12,
        ),
      );
    }
    Leave(instant ? "instant" : "focus");
    // A direct result reuses this modal and its backdrop. Prepare it while the
    // card is still visible, then crossfade both surfaces over the same duration.
    if (!instant || hasFollowup)
      await waitForCardExit(exitMs, controller.signal);
    if (controller.signal.aborted) return;
    const result = await begin();
    if (controller.signal.aborted) return;
    if (typeof result === "object") {
      if (el)
        el.style.setProperty(
          "--card-handoff-opacity",
          getComputedStyle(el).opacity,
        );
      Completed(result);
    } else if (!result) {
      starting.current = false;
      Leave(null);
    }
  }
  useLayoutEffect(() => {
    const dialog = ref.current,
      el = paper.current;
    if (!dialog || !el) return;
    const connected = source?.isConnected,
      from = connected
        ? source!.getBoundingClientRect()
        : source
          ? {
              x: parseFloat(source.style.left),
              y: parseFloat(source.style.top),
              width: parseFloat(source.style.width),
              height: parseFloat(source.style.height),
            }
          : null;
    const visibility = source?.style.visibility;
    sourceVisibility.current = visibility || "";
    let live = true,
      animation: Animation | null = null;
    sizeLegacyCard(el);
    dialog.showModal();
    if (connected) source!.style.visibility = "hidden";
    const to = el.getBoundingClientRect();
    if (
      from &&
      from.width > 0 &&
      from.height > 0 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const x = from.x + from.width / 2 - to.x - to.width / 2,
        y = from.y + from.height / 2 - to.y - to.height / 2,
        sx = from.width / to.width,
        sy = from.height / to.height;
      animation = animateSafely(
        el,
        [
          {
            transform: `translate3d(${x}px,${y}px,0) scale(${sx},${sy})`,
            offset: 0,
            easing: "cubic-bezier(.2,.8,.25,1)",
          },
          { transform: `translate3d(0,0,0) scale(${sx},${sy})`, offset: 0.48 },
          {
            transform: `translate3d(0,0,0) scale(${sx},${sy})`,
            offset: 0.62,
            easing: "cubic-bezier(.2,.8,.25,1)",
          },
          { transform: "translate3d(0,0,0) scale(1)", offset: 1 },
        ],
        { duration: 720, easing: "linear", fill: "forwards" },
      );
      const settle = () => {
        if (live) {
          animation?.cancel();
          setReady(true);
        }
      };
      if (!animation) settle();
      else if (animation.finished)
        void animation.finished.then(settle).catch(settle);
      else setTimeout(settle, 760);
    } else setReady(true);
    return () => {
      live = false;
      departure.current?.abort();
      animation?.cancel();
      if (connected && source) source.style.visibility = visibility || "";
      dialog.close();
    };
  }, [source]);

  return {
    canViewHistory,
    exitMs,
    memberPrompt,
    ref,
    paper,
    ready,
    showBack,
    touchStart,
    tap,
    touchFlip,
    opened,
    leaving,
    held,
    Held,
    completed,
    completionClosing,
    starting,
    dismissCompletion,
    flip,
    proceed,
  };
}
