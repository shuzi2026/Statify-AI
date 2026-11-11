import { Pencil, Trash2 } from "lucide-react";
import { memo, type ReactNode } from "react";
import { type Card, methodNames } from "../model";
import { cardNameWidth } from "../text-limits";
import { ThemeArtwork } from "../themes/ThemeArtwork";
import { CardTexture } from "./CardTexture";
import { ShoppingCardFace } from "./ShoppingCardTile";

export function PrintedCardArt({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      width="76"
      height="76"
      fill="currentColor"
      shapeRendering="crispEdges"
    >
      {kind === "book" ? (
        <>
          <path d="M8 14h24v4h16v-4h24v48H48v4H32v-4H8z" />
          <path
            fill="var(--card-paper)"
            d="M14 20h16v4h7v34h-7v-2H14zm36 0h16v36H50v2h-7V24h7z"
          />
          <path
            opacity=".35"
            d="M18 28h12v4H18zm0 10h12v4H18zm32-10h12v4H50zm0 10h12v4H50z"
          />
        </>
      ) : kind === "water" ? (
        <>
          <path d="M18 12h44v12h-4v36h-4v8H26v-8h-4V24h-4z" />
          <path
            fill="var(--card-paper)"
            d="M24 18h32v8h-4v31h-4v5H32v-5h-4V26h-4z"
          />
          <path opacity=".65" d="M28 36h24v20h-4v6H32v-6h-4z" />
          <path fill="var(--card-paper)" d="M32 40h4v12h-4z" />
        </>
      ) : kind === "move" ? (
        <>
          <path d="M24 12h20v8h-4v26h12v6h16v6h4v10H16V56h4V20h4z" />
          <path fill="var(--card-paper)" d="M28 20h8v28h-4v10h-8V32h4z" />
          <path opacity=".5" d="M16 64h56v8H16z" />
          <path fill="var(--card-paper)" d="M44 52h8v4h-8zm12 5h8v3h-8z" />
        </>
      ) : kind === "night" ? (
        <>
          <path d="M24 12h28v4H40v8h-4v24h4v8h12v4h12v4H52v4H28v-4H20v-8h-4V24h4v-8h4z" />
          <path d="M58 16h4v8h8v4h-8v8h-4v-8h-8v-4h8z" />
        </>
      ) : kind === "write" ? (
        <>
          <path d="M52 10h12v6h6v12h-6v8h-8v8h-8v8h-8v8h-8v8H12V48h8v-8h8v-8h8v-8h8v-8h8z" />
          <path
            fill="var(--card-paper)"
            d="M52 22h8v8h-8zm-8 8h8v8h-8zm-8 8h8v8h-8zm-8 8h8v8h-8zm-8 8h8v8h-8z"
          />
        </>
      ) : (
        <>
          <path d="M56 10h12v30h-4v12h-8v8H44v4H24v-8h-8V40h4V28h8v-8h16v-4h12z" />
          <path
            fill="var(--card-paper)"
            d="M28 44h8v-8h8v-8h8v-6h6v12h-8v8h-8v8h-8v8h-6z"
          />
          <path d="M24 54h8v8h-8v10h-8V62h8z" />
        </>
      )}
    </svg>
  );
}
const chainLinks = Array.from({ length: 17 }, (_, index) => (
  <ellipse
    key={index}
    cx={(index - 8) * 9.5}
    cy={0}
    rx={6.5}
    ry={index % 2 === 0 ? 3.3 : 1.8}
  />
));
const cardLockChain = (
  <svg className="card-lock-chain" viewBox="0 0 160 60" aria-hidden="true">
    <g transform="translate(80 24) rotate(-10)">{chainLinks}</g>
    <g transform="translate(80 39) rotate(7)">{chainLinks}</g>
  </svg>
);

export const ActionCardFace = memo(function ActionCardFace({
  card,
  details,
  showEdit = true,
  locked = false,
  planned = false,
}: {
  card: Card;
  number?: string;
  details?: ReactNode;
  showEdit?: boolean;
  locked?: boolean;
  planned?: boolean;
}) {
  if (card.shopping) return <ShoppingCardFace card={card} />;
  return (
    <span className="action-card-face">
      <CardTexture card={card} />
      <span
        title={card.name}
        className="fan-card-name"
        data-title-wrap={cardNameWidth(card.name) > 6 ? "two-lines" : undefined}
      >
        {card.name}
      </span>
      <span className="fan-card-category" data-planned={planned || undefined}>
        {planned ? (
          <span className="card-plan-category-line">
            <span className="card-plan-tag">计划中</span>
            <span className="card-plan-category-separator" aria-hidden="true"> • </span>
            <span className="card-plan-category" title={card.category || "未分类"}>
              {card.category || "未分类"}
            </span>
          </span>
        ) : card.category || "未分类"}
      </span>
      <span className="fan-card-art" aria-hidden="true">
        <ThemeArtwork card={card} />
        {!card.customArt && (
          <span
            className={
              "card-soft-orb " +
              (card.category === "运动" ? "card-soft-orb-warm" : "")
            }
          />
        )}
      </span>
      {locked && cardLockChain}
      {details && <span className="action-card-details">{details}</span>}
      <span className="fan-card-method">
        {card.method === "duration"
          ? card.minutes + " 分钟"
          : methodNames[card.method]}
      </span>
      {showEdit && (
        <span
          className="fan-card-corner"
          data-gesture-ignore
          aria-hidden="true"
        >
          <Pencil />
        </span>
      )}
    </span>
  );
});
export function CardPaperControls({
  name,
  edit,
  remove,
}: {
  name: string;
  edit: () => void;
  remove?: () => void;
}) {
  return (
    <>
      {remove && (
        <button
          type="button"
          className="card-delete-button"
          data-gesture-ignore
          aria-label={"删除卡牌 " + name}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remove();
          }}
        >
          <Trash2 />
        </button>
      )}
      <button
        type="button"
        className="card-edit-button"
        data-gesture-ignore
        aria-label={"编辑卡牌 " + name}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          edit();
        }}
      >
        <Pencil />
      </button>
    </>
  );
}
