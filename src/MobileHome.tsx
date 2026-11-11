import type { CSSProperties } from "react";
import { MobileMeters } from "./MobileMeters";
import { CardDetailView } from "./cards/CardDetailView";
import { QuietOrb } from "./themes/QuietOrb";
import { MobileStatus } from "./home/HomeStatus";
import { MobileAttributes } from "./home/HomeAttributes";
import { MobilePendingActions } from "./home/ActionNotices";
import { HomeHand } from "./home/HomeHand";
import { useHomeHand } from "./home/useHomeHand";
import { useHomeViewport, useHomeSceneLayout } from "./home/useHomeLayout";
import type { MobileHomeProps } from "./home/types";
import { MobileChatHome } from "./home/MobileChatHome";
export function MobileHome(p: MobileHomeProps) {
  if (p.mainContent && !p.tourScene) return <MobileChatHome {...p} />;
  return <LegacyMobileHome {...p} />;
}
function LegacyMobileHome(p: MobileHomeProps) {
  const { s, now, cards } = p;
  const attrs = s.attributes
    .filter((a) => a.slot >= 0)
    .sort((a, b) => a.slot - b.slot);
  const { homeRef, scene, windowSize } = useHomeViewport();
  const hand = useHomeHand(p, windowSize, attrs.length);
  const {
    geometry,
    expanded,
    selectedId,
    selected,
    down,
    move,
    up,
    cancel,
    suppressClick,
    gesture,
    setExpanded,
    attributeMode,
    setAttributeMode,
    dragging,
    dragCard,
    dragY,
    handRef,
    flight,
    closeCard,
    setSelectedId,
  } = hand;
  useHomeSceneLayout({
    homeRef,
    scene,
    handRef,
    expanded,
    attributeMode,
    attributeCount: attrs.length,
  });
  return (
    <section
      ref={homeRef}
      data-responsive
      data-scroll={geometry.scroll}
      style={geometry.style as CSSProperties}
      className={
        "mobile-home" +
        (expanded && cards.length && !selectedId ? " has-hand-focus" : "")
      }
      aria-label="角色数值总览"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        suppressClick.current = true;
        cancel();
      }}
      onLostPointerCapture={(e) => {
        if (e.target === e.currentTarget && gesture.current) {
          suppressClick.current = true;
          cancel();
        }
      }}
      onClickCapture={(e) => {
        if (
          (e.target as HTMLElement).closest(".drawn-card-overlay") ||
          e.detail === 0
        ) {
          suppressClick.current = false;
          return;
        }
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        if (
          !(e.target as HTMLElement).closest(
            "button,input,[data-gesture-ignore],.floating-attributes,.mobile-timer,.mobile-meters,.mobile-hud,.fan-hand,.card-manager-handle",
          )
        )
          setExpanded(false);
      }}
    >
      <MobileStatus
        s={s}
        now={now}
        notification={p.notification}
        executionLevel={p.executionLevel}
        openStatus={p.openStatus}
      />
      <MobileMeters meters={s.meters} open={p.openMeter} />
      <MobilePendingActions
        pending={p.pending}
        timer={p.timer}
        openFinish={p.openFinish}
      />
      <div
        ref={scene}
        className={
          "mobile-player-stage " +
          (attributeMode ? "attributes-folded " : "") +
          (expanded ? "hand-expanded" : "hand-collapsed") +
          (dragging && !dragCard ? " is-stage-dragging" : "")
        }
        style={
          {
            "--stage-hand-drag": (dragCard ? 0 : dragY) + "px",
          } as CSSProperties
        }
      >
        <div className="mobile-scene-backdrop" aria-hidden="true" />
        <div
          className={"mobile-character" + (p.mainContent ? " mobile-home-chat" : "")}
          data-gesture-ignore={p.mainContent ? true : undefined}
        >
          {p.mainContent || <>
            <QuietOrb />
            {s.restUntil > now && <small>休息中</small>}
          </>}
        </div>
        <MobileAttributes
          s={s}
          now={now}
          attrs={attrs}
          attributeMode={attributeMode}
          setAttributeMode={setAttributeMode}
          openAttributes={p.openAttributes}
        />
      </div>
      <HomeHand p={p} hand={hand} />

      {selected && (
        <CardDetailView
          card={selected}
          s={s}
          now={now}
          source={flight.current}
          close={closeCard}
          remove={() => p.deleteCard(selected.id)}
          edit={() => {
            setSelectedId(null);
            p.editCard(selected.id);
          }}
          begin={async () => {
            const ok = await p.begin(selected);
            if (ok === true) setSelectedId(null);
            return ok;
          }}
        />
      )}
    </section>
  );
}
