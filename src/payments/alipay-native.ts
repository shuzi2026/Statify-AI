import { paymentsBridge } from "../platform/native";
import type { NativeAlipay } from "./AlipayPurchase";

export const nativeAlipay: NativeAlipay = {
  pay: (orderString, environment) =>
    paymentsBridge.payAlipay({ orderString, environment }),
  onResume: (callback) => paymentsBridge.addListener("resume", callback),
};
