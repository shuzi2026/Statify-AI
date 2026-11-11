import { actionRules } from "../../shared/rules/actions";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { planRules } from "../../shared/rules/plans";
import { statusRules } from "../../shared/rules/status";
import { CardSchema } from "../../shared/save-schema";
import { SHOPPING_CATEGORY, inferShoppingKind, shoppingProductUrl } from "../../shared/shopping-demo";
import { Dialog, Field } from "../components";
import { timeWindowError } from "../engine";
import { NumberInput, TimeInput } from "../inputs/ValueInputs";
import {
  methodNames,
  newCard,
  rules,
  statusKeys,
  statusNames,
  type Card,
  type State,
} from "../model";
import { checkTextLength, textLimits } from "../text-limits";
import { CardArtPicker } from "../themes/CardArtPicker";
import { checkCardPrintBudget } from "../ui-layout/text-budget";
import { RewardSlider } from "./RewardSlider";
import { readCardDraft, writeCardDraft, discardCardDraft } from "./draft";
import { currentDraftEpoch } from "../local-data/draft-epoch";
import { prepareShoppingArtwork } from "./shopping-card-image";
export function CardForm({
  s,
  initial,
  startShopping,
  suggested,
  save,
  close,
  created,
}: {
  s: State;
  initial?: Card;
  startShopping?: boolean;
  suggested?: Partial<Card>;
  save: (c: Card, original?: Card) => Promise<boolean>;
  close: () => void;
  created?: (card: Card) => void;
  manage: (type: string, id: string) => void;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  const draftEpoch = useRef(currentDraftEpoch()).current;
  const [sourceCard] = useState(initial);
  const [draft] = useState(() => (initial ? null : readCardDraft(s)));
  const [c, set] = useState<Card>(() => {
      const v = structuredClone({ ...(initial || draft?.card || newCard(Date.now())), ...suggested });
      if (v.shopping || (!initial && startShopping)) v.category = SHOPPING_CATEGORY;
      return {
        ...v,
        timeWindows: v.timeWindows?.length
          ? v.timeWindows
          : v.timeStart && v.timeEnd
            ? [{ start: v.timeStart, end: v.timeEnd }]
            : [],
        minutes: Math.round(v.minutes),
        rewards: v.rewards.map((r) => ({ ...r, amount: Math.round(r.amount) })),
        effects: v.effects.map((r) => ({ ...r, amount: Math.round(r.amount) })),
        values: v.values.map((r) => ({ ...r, amount: Math.round(r.amount) })),
      };
    }),
    [step, Step] = useState(() => {
      if (initial?.shopping || startShopping || draft?.card.category === SHOPPING_CATEGORY) return 1;
      if (!suggested || suggested.name !== undefined || suggested.category !== undefined) return draft?.step || 1;
      if (suggested.method !== undefined || suggested.minutes !== undefined || suggested.unit !== undefined) return 2;
      if (suggested.rewards !== undefined || suggested.effects !== undefined || suggested.values !== undefined) return 3;
      return 4;
    }),
    [error, E] = useState(""),
    [busy, b] = useState(false);
  const [productUrl, setProductUrl] = useState(initial?.shopping?.url ?? draft?.productUrl ?? draft?.card.shopping?.url ?? "");
  const [generatingShopping, setGeneratingShopping] = useState(false);
  const shopping = !!initial?.shopping || (!initial && c.category === SHOPPING_CATEGORY);
  const [valueRange, ValueRange] = useState(1000),
    [imageBusy, ImageBusy] = useState(false);
  const [timeLimited, TimeLimited] = useState(c.timeWindows.length > 0),
    [capLimited, CapLimited] = useState(c.cap > 0),
    [activeWindow, ActiveWindow] = useState(0),
    [showUnequipped, ShowUnequipped] = useState(false),
    [timeErrorTarget, TimeErrorTarget] = useState<ReturnType<typeof timeWindowError>>(null);
  const timeError = timeLimited && step === 4 ? timeWindowError(c.timeWindows) : null;
  const invalidWindow = timeError ? c.timeWindows[timeError.index] : undefined;
  const inlineTimeError =
    invalidWindow && (timeErrorTarget || (invalidWindow.start && invalidWindow.end))
      ? timeError
      : null;
  useLayoutEffect(() => {
    if (!timeErrorTarget) return;
    const id = c.id + "-window-" + timeErrorTarget.index;
    const row = document.getElementById(id + "-entry");
    if (!row) return;
    row.scrollIntoView({ block: "center", inline: "nearest" });
    document
      .getElementById(id + (timeErrorTarget.field === "end" ? "-end" : ""))
      ?.focus({ preventScroll: true });
    if (
      document.documentElement.dataset.reduceEffects === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    const animation = row.animate?.(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.035)", offset: 0.4 },
        { transform: "scale(1)" },
      ],
      { duration: 460, easing: "ease-in-out" },
    );
    return () => animation?.cancel();
  }, [c.id, timeErrorTarget]);
  useEffect(() => {
    if (!initial)
      writeCardDraft(s, {
        card: {
          ...c,
          timeStart: "",
          timeEnd: "",
          timeWindows: timeLimited ? c.timeWindows : [],
          cap: capLimited ? c.cap : 0,
        },
        step,
        productUrl: shopping ? productUrl : undefined,
      }, draftEpoch);
  }, [c, step, initial, s.createdAt, timeLimited, capLimited, productUrl, shopping]);
  useEffect(() => {
    if (!initial && step === 1) nameInput.current?.focus();
  }, [initial, step]);
  const change = <K extends keyof Card>(k: K, v: Card[K]) =>
    set({ ...c, [k]: v });
  function effect(
    group: "rewards" | "effects" | "values",
    id: string,
    value: number,
  ) {
    set({
      ...c,
      [group]: [
        ...c[group].filter((r) => r.id !== id),
        ...(value !== 0 ? [{ id, amount: value }] : []),
      ],
    });
  }
  function jump(next: number) {
    E("");
    TimeErrorTarget(null);
    Step(next);
  }
  function cancel() {
    if (!initial) discardCardDraft(s, draftEpoch);
    close();
  }
  const methodHints = {
    instant: "点击即完成，固定任务奖励。",
    duration: "指定任务时长，固定任务奖励。",
    timed: "自动记录行动时长，按每分钟结算奖励。",
    quantity: "手动记录完成数量，按数量单位结算奖励。",
  };
  function addWindow() {
    const index = c.timeWindows.length;
    change("timeWindows", [...c.timeWindows, { start: "", end: "" }]);
    ActiveWindow(index);
    requestAnimationFrame(() =>
      document.getElementById(c.id + "-window-" + index)?.focus(),
    );
  }
  function removeWindow(index: number) {
    change(
      "timeWindows",
      c.timeWindows.filter((_, i) => i !== index),
    );
    ActiveWindow(
      activeWindow > index
        ? activeWindow - 1
        : Math.min(activeWindow, c.timeWindows.length - 2),
    );
  }
  function windowChange(index: number, key: "start" | "end", value: string) {
    change(
      "timeWindows",
      c.timeWindows.map((w, i) => (i === index ? { ...w, [key]: value } : w)),
    );
  }
  const unequipped = s.attributes.filter((attribute) => attribute.slot < 0);
  const attributeSliders = (attributes: State["attributes"]) => (
    <div className="form-grid reward-experience-grid reward-setting-grid">
      {attributes.map((attribute) => (
        <RewardSlider
          key={attribute.id}
          label={attribute.name + "经验"}
          value={c.rewards.find((reward) => reward.id === attribute.id)?.amount || 0}
          min={0}
          max={
            c.method === "timed" || c.method === "quantity"
              ? s.preferences.rewardPerUnitMax
              : s.preferences.rewardTotalMax
          }
          directMax={rules.dailyExperience}
          compact
          change={(value) => effect("rewards", attribute.id, value)}
        />
      ))}
    </div>
  );
  return (
    <Dialog
      title={initial ? "编辑卡牌" : "创建卡牌"}
      hideTitle
      className="card-form-dialog"
      close={cancel}
      dismissible={!busy && !imageBusy}
      wide
    >
      {!shopping && <nav className="card-form-progress" aria-label="卡牌填写进度">
        {["名称", "方式", "奖励", "更多设置"].map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={busy || imageBusy}
            aria-label={"跳转到" + label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={step === i + 1 ? "current" : step > i + 1 ? "done" : ""}
            onClick={() => jump(i + 1)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </nav>}
      <h3 className="card-settings-title">
        {shopping ? (initial ? "编辑购物卡牌" : "创建购物卡牌") :
          [initial ? "编辑任务卡牌" : "创建任务卡牌", "选择任务类型", "任务成长奖励", "更多设置"][step - 1]}
      </h3>
      <form
        className={step <= 2 ? "card-form-short-step" : undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          if (imageBusy || busy) return;
          E("");
          const name = c.name.trim();
          if (!name) {
            Step(1);
            E("请填写卡牌名称");
            return;
          }
          if (shopping) {
            const url = shoppingProductUrl.safeParse(productUrl.trim()).data;
            if (!url) { E("请输入有效的 HTTPS 商品链接。"); return; }
            const product = initial?.shopping?.url === url ? initial.shopping : { url, kind: inferShoppingKind(name) };
            b(true);
            setGeneratingShopping(!product.generatedArt?.transparent);
            try {
              const prepared = product.generatedArt?.transparent || initial?.customArt
                ? product : await prepareShoppingArtwork(product, name);
              if (!initial?.customArt && !prepared.generatedArt?.data && !prepared.image) {
                E("未能找到商品图片，请检查商品链接后重试。卡牌尚未保存。");
                return;
              }
              const card = {
                ...(initial ?? { ...newCard(c.createdAt), id: c.id }),
                name, category: SHOPPING_CATEGORY,
                shopping: prepared,
              };
              if (await save(card, sourceCard)) {
                if (!initial) discardCardDraft(s, draftEpoch);
                if (!initial && created) created(card);
                else close();
              }
            } finally {
              setGeneratingShopping(false);
              b(false);
            }
            return;
          }
          try {
            checkCardPrintBudget(name, initial?.name);
            checkTextLength(
              c.unit.trim(),
              textLimits.unit,
              "计数单位",
              initial?.unit,
            );
          } catch (error) {
            Step(
              (error as Error).message.includes("名称") ||
                (error as Error).message.includes("name")
                ? 1
                : 3,
            );
            E((error as Error).message);
            return;
          }
          if (
            step >= 3 &&
            (c.rewards.some(
              (r) => r.amount < 0 || r.amount > rules.dailyExperience,
            ) ||
              c.effects.some(
                (r) =>
                  r.amount < -statusRules.max || r.amount > statusRules.max,
              ))
          ) {
            Step(3);
            E("请将经验调整至0–1000，状态变化调整至−100–100后保存");
            return;
          }
          if (step < 4) {
            Step(step + 1);
            return;
          }
          if (c.method === "quantity" && !c.unit.trim()) {
            Step(3);
            E("请填写计数单位");
            return;
          }
          if (
            c.method === "duration" &&
            (!Number.isInteger(c.minutes) ||
              c.minutes < 1 ||
              c.minutes > actionRules.maxTargetMinutes)
          ) {
            Step(3);
            E("请填写1至1440的整数分钟");
            return;
          }
          const windows = timeLimited
            ? c.timeWindows.filter((w) => w.start || w.end)
            : [];
          if (timeError) {
            ActiveWindow(timeError.index);
            TimeErrorTarget(timeError);
            return;
          }
          b(true);
          try {
            if (
              await save({
                ...c,
                name,
                unit: c.unit.trim(),
                timeWindows: windows,
                timeStart: "",
                timeEnd: "",
                timeMode: timeLimited ? "block" : c.timeMode,
                cap: capLimited ? c.cap : 0,
              })
            ) {
              if (!initial) discardCardDraft(s, draftEpoch);
              if (!initial && created) created({ ...c, name });
              else close();
            }
          } finally {
            b(false);
          }
        }}
      >
        {step === 1 && (
          <>
            <Field label="卡牌名称">
              <input
                ref={nameInput}
                autoFocus={!initial}
                required
                disabled={generatingShopping}
                maxLength={CardSchema.shape.name.maxLength ?? undefined}
                value={c.name}
                onChange={(e) => change("name", e.target.value)}
                placeholder="比如：读一会儿书"
              />
            </Field>
            <Field label="分类">
              <select
                aria-label="分类"
                value={c.category}
                disabled={!!initial?.shopping || generatingShopping}
                onChange={(e) => change("category", e.target.value)}
              >
                <option value="">--</option>
                {[
                  ...new Set([
                    ...s.categories,
                    ...(!initial || initial.shopping ? [SHOPPING_CATEGORY] : []),
                    ...(c.category ? [c.category] : []),
                  ]),
                ].filter((name) => name !== SHOPPING_CATEGORY || !initial || !!initial.shopping || initial.category === name).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            {shopping && <Field label="商品链接">
              <input type="url" required value={productUrl} maxLength={2048} disabled={generatingShopping}
                placeholder="https://…" onChange={(event) => setProductUrl(event.target.value)} />
            </Field>}
          </>
        )}
        {step === 2 && (
          <div className="card-method-choices">
            {Object.entries(methodNames).map(([k, v]) => (
              <button
                type="button"
                key={k}
                aria-label={v}
                aria-describedby={c.id + "-hint-" + k}
                aria-pressed={c.method === k}
                className={c.method === k ? "selected" : ""}
                onClick={() => change("method", k as Card["method"])}
              >
                <strong>{v}</strong>
                <small id={c.id + "-hint-" + k}>
                  {methodHints[k as Card["method"]]
                    .split("，")
                    .map((line, i) => (
                      <span key={i}>
                        {line}
                        {i === 0 ? "，" : ""}
                      </span>
                    ))}
                </small>
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <>
            {c.method === "duration" && (
              <Field label="目标分钟">
                <NumberInput
                  required
                  min="1"
                  max={actionRules.maxTargetMinutes}
                  step="1"
                  value={c.minutes}
                  onChange={(e) => change("minutes", Number(e.target.value))}
                />
              </Field>
            )}
            {c.method === "quantity" && (
              <Field
                label="计数单位"
                inlineHint
                hint={`最多${textLimits.unit}个字符`}
              >
                <input
                  required
                  maxLength={textLimits.unit}
                  value={c.unit}
                  onChange={(e) => change("unit", e.target.value)}
                />
              </Field>
            )}
            <p className="reward-limit-note">
              {c.method === "timed"
                ? "每分钟"
                : c.method === "quantity"
                  ? "每" + (c.unit || "单位")
                  : "每次"}
              基础经验 · 单项最多1000，每日实际获得也不超过1000。
            </p>
            {attributeSliders(s.attributes.filter((attribute) => attribute.slot >= 0))}
            <details>
              <summary>五项状态变化</summary>
              <div className="form-grid reward-setting-grid">
                {statusKeys.map((k) => (
                  <RewardSlider
                    key={k}
                    label={statusNames[k] + "变化"}
                    value={c.effects.find((r) => r.id === k)?.amount || 0}
                    min={-statusRules.max}
                    max={statusRules.max}
                    directMax={statusRules.max}
                    compact
                    change={(v) => effect("effects", k, v)}
                  />
                ))}
              </div>
            </details>
            <details>
              <summary>自定义数值关联</summary>
              {s.meters.length ? (
                <>
                  <label className="custom-reward-scale">
                    滑动范围 ±
                    <NumberInput
                      aria-label="自定义数值滑动范围"
                      min="1"
                      max="1000000000000"
                      step="1"
                      value={valueRange}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 1e12)
                          ValueRange(n);
                      }}
                    />
                  </label>
                  <div className="form-grid reward-setting-grid">
                    {s.meters.map((v) => {
                      const value =
                          c.values.find((r) => r.id === v.id)?.amount || 0,
                        max = Math.max(valueRange, Math.abs(value));
                      return (
                        <RewardSlider
                          key={v.id}
                          label={v.name + "增减"}
                          value={value}
                          min={-max}
                          max={max}
                          directMin={-1e12}
                          directMax={1e12}
                          compact
                          change={(n) => effect("values", v.id, n)}
                        />
                      );
                    })}
                  </div>
                  <p className="custom-reward-hint">
                    滑动范围可调整；实际数值仍按你设置的上下限计算。
                  </p>
                </>
              ) : (
                <p className="help">
                  暂无自定义数值。可以先保存卡牌，之后从首页新建数值再回来关联。
                </p>
              )}
            </details>
            {unequipped.length > 0 && (
              <details
                open={showUnequipped}
                onToggle={(event) => ShowUnequipped(event.currentTarget.open)}
              >
                <summary>未装备属性</summary>
                {showUnequipped && attributeSliders(unequipped)}
              </details>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Field label="卡牌类型">
              <select
                aria-label="卡牌类型"
                value={c.life}
                onChange={(e) => change("life", e.target.value as Card["life"])}
              >
                <option value="repeat">可复用卡牌</option>
                <option value="consumable">事件型卡片</option>
              </select>
            </Field>
            {c.life === "consumable" && (
              <>
                <p className="card-setting-note">完成后销毁归入历史存档</p>
                <label className="card-inline-setting">
                  完成
                  <NumberInput
                    aria-label="销毁所需完成次数"
                    required
                    min="1"
                    max={planRules.maxUses}
                    step="1"
                    value={c.uses}
                    onChange={(e) => change("uses", Number(e.target.value))}
                  />
                  次后销毁
                </label>
              </>
            )}
            <div className="card-setting-group">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={timeLimited}
                  onChange={(e) => {
                    TimeLimited(e.target.checked);
                    TimeErrorTarget(null);
                    if (e.target.checked && !c.timeWindows.length)
                      change("timeWindows", [{ start: "", end: "" }]);
                  }}
                />
                限制使用时间段
              </label>
              {timeLimited && (
                <div className="card-time-windows">
                  {c.timeWindows.map((w, i) => {
                    const id = c.id + "-window-" + i;
                    const issue = inlineTimeError?.index === i ? inlineTimeError : null;
                    const invalidStart = issue?.field === "start";
                    const invalidEnd = issue?.field === "end";
                    return (
                      <div className="card-time-entry" id={id + "-entry"} key={i}>
                        <div className="card-time-row">
                          <span>可完成时段</span>
                          <TimeInput
                            id={id}
                            aria-label={"时段" + (i + 1) + "开始"}
                            aria-invalid={invalidStart || undefined}
                            aria-describedby={invalidStart ? id + "-error" : undefined}
                            value={w.start}
                            onFocus={() => ActiveWindow(i)}
                            onChange={(e) =>
                              windowChange(i, "start", e.target.value)
                            }
                          />
                          <span>—</span>
                          <TimeInput
                            id={id + "-end"}
                            aria-label={"时段" + (i + 1) + "结束"}
                            aria-invalid={invalidEnd || undefined}
                            aria-describedby={invalidEnd ? id + "-error" : undefined}
                            value={w.end}
                            onFocus={() => ActiveWindow(i)}
                            onChange={(e) => windowChange(i, "end", e.target.value)}
                          />
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={
                              i === activeWindow || c.timeWindows.length === 1
                                ? "增加可完成时段"
                                : "删除时段" + (i + 1)
                            }
                            disabled={
                              (i === activeWindow || c.timeWindows.length === 1) &&
                              c.timeWindows.length >= 100
                            }
                            onClick={() =>
                              i === activeWindow || c.timeWindows.length === 1
                                ? addWindow()
                                : removeWindow(i)
                            }
                          >
                            {i === activeWindow || c.timeWindows.length === 1 ? (
                              <Plus size={18} />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                        {issue && (
                          <p id={id + "-error"} className="card-time-error" role="alert">
                            {issue.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="card-setting-group">
              <div className="card-cap-heading">
                <label className="check-line">
                  <input
                    type="checkbox"
                    aria-label="限制使用次数"
                    checked={capLimited}
                    onChange={(e) => {
                      CapLimited(e.target.checked);
                      if (e.target.checked && !c.cap) change("cap", 1);
                    }}
                  />
                  限制
                </label>
                <select
                  aria-label="次数限制周期"
                  value={c.capPeriod}
                  onChange={(e) =>
                    change("capPeriod", e.target.value as Card["capPeriod"])
                  }
                >
                  <option value="day">每天</option>
                  <option value="week">每周</option>
                  <option value="month">每月</option>
                </select>
                <span>使用次数</span>
              </div>
              {capLimited && (
                <Field label="可完成次数">
                  <NumberInput
                    required
                    min="1"
                    max={planRules.maxUses}
                    step="1"
                    value={c.cap}
                    onChange={(e) => change("cap", Number(e.target.value))}
                  />
                </Field>
              )}
            </div>
            <div
              className="card-extra-settings"
              role="group"
              aria-label="卡牌附加设置"
            >
              <details className="card-settlement-settings">
                <summary>完成结算</summary>
                <div className="checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={c.settle}
                      onChange={(e) => change("settle", e.target.checked)}
                    />
                    展示结算动画
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={c.evaluate}
                      onChange={(e) => change("evaluate", e.target.checked)}
                    />
                    完成后可评价
                  </label>
                </div>
              </details>
              {initial && (
                <details className="card-image-editor">
                  <summary>编辑卡牌图片</summary>
                  <CardArtPicker
                    card={c}
                    onBusyChange={ImageBusy}
                    onChange={(next) =>
                      set((current) => ({
                        ...current,
                        artwork: next.artwork,
                        customArt: next.customArt,
                      }))
                    }
                  />
                </details>
              )}
              <details className="card-message-settings">
                <summary>给此卡牌写一句话</summary>
                <Field label="卡牌寄语（选填）">
                  <textarea
                    maxLength={120}
                    value={c.message}
                    onChange={(e) => change("message", e.target.value)}
                    placeholder="完成时，会再次看到这句话"
                  />
                </Field>
              </details>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {generatingShopping && <p className="card-generation-status" role="status">
          <LoaderCircle size={17} aria-hidden="true" /> 正在获取商品图片并制作卡图…
        </p>}
        <footer className="dialog-actions">
          <button type="button" disabled={busy || imageBusy} onClick={cancel}>
            取消
          </button>
          {step > 1 && (
            <button
              type="button"
              disabled={busy || imageBusy}
              onClick={() => jump(step - 1)}
            >
              上一步
            </button>
          )}
          <button className="primary" disabled={busy || imageBusy}>
            {generatingShopping ? "生成中…" : imageBusy
              ? "正在处理图片"
              : busy
                ? "正在保存"
                : shopping || step === 4
                  ? "保存卡牌"
                  : "OK！"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
