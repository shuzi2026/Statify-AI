import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { DateInput } from "../inputs/ValueInputs";
import { Field } from "../components";
import { dateKey } from "../engine";

const searchPageSize = 50;

export function useJournalFilters(today: string) {
  const [search, setKeyword] = useState("");
  const [limit, setLimit] = useState(searchPageSize);
  const [chosenDate, setDate] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const date = chosenDate || today;
  const chooseDate = (value: string) => {
    setDate(!value || value === today ? null : value);
  };
  const shiftDay = (amount: number) => {
    const next = new Date(date + "T12:00:00");
    next.setDate(next.getDate() + amount);
    chooseDate(dateKey(next.getTime()));
  };

  return {
    today,
    date,
    search,
    limit,
    searching,
    chooseDate,
    shiftDay,
    setSearch: (value: string) => {
      setKeyword(value);
      setLimit(searchPageSize);
    },
    showMore: () => setLimit((shown) => shown + searchPageSize),
    toggleSearch: () => {
      setSearching((open) => !open);
      setKeyword("");
      setLimit(searchPageSize);
    },
  };
}

export function JournalFilters({
  filter,
  hasRecordedDate,
}: {
  filter: ReturnType<typeof useJournalFilters>;
  hasRecordedDate: (date: string) => boolean;
}) {
  const searchButton = useRef<HTMLButtonElement>(null);
  const {
    today,
    date,
    search,
    searching,
    chooseDate,
    shiftDay,
    setSearch,
    toggleSearch,
  } = filter;
  if (!searching)
    return (
      <header className="journal-day-nav" aria-label="记录日期">
        <button
          className="icon-button"
          aria-label="前一天"
          onClick={() => shiftDay(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <DateInput
          aria-label="按日期查看"
          value={date}
          max={today}
          isDateAvailable={hasRecordedDate}
          onChange={(e) => chooseDate(e.target.value)}
        />
        <button
          className="icon-button"
          aria-label="后一天"
          disabled={date >= today}
          onClick={() => shiftDay(1)}
        >
          <ChevronRight size={20} />
        </button>
        <button
          ref={searchButton}
          className="icon-button"
          aria-label="搜索行动与感想"
          aria-expanded={false}
          onClick={toggleSearch}
        >
          <Search size={18} />
        </button>
      </header>
    );
  return (
    <div className="journal-search">
      <Field label="搜索全部历史">
        <input
          className="journal-search-input"
          aria-label="搜索行动与感想"
          autoFocus
          maxLength={120}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="记住了什么？"
        />
      </Field>
      <button
        className="icon-button"
        aria-label="关闭搜索"
        onClick={() => {
          toggleSearch();
          requestAnimationFrame(() => searchButton.current?.focus());
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}
