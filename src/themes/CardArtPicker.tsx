import { useId, useRef, useState } from "react";
import { prepareCardImage } from "./card-image";
import type { Card } from "../model";
import { ThemeArtwork } from "./ThemeArtwork";
import { memberFeaturesActive } from "../payments/access";
import { useMemberFeatures } from "../payments/use-member";
import { MemberNotice, useMemberPrompt } from "../payments/MemberNotice";
const choices = [
  ["auto", "按分类默认"],
  ["companion", "伙伴"],
  ["reading", "阅读"],
  ["writing", "书写"],
  ["walking", "散步"],
  ["drinking", "喝水"],
  ["sleeping", "休息"],
] as const;
/** Shared image control for creation and later editing; saves contain no baked text. */
export function CardArtPicker({
  card,
  onChange,
  onBusyChange,
}: {
  card: Card;
  onBusyChange?: (busy: boolean) => void;
  onChange: (card: Card) => void | Promise<boolean | void>;
}) {
  const [busy, Busy] = useState(false),
    [error, Error] = useState(""),
    id = useId();
  const working = useRef(false);
  const member = useMemberFeatures(),
    memberPrompt = useMemberPrompt();
  async function change(next: Card | (() => Promise<Card>), upload = false) {
    if (working.current) return;
    if (upload && !memberFeaturesActive()) {
      memberPrompt.prompt();
      return;
    }
    working.current = true;
    Busy(true);
    onBusyChange?.(true);
    Error("");
    try {
      const value = typeof next === "function" ? await next() : next;
      if (upload && !memberFeaturesActive()) {
        memberPrompt.prompt();
        return;
      }
      if ((await onChange(value)) === false) Error("图片未保存，请重试。");
    } catch (e) {
      Error(e instanceof globalThis.Error ? e.message : "图片未保存，请重试。");
    } finally {
      working.current = false;
      Busy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="card-art-picker">
      <label className="artwork-follow">
        <input
          type="checkbox"
          disabled={busy}
          checked={!card.customArt && card.artwork === "auto"}
          onChange={(e) =>
            void change({
              ...card,
              artwork: e.target.checked ? "auto" : "companion",
              customArt: "",
            })
          }
        />
        跟随卡牌分类选择插图
      </label>
      <div className="artwork-choices" role="group" aria-label="主题插图库">
        {choices.filter(([artwork]) => artwork !== "auto")
          .map(([artwork, label]) => (
            <button
              type="button"
              key={artwork}
              aria-label={label}
              disabled={busy}
              aria-pressed={!card.customArt && card.artwork === artwork}
              onClick={() => void change({ ...card, artwork, customArt: "" })}
            >
              <ThemeArtwork card={{ ...card, artwork, customArt: "" }} />
            </button>
          ))}
      </div>
      <div className="artwork-upload">
        {member ? (
          <label htmlFor={id + "-upload"}>上传自己的图片</label>
        ) : (
          <button
            type="button"
            className="member-prompt-trigger"
            aria-label="开通会员后，可上传自己的卡牌图片。"
            onClick={memberPrompt.prompt}
          >
            <MemberNotice inline pulse={memberPrompt.pulse}>
              开通会员后，可上传自己的卡牌图片。
            </MemberNotice>
          </button>
        )}
        <input
          id={id + "-upload"}
          hidden={!member}
          type="file"
          aria-label="上传卡牌图片"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || !member}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            void change(
              async () => ({
                ...card,
                customArt: await prepareCardImage(file),
              }),
              true,
            );
          }}
        />
      </div>
      {card.customArt && <small>正在使用自定义图片</small>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
