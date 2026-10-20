import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: {
          // 测试夹具里的嵌入播放器 iframe 不真的去加载页面。
          disableIframePageLoading: true,
        },
      },
    },
    onConsoleLog(log) {
      // 上面的开关会让 happy-dom 给每个播放器 iframe 记一条 console.error,属预期噪音。
      if (log.includes("Iframe page loading is disabled")) {
        return false;
      }
    },
  },
});
