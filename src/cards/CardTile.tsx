import { Activity, Check, Hash, Heart, Timer } from "lucide-react";
import { CardMoreActions } from "../CardMoreActions";
import { unavailable } from "../engine";
import { type Card, type State } from "../model";
import { ActionCardFace, CardPaperControls } from "./CardAppearance";
import { PlanCardFinish } from "./PlanCardFinish";
export const icons = {
  instant: Check,
  duration: Timer,
  timed: Activity,
  quantity: Hash,
};
export function CardTile({
  card,
  s,
  begin,
  edit,
  open,
  favorite,
  remove,
  manage,
  reorder,
  now,
  compact = false,
  showActions = true,
  selected,
  planned = false,
  surface = "collection",
}: {
  card: Card;
  s: State;
  begin: () => void;
  edit: () => void;
  open: (source: HTMLElement) => void;
  favorite: () => void;
  remove?: () => void;
  manage?: (type: string) => void;
  reorder?: () => void;
  now: number;
  compact?: boolean;
  showActions?: boolean;
  selected?: boolean;
  planned?: boolean;
  surface?: "collection" | "source";
}) {
  const Icon = icons[card.method],
    reason = unavailable(s, card, now),
    locked = card.state === "active" && !card.shopping && !!reason;
  return (
    <article
      className={
        "task-card playing-card unified-card-tile " +
        (s.firstActionGuide && card.name === "喝一杯水"
          ? "first-action-card "
          : "") +
        (compact ? "compact-card" : "")
      }
      aria-label={card.name}
    >
      <div className="card-paper-controls" data-card-locked={locked || undefined}
        data-card-pattern={card.shopping ? "vertical-stripes" : undefined}>
        <button
          className="gallery-card-paper"
          aria-pressed={selected}
          onClick={(e) => open(e.currentTarget)}
          aria-label={"抽出卡牌 " + card.name}
        >
          <ActionCardFace card={card} showEdit={false} locked={locked} planned={planned} />
          {card.state === "active" && !card.shopping && (
            <PlanCardFinish surface={surface} planned={planned} locked={locked} />
          )}
        </button>
        <CardPaperControls name={card.name} edit={edit} remove={remove} />
      </div>

      {showActions &&
        (compact ? (
          <footer className="gallery-card-actions">
            <button
              className="card-action"
              onClick={begin}
              disabled={!!reason}
              title={reason}
              aria-label={
                (card.method === "instant" ? "完成 " : "开始 ") + card.name
              }
            >
              {reason
                ? "暂不可用"
                : card.method === "instant"
                  ? "完成一次"
                  : "开始"}
              {!reason && <Icon size={15} />}
            </button>
          </footer>
        ) : (
          <CardManagementActions
            card={card}
            favorite={favorite}
            manage={manage}
            reorder={reorder}
          />
        ))}
    </article>
  );
}
function CardManagementActions({
  card,
  favorite,
  manage,
  reorder,
}: {
  card: Card;
  favorite: () => void;
  manage?: (type: string) => void;
  reorder?: () => void;
}) {
  return (
    <footer className="gallery-card-actions card-management-actions">
      {card.state === "active" ? (
        <>
          <button
            className={"card-favorite " + (card.favorite ? "selected" : "")}
            aria-label={(card.favorite ? "取消常用 " : "加入常用 ") + card.name}
            aria-pressed={card.favorite}
            onClick={favorite}
          >
            <Heart
              size="1.5em"
              fill={card.favorite ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
          <button
            className="card-discard"
            aria-label={"弃用卡牌 " + card.name}
            onClick={() => manage?.("abandon")}
          >
            弃用
          </button>
          <CardMoreActions
            name={card.name}
            archive={() => manage?.("archive")}
            reorder={reorder}
          />
        </>
      ) : card.state === "archived" ? (
        <button
          className="card-restore"
          aria-label={"复制卡牌 " + card.name}
          onClick={() => manage?.("copy")}
        >
          复制为新卡牌
        </button>
      ) : (
        <button
          className="card-restore"
          aria-label={"恢复卡牌 " + card.name}
          onClick={() => manage?.("restore")}
        >
          恢复使用
        </button>
      )}
    </footer>
  );
}
