import { statusRules } from "../../shared/rules/status";
import {
  Activity,
  Bell,
  BookOpen,
  Brain,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  abilityPositions,
  cardQuad,
  homography,
  type Layout,
} from "../../public/whitebox/core.js";
import type { Card } from "../model";
import { ThemeArtwork } from "../themes/ThemeArtwork";
import { animateSafely } from "./animation";

export type CanvasCard = {
  id: string;
  name: string;
  category: string;
  method: string;
  progress?: string;
  art?: Card;
};
export type CanvasData = {
  level: number;
  coefficient: string;
  statuses: { name: string; value: number | string }[];
  meters: { id: string; name: string; value: string | number; unit?: string }[];
  attributes: {
    name: string;
    level: number;
    progress: number;
    locked?: boolean;
  }[];
  cards: CanvasCard[];
};
const icons = [Activity, Brain, BookOpen, Target, Sparkles, Sparkles];
export const sampleData: CanvasData = {
  level: 0,
  coefficient: "1.06",
  statuses: ["情绪", "活力", "压力", "舒适", "睡眠"].map((name, i) => ({
    name,
    value: [50, 72, 50, 56, 75][i],
  })),
  meters: Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    name: "数值" + (i + 1),
    value: "—",
  })),
  attributes: ["体魄", "记忆", "认知", "专注", "厉害值"].map((name, i) => ({
    name,
    level: i ? 50 : 0,
    progress: 0.3,
  })),
  cards: [
    {
      id: "0",
      name: "写下一点收获",
      category: "学习",
      method: "按数量",
      progress: "0/2",
    },
    {
      id: "1",
      name: "出去走走",
      category: "运动",
      method: "按时长",
      progress: "0/30 分钟",
    },
    {
      id: "2",
      name: "喝一杯水",
      category: "生活",
      method: "即时打卡",
      progress: "0/1",
    },
  ],
};
type Props = {
  fitViewport?: boolean;
  layout: Layout;
  data?: CanvasData;
  white?: boolean;
  guides?: boolean;
  active?: number;
  choose?: (n: number) => void;
  draw?: (id: string) => void;
  edit?: (id: string) => void;
  remove?: (id: string) => void;
  newCard?: () => void;
  meter?: (id?: string) => void;
  attributes?: () => void;
  status?: () => void;
  bell?: () => void;
  execution?: ReactNode;
  expanded?: boolean;
  dragY?: number;
  attributeMode?: number;
  toggleAttributes?: () => void;
  handRef?: React.RefObject<HTMLDivElement | null>;
  children?: ReactNode;
  workspace?: () => void;
};
export function HomeCanvas(p: Props) {
  const s = p.layout,
    d = p.data || sampleData,
    white = p.white ?? false,
    [localActive, setLocalActive] = useState(1),
    active = Math.min(
      Math.max(0, p.active ?? localActive),
      Math.max(0, d.cards.length - 1),
    ),
    choose = p.choose || setLocalActive;
  const [scale, setScale] = useState(1),
    host = useRef<HTMLDivElement>(null),
    cardRoot = useRef<HTMLDivElement>(null),
    previous = useRef(new Map<string, { x: number; y: number; m: string }>());
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () =>
      setScale(
        Math.min(
          el.clientWidth / 390,
          p.fitViewport
            ? (window.innerHeight - (p.expanded === false ? 78 : 12)) /
                s.screenH
            : 10,
        ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [s.screenH, p.fitViewport, p.expanded]);
  useLayoutEffect(() => {
    const next = new Map<string, { x: number; y: number; m: string }>();
    cardRoot.current
      ?.querySelectorAll<HTMLElement>(".card-slot")
      .forEach((el) => {
        const face = el.querySelector<HTMLElement>(".card-face")!,
          id = el.dataset.cardId!,
          old = previous.current.get(id),
          x = el.offsetLeft,
          y = el.offsetTop,
          m = face.style.transform;
        next.set(id, { x, y, m });
        if (
          old &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches &&
          s.motionMs
        ) {
          animateSafely(
            el,
            [
              { transform: `translate(${old.x - x}px,${old.y - y}px)` },
              { transform: "none" },
            ],
            { duration: s.motionMs, easing: "ease-out" },
          );
          animateSafely(face, [{ transform: old.m }, { transform: m }], {
            duration: s.motionMs,
            easing: "ease-out",
          });
        }
      });
    previous.current = next;
  }, [active, s]);
  const positions = abilityPositions(s),
    rect = (prefix: "hero" | "ability" | "custom" | "card") => ({
      left: s[`${prefix}X`],
      top: s[`${prefix}Y`],
      width: s[`${prefix}W`],
      height: s[`${prefix}H`],
    }),
    meters = p.data ? d.meters : d.meters.slice(0, s.customCount),
    collapsed = p.expanded === false;
  return (
    <div
      ref={host}
      className="layout-host"
      style={{ height: s.screenH * scale }}
    >
      <div
        className={
          "layout-canvas " +
          (white ? "is-white " : "") +
          (p.guides ? "guides " : "") +
          (collapsed ? "is-collapsed" : "")
        }
        style={
          {
            height: s.screenH,
            left: p.fitViewport ? "50%" : 0,
            marginLeft: p.fitViewport ? -195 * scale : 0,
            transform: `scale(${scale})`,
            "--layout-motion": s.motionMs + "ms",
          } as CSSProperties
        }
      >
        <div
          className="layout-scene"
          style={{
            transform: `translateY(${(collapsed ? 30 : 0) + (p.dragY || 0) * 0.2}px)`,
          }}
        >
          <div className="layout-backdrop" />
          <div id="heroZone" style={rect("hero")}>
            {white ? (
              <>
                <svg viewBox="0 0 180 300">
                  <circle cx="90" cy="66" r="34" />
                  <path d="M62 110Q90 100 118 110L142 217Q144 232 125 234L113 272H94L90 234L85 272H66L55 234Q36 230 40 216Z" />
                </svg>
                <span>主体占位</span>
              </>
            ) : (
              <>
                <ThemeArtwork name="companion" />
                {!document.documentElement.dataset.illustrated ||
                document.documentElement.dataset.illustrated === "false" ? (
                  <div className="layout-orb" />
                ) : null}
              </>
            )}
          </div>
        </div>
        <div id="topZone" className={"top-" + s.top} style={{ top: s.topY }}>
          <div className="top-main">
            <div className="layout-execution">
              {p.execution || (
                <button className="execution-summary">
                  <span>执行等级</span>
                  <strong>
                    <small>Lv.</small>
                    {d.level}
                  </strong>
                  {["每日", "每周"].map((v, i) => (
                    <span className="execution-track" key={v}>
                      <span>{v}</span>
                      <progress max={2} value={0} />
                      <small>{i ? "—" : "0/2"}</small>
                    </span>
                  ))}
                </button>
              )}
            </div>
            <button className="coefficient" onClick={p.status}>
              状态系数<b>×{d.coefficient}</b>
            </button>
            <button
              className="bell"
              onClick={p.bell || p.status}
              aria-label="消息提醒"
            >
              <Bell />
            </button>
          </div>
          <div className="states">
            {d.statuses.map((v, i) => (
              <button className="state" key={v.name} onClick={p.status}>
                <span className="state-symbol">
                  {["☻", "ϟ", "⌁", "♧", "☾"][i]}
                </span>
                <span>{v.name}</span>
                <b>{v.value}</b>
                <progress
                  max={statusRules.max}
                  value={typeof v.value === "number" ? v.value : 0}
                />
              </button>
            ))}
          </div>
        </div>
        <div
          id="customZone"
          className={"custom-" + s.customStyle}
          style={{ ...rect("custom"), fontSize: s.customFont }}
        >
          {meters.length ? (
            <>
              <div
                className="custom-values"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(5, meters.length)},minmax(0,1fr))`,
                }}
              >
                {meters.map((v) => (
                  <button
                    className="custom-value"
                    onClick={() => p.meter?.(v.id)}
                    key={v.id}
                  >
                    <span>{v.name}</span>
                    <b>{v.value}</b>
                    {v.unit && <small>{v.unit}</small>}
                  </button>
                ))}
              </div>
              {meters.length < 5 && (
                <button
                  className="custom-add-inline"
                  onClick={() => p.meter?.()}
                  aria-label="添加自定义数值"
                >
                  ＋
                </button>
              )}
            </>
          ) : (
            <button className="custom-empty" onClick={() => p.meter?.()}>
              自定义数值 ＋
            </button>
          )}
        </div>
        <div
          id="abilityZone"
          className={s.ability === "sidebar" ? "layout-sidebar" : s.ability}
          style={{
            ...rect("ability"),
            opacity: p.attributeMode === 2 ? 0 : 1,
            pointerEvents: p.attributeMode === 2 ? "none" : undefined,
          }}
        >
          {s.ability === "sidebar" && (
            <>
              <div
                className="ability-shell"
                style={{ borderRadius: s.radius }}
              />
              <button className="ability-heading" onClick={p.toggleAttributes}>
                <span>属性</span>
                <span>‹</span>
              </button>
            </>
          )}
          {positions.map(([x, y, w, h], i) => {
            const a = d.attributes[i],
              Icon = a ? icons[i] : Plus;
            return (
              <button
                key={i}
                className={"ability " + s.textLayout + (a ? "" : " empty")}
                style={{
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  borderRadius: s.radius,
                }}
                onClick={p.attributes}
                aria-label={a ? `${a.name} 等级${a.level}` : "添加属性"}
              >
                <span className="ability-icon">
                  <Icon />
                </span>
                <div className="ability-text">
                  <div className="ability-name">{a?.name || "添加属性"}</div>
                  {a && (
                    <>
                      <div className="ability-level">
                        <small>Lv.</small>
                        {a.level}
                        {a.locked ? " · 锁" : ""}
                      </div>
                      <progress max={1} value={a.progress} />
                    </>
                  )}
                </div>
              </button>
            );
          })}
          <button
            className="manage"
            style={{
              top:
                s.ability === "sidebar"
                  ? s.abilityH - 25
                  : s.ability === "arc"
                    ? s.arcDepth + s.buttonH + 12
                    : Math.max(...positions.map((p) => p[1] + p[3])) + 7,
              ...(s.ability === "sidebar"
                ? { left: 12 }
                : s.ability === "arc"
                  ? { left: "34%" }
                  : { right: 0 }),
            }}
            onClick={p.attributes}
          >
            管理属性 ›
          </button>
        </div>
        <div
          id="cardZone"
          className="layout-card-dock"
          ref={cardRoot}
          style={{
            ...rect("card"),
            width: s.cardW * 3 + s.cardGap * 2,
            transform: `translateY(${(collapsed ? s.collapseShift : 0) + (p.dragY || 0)}px)`,
          }}
        >
          <button
            className="card-add"
            data-gesture-ignore
            onClick={p.newCard}
            aria-label="新建卡牌"
          >
            ＋
          </button>
          <div
            className="layout-hand fan-hand"
            ref={p.handRef}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") choose(Math.max(0, active - 1));
              if (e.key === "ArrowRight")
                choose(Math.min(d.cards.length - 1, active + 1));
            }}
          >
            {d.cards.map((c, i) => {
              const side = i - active;
              if (Math.abs(side) > 1) return null;
              return (
                <div
                  className={`card-slot card-${s.cardShape} card-layout-${s.cardMode}`}
                  key={c.id}
                  data-card-id={c.id}
                  style={{
                    left: (side + 1) * (s.cardW + s.cardGap),
                    top: side === 0 ? -s.cardLift : 0,
                    width: s.cardW,
                    height: s.cardH,
                    zIndex: side === 0 ? 3 : 1,
                  }}
                >
                  <div
                    className="card-face"
                    style={{
                      transform: homography(
                        s.cardW,
                        s.cardH,
                        cardQuad(s, side),
                      ),
                    }}
                  >
                    <div className="card-inner">
                      <button
                        className="layout-card-main"
                        aria-label={
                          p.draw
                            ? "抽出卡牌 " + c.name
                            : c.name + "，点击移至中心"
                        }
                        onClick={() =>
                          side !== 0
                            ? choose(i)
                            : p.draw
                              ? p.draw(c.id)
                              : choose(i)
                        }
                      >
                        {s.cardMode === "inner" ? (
                          <>
                            <strong className="card-title">{c.name}</strong>
                            <span className="card-category">{c.category}</span>
                          </>
                        ) : null}
                        <span className="card-art">
                          {white ? (
                            "插画占位"
                          ) : c.art ? (
                            <ThemeArtwork card={c.art} />
                          ) : (
                            <ThemeArtwork
                              name={
                                (["writing", "walking", "drinking"] as const)[
                                  i % 3
                                ]
                              }
                            />
                          )}
                        </span>
                        {s.cardMode === "orbit" ? (
                          <>
                            <strong className="card-title">{c.name}</strong>
                            <span className="card-category">{c.category}</span>
                            <span className="card-progress">
                              {c.method}
                              <b>{c.progress}</b>
                              <progress max={1} value={0} />
                            </span>
                          </>
                        ) : null}
                      </button>
                      <div className="layout-card-action">
                        {s.cardMode === "inner" ? (
                          <>
                            <button
                              data-gesture-ignore
                              aria-label={"删除 " + c.name}
                              onClick={() => p.remove?.(c.id)}
                            >
                              <Trash2 />
                            </button>
                            <span>{c.method}</span>
                            <button
                              data-gesture-ignore
                              aria-label={"编辑 " + c.name}
                              onClick={() => p.edit?.(c.id)}
                            >
                              <Pencil />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              data-gesture-ignore
                              aria-label={"编辑 " + c.name}
                              onClick={() => p.edit?.(c.id)}
                            >
                              <Pencil />
                            </button>
                            <button
                              data-gesture-ignore
                              aria-label={"删除 " + c.name}
                              onClick={() => p.remove?.(c.id)}
                            >
                              <Trash2 />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {p.guides && (
                    <div className="base-frame">
                      <span>
                        {s.cardW} × {s.cardH}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {!d.cards.length && (
              <button className="empty-hand" onClick={p.newCard}>
                创建第一张卡牌
              </button>
            )}
          </div>
          <div className="card-nav" data-gesture-ignore>
            <button
              disabled={active === 0}
              aria-label="上一张"
              onClick={() => choose(active - 1)}
            >
              ‹
            </button>
            <span>
              {d.cards.length ? active + 1 : 0} / {d.cards.length}
            </span>
            <button
              disabled={active === d.cards.length - 1 || !d.cards.length}
              aria-label="下一张"
              onClick={() => choose(active + 1)}
            >
              ›
            </button>
          </div>
        </div>
        {p.workspace && (
          <button
            className="layout-manager card-manager-handle"
            style={{ top: s.cardY + s.cardH + 27 }}
            onClick={p.workspace}
          >
            ⌃ 按住上滑，打开卡牌管理面板
          </button>
        )}
        {p.children}
      </div>
    </div>
  );
}
