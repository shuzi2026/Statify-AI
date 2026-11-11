import { ShoppingBag } from "lucide-react";
import dishSoapIcon from "../../assets/素材/G_公用/SG028_GenericDishSoap.png";
import type { Card } from "../model";
import { DISH_SOAP_PRODUCT_ID } from "../../shared/shopping-demo";
import "../themes/vertical-stripes.css";

export function ShoppingCardFace({ card }: { card?: Card } = {}) {
  const image = card ? card.customArt || card.shopping?.generatedArt?.data ||
    (card.shopping?.productId === DISH_SOAP_PRODUCT_ID ? dishSoapIcon : card.shopping?.image) : dishSoapIcon;
  const name = card?.name ?? "洗洁精";
  return (
    <span className="action-card-face shopping-card-face">
      <span className="fan-card-name" title={name} data-title-wrap={card ? "two-lines" : undefined}>{name}</span>
      <span className="fan-card-category">Shopping</span>
      <span className="fan-card-art" aria-hidden="true">
        {image && <img key={image} className="shopping-card-product" src={image} alt="" referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.hidden = true; }} />}
        <ShoppingBag size={44} className="shopping-card-placeholder" />
      </span>
      <span className="fan-card-method">购物</span>
    </span>
  );
}

