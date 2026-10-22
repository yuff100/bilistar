# BiliStar

B 站 Chrome 插件：打开之后只看已经关注的 UP 主，推荐、热门、排行榜不会出现。

用户直接访问 [bilibili.com](https://www.bilibili.com) 登录，沿用浏览器里已经登录的账号。插件不碰密码，也不申请 `cookies` / `storage` 权限。

## 能做什么

- **首页三栏**：左栏关注、中栏投稿、右栏播放。左栏和中栏可以收起、再展开。
- **关注分组**：直接用 B 站自己的关注分组；分组可以折叠，组与组、组内 UP 可以拖拽排序（只记在本机，不影响 B 站原生页面）。
- **视频列表**：只出现视频，没有直播和图文动态。点击视频名在右栏播放。
- **播放器**：右栏用 B 站同源播放器，清晰度、倍速、设置都在页内调整。要看评论时点「在 B 站打开」。
- **完整播放页**：已关注 UP 保留播放器和评论，去掉顶栏与推荐；未关注的视频只留播放器和关注按钮。
- **仍可打开**：收藏、历史、稍后再看，以及已关注 UP 的专栏、合集、课程。
- **会回到首页**：排行榜、消息、创作中心、账号设置、搜索、直播、动态，以及未关注 UP 的空间。

关掉插件后，B 站恢复原来的样子。

## 安装

第一版只支持 Chrome。

1. 打开 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选仓库里的 `extension` 目录
4. 打开 [www.bilibili.com](https://www.bilibili.com)

未登录时页面只留「登录 B 站」，走 B 站自己的登录，不会出现推荐。

改过代码后，在扩展页点刷新，再刷新 B 站页面。扩展列表里应显示 **bilistar**。

## 开发

```bash
npm install
npm test
npm run build
```

`npm run build` 把 `src/content/main.ts` 打成 `extension/content.js`。改源码后需要重新 build，再在 Chrome 里刷新插件。

## 目录

```
extension/     Chrome 未打包目录（manifest + 打包后的 content.js）
src/           内容脚本、接口、页面渲染
tests/         vitest + happy-dom
```

## 说明

- 关注列表、投稿和移动分组都走当前页面的登录态请求，不把 SESSDATA 抄进插件存储。
- 侧栏折叠和拖拽顺序写在页面 `localStorage`，只影响本机显示。
