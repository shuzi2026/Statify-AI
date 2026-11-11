import { BookOpen } from "lucide-react";
import { Empty } from "../components";
import type { Entry } from "../model";
import { journalSentence, type journalRows } from "./read-model";

export function JournalList({
  view,
  profileName,
  date,
  today,
  search,
  searching,
  pending,
  showMore,
  open,
}: {
  view: ReturnType<typeof journalRows>;
  profileName: string;
  date: string;
  today: string;
  search: string;
  searching: boolean;
  pending: boolean;
  showMore: () => void;
  open: (entry: Entry, source: HTMLElement) => void;
}) {
  const { rows, groups } = view;
  const sentence = (entry: Entry) => journalSentence(profileName, entry);
  return (
    <div className="journal-log" aria-label="日程记录">
      {pending ? (
        <p className="empty" role="status">
          正在搜索…
        </p>
      ) : searching && !search ? (
        <Empty
          title="输入关键词搜索全部历史。"
          detail="可以搜索行动名称或感想。"
        />
      ) : rows.length ? (
        Array.from(groups, ([day, entries]) => (
          <section
            className="journal-day"
            key={day}
            aria-label={day + "的记录"}
          >
            {searching && (
              <h3 className="journal-day-label">
                <time dateTime={day}>{day}</time>
              </h3>
            )}
            <ul>
              {entries.map((e) => {
                const hasNote = !!e.note.trim();
                const encouragement = e.purchase ? "" : !e.counted
                  ? "也算有进步啦～"
                  : e.method === "instant"
                    ? "真是太厉害啦！"
                    : e.method === "timed"
                      ? "自律满分！"
                      : e.method === "quantity"
                        ? "攒下不少呢！"
                        : "太棒啦！";
                const content = (
                  <>
                    <span className="journal-meta">
                      {hasNote && <BookOpen size={14} aria-hidden="true" />}
                      <time
                        dateTime={new Date(e.endedAt).toISOString()}
                        title={new Date(e.endedAt).toLocaleString("zh-CN")}
                      >
                        {new Date(e.endedAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </time>
                    </span>
                    <span className="journal-message">
                      <span>{sentence(e)}</span>
                      <span className="journal-encouragement">
                        {encouragement}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={e.id}>
                    <div className="journal-line">
                      <button
                        className={
                          "journal-sentence" + (hasNote ? " has-note" : "")
                        }
                        aria-label={"查看感悟 " + e.name}
                        onClick={(event) => open(e, event.currentTarget)}
                      >
                        {content}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <Empty
          title={search ? "没有找到记录。" : "这一天还没有记录。"}
          detail={
            search
              ? "试试其他关键词。"
              : date === today
                ? "完成一张卡牌，这里就会留下今天的第一个印记。"
                : "可以切换日期查看其他日子的记录。"
          }
        />
      )}
      {searching && !pending && search && view.hasMore && (
        <button className="text-button journal-more" onClick={showMore}>
          加载更多记录
        </button>
      )}
    </div>
  );
}
