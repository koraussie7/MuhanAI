import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.muhanai.thinclient",
  appName: "Muhan Thin Client",
  webDir: "dist",
  server: {
    // 개발 중에는 vite dev 서버, 프로덕션은 번들 파일 사용.
    androidScheme: "https",
  },
};

export default config;
