import { useEffect, useMemo, useState } from "react";
import type { State } from "./model";
import { dateKey } from "./engine";
import { JournalFilters, useJournalFilters } from "./journal/JournalFilters";
import { JournalList } from "./journal/JournalList";
import { JournalReflection } from "./journal/JournalReflection";
import { journalRows } from "./journal/read-model";
import { useJournalEditor, type JournalRun } from "./journal/useJournalEditor";

/** Composition boundary: the page receives a committed snapshot and the existing write adapter. */
export function Journal({
  s,
  run,
  removeEntry,
}: {
  s: State;
  run: JournalRun;
  removeEntry: (id: string) => Promise<boolean>;
}) {
  const filter = useJournalFilters(dateKey(Date.now()));
  const { searching, date, limit } = filter;
  const keyword = filter.search.trim() ? filter.search : "";
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(keyword), keyword ? 160 : 0);
    return () => window.clearTimeout(timer);
  }, [keyword]);
  const pending = searching && !!keyword && keyword !== query;
  const activeQuery = searching && !pending ? keyword : "";
  const view = useMemo(
    () =>
      journalRows(
        s.entries,
        s.profile.name,
        date,
        activeQuery,
        activeQuery ? limit : Infinity,
      ),
    [s.entries, s.profile.name, date, activeQuery, limit],
  );
  const editor = useJournalEditor(s.entries, run, removeEntry);
  return (
    <div className="journal-page">
      <JournalFilters filter={filter} hasRecordedDate={view.hasRecordedDate} />
      <JournalList
        view={view}
        profileName={s.profile.name}
        date={filter.date}
        today={filter.today}
        search={keyword}
        searching={searching}
        pending={pending}
        showMore={filter.showMore}
        open={editor.open}
      />
      <JournalReflection editor={editor} profileName={s.profile.name} />
    </div>
  );
}
