import { useRef, useState } from "react";
import type { Entry, State } from "../model";
import { saveJournalNote } from "./note";
export type JournalRun = (fn: (state: State) => unknown) => Promise<boolean>;

/** Only UI draft state lives here; writes still go through the caller's application queue. */
export function useJournalEditor(
  entries: Entry[],
  run: JournalRun,
  removeEntry: (id: string) => Promise<boolean>,
) {
  const [selected, Select] = useState<string | null>(null),
    [editing, Edit] = useState(false),
    [note, N] = useState(""),
    [saving, Saving] = useState(false);
  const opener = useRef<HTMLElement | null>(null),
    journal = useRef<HTMLElement | null>(null);
  const entry = entries.find((e) => e.id === selected);
  const open = (e: Entry, source: HTMLElement) => {
    opener.current = source;
    journal.current = source.closest(".journal-page");
    Select(e.id);
    Edit(false);
    N(e.note);
  };
  const reset = () => {
    const source = opener.current;
    const page = journal.current;
    Select(null);
    Edit(false);
    requestAnimationFrame(() => {
      const target = source?.isConnected
        ? source
        : page?.querySelector<HTMLElement>(".journal-search-input") ??
          page?.querySelector<HTMLElement>(".journal-day-nav button");
      target?.focus({ preventScroll: true });
    });
  };
  const close = () => {
    if (!saving) reset();
  };
  async function remove() {
    if (!entry || saving) return;
    Saving(true);
    try {
      if (await removeEntry(entry.id)) reset();
    } finally {
      Saving(false);
    }
  }
  async function save() {
    if (!entry || saving) return;
    Saving(true);
    try {
      const id = entry.id;
      if (
        await run((st) => saveJournalNote(st, id, note))
      )
        Edit(false);
    } finally {
      Saving(false);
    }
  }

  return {
    entry,
    editing,
    note,
    saving,
    open,
    close,
    save,
    remove,
    setNote: N,
    cancel: () => Edit(false),
    edit: () => {
      if (entry) {
        N(entry.note);
        Edit(true);
      }
    },
  };
}
