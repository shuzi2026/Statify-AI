import type { Card } from "../model";

export function CardTexture({ card }: { card: Pick<Card, "life" | "method"> }) {
  if (card.life !== "repeat") return null;
  return (
    <>
      <span
        className="card-method-texture"
        data-method={card.method}
        aria-hidden="true"
      />
      <span className="card-text-paper-wash" aria-hidden="true" />
    </>
  );
}
