import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import { CardTile } from "../cards/CardTile";
import { CardDetailView } from "../cards/CardDetailView";
import { MobileMeters } from "../MobileMeters";
import { MobileAttributes } from "./HomeAttributes";
import { MobileStatus } from "./HomeStatus";
import { MobilePendingActions } from "./ActionNotices";
import type { MobileHomeProps } from "./types";
import "./mobile-chat-home.css";

export function MobileChatHome(p: MobileHomeProps) {
  const [attributesOpen, setAttributesOpen] = useState(true);
  const [cardsOpen, setCardsOpen] = useState(true);
  const trayId = "mobile-home-card-slots";
  const trayGesture = useRef<number | null>(null);
  const traySwiped = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const source = useRef<HTMLElement | null>(null);
  const selected = p.s.cards.find((card) => card.id === selectedId);
  const attrs = p.s.attributes.filter((a) => a.slot >= 0).sort((a, b) => a.slot - b.slot);
  return (
    <section className="mobile-chat-panel" data-cards-open={cardsOpen} aria-label="角色数值总览">
      <MobileStatus s={p.s} now={p.now} notification={p.notification}
        executionLevel={p.executionLevel} openStatus={p.openStatus} />
      <MobileMeters meters={p.s.meters} open={p.openMeter} />
      <MobilePendingActions pending={p.pending} timer={p.timer} openFinish={p.openFinish} />
      <div className="mobile-chat-body" data-attributes-open={attributesOpen}>
        {attributesOpen && <MobileAttributes s={p.s} now={p.now} attrs={attrs}
          attributeMode={0} setAttributeMode={() => setAttributesOpen(false)}
          openAttributes={p.openAttributes} />}
        <div className="mobile-chat-conversation mobile-home-chat">
          {!attributesOpen && <button className="mobile-attributes-reopen" type="button"
            aria-label="展开属性" aria-expanded={false} onClick={() => setAttributesOpen(true)}>
            <ChevronRight size={16} />
          </button>}
          {p.mainContent}
        </div>
      </div>
      <section className="mobile-card-tray" aria-label="行动卡牌">
        <div className="mobile-card-tray-controls"
          onPointerDown={(event) => {
            trayGesture.current = event.clientY;
            traySwiped.current = false;
          }}
          onPointerUp={(event) => {
            const start = trayGesture.current;
            trayGesture.current = null;
            if (start !== null && Math.abs(event.clientY - start) > 28) {
              traySwiped.current = true;
              setCardsOpen(event.clientY < start);
            }
          }}
          onClickCapture={(event) => {
            if (traySwiped.current) {
              traySwiped.current = false;
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onPointerCancel={() => { trayGesture.current = null; }}>
          <button type="button" className="icon-button mobile-card-tray-toggle"
            aria-label={cardsOpen ? "收起卡牌" : "展开卡牌"} aria-expanded={cardsOpen}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            aria-controls={trayId} onClick={() => setCardsOpen((open) => !open)}>
            {cardsOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          {p.filterControl}
          <button type="button" className="icon-button" aria-label="新建卡牌" onClick={p.newCard}>
            <Plus size={17} />
          </button>
        </div>
        <div id={trayId} hidden={!cardsOpen} className="mobile-card-slots" role="group" aria-label="行动手牌，可左右滑动" tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            event.currentTarget.scrollBy({ left: event.key === "ArrowRight" ? 112 : -112,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          }}>
          {p.cards.map((card) => <CardTile key={card.id} card={card} s={p.s} now={p.now}
            showActions={false} planned={p.plannedCards?.has(card.id)}
            begin={() => void p.begin(card)} edit={() => p.editCard(card.id)}
            remove={() => p.deleteCard(card.id)} favorite={() => {}}
            open={(element) => { source.current = element; setSelectedId(card.id); }} />)}
          {!p.cards.length && <button type="button" className="mobile-card-tray-empty"
            onClick={p.s.cards.some((card) => card.state === "active") ? p.resetFilter : p.newCard}>
            <Plus size={18} />
            {p.s.cards.some((card) => card.state === "active") ? "暂无匹配卡牌，查看全部" : "创建第一张卡牌"}
          </button>}
        </div>
      </section>
      {selected && <CardDetailView card={selected} s={p.s} now={p.now} source={source.current}
        close={() => setSelectedId(null)} remove={() => p.deleteCard(selected.id)}
        edit={() => { setSelectedId(null); p.editCard(selected.id); }}
        begin={async () => { const result = await p.begin(selected); if (result === true) setSelectedId(null); return result; }} />}
    </section>
  );
}
