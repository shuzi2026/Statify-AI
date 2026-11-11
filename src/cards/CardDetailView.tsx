import { useState, type CSSProperties } from "react";
import { ActionCardFace } from "./CardAppearance";
import { cardUseRestrictions, dateKey, unavailable } from "../engine";
import {
  statusKeys,
  statusNames,
  type Card,
  type Entry,
  type State,
} from "../model";
import { DrawnCardView } from "./DrawnCardView";
import { PurchaseHistory } from "./PurchaseHistory";

const capLabels = {
  day: "已达本日使用上限",
  week: "已达本周使用上限",
  month: "已达本月使用上限",
} satisfies Record<Card["capPeriod"], string>;

export function CardDetailView({
  card,
  s,
  now,
  source,
  close,
  edit,
  remove,
  begin,
}: {
  card: Card;
  s: State;
  now: number;
  source: HTMLElement | null;
  close: () => void;
  edit: () => void;
  remove?: () => void;
  begin: () => Promise<boolean | Entry>;
}) {
  const restrictions = cardUseRestrictions(s, card, now),
    reason = unavailable(s, card, now, restrictions),
    usageBlocked = reason === "还没到可用时段" || reason === "已达到本周期次数上限",
    messages = usageBlocked
      ? [
          restrictions.capReached ? capLabels[card.capPeriod] : "",
          restrictions.outsideWindow ? "不在使用时段内" : "",
        ].filter(Boolean)
      : reason ? [reason] : [],
    statuses = statusKeys.flatMap((key) => {
      const effect = card.effects.find((item) => item.id === key);
      if (!effect) return [];
      const amount = Math.round(effect.amount);
      const absolute = card.sleep && key === "sleep";
      return amount || absolute ? [{ key, amount, absolute }] : [];
    }),
    rewards = card.rewards.flatMap((reward) => {
      const attribute = s.attributes.find((item) => item.id === reward.id && item.slot >= 0);
      return attribute ? [{ reward, attribute }] : [];
    }),
    values = card.values.flatMap((value) => {
      const meter = s.meters.find((item) => item.id === value.id);
      return meter ? [{ meter, amount: Math.round(value.amount) }] : [];
    }),
    entries = s.entries.filter((e) => e.cardId === card.id);
  const rewardRate = card.method === "timed" ? "/分" : card.method === "quantity" ? "/" + card.unit : "";
  const [month, Month] = useState(() => dateKey(now).slice(0, 7)),
    [all, All] = useState(false);
  const first = new Date(month + "-01T12:00:00"),
    length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.date, (counts.get(e.date) || 0) + 1);
  const days = Array.from({ length }, (_, i) => {
    const date = month + "-" + String(i + 1).padStart(2, "0");
    return { date, count: counts.get(date) || 0 };
  });
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const shift = (n: number) => {
    const d = new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() + n);
    Month(dateKey(d.getTime()).slice(0, 7));
  };
  return (
    <DrawnCardView
      title={card.name}
      source={source}
      close={close}
      edit={edit}
      remove={remove}
      begin={begin}
      instant={card.method === "instant"}
      blocked={!!reason}
      restrictions={messages}
      hasFollowup={card.method !== "instant" || card.evaluate || card.settle}
      message={card.message}
      back={card.shopping ? <PurchaseHistory card={card} entries={entries} /> :
        <div className="card-history">
          <header>
            <strong>{card.name}</strong>
            <span>使用记录</span>
          </header>
          <div className="card-history-month">
            <button aria-label="上个月" onClick={() => shift(-1)}>
              ‹
            </button>
            <strong>
              {month} · {total}次
            </strong>
            <button
              aria-label="下个月"
              disabled={month >= dateKey(now).slice(0, 7)}
              onClick={() => shift(1)}
            >
              ›
            </button>
          </div>
          <div
            className="card-history-grid"
            role="group"
            aria-label={month + "使用热力图"}
          >
            {Array.from({ length: offset }, (_, i) => (
              <i key={"blank" + i} aria-hidden="true" />
            ))}
            {days.map((d) => (
              <span
                key={d.date}
                role="img"
                aria-label={d.date + "，" + d.count + "次行动"}
                title={d.date + " · " + d.count + "次行动"}
                style={{ "--heat": Math.min(1, d.count / 4) } as CSSProperties}
              />
            ))}
          </div>
          <div className="card-history-dates">
            <span>{days[0].date.slice(5)}</span>
            <span>{days[days.length - 1].date.slice(5)}</span>
          </div>
          <div className="card-history-legend">
            <span>少</span>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <i key={v} style={{ "--heat": v } as CSSProperties} />
            ))}
            <span>多</span>
          </div>
          {total === 0 && (
            <p className="card-history-empty">本月还没有使用记录</p>
          )}
          <button
            className="text-button"
            aria-expanded={all}
            onClick={() => All((v) => !v)}
          >
            全部记录（{entries.length}）
          </button>
          {all && (
            <div className="card-all-records">
              {[...entries]
                .sort((a, b) => b.endedAt - a.endedAt)
                .map((e) => (
                  <p key={e.id}>
                    {e.date} · {e.counted ? "完成一次" : "部分记录"}
                    {e.note && <span> · {e.note}</span>}
                  </p>
                ))}
            </div>
          )}
        </div>
      }
    >
      <ActionCardFace
        card={card}
        details={
          <>
            {card.description && (
              <span className="drawn-card-detail-copy">{card.description}</span>
            )}
            {(rewards.length > 0 || statuses.length > 0 || values.length > 0) && (
              <span
                className="drawn-card-changes"
                data-has-status={statuses.length > 0 || undefined}
                role="group"
                aria-label="卡牌属性与状态变化"
                tabIndex={0}
              >
                {rewards.map(({ reward, attribute }, i) => (
                  <span key={reward.id + ":" + i}>
                    <span>{attribute.name}</span>{" "}
                    <b>+{Math.round(reward.amount)}</b>
                    {rewardRate}
                  </span>
                ))}
                {statuses.map(({ key, amount, absolute }) => (
                  <span key={key}>
                    <span>{statusNames[key]}</span>{" "}
                    {absolute && <span>设为</span>}{" "}
                    <b>{!absolute && amount > 0 ? "+" + amount : amount}</b>
                  </span>
                ))}
                {values.map(({ meter, amount }) => (
                  <span key={meter.id}>
                    <span>{meter.name}</span>{" "}
                    <b>{amount > 0 ? "+" + amount : amount}</b>
                    {meter.unit}
                    {rewardRate}
                  </span>
                ))}
              </span>
            )}
          </>
        }
      />
    </DrawnCardView>
  );
}
