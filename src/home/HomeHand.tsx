import { Plus, ChevronUp } from "lucide-react";
import type { CSSProperties } from "react";
import { ActionCardFace, CardPaperControls } from "../cards/CardAppearance";
import { unavailable } from "../engine";
import { PlanCardFinish } from "../cards/PlanCardFinish";
import type { MobileHomeProps } from "./types";
import type { useHomeHand } from "./useHomeHand";

export function HomeHand({
  p,
  hand,
}: {
  p: MobileHomeProps;
  hand: ReturnType<typeof useHomeHand>;
}) {
  const { s, cards } = p;
  const {
    expanded,
    handEngaged,
    dragging,
    dragCard,
    dragY,
    handRef,
    choose,
    index,
    draw,
    setExpanded,
    handWidth,
    step,
    selectedId,
  } = hand;
  return (
    <>
      <section
        className={
          "hand-dock " +
          (expanded ? "is-expanded" : "is-collapsed") +
          (handEngaged ? " is-interacting" : "") +
          (dragging && !dragCard ? " is-dragging" : "")
        }
        style={
          { "--hand-drag-y": (dragCard ? 0 : dragY) + "px" } as CSSProperties
        }
        aria-label="行动卡牌"
      >
        <div className="hand-focus-veil" aria-hidden="true" />
        <div className="hand-controls">
          {p.filterControl}
          <button
            className="icon-button"
            data-gesture-ignore
            aria-label="新建卡牌"
            onClick={p.newCard}
          >
            <Plus size={19} />
          </button>
        </div>
        <div
          ref={handRef}
          id="mobile-hand"
          className="fan-hand"
          role="group"
          aria-label="行动手牌，可左右滑动"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              choose(index - 1, true);
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              choose(index + 1, true);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (expanded && cards[index]) draw(cards[index].id);
              else setExpanded(true);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setExpanded(false);
            }
          }}
        >
          {cards.length ? (
            cards.map((c, i) => {
              const baseOffset = i - index,
                offset = baseOffset,
                distance = Math.abs(offset),
                isFront = distance < 0.5,
                hidden = distance > (handWidth >= 440 ? 3.6 : 2.6);
              if (distance > 5) return null;
              const locked = !!unavailable(s, c, p.now);
              return (
                <div
                  key={c.id}
                  role="group"
                  data-card-id={c.id}
                  data-card-locked={locked || undefined}
                  className={
                    "fan-card " +
                    (isFront ? "is-front" : "") +
                    (dragCard === c.id ? " is-card-dragging" : "")
                  }
                  aria-label={"手牌 " + c.name}
                  aria-current={i === index ? "true" : undefined}
                  tabIndex={i === index ? 0 : -1}
                  aria-hidden={hidden ? true : undefined}
                  style={
                    {
                      // Pointer movement is painted by useHomeHand without
                      // rerendering the home scene. React owns the resting pose.
                      "--offset": baseOffset,
                      "--distance": Math.abs(baseOffset),
                      "--step": step() + "px",
                      "--card-drag-x": "0px",
                      "--card-drag-y": (dragCard === c.id ? dragY : 0) + "px",
                      zIndex:
                        dragCard === c.id ? 80 : 30 - Math.round(distance * 10),
                      visibility: hidden ? "hidden" : "visible",
                      opacity: selectedId === c.id ? 0 : 1,
                    } as CSSProperties
                  }
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      draw(c.id);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="fan-card-main"
                    aria-current={i === index ? true : undefined}
                    tabIndex={i === index ? 0 : -1}
                    aria-label={"抽出卡牌 " + c.name}
                    onClick={(e) => {
                      if (expanded || e.detail === 0) draw(c.id);
                      else setExpanded(true);
                    }}
                  >
                    <ActionCardFace
                      card={c}
                      showEdit={false}
                      locked={locked}
                      planned={p.plannedCards?.has(c.id)}
                    />
                  </button>
                  {expanded && !p.tourScene && (
                    <PlanCardFinish
                      surface="hand"
                      planned={p.plannedCards?.has(c.id)}
                      locked={locked}
                    />
                  )}
                  <CardPaperControls
                    name={c.name}
                    edit={() => p.editCard(c.id)}
                    remove={() => p.deleteCard(c.id)}
                  />
                </div>
              );
            })
          ) : (
            <button
              className="empty-hand"
              data-gesture-ignore
              onClick={
                s.cards.some((c) => c.state === "active")
                  ? p.resetFilter
                  : p.newCard
              }
            >
              <Plus size={22} />
              {s.cards.some((c) => c.state === "active")
                ? "暂无匹配卡牌，查看全部"
                : "创建第一张卡牌"}
            </button>
          )}
        </div>
      </section>{" "}
      {expanded && (
        <div
          className="card-manager-handle"
          role="separator"
          aria-label="按住上滑，打开卡牌管理面板"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              p.openWorkspace();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setExpanded(false);
            }
          }}
        >
          <span className="manager-chevrons" aria-hidden="true">
            <ChevronUp />
            <ChevronUp />
            <ChevronUp />
          </span>
          <span>按住上滑，打开卡牌管理面板</span>
        </div>
      )}
    </>
  );
}
