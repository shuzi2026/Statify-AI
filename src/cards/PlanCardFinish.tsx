import { observeCardLighting } from "./card-lighting-runtime";
import { memo, type CSSProperties } from "react";

export const PlanCardFinish = memo(function PlanCardFinish({
  surface,
  planned = false,
  locked = false,
  dragOffset,
}: {
  surface: "hand" | "collection" | "plan" | "source";
  planned?: boolean;
  locked?: boolean;
  dragOffset?: number;
}) {
  const showFoil = surface === "plan" || (planned && !locked && surface !== "source");
  const lightsOnly = locked && surface !== "plan";
  if (!showFoil && !lightsOnly) return null;
  const compact = surface !== "hand";
  return (
    <span
      ref={observeCardLighting}
      style={
        dragOffset === undefined
          ? undefined
          : ({ "--offset": dragOffset } as CSSProperties)
      }
      className={
        "hand-plan-finish" +
        (compact ? " plan-card-finish-compact" : "") +
        (lightsOnly ? " plan-card-finish-lights-only" : "")
      }
      aria-hidden="true"
    >
      {showFoil && (
        <>
          <span className="hand-foil hand-foil-top" />
          <span className="hand-foil hand-foil-bottom" />
        </>
      )}
      {fireflies}
    </span>
  );
});

const sparkleShape = "M0 -6 Q.7 -.7 5 0 Q.7 .7 0 6 Q-.7 .7 -5 0 Q-.7 -.7 0 -6Z";
const fireflies = (
  <svg className="hand-fireflies" viewBox="0 0 158 218" preserveAspectRatio="none">
    <g transform="translate(145 35) scale(1.55)">
      <g className="hand-firefly-cluster">
        <path d={sparkleShape} />
        <circle cx="-7" cy="6" r="1.65" />
        <circle cx="5" cy="9" r="1" />
      </g>
    </g>
    <g transform="translate(14 174) scale(1.3)">
      <g className="hand-firefly-cluster">
        <path d={sparkleShape} />
        <circle cx="8" cy="-7" r="1.6" />
        <circle cx="-4" cy="-9" r="1.15" />
      </g>
    </g>
    <g transform="translate(149 133) scale(.65)">
      <g className="hand-firefly-cluster">
        <path d={sparkleShape} />
        <circle cx="-8" cy="8" r="1.3" />
      </g>
    </g>
    <g transform="translate(9 85) scale(.75)">
      <g className="hand-firefly-cluster">
        <path d={sparkleShape} />
        <circle cx="7" cy="-8" r="1.2" />
      </g>
    </g>
  </svg>
);
