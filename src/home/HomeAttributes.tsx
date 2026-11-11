import { useId } from "react";
import {
  Activity,
  Brain,
  BookOpen,
  Target,
  Sparkles,
  ChevronLeft,
  SlidersHorizontal,
} from "lucide-react";
import { attrAllowed, growth } from "../engine";
import { ruleContext } from "../payments/access";
import { attributeRules } from "../../shared/rules/growth";
import { attributeCaption } from "../ui-layout/text-budget";
import type { State } from "../model";
type AttributeProps = { s: State; now: number; openAttributes: () => void };
export function MobileAttributes(
  p: AttributeProps & {
    attrs: State["attributes"];
    attributeMode: number;
    setAttributeMode: (n: number) => void;
  },
) {
  const { s, now, attrs, attributeMode, setAttributeMode } = p;
  const attributesId = useId(),
    icons = [Activity, Brain, BookOpen, Target, Sparkles, Sparkles];
  return (
    <section
      className={"floating-attributes attribute-mode-" + attributeMode}
      aria-label="角色属性"
      data-mode={attributeMode}
      data-dense={attrs.length > 4}
      aria-hidden={attributeMode === 2}
    >
      <button
        className="attribute-toggle"
        aria-label="属性"
        tabIndex={attributeMode === 2 ? -1 : 0}
        aria-expanded={attributeMode === 0}
        aria-controls={attributesId}
        onClick={() => setAttributeMode(attributeMode === 0 ? 1 : 2)}
      >
        <span>属性</span>
        <ChevronLeft size={18} />
      </button>
      <div id={attributesId} className="floating-attribute-list">
        {attrs.map((a) => {
          const g = growth(a),
            locked = !attrAllowed(s, a, ruleContext(now)),
            Icon = icons[a.slot] || Sparkles;
          return (
            <button
              key={a.id}
              tabIndex={attributeMode === 2 ? -1 : 0}
              onClick={p.openAttributes}
              aria-label={
                a.name + " 等级" + g.level + (locked ? "，已锁定" : "")
              }
            >
              <span className="floating-attribute-label">
                <Icon size={18} />
                <span className="floating-attribute-name" title={a.name}>
                  {attributeCaption(a.name, g.level)}
                </span>
              </span>
              <strong>
                {attributeMode === 0 && <small>Lv.</small>}
                {g.level}
              </strong>
              {attributeMode === 0 && (
                <progress
                  aria-label={a.name + "成长进度"}
                  max={g.next}
                  value={g.level >= 100 ? g.next : Math.min(g.next, g.progress)}
                />
              )}
            </button>
          );
        })}
      </div>
      <button
        className="attribute-manage-icon"
        aria-label="管理属性"
        title="管理属性"
        tabIndex={attributeMode === 2 ? -1 : 0}
        onClick={p.openAttributes}
      >
        <SlidersHorizontal />
      </button>
    </section>
  );
}
export function DesktopAttributes({ s, now, openAttributes }: AttributeProps) {
  const attrs = s.attributes
    .filter((a) => a.slot >= 0)
    .sort((a, b) => a.slot - b.slot);
  const attrIcons = [Activity, Brain, BookOpen, Target, Sparkles, Sparkles];
  return (
    <>
      {" "}
      <section className="attribute-panel" aria-label="角色属性">
        <header>
          <h2>我的属性</h2>
          <button className="text-button" onClick={openAttributes}>
            管理 <SlidersHorizontal size={14} />
          </button>
        </header>
        <div className="simulator-attributes">
          {attrs.map((a) => {
            const g = growth(a),
              locked = !attrAllowed(s, a, ruleContext(now)),
              Icon = attrIcons[a.slot];
            return (
              <button
                className={"simulator-attribute " + (locked ? "locked" : "")}
                key={a.id}
                onClick={openAttributes}
                aria-label={
                  a.name + " 等级" + g.level + (locked ? "，已锁定" : "")
                }
              >
                <span className="sim-attr-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <div className="sim-attr-line">
                    <span>{a.name}</span>
                    <strong>
                      <small>Lv.</small>
                      {g.level}
                    </strong>
                  </div>
                  <progress
                    value={Math.min(g.progress, g.next)}
                    max={g.next}
                    aria-label={a.name + "成长进度"}
                  />
                  <small>
                    {g.level === attributeRules.maxLevel
                      ? "累计 " + Math.round(g.total) + " 经验"
                      : Math.round(g.progress) + " / " + g.next}
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
