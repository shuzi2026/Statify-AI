import { uiLocale } from "../i18n/runtime";
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Clock3, Delete } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "ref">;
function usePicker() {
  const input = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLDivElement>(null),
    id = useId();
  const [host, Host] = useState<HTMLElement | null>(null);
  useLayoutEffect(
    () => Host(input.current?.closest("dialog") || document.body),
    [],
  );
  const [opened, Opened] = useState(false);
  function place() {
    const p = panel.current,
      b = input.current?.getBoundingClientRect();
    if (!p || !b) return;
    const width = Math.min(310, innerWidth - 24),
      height = p.offsetHeight;
    p.style.width = width + "px";
    p.style.left =
      Math.max(12, Math.min(innerWidth - width - 12, b.left)) + "px";
    p.style.top =
      Math.max(
        12,
        b.bottom + height + 8 < innerHeight ? b.bottom + 8 : b.top - height - 8,
      ) + "px";
  }
  function show() {
    const p = panel.current;
    if (!p || input.current?.disabled) return;
    if (typeof p.showPopover === "function") p.showPopover();
    else {
      p.dataset.pickerOpen = "true";
      Opened(true);
    }
    place();
  }
  function hide() {
    const p = panel.current;
    if (!p) return;
    if (typeof p.hidePopover === "function") p.hidePopover();
    else {
      delete p.dataset.pickerOpen;
      Opened(false);
    }
  }
  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    const toggle = (e: Event) => Opened((e as ToggleEvent).newState === "open");
    p.addEventListener("toggle", toggle);
    return () => {
      p.removeEventListener("toggle", toggle);
    };
  }, [host]);
  useEffect(() => {
    const p = panel.current;
    if (!p || typeof p.showPopover === "function") return;
    const close = () => hide();
    p.addEventListener("statify-picker-close", close);
    return () => p.removeEventListener("statify-picker-close", close);
  }, [host]);
  useEffect(() => {
    if (!opened || typeof panel.current?.showPopover === "function") return;
    const outside = (e: Event) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !input.current?.contains(e.target as Node)
      )
        hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hide();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [opened]);
  useEffect(() => {
    if (!opened) return;
    const scroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) hide();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [opened]);
  function emit(value: string) {
    const el = input.current;
    if (!el) return;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return { input, panel, host, id, opened, show, hide, emit };
}

function validNumber(n: number, min: number, max: number, step: number) {
  if (!Number.isFinite(n) || n < min || n > max) return false;
  if (!Number.isFinite(step) || step <= 0) return true;
  const offset = (n - (Number.isFinite(min) ? min : 0)) / step;
  return Math.abs(offset - Math.round(offset)) <= 1e-7;
}

/** Live text remains editable with a physical keyboard; touch uses our own keypad. */
export function NumberInput({
  showActions = true,
  allowEmpty = false,
  ...props
}: Props & { showActions?: boolean; allowEmpty?: boolean }) {
  const p = usePicker(),
    [replace, Replace] = useState(true),
    [draft, Draft] = useState(String(props.value ?? props.defaultValue ?? ""));
  const min = props.min === undefined ? -Infinity : Number(props.min),
    max = props.max === undefined ? Infinity : Number(props.max),
    step = Number(props.step ?? 1),
    emptyValue = !allowEmpty && validNumber(0, min, max, step) ? "0" : "";
  useEffect(() => {
    Draft((current) =>
      typeof props.value === "number" &&
      current.trim() !== "" &&
      Number.isFinite(Number(current)) &&
      Number(current) === props.value
        ? current
        : String(props.value ?? ""),
    );
  }, [props.value]);
  useEffect(() => {
    const el = p.input.current;
    if (!el) return;
    el.setCustomValidity(
      draft && !validNumber(Number(draft), min, max, step)
        ? "请填写范围内的有效数值"
        : "",
    );
  }, [draft, min, max, step]);
  function enter(raw: string) {
    const next = raw || emptyValue;
    if (next.length > (props.maxLength ?? 24)) return;
    Draft(next);
    p.emit(next);
    Replace(false);
  }
  function key(k: string) {
    if (k === "清空") return enter("");
    if (k === "退格") return enter(draft.slice(0, -1));
    if (k === "±")
      return enter(draft.startsWith("-") ? draft.slice(1) : "-" + draft);
    const prefix = replace
      ? ""
      : k !== "." && draft === "0"
        ? ""
        : k !== "." && draft === "-0"
          ? "-"
          : draft;
    enter(prefix + k);
  }
  const decimal =
    props.step === "any" || (Number.isFinite(step) && !Number.isInteger(step));
  return (
    <span className="value-input number-input">
      <input
        {...props}
        maxLength={props.maxLength ?? 24}
        value={draft}
        ref={p.input}
        type="text"
        inputMode="none"
        role="spinbutton"
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuenow={
          draft.trim() && Number.isFinite(Number(draft))
            ? Number(draft)
            : undefined
        }
        aria-controls={p.id}
        aria-expanded={p.opened}
        onChange={(e) => {
          if (e.currentTarget.value === "" && emptyValue) {
            e.currentTarget.value = emptyValue;
            e.currentTarget.select();
          }
          Draft(e.currentTarget.value);
          Replace(false);
          if (e.target.value === "" || Number.isFinite(Number(e.target.value)))
            props.onChange?.(e);
        }}
        onClick={(e) => {
          Replace(true);
          p.show();
          props.onClick?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            enter(
              String(
                Math.max(
                  min,
                  Math.min(
                    max,
                    (Number(draft) || 0) +
                      (e.key === "ArrowUp" ? 1 : -1) *
                        (Number.isFinite(step) ? step : 1),
                  ),
                ),
              ),
            );
          } else if (e.key === "Enter" && p.opened) {
            e.preventDefault();
            p.hide();
          }
          props.onKeyDown?.(e);
        }}
      />
      {p.host &&
        createPortal(
          <div
            ref={p.panel}
            id={p.id}
            popover="auto"
            className="value-picker number-picker"
            role="group"
            aria-label="数字键盘"
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <output className="picker-readout">{draft || " "}</output>
            <div className="number-keys">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                min < 0 ? "±" : "清空",
                "0",
                "退格",
                ...(decimal ? ["."] : []),
              ].map((k) =>
                k === "清空" && !showActions ? (
                  <span key={k} aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    key={k}
                    className={
                      k === "退格" || k === "清空"
                        ? "number-action-key"
                        : undefined
                    }
                    aria-label={k}
                    onClick={() => key(k)}
                  >
                    {k === "退格" ? <Delete size={22} aria-hidden="true" /> : k}
                  </button>
                ),
              )}
            </div>
            {showActions && (
              <footer>
                <button type="button" onClick={() => key("清空")}>
                  清空
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    p.hide();
                    p.input.current?.blur();
                  }}
                >
                  {uiLocale ? "Done" : "完成"}
                </button>
              </footer>
            )}
          </div>,
          p.host,
        )}
    </span>
  );
}

export function PickerWheel({
  label,
  options,
  value,
  change,
  read,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  change: (v: string) => void;
  read?: RefObject<(() => string) | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reported = useRef<string | undefined>(undefined);
  const optionKey = JSON.stringify(options.map((option) => option.value));
  const positionedOptions = useRef("");
  const selected = () =>
    options[
      Math.min(
        options.length - 1,
        Math.max(0, Math.round((ref.current?.scrollTop || 0) / 40)),
      )
    ].value;
  useLayoutEffect(() => {
    const el = ref.current;
    // A scroll reports the nearest row; its controlled echo must not interrupt
    // native touch inertia. Only an external selection needs repositioning.
    if (
      el &&
      (reported.current !== value || positionedOptions.current !== optionKey)
    ) {
      reported.current = value;
      positionedOptions.current = optionKey;
      el.scrollTop =
        Math.max(
          0,
          options.findIndex((o) => o.value === value),
        ) * 40;
    }
  }, [value, optionKey]);
  useEffect(() => {
    if (!read) return;
    read.current = selected;
    return () => {
      read.current = null;
    };
  }, [options, read]);
  return (
    <div className="plan-wheel-column">
      <small>{label}</small>
      <div
        ref={ref}
        className="plan-wheel"
        role="listbox"
        aria-label={label}
        onScroll={() => {
          const next = selected();
          reported.current = next;
          if (next !== value) change(next);
        }}
      >
        {options.map((o, i) => (
          <button
            type="button"
            role="option"
            aria-selected={o.value === value}
            key={o.value}
            onClick={() => {
              reported.current = o.value;
              ref.current?.scrollTo({ top: i * 40, behavior: "instant" });
              change(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TimeInput(props: Props) {
  const p = usePicker(),
    [hour, Hour] = useState("00"),
    [minute, Minute] = useState("00"),
    [version, V] = useState(0),
    readHour = useRef<(() => string) | null>(null),
    readMinute = useRef<(() => string) | null>(null);
  function show() {
    const parts = String(props.value || "00:00").split(":");
    Hour(parts[0]);
    Minute(parts[1]);
    V((v) => v + 1);
    p.show();
  }
  return (
    <span className="value-input time-input">
      <input
        {...props}
        ref={p.input}
        type="text"
        inputMode="none"
        maxLength={5}
        placeholder="--:--"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        aria-controls={p.id}
        aria-expanded={p.opened}
        onClick={(e) => {
          show();
          props.onClick?.(e);
        }}
      />
      <Clock3 size={17} aria-hidden="true" />
      {p.host &&
        createPortal(
          <div
            ref={p.panel}
            id={p.id}
            popover="auto"
            className="value-picker time-picker"
            role="group"
            aria-label="选择时间"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="value-wheels" key={version}>
              <PickerWheel
                label="小时"
                options={Array.from({ length: 24 }, (_, i) => ({
                  value: String(i).padStart(2, "0"),
                  label: String(i).padStart(2, "0"),
                }))}
                value={hour}
                change={Hour}
                read={readHour}
              />
              <b>:</b>
              <PickerWheel
                label="分钟"
                options={Array.from({ length: 60 }, (_, i) => ({
                  value: String(i).padStart(2, "0"),
                  label: String(i).padStart(2, "0"),
                }))}
                value={minute}
                change={Minute}
                read={readMinute}
              />
            </div>
            <footer>
              <button
                type="button"
                onClick={() => {
                  p.emit("");
                  p.hide();
                }}
              >
                清空
              </button>
              <button type="button" onClick={p.hide}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  p.emit(
                    (readHour.current?.() ?? hour) +
                      ":" +
                      (readMinute.current?.() ?? minute),
                  );
                  p.hide();
                }}
              >
                确定时间
              </button>
            </footer>
          </div>,
          p.host,
        )}
    </span>
  );
}

export function DateInput({
  isDateAvailable,
  ...props
}: Props & { isDateAvailable?: (date: string) => boolean }) {
  const p = usePicker(),
    [month, Month] = useState(() =>
      String(props.value || new Date().toLocaleDateString("sv-SE")).slice(0, 7),
    ),
    [text, Text] = useState(String(props.value || ""));
  useEffect(() => Text(String(props.value || "")), [props.value]);
  const canSelect = (value: string) =>
    (!props.min || value >= String(props.min)) &&
    (!props.max || value <= String(props.max)) &&
    (!isDateAvailable || isDateAvailable(value));
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(value + "T12:00:00").toLocaleDateString("sv-SE") === value;
  useEffect(() => {
    const valid =
      !text ||
      (validDate(text) &&
        (canSelect(text) ||
          (!!isDateAvailable && text === String(props.value))));
    p.input.current?.setCustomValidity(valid ? "" : "请选择有效范围内的日期");
  }, [text, props.min, props.max, props.value, isDateAvailable]);
  const [y, m] = month.split("-").map(Number),
    length = new Date(y, m, 0).getDate(),
    offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  function shift(n: number) {
    const d = new Date(y, m - 1 + n, 1);
    Month(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  return (
    <span className="value-input date-input">
      <input
        {...props}
        value={text}
        ref={p.input}
        type="text"
        inputMode="none"
        maxLength={10}
        placeholder="YYYY-MM-DD"
        pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
        aria-controls={p.id}
        aria-expanded={p.opened}
        onChange={(e) => {
          const v = e.target.value;
          Text(v || String(props.value || ""));
          if (!v || (validDate(v) && canSelect(v))) props.onChange?.(e);
        }}
        onBlur={(e) => {
          if (isDateAvailable && !canSelect(text))
            Text(String(props.value || ""));
          props.onBlur?.(e);
        }}
        onClick={(e) => {
          Month(
            String(props.value || new Date().toLocaleDateString("sv-SE")).slice(
              0,
              7,
            ),
          );
          p.show();
          props.onClick?.(e);
        }}
      />
      <CalendarDays size={17} aria-hidden="true" />
      {p.host &&
        createPortal(
          <div
            ref={p.panel}
            id={p.id}
            popover="auto"
            className="value-picker date-picker"
            role="group"
            aria-label="选择日期"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <header>
              <button
                type="button"
                aria-label="上个月"
                onClick={() => shift(-1)}
              >
                ‹
              </button>
              <strong>
                {uiLocale ? (
                  new Date(y, m - 1, 1).toLocaleDateString("en", {
                    month: "long",
                    year: "numeric",
                  })
                ) : (
                  <>
                    {y}年{m}月
                  </>
                )}
              </strong>
              <button
                type="button"
                aria-label="下个月"
                onClick={() => shift(1)}
              >
                ›
              </button>
            </header>
            <div className="calendar-grid">
              {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                <small key={d}>{d}</small>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={"blank" + i} />
              ))}
              {Array.from({ length }, (_, i) => {
                const value = month + "-" + String(i + 1).padStart(2, "0");
                const disabled = !canSelect(value);
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={value}
                    aria-pressed={props.value === value}
                    key={value}
                    onClick={() => {
                      p.emit(value);
                      p.hide();
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <footer>
              <button type="button" onClick={p.hide}>
                取消
              </button>
            </footer>
          </div>,
          p.host,
        )}
    </span>
  );
}
