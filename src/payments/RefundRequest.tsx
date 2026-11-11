import { useState } from "react";
type Receipt = {
  id: string;
  order_id: string;
  status: string;
  created_at: number;
  decision: string | null;
  reason: string;
  basis: string;
};
export function RefundRequest({
  orderId,
  api,
  locale = "en",
}: {
  orderId: string;
  locale?: string;
  api: (
    path: string,
    body?: Record<string, unknown>,
  ) => Promise<{ request: Receipt | null }>;
}) {
  const en = locale === "en";
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""),
    [basis, setBasis] = useState("commercial");
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [error, setError] = useState("");
  async function request(submit: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(
        `/orders/${orderId}/refund-request`,
        submit ? { basis, reason } : undefined,
      );
      setReceipt(data.request);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section style={{ width: "100%", overflowWrap: "anywhere" }}>
      <button type="button" disabled={busy} onClick={() => void request(false)}>
        {en ? "Refund request / status" : "退款申请／状态"}
      </button>
      {error && <p role="alert">{error}</p>}
      {open && (
        <>
          <p>
            {en
              ? "PayPal: apply within 7 days of payment, with a reason. Requests are manually reviewed; approval does not mean the refund has completed. Statutory rights are unaffected. Website activation-code purchases must be requested by the original buyer on the website."
              : "PayPal 付款后七天内可填写理由申请退款，人工审核。批准不代表退款已到账。法定权利不受影响。官网激活码订单由原购买者在官网申请。"}
          </p>
          {receipt ? (
            <div role="status">
              <p>
                {en ? "Request received" : "已收到申请"} ·{" "}
                {new Date(receipt.created_at).toLocaleString()}
              </p>
              <p>
                {en ? "Status" : "状态"}:{" "}
                {(
                  {
                    pending: en ? "Awaiting manual review" : "待人工审核",
                    approved: en
                      ? "Approved; awaiting PayPal refund"
                      : "已批准，等待 PayPal 退款",
                    rejected: en ? "Rejected" : "已拒绝",
                    refunded: en ? "Refund confirmed" : "已确认退款",
                  } as Record<string, string>
                )[receipt.status] || receipt.status}
              </p>
              <code>{receipt.id}</code><p>{receipt.reason}</p>
              <p>{receipt.decision}</p>
              <button
                type="button"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(receipt, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `refund-${receipt.id}.json`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                {en ? "Save confirmation" : "保存申请凭证"}
              </button>
            </div>
          ) : (
            <div>
              <label>
                {en ? "Request type" : "申请类型"}
                <select
                  value={basis}
                  onChange={(e) => setBasis(e.target.value)}
                >
                  <option value="commercial">
                    {en ? "Seven-day commercial refund" : "七天商业退款申请"}
                  </option>
                  <option value="statutory">
                    {en
                      ? "Statutory withdrawal / payment or product problem"
                      : "法定撤回／付款或产品问题"}
                  </option>
                </select>
              </label>
              <label>
                {basis === "commercial"
                  ? en
                    ? "Reason (required)"
                    : "理由（必填）"
                  : en
                    ? "Details (optional for statutory withdrawal)"
                    : "说明（法定无理由撤回可不填写）"}
                <textarea
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || (basis === "commercial" && !reason.trim())}
                onClick={() => void request(true)}
              >
                {en ? "Submit request" : "提交申请"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
