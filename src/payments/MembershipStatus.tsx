/** Display labels stay separate from signed membership and collector payloads. */
export function MembershipStatus({
  label,
  founder = false,
  region,
}: {
  label: string;
  founder?: boolean;
  region: "cn" | "global";
}) {
  return (
    <span className="membership-status-line">
      <span>{label}</span>
      {founder && (
        <span className="membership-founder-badge">
          {region === "cn" ? "原始股东" : "Founder"}
        </span>
      )}
    </span>
  );
}
