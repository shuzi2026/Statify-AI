import type { Card, Entry } from "../model";
import { ChevronDown } from "lucide-react";
import { merchantName, shoppingPrice } from "../../shared/shopping-demo";
import { ChatText } from "../app/ai-chat-links";
import "./purchase-history.css";

export function PurchaseDetails({ purchase, at, note }: {
  purchase: NonNullable<Entry["purchase"]>;
  at?: number;
  note?: string;
}) {
  return <details className="purchase-details">
    <summary>
      {at !== undefined && <time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleString()}</time>}
      <span className="purchase-summary">
        <span>{merchantName(purchase.merchant)}</span>
        <strong>{shoppingPrice(purchase.cents)}</strong>
        <ChevronDown className="purchase-expand-icon" size={16} aria-hidden="true" />
      </span>
    </summary>
    <div className="purchase-expanded">
      {purchase.title && <p>{purchase.title}</p>}
      <a href={purchase.url} target="_blank" rel="noopener noreferrer">查看本次购买的商品 ↗</a>
      <p>PayPal Sandbox</p>
      <p>订单号 <code>{purchase.orderId}</code></p>
      {note && <p><ChatText content={note} /></p>}
    </div>
  </details>;
}

export function PurchaseHistory({ card, entries }: { card?: Card; entries: Entry[] }) {
  const purchases = entries.filter((entry) => entry.purchase).sort((a, b) => b.endedAt - a.endedAt);
  const legacy = !purchases.length && card?.shopping?.lastPurchase;
  return <div className="card-history purchase-history">
    <div className="card-all-records">
      {purchases.map((entry) => <PurchaseDetails key={entry.id} purchase={entry.purchase!} at={entry.endedAt} note={entry.note} />)}
      {legacy && card?.shopping && <PurchaseDetails purchase={{ ...legacy, url: card.shopping.url }} />}
      {!purchases.length && !legacy && <p>还没有购买记录。</p>}
    </div>
  </div>;
}
