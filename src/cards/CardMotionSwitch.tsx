import { useCardMotion } from "./card-motion";

export function CardMotionSwitch({
  preference,
}: {
  preference: Parameters<typeof useCardMotion>[0];
}) {
  const [enabled, setEnabled] = useCardMotion(preference);
  return (
    <button
      className="card-motion-switch"
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}
    >
      {preference === "cardLighting" ? "光影效果" : "卡牌浮动"}
      <i aria-hidden="true"><b /></i>
    </button>
  );
}
