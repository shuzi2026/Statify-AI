import { Plus } from "lucide-react";
import { Dialog, Field } from "./components";
import { elapsed, roundedMinutes } from "./engine";
import { actionRules } from "../shared/rules/actions";
import { NumberInput } from "./inputs/ValueInputs";
import { ratingNames, ratings } from "./model";
import { textLimits } from "./text-limits";
import { useSettlement, type SettlementProps } from "./actions/useSettlement";
import { SettlementRewards } from "./actions/SettlementRewards";
export function SettlementFlow(p: SettlementProps) {
  const { s, action: a } = p;
  const {
    quantity,
    Qty,
    rating,
    R,
    count,
    C,
    remember,
    Remember,
    note,
    Note,
    noteOpen,
    NoteOpen,
    stage,
    busy,
    error,
    preview,
    previewError,
    finish,
    cancel,
    next,
  } = useSettlement(p);
  return (
    <Dialog
      title="完成任务"
      className={
        "settlement-page finish-dialog stage-" +
        stage +
        (a.card.method === "instant" ? " instant-result" : "")
      }
      dismissible={!busy}
      outsideDismiss={false}
      focusTitle
      close={() => void (a.reported ? cancel() : finish())}
    >
      <h3 className="settlement-task-name">{a.card.name}</h3>
      {a.reported && <p className="finish-meta">{"补记行动"}</p>}
      {a.card.method !== "instant" && !(a.reported && a.card.method === "quantity") && (
        <p className="finish-meta">
          本次投入 {roundedMinutes(elapsed(a, Date.now()))} 分钟
          {a.card.method === "duration"
            ? " / 目标 " + Math.round(a.card.minutes) + " 分钟"
            : ""}
        </p>
      )}
      {stage === "partial" && (
        <>
          <fieldset disabled={busy} className="partial-options">
            <legend>提前结束，本次如何记录？</legend>
            <label>
              <input
                type="radio"
                name="partial"
                checked={count}
                onChange={() => C(true)}
              />
              <span>
                完成一次<small>计入计划进度，消耗1次卡牌次数。</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="partial"
                checked={!count}
                onChange={() => C(false)}
              />
              <span>
                只记录本次投入
                <small>保留成长与记录，不计计划完成次数，不消耗卡牌。</small>
              </span>
            </label>
          </fieldset>
          <label className="check-line">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => Remember(e.target.checked)}
            />
            以后默认此选项（可在设置中修改）
          </label>
        </>
      )}
      {stage === "rating" && (
        <>
          {a.card.method === "quantity" && (
            <Field label={"本次数量（" + a.card.unit + "）"}>
              <NumberInput
                disabled={busy}
                min={1}
                max={actionRules.maxQuantity}
                step={1}
                value={quantity}
                onChange={(e) => Qty(Number(e.target.value))}
              />
            </Field>
          )}
          {a.card.evaluate && (
            <fieldset disabled={busy}>
              <legend>这一次，感觉怎么样？</legend>
              <div className="rating-options">
                {ratings.map((r, i) => (
                  <button
                    key={r}
                    aria-pressed={rating === r}
                    className={rating === r ? "selected" : ""}
                    onClick={() => R(r)}
                  >
                    {ratingNames[i]}
                    <small>×{r}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
      <SettlementRewards s={s} a={a} preview={preview} rating={rating} />
      {noteOpen && (
        <Field label="感想（可选）">
          <textarea
            disabled={busy}
            maxLength={textLimits.note}
            value={note}
            onChange={(e) => Note(e.target.value)}
          />
        </Field>
      )}
      {(error || previewError) && <p role="alert">{error || previewError}</p>}
      <footer className="dialog-actions">
        <button
          className="text-button finish-note-toggle"
          aria-label="添加感想"
          aria-expanded={noteOpen}
          disabled={busy}
          onClick={() => NoteOpen((v) => !v)}
        >
          <Plus size={15} />
          个人感悟
        </button>
        {stage === "rewards" ? (
          <button
            className="primary"
            disabled={busy || !!previewError}
            onClick={() => void finish()}
          >
            {busy ? "正在保存…" : "完成"}
          </button>
        ) : (
          <button className="primary" disabled={busy} onClick={next}>
            OK！
          </button>
        )}
      </footer>
    </Dialog>
  );
}
