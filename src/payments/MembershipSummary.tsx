import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import "./payments.css";

/** One settings entry surface; region adapters supply status and available actions. */
export function MembershipSummary({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="membership-summary global-member-summary">
      <div>
        <ShieldCheck size={22} />
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
      <div className="global-member-actions membership-summary-actions">{children}</div>
    </section>
  );
}
