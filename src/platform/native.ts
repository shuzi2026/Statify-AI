import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

export const nativePlatform = () => Capacitor.getPlatform();
export const hasAndroidBridge = () => nativePlatform() === "android";
export type BarColors = { top: string; bottom: string; persist?: boolean };
// One typed registration per custom plugin; availability is a separate decision.
export const deviceBridge = registerPlugin<{
  environment(): Promise<Record<string, unknown>>;
  systemBars(colors: BarColors): Promise<void>;
  selectionTick(): Promise<void>;
}>("StatifyDevice");
export const paymentsBridge = registerPlugin<{
  request(options: {
    path: string;
    body?: string;
  }): Promise<{ status: number; data: unknown }>;
  openCheckout(options: { url: string }): Promise<void>;
  payAlipay(options: {
    orderString: string;
    environment: "sandbox" | "live";
  }): Promise<{ resultStatus: string }>;
  readAccountLicense(): Promise<{ value: string }>;
  writeAccountLicense(options: { value: string }): Promise<void>;
  clearCnAccountSession(): Promise<void>;
  addListener(
    event: "resume",
    callback: () => void,
  ): Promise<PluginListenerHandle>;
}>("StatifyPayments");
