import { useId } from "react";
export function InitialLevelCurve({
  name,
  value,
}: {
  name: string;
  value: number;
}) {
  const clip = useId(),
    description = clip + "-description",
    x = (n: number) => 52 + n * 2.52,
    y = (n: number) =>
      108 -
      (66 *
        (Math.exp(-0.5 * ((n - 50) / 17) ** 2) /
          (17 * Math.sqrt(2 * Math.PI) * 0.9967303))) /
        0.025;
  const points = Array.from({ length: 101 }, (_, i) => [x(i), y(i)]);
  const path = points
    .map(([px, py], i) => (i ? "L" : "M") + px.toFixed(2) + " " + py.toFixed(2))
    .join(" ");
  return (
    <svg
      className="initial-level-curve"
      viewBox="0 0 320 142"
      role="img"
      aria-label={name + "初始等级参考曲线，当前位置" + value}
      aria-describedby={description}
    >
      <desc id={description}>
        横轴是0到100的能力等级；纵轴表示处在这一水平附近的人数多少，曲线越高表示人越多。曲线仅为示意，不代表真实人群排名。
      </desc>
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width={x(value)} height="142" />
        </clipPath>
      </defs>
      <rect
        className="curve-frame"
        x=".5"
        y=".5"
        width="319"
        height="141"
        rx="8"
      />
      <text className="curve-axis-title" x="14" y="21">
        这一水平的人数（示意）
      </text>
      <text x="46" y="45" textAnchor="end">
        多
      </text>
      <text x="46" y="110" textAnchor="end">
        少
      </text>
      <path className="curve-grid" d="M52 46H304M52 77H304" />
      <path className="curve-axes" d="M52 34V108H304" />
      <path className="curve-area" d={path + "L304 108H52Z"} />
      <path
        className="curve-percent-area"
        d={path + "L304 108H52Z"}
        clipPath={"url(#" + clip + ")"}
      />
      <path className="curve-track" d={path} />
      <path className="curve-active" d={path} clipPath={"url(#" + clip + ")"} />
      <path
        className="curve-marker"
        d={"M" + x(value) + " " + y(value) + "V108"}
      />
      <circle className="curve-dot" cx={x(value)} cy={y(value)} r="5" />
      <text x="52" y="131" textAnchor="middle">
        0
      </text>
      <text x="304" y="131" textAnchor="middle">
        100
      </text>
      <text className="curve-axis-title" x="168" y="131" textAnchor="middle">
        能力等级（0–100）
      </text>
    </svg>
  );
}
