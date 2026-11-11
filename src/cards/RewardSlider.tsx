import { useEffect, useState, type CSSProperties } from "react";
import { NumberInput } from "../inputs/ValueInputs";

export function RewardSlider({
  label,
  value,
  min,
  max,
  change,
  compact = false,
  directMax,
  directMin = min,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  change: (v: number) => void;
  compact?: boolean;
  directMax?: number;
  directMin?: number;
}) {
  const outside = value < min || value > max,
    [text, Text] = useState(String(value));
  useEffect(() => Text(String(value)), [value]);
  const invalid =
    directMax !== undefined &&
    (!text.trim() ||
      !Number.isInteger(Number(text)) ||
      Number(text) < directMin ||
      Number(text) > directMax);
  return (
    <div
      className={
        "field reward-slider " +
        (compact ? "is-compact" : "") +
        (directMax !== undefined ? " has-direct-input" : "")
      }
    >
      <span className="reward-slider-heading">
        <span>{label}</span>
        <output>
          {value > 0 && min < 0 ? "+" : ""}
          {value}
          {compact && " / " + max}
        </output>
      </span>
      {directMax !== undefined && (
        <span className="reward-direct-input">
          <NumberInput
            aria-label={label + "数值"}
            required
            min={directMin}
            max={directMax}
            step="1"
            maxLength={Math.max(
              5,
              String(directMin).length,
              String(directMax).length,
            )}
            value={text}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              const raw = e.target.value,
                n = Number(raw);
              Text(raw);
              if (
                raw.trim() &&
                Number.isInteger(n) &&
                n >= directMin &&
                n <= directMax
              )
                change(n);
            }}
          />
        </span>
      )}
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step="1"
        value={Math.min(max, Math.max(min, value))}
        aria-valuetext={String(value)}
        style={
          {
            "--reward-progress":
              ((Math.min(max, Math.max(min, value)) - min) / (max - min)) *
                100 +
              "%",
          } as CSSProperties
        }
        onChange={(e) => {
          const n = Number(e.target.value);
          Text(String(n));
          change(n);
        }}
      />
      {!compact && (
        <span className="reward-slider-bounds">
          <small>{min}</small>
          <small>上限 {max}</small>
        </span>
      )}
      {invalid ? (
        <small role="alert">
          请输入{directMin}～{directMax}的整数
        </small>
      ) : (
        outside && (
          <small>
            {directMax !== undefined
              ? "已超过滑轨范围，仍可输入或保存。"
              : "原设置超出当前范围，请滑动重新设置。"}
          </small>
        )
      )}
    </div>
  );
}
