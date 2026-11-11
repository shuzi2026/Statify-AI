import { X } from "lucide-react";
import type { CSSProperties } from "react";
import { CardPaperControls } from "./CardAppearance";
import { CompletionNotice } from "../CompletionNotice";
import { MemberNotice } from "../payments/MemberNotice";
import type { DrawnCardProps } from "./types";
import { useDrawnCard } from "./useDrawnCard";

export function DrawnCardView(p: DrawnCardProps) {
  const {
    title,
    close,
    edit,
    remove,
    instant,
    blocked,
    restrictions,
    hasFollowup,
    message,
    children,
    back,
  } = p;
  const {
    canViewHistory,
    exitMs,
    memberPrompt,
    ref,
    paper,
    ready,
    showBack,
    touchStart,
    tap,
    touchFlip,
    opened,
    leaving,
    held,
    Held,
    completed,
    completionClosing,
    starting,
    dismissCompletion,
    flip,
    proceed,
  } = useDrawnCard(p);
  return (
    <dialog
      ref={ref}
      className={"drawn-card-overlay " + (ready ? "is-ready" : "is-flying")}
      aria-label={completed ? "完成任务" : title}
      style={{ "--card-exit-duration": exitMs + "ms" } as CSSProperties}
      data-completed={!!completed || undefined}
      data-completion-closing={completionClosing || undefined}
      data-departure={leaving || undefined}
      data-held={held || undefined}
      data-direct-completion={!hasFollowup || undefined}
      aria-busy={!!leaving && !completed}
      onPointerUpCapture={() => Held(false)}
      onPointerCancelCapture={() => Held(false)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (
          ready &&
          e.target === e.currentTarget &&
          performance.now() - opened.current > 180
        ) {
          if (completed) void dismissCompletion();
          else if (!starting.current) close();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (completed) void dismissCompletion();
        else if (!starting.current) close();
      }}
    >
      <div
        ref={paper}
        inert={!!leaving}
        onPointerDownCapture={() => Held(true)}
        onPointerUpCapture={() => Held(false)}
        onPointerCancelCapture={() => Held(false)}
        onLostPointerCapture={() => Held(false)}
        className={"drawn-card-paper " + (showBack ? "is-flipped" : "")}
        tabIndex={0}
        role="group"
        aria-label={title + "，可翻转卡牌"}
        onDoubleClick={(e) => {
          if (
            (e.target as HTMLElement).closest("button") ||
            Date.now() - touchFlip.current < 500
          )
            return;
          flip();
        }}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            flip();
          }
        }}
        onPointerDown={(e) => {
          if (
            e.pointerType === "touch" &&
            !(e.target as HTMLElement).closest("button")
          )
            touchStart.current = { x: e.clientX, y: e.clientY };
          else touchStart.current = null;
        }}
        onPointerMove={(e) => {
          const origin = touchStart.current;
          if (
            origin &&
            Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10
          )
            touchStart.current = null;
        }}
        onPointerUp={(e) => {
          const origin = touchStart.current;
          touchStart.current = null;
          if (
            e.pointerType !== "touch" ||
            !origin ||
            Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10
          )
            return;
          const at = Date.now(),
            previous = tap.current;
          if (
            previous &&
            at - previous.at < 350 &&
            Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 24
          ) {
            touchFlip.current = at;
            tap.current = null;
            flip();
          } else tap.current = { at, x: e.clientX, y: e.clientY };
        }}
        onPointerCancel={() => {
          touchStart.current = null;
          tap.current = null;
        }}
      >
        <div className="card-flip-inner">
          <div
            className="drawn-card-front"
            inert={showBack}
            aria-hidden={showBack}
          >
            {children}
            <CardPaperControls name={title} edit={edit} remove={remove} />
          </div>
          <div
            className="drawn-card-back"
            inert={!showBack}
            aria-hidden={!showBack}
          >
            {canViewHistory ? (
              back
            ) : (
              <div className="card-history-locked">
                <h3>卡牌使用记录</h3>
                <MemberNotice pulse={memberPrompt.pulse}>
                  开通会员后，
                  <br />
                  可查看卡牌使用热力图。
                </MemberNotice>
              </div>
            )}
          </div>
        </div>
      </div>
      <button className="card-flip-hint" disabled={!!leaving} onClick={flip}>
        {showBack
          ? "双击卡牌，返回正面"
          : canViewHistory
            ? "双击卡牌，查看历史使用记录"
            : "双击卡牌，翻到背面"}
      </button>
      <button
        className="drawn-card-close icon-button"
        aria-label="关闭窗口"
        disabled={!!leaving}
        onClick={close}
      >
        <X size={21} />
      </button>
      <div className="drawn-card-actions">
        <button
          className="primary drawn-card-start"
          disabled={blocked || !ready || !!leaving}
          aria-label={blocked ? undefined : (instant ? "完成 " : "开始 ") + title}
          onClick={() => void proceed()}
        >
          {blocked ? (
            <span className="drawn-card-restrictions">
              {restrictions.map((reason, index) => (
                <span key={reason}>
                  {index > 0 && <span aria-hidden="true" className="restriction-divider"> | </span>}
                  <span>{reason}</span>
                </span>
              ))}
            </span>
          ) : instant ? "完成一次" : "开始行动"}
        </button>
      </div>
      {completed && (
        <div
          className="completed-animation is-instant inline-completion"
          role="status"
        >
          <CompletionNotice entry={completed} message={message} />
        </div>
      )}
    </dialog>
  );
}
