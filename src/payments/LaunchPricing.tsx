import pricing from "../../shared/membership-pricing.json";
export function LaunchPricing({ region }: { region: "cn" | "global" }) {
  const p = pricing[region];
  return (
    <aside
      className="membership-launch-pricing"
      aria-label={
        region === "cn" ? "正式上线价格预告" : "Launch pricing preview"
      }
    >
      <strong>
        {region === "cn" ? "正式上线后" : "After official launch"}
      </strong>
      <p>
        {region === "cn"
          ? `年订阅 ¥${p.launchAnnual}／年 · 终身会员 ¥${p.launchLifetime}`
          : `Annual subscription US$${p.launchAnnual}/year · Lifetime US$${p.launchLifetime}`}
      </p>
      <small>
        {region === "cn"
          ? "目前仍为内测价。已购买的永久会员持续有效，无需转为年费。"
          : "Beta pricing applies now. Existing lifetime memberships remain lifetime; no annual subscription is required."}
      </small>
    </aside>
  );
}
