import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Dialog } from "./components";
import { ActionCardFace } from "./cards/CardAppearance";
import {
  useCollectionOrder,
  type CardCollectionProps,
} from "./cards/useCollectionOrder";
export function CardCollectionGrid({
  cards,
  sortable,
  render,
  reorder,
  leadingCard,
}: CardCollectionProps & { leadingCard?: ReactNode }) {
  const {
    root,
    ghost,
    press,
    suppress,
    drag,
    position,
    Position,
    saving,
    message,
    shown,
    dragged,
    named,
    save,
    down,
    move,
    end,
  } = useCollectionOrder({ cards, sortable, reorder });
  return (
    <>
      <div
        ref={root}
        className="card-grid collection-grid"
        role="list"
        aria-label={sortable ? "常用卡牌顺序" : "卡牌列表"}
        aria-busy={saving}
        data-sorting={!!drag || undefined}
        onPointerDownCapture={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => {
          if (e.target === e.currentTarget && press.current?.active)
            end(e, true);
        }}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          if (press.current) e.preventDefault();
        }}
        onClickCapture={(e) => {
          if (suppress.current && e.detail !== 0) {
            e.preventDefault();
            e.stopPropagation();
            suppress.current = false;
          }
        }}
      >
        {leadingCard && <div className="collection-item" role="listitem">{leadingCard}</div>}
        {shown.map((c, index) => (
          <div
            key={c.id}
            className="collection-item"
            role="listitem"
            data-collection-card={c.id}
            data-dragging={drag?.id === c.id || undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-keyshortcuts={
              sortable
                ? "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                : undefined
            }
            aria-label={sortable ? `${c.name}，第${index + 1}位` : undefined}
            onKeyDown={(e) => {
              if (
                !sortable ||
                !e.altKey ||
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              e.stopPropagation();
              const index = cards.findIndex((item) => item.id === c.id),
                step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1,
                target = Math.max(0, Math.min(cards.length - 1, index + step)),
                others = cards.filter((item) => item.id !== c.id);
              void save(c.id, others[target]?.id || null).then(() => {
                [
                  ...(root.current?.querySelectorAll<HTMLElement>(
                    "[data-collection-card]",
                  ) || []),
                ]
                  .find((node) => node.dataset.collectionCard === c.id)
                  ?.focus({ preventScroll: true });
              });
            }}
          >
            {render(c, sortable ? () => Position(c.id) : undefined)}
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        {message}
      </p>
      {drag &&
        dragged &&
        createPortal(
          <div
            ref={ghost}
            className="collection-drag-preview"
            aria-hidden="true"
            inert
            style={{
              width: drag.width,
              height: drag.height,
              transform: `translate3d(${drag.x}px,${drag.y}px,0)`,
            }}
          >
            <div className="gallery-card-paper">
              <ActionCardFace card={dragged} showEdit={false} />
            </div>
          </div>,
          document.body,
        )}
      {named && (
        <Dialog
          title="调整常用顺序"
          close={() => {
            if (!saving) Position(null);
          }}
          dismissible={!saving}
        >
          <p>将“{named.name}”放到：</p>
          <div className="collection-position-options">
            {cards
              .filter((c) => c.id !== position)
              .map((c) => (
                <button
                  type="button"
                  disabled={saving}
                  key={c.id}
                  onClick={() => void save(named.id, c.id)}
                >
                  “{c.name}”之前
                </button>
              ))}
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(named.id, null)}
            >
              最后一位
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
