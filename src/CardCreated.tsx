import { useState } from "react";
import type { Card } from "./model";
import { Dialog } from "./components";
import { ActionCardFace } from "./cards/CardAppearance";
import { CardArtPicker } from "./themes/CardArtPicker";
export function CardCreated({
  card,
  save,
  close,
}: {
  card: Card;
  save: (card: Card) => Promise<boolean>;
  close: () => void;
}) {
  const [editing, Editing] = useState(false),
    [busy, Busy] = useState(false);
  return (
    <Dialog
      title="成功创建卡牌"
      className="card-created-dialog"
      close={close}
      dismissible={!busy}
    >
      <button
        type="button"
        className="created-card-preview gallery-card-paper"
        data-card-pattern={card.shopping ? "vertical-stripes" : undefined}
        aria-label="编辑卡牌图片"
        disabled={busy}
        aria-expanded={editing}
        onClick={() => Editing((v) => !v)}
      >
        <ActionCardFace card={card} showEdit={false} />
      </button>
      {card.shopping && !card.shopping.generatedArt?.transparent && <p className="help">
        {card.shopping.generatedArt || card.shopping.image
          ? "未能自动去除背景，已使用原商品图。"
          : "暂未找到商品图，已使用默认购物图标。"}
      </p>}
      <button
        className="text-button"
        disabled={busy}
        aria-expanded={editing}
        onClick={() => Editing((v) => !v)}
      >
        编辑卡牌图片
      </button>
      {editing && (
        <CardArtPicker card={card} onBusyChange={Busy} onChange={save} />
      )}
      <footer className="dialog-actions">
        <button className="primary" disabled={busy} onClick={close}>
          完成
        </button>
      </footer>
    </Dialog>
  );
}
