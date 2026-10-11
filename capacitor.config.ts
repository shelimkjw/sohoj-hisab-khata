import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.talikhata.app",
  appName: "Tali Khata",
  webDir: "www",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#1f6b45" },
    CapacitorSQLite: { androidIsEncryption: false },
  },
};

export default config;
