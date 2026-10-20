import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.basket.merchant",
  appName: "السلة للتاجر",
  webDir: "dist/public",
  android: { allowMixedContent: false },
  server: { androidScheme: "https" },
};
export default config;
