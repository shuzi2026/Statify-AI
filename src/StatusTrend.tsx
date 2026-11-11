import { useState } from "react";
import { type State, statusKeys, statusNames } from "./model";
export function StatusTrend({ s }: { s: State }) {
  const [days, D] = useState(7),
    [key, K] = useState<(typeof statusKeys)[number]>("mood");
  const now = Date.now(),
    from = now - days * 86400000;
  const points = [
    ...s.entries.flatMap((e) =>
      e.effects
        .filter((r) => r.id === key)
        .map((r) => ({ at: e.endedAt, value: r.after, source: e.name })),
    ),
    ...s.changes
      .filter((c) => c.kind === "状态纠正" && c.name === key)
      .map((c) => ({ at: c.at, value: c.after, source: "手动调整" })),
  ]
    .filter((p) => p.at >= from && p.at <= now)
    .sort((a, b) => a.at - b.at);
  return (
    <section className="state-trend">
      <h3>状态留下的轨迹</h3>
      <div className="button-row">
        <select
          aria-label="趋势状态"
          value={key}
          onChange={(e) => K(e.target.value as typeof key)}
        >
          {statusKeys.map((k) => (
            <option key={k} value={k}>
              {statusNames[k]}
            </option>
          ))}
        </select>
        <select
          aria-label="趋势范围"
          value={days}
          onChange={(e) => D(Number(e.target.value))}
        >
          <option value="1">24小时</option>
          <option value="7">7天</option>
          <option value="30">30天</option>
        </select>
      </div>
      {points.length ? (
        <>
          <svg
            viewBox="0 0 420 140"
            role="img"
            aria-label={
              statusNames[key] + "变化记录，共" + points.length + "个点"
            }
            style={{ width: "100%", height: 160 }}
          >
            {[0, 50, 100].map((n) => (
              <g key={n}>
                <line
                  x1="28"
                  x2="405"
                  y1={120 - n}
                  y2={120 - n}
                  stroke="currentColor"
                  opacity=".12"
                />
                <text x="0" y={124 - n} fontSize="11" fill="currentColor">
                  {n}
                </text>
              </g>
            ))}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={28 + ((p.at - from) / (now - from)) * 377}
                cy={120 - p.value}
                r="4"
                fill="var(--accent)"
              >
                <title>
                  {new Date(p.at).toLocaleString()} · {p.source}：{p.value}
                </title>
              </circle>
            ))}
          </svg>
          <p className="help">
            记录点表示行动结算或手动调整后的状态；没有记录的时段留空，不推算历史值。
          </p>
        </>
      ) : (
        <p className="help">这段时间还没有{statusNames[key]}变化记录。</p>
      )}
    </section>
  );
}
