import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Plan } from "../model";
import { hasUpcomingPlanChanges } from "../late-plan-edits";
import {
  assertSaveScope,
  saveSnapshot,
  type SaveScope,
} from "../save-publication";
import {
  bounds,
  configureBoardCard,
  findBoardPlan,
  firstAvailableDate,
  newPlan,
  planBounds,
  planLocked,
  planProgress,
  putBoardCard,
  saveBoardPlan,
  slotStamp,
  updatePlanSlot,
} from "../planning";
import type { PlanWorkspaceProps, Selection } from "./types";
// Keep view selection and pending edits in one workspace lifetime; writes use the supplied queue.
export function usePlanBoard({
  s,
  now,
  readOnlyDemo,
  run,
}: Pick<PlanWorkspaceProps, "s" | "now" | "readOnlyDemo" | "run">) {
  const [selection, Select] = useState<Selection>(() => ({
    scope: "repeat",
    period: "day",
    anchor: firstAvailableDate("day", now),
  }));
  const anchor =
    selection.scope === "repeat"
      ? firstAvailableDate(selection.period, now)
      : selection.anchor;
  const candidate = useMemo(
    () => ({ ...newPlan(now), mode: s.planMode, ...selection, anchor }),
    [selection.scope, selection.period, anchor, s.planMode],
  );
  const viewKey =
    selection.scope +
    ":" +
    selection.period +
    ":" +
    (selection.scope === "once"
      ? bounds(selection.period, new Date(anchor + "T00:00:00").getTime()).key
      : "");
  const stored = findBoardPlan(
    s,
    selection.scope,
    selection.period,
    anchor,
    now,
  );

  const [local, Local] = useState<{
      key: string;
      mode: Plan["mode"];
      timeline: boolean;
    } | null>(null),
    [choosing, SetChoosing] = useState<{
      card: Card;
      slotId?: string;
      increment: boolean;
      scope: SaveScope | undefined;
    } | null>(null),
    [configuring, SetConfiguring] = useState<{
      card: Card;
      adding: boolean;
      increment: boolean;
      scope: SaveScope | undefined;
    } | null>(null),
    [error, E] = useState(""),
    [scheduleError, SE] = useState(""),
    [cardError, CE] = useState(""),
    [updating, U] = useState(false),
    [arrival, Arrive] = useState<{
      planId: string;
      key: string;
      name: string;
    } | null>(null);
  const settingRequest = useRef(0);
  // A draft belongs to the save reviewed when its editor opened. Rerenders must
  // not adopt a replacement's scope; ordinary edits within this save advance it.
  function Choose(value: Omit<NonNullable<typeof choosing>, "scope"> | null) {
    SetChoosing(value ? { ...value, scope: saveSnapshot()?.scope } : null);
  }
  function Configure(
    value: Omit<NonNullable<typeof configuring>, "scope"> | null,
  ) {
    SetConfiguring(value ? { ...value, scope: saveSnapshot()?.scope } : null);
  }
  const [source, Source] = useState<"tasks" | "warehouse">("tasks"),
    [removeKey, RemoveKey] = useState<string | null>(null);
  useEffect(() => {
    const clear = (e: globalThis.PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".plan-paper-wrap"))
        RemoveKey(null);
    };
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, []);

  const p: Plan = {
      ...(stored || candidate),
      scope: selection.scope,
      anchor: stored?.anchor || anchor,
      ...(local?.key === viewKey
        ? { mode: local.mode, timeline: local.timeline }
        : {}),
    },
    closed = planLocked(p, now),
    pr = planProgress(s, p, now);
  const liveCycle = s.planCycles.find(
      (c) => c.planId === p.id && c.startsAt <= now && now < c.end,
    ),
    upcoming =
      hasUpcomingPlanChanges(s, p, now) ||
      (p.scope === "repeat" && !!p.startsAt && p.startsAt > now);

  useEffect(() => {
    if (
      !readOnlyDemo &&
      stored?.scope &&
      stored.draft &&
      stored.cards.length &&
      !closed
    )
      void run((st) => {
        const current = st.plans.find((x) => x.id === stored.id);
        if (current?.draft && current.cards.length)
          saveBoardPlan(st, current, Date.now());
      }, E);
  }, [stored?.id, stored?.draft, closed, readOnlyDemo]);
  function select(next: Selection) {
    Source("tasks");
    settingRequest.current++;
    Local(null);
    Select(next);
    E("");
    Arrive(null);
    RemoveKey(null);
    Choose(null);
    Configure(null);
    CE("");
  }

  async function update(change: (p: Plan) => void) {
    E("");
    U(true);
    try {
      return await run((st) => {
        const live = structuredClone(
          findBoardPlan(
            st,
            selection.scope,
            selection.period,
            anchor,
            Date.now(),
          ) || p,
        );
        change(live);
        saveBoardPlan(st, live, Date.now());
      }, E);
    } finally {
      U(false);
    }
  }
  function setting(mode: Plan["mode"], timeline: boolean) {
    const request = ++settingRequest.current;
    Local({ key: viewKey, mode, timeline });
    if (!p.cards.length) return;
    void update((x) => {
      x.mode = mode;
      x.timeline = timeline;
    }).then(() => {
      if (settingRequest.current === request) Local(null);
    });
  }
  async function add(c: Card, scheduled = !!p.timeline, increment = true) {
    if (closed) {
      E("这个计划周期已结束，不能修改历史计划");
      return;
    }
    if (p.mode === "score" && !scheduled) {
      CE("");
      Configure({ card: c, adding: true, increment });
      return;
    }
    E("");
    U(true);
    try {
      let result: ReturnType<typeof putBoardCard> | undefined;
      const day =
        p.period !== "day" ? "" : p.scope === "once" ? p.anchor! : "1";
      if (
        (await run((st) => {
          result = putBoardCard(
            st,
            p,
            c.id,
            Date.now(),
            scheduled ? { day, time: "", configured: false } : undefined,
            increment,
          );
        }, E)) &&
        result
      ) {
        Arrive({
          planId: result.plan.id,
          key: result.slotId || c.id,
          name: c.name,
        });
        if (scheduled) {
          SE("");
          Choose({ card: c, slotId: result.slotId, increment: false });
        }
      }
    } finally {
      U(false);
    }
  }

  async function saveCard(target: number, score?: number) {
    if (!configuring) return;
    CE("");
    let planId = p.id;
    if (
      await run((st) => {
        assertSaveScope(configuring.scope);
        planId = configureBoardCard(
          st,
          p,
          configuring.card.id,
          target,
          score,
          Date.now(),
        ).id;
      }, CE)
    ) {
      Arrive({
        planId,
        key: configuring.card.id,
        name: configuring.card.name,
      });
      Configure(null);
    }
  }
  async function saveSchedule(day: string, time: string, score?: number) {
    if (!choosing) return;
    SE("");
    let focus: string | undefined,
      planId = p.id;
    const ok = await run((st) => {
      assertSaveScope(choosing.scope);
      if (p.mode === "score") {
        const live =
          findBoardPlan(
            st,
            selection.scope,
            selection.period,
            anchor,
            Date.now(),
          ) || p;
        const r = live.cards.find((r) => r.id === choosing.card.id);
        if (r)
          configureBoardCard(
            st,
            live,
            choosing.card.id,
            r.target,
            score,
            Date.now(),
          );
      }
      if (choosing.slotId) {
        const known = new Set(
          st.plans.find((x) => x.id === p.id)?.slots?.map((slot) => slot.id),
        );
        const next = updatePlanSlot(
          st,
          p.id,
          choosing.slotId,
          day,
          time,
          Date.now(),
        );
        focus = next.slots?.find(
          (slot) => slot.id === choosing.slotId || !known.has(slot.id),
        )?.id;
      } else {
        const result = putBoardCard(
          st,
          p,
          choosing.card.id,
          Date.now(),
          { day, time, configured: !!day },
          choosing.increment,
        );
        focus = result.slotId;
        planId = result.plan.id;
      }
    }, SE);
    if (ok) {
      Choose(null);
      Arrive({
        planId,
        key: focus || choosing.card.id,
        name: choosing.card.name,
      });
    }
  }
  const slots = [...(p.slots || [])].sort(
    (a, b) =>
      slotStamp(p, a, planBounds(p, now).start) -
      slotStamp(p, b, planBounds(p, now).start),
  );
  const items = p.cards.map((r) => ({ cardId: r.id, slot: undefined })),
    timelineItems = slots.map((slot) => ({ cardId: slot.cardId, slot }));

  return {
    selection,
    select,
    viewKey,
    p,
    closed,
    pr,
    liveCycle,
    upcoming,
    choosing,
    Choose,
    configuring,
    Configure,
    error,
    scheduleError,
    SE,
    cardError,
    CE,
    updating,
    arrival,
    Arrive,
    source,
    Source,
    removeKey,
    RemoveKey,
    update,
    setting,
    add,
    saveCard,
    saveSchedule,
    slots,
    items,
    timelineItems,
  };
}
export type PlanBoard = ReturnType<typeof usePlanBoard>;
