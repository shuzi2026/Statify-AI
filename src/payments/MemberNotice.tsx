import { useState, type ReactNode } from "react";
import "./member-notice.css";

export const useMemberPrompt = () => {
  const [pulse, Pulse] = useState(0);
  return { pulse, prompt: () => Pulse((n) => n + 1), reset: () => Pulse(0) };
};
/** Paywall feedback is visible and repeatable; it never changes entitlement. */
export function MemberNotice({
  children,
  pulse = 0,
  inline = false,
}: {
  children: ReactNode;
  pulse?: number;
  inline?: boolean;
}) {
  const Tag = inline ? "span" : "p";
  return (
    <Tag
      key={pulse}
      className={"member-notice" + (pulse ? " is-emphasized" : "")}
      role={pulse ? "alert" : undefined}
    >
      {children}
    </Tag>
  );
}
