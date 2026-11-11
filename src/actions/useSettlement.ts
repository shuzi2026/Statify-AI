import { useRef, useState } from "react";
import { elapsed, roundedMinutes, settle } from "../engine";
import { ruleContext } from "../payments/access";
import type { Action, Entry, State } from "../model";
import type { Command } from "../application/commands";
export type SettlementProps = {
  s: State;
  action: Action;
  submit: (
    command: Extract<Command, { type: "settle" }>,
  ) => Promise<Entry | undefined>;
  done: (entry: Entry) => void;
  cancelReported?: () => Promise<void>;
};
export function useSettlement({ s, action: a, submit, done, cancelReported }: SettlementProps) {
  const seconds = roundedMinutes(elapsed(a, Date.now())) * 60,
    partial =
      a.card.method === "duration" && seconds < Math.round(a.card.minutes) * 60;
  const [quantity, Qty] = useState(a.draft?.quantity ?? 1),
    [rating, R] = useState(a.draft?.rating ?? 1),
    [count, C] = useState(
      a.draft?.counted ??
        (partial ? s.preferences.earlyCompletion === "count" : true),
    ),
    [remember, Remember] = useState(false);
  const [note, Note] = useState(a.draft?.note ?? ""),
    [noteOpen, NoteOpen] = useState(!!a.draft?.note),
    [stage, Stage] = useState<"partial" | "rating" | "rewards" | "confirm">(
      partial && s.preferences.earlyCompletion === "ask"
        ? "partial"
        : a.card.evaluate || a.card.method === "quantity"
          ? "rating"
          : a.card.settle
            ? "rewards"
            : "confirm",
    );
  const [busy, Busy] = useState(false),
    [error, E] = useState(""),
    saving = useRef(false);
  const input = { seconds, quantity, rating, counted: count, note };
  let preview: Entry | undefined,
    previewError = "";
  if (stage === "rewards")
    try {
      preview = settle(
        structuredClone(s),
        a.id,
        input,
        ruleContext(Date.now()),
      );
    } catch (e) {
      previewError = (e as Error).message;
    }
  async function finish() {
    if (saving.current) return;
    saving.current = true;
    Busy(true);
    E("");
    try {
      const result = await submit({
        type: "settle",
        actionId: a.id,
        input,
        rememberEarlyCompletion: partial && remember,
      });
      if (result) done(result);
    } finally {
      saving.current = false;
      Busy(false);
    }
  }
  async function cancel() {
    if (!cancelReported || saving.current) return;
    saving.current = true;
    Busy(true);
    try {
      await cancelReported();
    } finally {
      saving.current = false;
      Busy(false);
    }
  }
  function next() {
    if (quantity < 1 || !Number.isInteger(quantity)) {
      E("请填写至少1的整数数量");
      return;
    }
    if (
      !a.card.settle &&
      (stage !== "partial" ||
        (!a.card.evaluate && a.card.method !== "quantity"))
    ) {
      void finish();
      return;
    }
    Stage(
      stage === "partial" && (a.card.evaluate || a.card.method === "quantity")
        ? "rating"
        : "rewards",
    );
  }

  return {
    quantity,
    Qty,
    rating,
    R,
    count,
    C,
    remember,
    Remember,
    note,
    Note,
    noteOpen,
    NoteOpen,
    stage,
    busy,
    error,
    preview,
    previewError,
    finish,
    cancel,
    next,
  };
}
