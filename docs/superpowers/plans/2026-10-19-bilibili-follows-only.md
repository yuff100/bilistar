# 只看关注的 B 站插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个只在 Chrome 里运行的 B 站插件，打开后只看已关注 UP 的投稿，推荐和规定要挡住的页面都进不去。

**Architecture:** Manifest V3 内容脚本在 `document_start` 注入。纯函数先把网址和登录状态判成一个动作，再要么换成插件自己的首页，要么改 B 站播放页的 DOM。请求从内容脚本发出，带上页面自己的登录态；插件不读、不存 `SESSDATA`。

**Tech Stack:** Chrome Manifest V3、TypeScript、Vitest、happy-dom。无 UI 框架，无服务端。

**Spec:** `docs/superpowers/specs/2026-10-19-bilibili-follows-only-design.md`

## Global Constraints

- 第一版只支持 Chrome。
- 界面文案用简体中文。
- 插件不提供用户名密码输入，不保存密码，也不把 Cookie 复制到插件自己的存储里。
- 只访问当前浏览器里这个用户自己的 B 站登录状态。
- 关掉插件后，B 站恢复原来的样子。内容脚本只在当次页面里改 DOM，不改 B 站源站文件。
- 「全部更新」和某位 UP 的投稿列表里只有投稿视频。直播和图文动态不出现。专栏、合集、课程不混进这两条时间线。
- 插件显示名是 `只看关注`。空关注文案是 `还没有关注任何 UP 主`。空投稿文案是 `这些 UP 主还没有投稿`。关注失败文案是 `没有关注上，请再试一次`。
- 关注列表每页 50 人。投稿列表每次 20 条。

## Review Focus

- 未登录打开 `https://www.bilibili.com/` 时，页面上不能出现推荐视频，也不能出现密码框，只能去 B 站登录页。
- 视频播完时，`.bpx-player-ending-wrap` 里的相关推荐要被拿掉，并且不自动播放下一条推荐。
- 收藏页可以留下列表，但 `#biliMainHeader` 里通往排行榜的链接不能留在页面上。
- 未关注 UP 的 `https://space.bilibili.com/999` 不能列出他的投稿，要回到首页。
- `https://www.bilibili.com/read/cv1` 这种网址里没有 mid。作者已关注时要显示正文，未关注时要回家，不能因为解析不到作者就一律挡掉或一律放行。

---

### Task 1: 网址判定

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/domain/types.ts`
- Create: `src/domain/route.ts`
- Test: `tests/domain/route.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type Session = { loggedIn: false } | { loggedIn: true; mid: number }`
  - `type PageClass = { kind: "home" } | { kind: "login" } | { kind: "video"; id: string } | { kind: "native"; page: "favorites" | "history" | "watchlater" } | { kind: "work"; work: "article" | "collection" | "course" | "space"; mid: number | null; id: string } | { kind: "blocked" }`
  - `type Decision = { type: "show-home" } | { type: "show-up"; mid: number } | { type: "leave-login" } | { type: "prompt-login" } | { type: "video"; id: string } | { type: "native-stripped"; page: "favorites" | "history" | "watchlater" } | { type: "work-stripped" } | { type: "resolve-work"; work: "article" | "collection" | "course"; id: string } | { type: "redirect-home" }`
  - `classifyUrl(href: string): PageClass`
  - `decide(page: PageClass, session: Session, followed: ReadonlySet<number>): Decision`
  - `decideWork(authorFollowed: boolean): "work-stripped" | "redirect-home"`
  - `videoChrome(authorFollowed: boolean): "followed" | "unfollowed"`

- [ ] **Step 1: Write the failing test**

`tests/domain/route.test.ts` 用下面这张表断言 `classifyUrl` 与 `decide`。已登录会话是 `{ loggedIn: true, mid: 1 }`，关注集合是 `new Set([2])`。未登录会话是 `{ loggedIn: false }`。

| href | classifyUrl | 已登录 decide | 未登录 decide |
|---|---|---|---|
| `https://www.bilibili.com/` | `home` | `show-home` | `prompt-login` |
| `https://www.bilibili.com/index.html` | `home` | `show-home` | `prompt-login` |
| `https://passport.bilibili.com/login` | `login` | `leave-login` | `leave-login` |
| `https://www.bilibili.com/video/BV1xx` | `video` id `BV1xx` | `video` id `BV1xx` | `prompt-login` |
| `https://www.bilibili.com/video/av42/` | `video` id `av42` | `video` | `prompt-login` |
| `https://space.bilibili.com/1/favlist` | `native` `favorites` | `native-stripped` | `prompt-login` |
| `https://www.bilibili.com/history` | `native` `history` | `native-stripped` | `prompt-login` |
| `https://www.bilibili.com/watchlater` | `native` `watchlater` | `native-stripped` | `prompt-login` |
| `https://www.bilibili.com/v/popular/rank/all` | `blocked` | `redirect-home` | `prompt-login` |
| `https://search.bilibili.com/all?keyword=a` | `blocked` | `redirect-home` | `prompt-login` |
| `https://live.bilibili.com/1` | `blocked` | `redirect-home` | `prompt-login` |
| `https://t.bilibili.com/` | `blocked` | `redirect-home` | `prompt-login` |
| `https://www.bilibili.com/v/popular/all` | `blocked` | `redirect-home` | `prompt-login` |
| `https://www.bilibili.com/anime` | `blocked` | `redirect-home` | `prompt-login` |
| `https://message.bilibili.com/` | `blocked` | `redirect-home` | `prompt-login` |
| `https://member.bilibili.com/platform/home` | `blocked` | `redirect-home` | `prompt-login` |
| `https://account.bilibili.com/account/home` | `blocked` | `redirect-home` | `prompt-login` |
| `https://space.bilibili.com/2` | `work` `space` mid `2` | `show-up` mid `2` | `prompt-login` |
| `https://space.bilibili.com/2/video` | `work` `space` mid `2` | `show-up` mid `2` | `prompt-login` |
| `https://space.bilibili.com/999` | `work` `space` mid `999` | `redirect-home` | `prompt-login` |
| `https://space.bilibili.com/2/article` | `work` `article` mid `2` | `work-stripped` | `prompt-login` |
| `https://space.bilibili.com/2/lists/5` | `work` `collection` mid `2` | `work-stripped` | `prompt-login` |
| `https://space.bilibili.com/999/cheese` | `work` `course` mid `999` | `redirect-home` | `prompt-login` |
| `https://www.bilibili.com/read/cv1` | `work` `article` mid `null` id `cv1` | `resolve-work` | `prompt-login` |

另外断言：`decideWork(true)` 是 `"work-stripped"`，`decideWork(false)` 是 `"redirect-home"`，`videoChrome(true)` 是 `"followed"`，`videoChrome(false)` 是 `"unfollowed"`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/route.test.ts`
Expected: FAIL，`classifyUrl` 未定义

- [ ] **Step 3: Implement the files**

`package.json` 的 `test` 脚本是 `vitest run`。`vitest.config.ts` 使用 `happy-dom`。`tsconfig.json` 打开 `strict`。`.gitignore` 忽略 `node_modules/`、`dist/`、`.superpowers/`。

`classifyUrl` 只看主机名和路径，忽略查询串。上表没列出的 `bilibili.com` 地址判成 `blocked`。`decide` 在 `session.loggedIn === false` 且页面不是 `login` 时返回 `prompt-login`。`login` 永远 `leave-login`。`work.kind` 为 `space` 且 mid 已关注时返回 `show-up`，不返回 `work-stripped`。`article`、`collection`、`course` 且 mid 已关注时才返回 `work-stripped`。`work.mid === null` 且已登录时返回 `resolve-work`，不猜作者是否已关注。`space` 的 mid 不会是 `null`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/domain/types.ts src/domain/route.ts tests/domain/route.test.ts
git commit -m "feat: classify bilibili urls into plugin actions"
```

---

### Task 2: 投稿列表的筛选和排序

**Files:**
- Create: `src/domain/feed.ts`
- Test: `tests/domain/feed.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type Submission = { bvid: string; title: string; authorMid: number; authorName: string; publishedAt: number }`
  - `type Following = { mid: number; name: string }`
  - `type RawDynamic = { id: string; majorType: string; bvid?: string; title?: string; authorMid: number; authorName: string; publishedAt: number }`
  - `onlySubmissions(items: RawDynamic[]): Submission[]`
  - `collapseParts(items: Submission[]): Submission[]`
  - `newestFirst(items: Submission[]): Submission[]`
  - `orderFollowings(followings: Following[], submissions: Submission[]): Following[]`

- [ ] **Step 1: Write the failing test**

断言：

- `majorType` 为 `archive` 的条目留下；`live` 和 `opus` 丢掉。留下的条目带上 `bvid`、`title`、`authorMid`、`authorName`、`publishedAt`。
- 同一个 `bvid` 出现两次时，`collapseParts` 只留一条。
- `publishedAt` 为 `300`、`100`、`200` 的三条，`newestFirst` 的顺序是 `300`、`200`、`100`。
- 关注顺序是 mid `1`、`2`、`3`。投稿里 mid `3` 的 `publishedAt` 是 `500`，mid `1` 是 `100`，mid `2` 没有投稿。`orderFollowings` 的顺序是 `3`、`1`、`2`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/feed.test.ts`
Expected: FAIL，`onlySubmissions` 未定义

- [ ] **Step 3: Implement `onlySubmissions`, `collapseParts`, `newestFirst`, and `orderFollowings` in `src/domain/feed.ts`**

没有投稿的人保持原关注列表里的相对顺序，排在有投稿的人后面。不要按名字分组，也不要单独分出特别关注。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/feed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/feed.ts tests/domain/feed.test.ts
git commit -m "feat: keep submission videos in newest-first order"
```

---

### Task 3: 登录态和 B 站请求

**Files:**
- Create: `src/api/client.ts`
- Test: `tests/api/client.test.ts`

**Interfaces:**
- Consumes: `Session` from `src/domain/types.ts`; `Submission`, `Following`, `RawDynamic` from `src/domain/feed.ts`
- Produces:
  - `readCsrfToken(cookie: string): string | null`
  - `parseSession(body: unknown): Session`
  - `parseFollowings(body: unknown): { items: Following[]; total: number }`
  - `parseDynamics(body: unknown): { items: RawDynamic[]; nextOffset: string | null }`
  - `parseViewOwner(body: unknown): { mid: number; name: string }`
  - `parseWorkAuthor(body: unknown): { mid: number }`
  - `getSession(fetchImpl: typeof fetch): Promise<Session>`
  - `listFollowings(mid: number, page: number, fetchImpl: typeof fetch): Promise<{ items: Following[]; total: number }>`
  - `listAllSubmissions(offset: string | null, fetchImpl: typeof fetch): Promise<{ items: RawDynamic[]; nextOffset: string | null }>`
  - `listUpSubmissions(mid: number, offset: string | null, fetchImpl: typeof fetch): Promise<{ items: RawDynamic[]; nextOffset: string | null }>`
  - `getVideoOwner(id: string, fetchImpl: typeof fetch): Promise<{ mid: number; name: string }>`
  - `getWorkAuthor(work: "article" | "collection" | "course", id: string, fetchImpl: typeof fetch): Promise<{ mid: number }>`
  - `followUp(mid: number, csrf: string, fetchImpl: typeof fetch): Promise<{ ok: true } | { ok: false }>`

- [ ] **Step 1: Write the failing test**

用假的 `fetch` 断言请求 URL、方法和正文，并断言解析结果：

- `readCsrfToken("SESSDATA=secret; bili_jct=abc")` 返回 `"abc"`。没有 `bili_jct` 时返回 `null`。
- `getSession` 请求 `https://api.bilibili.com/x/web-interface/nav`，`credentials` 为 `"include"`。`data.isLogin === true` 且 `data.mid === 7` 时得到 `{ loggedIn: true, mid: 7 }`。`isLogin === false` 时得到 `{ loggedIn: false }`。
- `listFollowings(7, 1, fetch)` 请求 `https://api.bilibili.com/x/relation/followings?vmid=7&pn=1&ps=50&order=desc`。从 `data.list[].mid` 和 `data.list[].uname` 读出 `Following`。
- `listAllSubmissions(null, fetch)` 请求 `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=video&features=itemOpusStyle&offset=`。`listUpSubmissions(2, "cursor", fetch)` 请求 `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=2&type=video&offset=cursor`。两条都从 `data.items` 读出 `majorType`：`MAJOR_TYPE_ARCHIVE` 记为 `archive`，`MAJOR_TYPE_LIVE_RCMD` 记为 `live`，`MAJOR_TYPE_OPUS` 记为 `opus`。`archive` 的 `bvid`、标题、作者 mid、作者名、`pub_ts` 从 `modules.module_dynamic.major.archive` 和 `modules.module_author` 读取。`data.offset` 成为 `nextOffset`，没有则是 `null`。
- `getVideoOwner("BV1xx", fetch)` 请求 `https://api.bilibili.com/x/web-interface/view?bvid=BV1xx`。`av42` 用 `?aid=42`。作者取 `data.owner.mid` 和 `data.owner.name`。
- `getWorkAuthor("article", "cv1", fetch)` 请求 `https://api.bilibili.com/x/article/viewinfo?id=1`，作者取 `data.mid`。`collection` 请求 `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?season_id=5&page_num=1&page_size=1`，作者取 `data.meta.mid`。`course` 请求 `https://api.bilibili.com/pugv/view/web/season?season_id=9`，作者取 `data.up_info.mid`。
- `followUp(2, "abc", fetch)` 是 `POST https://api.bilibili.com/x/relation/modify`，正文是 `fid=2&act=1&re_src=11&csrf=abc`，`Content-Type` 是 `application/x-www-form-urlencoded`，`credentials` 是 `"include"`。正文里不能出现 `secret`。响应 `code === 0` 时 `{ ok: true }`，否则 `{ ok: false }`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/client.test.ts`
Expected: FAIL，`getSession` 未定义

- [ ] **Step 3: Implement the parsers and request functions in `src/api/client.ts`**

每个请求都传入 `credentials: "include"`。不要读 `SESSDATA`，不要写 `chrome.storage`。`readCsrfToken` 只返回 `bili_jct` 的值。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat: read follows and submissions with the page session"
```

---

### Task 4: 首页

**Files:**
- Create: `src/ui/home.ts`
- Test: `tests/ui/home.test.ts`

**Interfaces:**
- Consumes: `Following`, `Submission` from `src/domain/feed.ts`
- Produces:
  - `type HomeState = { followings: Following[]; submissions: Submission[]; selectedMid: number | null; hasMore: boolean }`
  - `type HomeHandlers = { onSelect: (mid: number | null) => void; onOpenVideo: (bvid: string) => void; onLoadMore: () => void }`
  - `renderHome(root: HTMLElement, state: HomeState, handlers: HomeHandlers): void`
  - `HOME_COPY: { sidebar: "关注"; all: "全部更新"; emptyFollows: "还没有关注任何 UP 主"; emptyVideos: "这些 UP 主还没有投稿"; article: "专栏"; collection: "合集"; course: "课程"; more: "继续看" }`

- [ ] **Step 1: Write the failing test**

在 happy-dom 里调用 `renderHome`。状态里有两位 UP：`{ mid: 2, name: "影视飓风" }` 和 `{ mid: 3, name: "何同学" }`，两条投稿分别属于他们，`publishedAt` 已按从新到旧排好。

断言：

- 有标题文本 `关注`，第一项文本是 `全部更新`，属性 `data-follows="all"`。
- 两位 UP 按传入顺序出现，元素是 `[data-follows-mid="2"]` 和 `[data-follows-mid="3"]`，文本是他们的名字。
- `selectedMid === null` 时两条投稿都在，每条能看到标题、作者名和发布时间的文本。投稿元素是 `[data-bvid]`。页面文本里没有 `专栏`。
- `selectedMid === 2` 时只显示 mid `2` 的投稿，并出现链接文本 `专栏`、`合集`、`课程`，地址分别是 `https://space.bilibili.com/2/article`、`https://space.bilibili.com/2/lists`、`https://space.bilibili.com/2/cheese`。
- 点击 `[data-follows-mid="3"]` 调用 `onSelect(3)`。点击 `[data-follows="all"]` 调用 `onSelect(null)`。点击一条 `[data-bvid="BV1"]` 调用 `onOpenVideo("BV1")`。
- `followings` 为空时，能看到 `还没有关注任何 UP 主`，看不到 `[data-bvid]`。
- `submissions` 为空且已有关注时，能看到 `这些 UP 主还没有投稿`。
- `hasMore === true` 时有按钮 `继续看`，点击调用 `onLoadMore`。`hasMore === false` 时没有这个按钮。
- 页面里没有 `input`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/home.test.ts`
Expected: FAIL，`renderHome` 未定义

- [ ] **Step 3: Implement `renderHome` in `src/ui/home.ts`**

整页只渲染这一个根节点，不渲染 B 站顶栏、搜索框和分区入口。时间显示用 `publishedAt` 的本地日期时间字符串即可。根节点 id 是 `follows-root`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/home.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/home.ts tests/ui/home.test.ts
git commit -m "feat: render the follows-only home page"
```

---

### Task 5: 播放页和允许留下的页面

**Files:**
- Create: `src/ui/watch.ts`
- Test: `tests/ui/watch.test.ts`

**Interfaces:**
- Consumes: `Submission` from `src/domain/feed.ts`; `videoChrome` from `src/domain/route.ts`
- Produces:
  - `REMOVE_SELECTORS: { followed: string[]; unfollowed: string[]; native: string[] }`
  - `applyWatchPolicy(document: Document, mode: "followed" | "unfollowed" | "native", submissions: Submission[]): void`
  - `endingAutoplayAllowed(): false`

`REMOVE_SELECTORS` 的值固定为：

- `followed`: `#biliMainHeader`, `.bili-header`, `#reco_list`, `.rec-footer`, `.recommend-list-container`, `.bpx-player-ending-wrap`, `.bpx-player-ending-related`, `.next-play`
- `unfollowed`: 上面这些，再加上 `#comment`, `#commentapp`, `bili-comments`, `.video-toolbar-left`, `#arc_toolbar_report`
- `native`: `#biliMainHeader`, `.bili-header`

- [ ] **Step 1: Write the failing test**

准备一个文档，里面同时有：`#biliMainHeader`（内部有指向 `/v/popular/rank/all` 的链接）、`video`、`.bpx-player-video-wrap`、`.bpx-player-dm`、`#comment`、`.video-toolbar-left`、`#reco_list`、`.bpx-player-ending-wrap`。

断言：

- `endingAutoplayAllowed()` 是 `false`。
- `applyWatchPolicy(document, "followed", submissions)` 之后：顶栏、`#reco_list`、`.bpx-player-ending-wrap` 不在；`video`、`#comment`、`.video-toolbar-left`、`.bpx-player-dm` 还在。有链接 `a[data-action="back-home"]`，文本是 `返回关注`，`href` 是 `https://www.bilibili.com/`。侧栏 `#follows-up-videos` 里的 `[data-bvid]` 顺序与传入的 `submissions` 相同，文本含标题。
- 然后再把 `.bpx-player-ending-wrap` 加回文档并第二次调用 `applyWatchPolicy`，该节点再次不在。
- `applyWatchPolicy(document, "unfollowed", [])` 之后：`video` 还在；`#comment`、`.video-toolbar-left`、`#reco_list`、顶栏、`#follows-up-videos` 都不在。有 `button[data-action="follow"]`，文本是 `关注`。没有 `返回关注`。
- `applyWatchPolicy(document, "native", [])` 之后：`#biliMainHeader` 不在，因此排行榜链接不在；`video` 和原来的列表节点 `#fav-list` 还在。测试夹具里要放一个 `#fav-list`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/watch.test.ts`
Expected: FAIL，`applyWatchPolicy` 未定义

- [ ] **Step 3: Implement `applyWatchPolicy` in `src/ui/watch.ts`**

按 `REMOVE_SELECTORS[mode]` 删除匹配节点。`followed` 时如果还没有 `a[data-action="back-home"]` 就插入它，并填上该 UP 的其他投稿。`unfollowed` 时如果还没有关注按钮就插入它。不要删除 `.bpx-player-dm` 和 `video`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/watch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/watch.ts tests/ui/watch.test.ts
git commit -m "feat: strip recommendations from bilibili watch pages"
```

---

### Task 6: 把判定接到页面上

**Files:**
- Create: `src/content/main.ts`
- Create: `extension/manifest.json`
- Create: `tests/content/main.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `classifyUrl`, `decide`, `decideWork`, `videoChrome` from `src/domain/route.ts`; `onlySubmissions`, `collapseParts`, `newestFirst`, `orderFollowings`, `Submission`, `Following` from `src/domain/feed.ts`; `getSession`, `listFollowings`, `listAllSubmissions`, `listUpSubmissions`, `getVideoOwner`, `getWorkAuthor`, `followUp`, `readCsrfToken` from `src/api/client.ts`; `renderHome`, `HomeState` from `src/ui/home.ts`; `applyWatchPolicy` from `src/ui/watch.ts`
- Produces:
  - `loadFollowings(mid: number, fetchImpl: typeof fetch): Promise<Following[]>`
  - `loadSubmissions(mode: { scope: "all" } | { scope: "up"; mid: number }, offset: string | null, fetchImpl: typeof fetch): Promise<{ items: Submission[]; nextOffset: string | null }>`
  - `start(env: PageEnv): Promise<void>`
  - `type PageEnv = { href: string; document: Document; fetchImpl: typeof fetch; cookie: string; replace: (url: string) => void }`

- [ ] **Step 1: Write the failing test**

`loadFollowings` 在 `total` 大于 50 时请求第 2 页，并把两页接在一起。`loadSubmissions({ scope: "all" })` 只留下 `archive`，按 `bvid` 合并，按 `publishedAt` 从新到旧排列，并且最多返回 20 条。假响应里放 21 条 `archive` 时，结果长度是 20。

`start` 用假的 `document`、`fetch` 和 `replace`：

- `href` 是 `https://www.bilibili.com/`，`getSession` 的响应是未登录：文档里能看到通往 `https://passport.bilibili.com/login` 的链接，没有 `input`，没有 `[data-bvid]`，`replace` 不被调用。
- 同一网址，会话已登录：文档被换成首页，`#follows-root` 存在，假响应里的 UP 和投稿能看见。
- `href` 是 `https://space.bilibili.com/2`，mid `2` 已关注：不调用 `replace`，页面是首页且只显示这个 UP 的投稿。mid `999` 未关注时 `replace("https://www.bilibili.com/")`。
- `href` 是 `https://www.bilibili.com/v/popular/rank/all` 且已登录：`replace` 被调用为 `https://www.bilibili.com/`。
- `href` 是 `https://www.bilibili.com/video/BV1xx`，视频作者 mid 不在关注集合里：调用结果相当于 `applyWatchPolicy(..., "unfollowed", ...)`，存在 `button[data-action="follow"]`。让这个按钮的点击把 `followUp` 的响应设为 `{ ok: false }` 时，按钮旁边的文本是 `没有关注上，请再试一次`，`#comment` 仍然不在。响应为成功时，再跑一次策略后 `#comment` 可以留在夹具里，并且出现 `返回关注`。
- `href` 是 `https://www.bilibili.com/read/cv1`，`getWorkAuthor` 返回已关注的 mid：不调用 `replace`。返回未关注的 mid：`replace("https://www.bilibili.com/")`。
- `href` 是 `https://www.bilibili.com/history` 且已登录：不调用 `replace`，顶栏选择器对应的节点被去掉。

`extension/manifest.json` 断言：`manifest_version` 是 `3`，`name` 是 `只看关注`，`permissions` 不包含 `cookies`，也没有 `storage`。`content_scripts[0].run_at` 是 `document_start`。`matches` 包含 `https://*.bilibili.com/*` 和 `https://*.bilibili.com/` 所覆盖的站点即可，但列表里不能出现 `b23.tv`。`host_permissions` 只有 `https://*.bilibili.com/*` 和 `https://api.bilibili.com/*`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/main.test.ts`
Expected: FAIL，`start` 未定义

- [ ] **Step 3: Implement `start` in `src/content/main.ts` and add `extension/manifest.json`**

`start` 先 `classifyUrl` 再 `decide`。`prompt-login` 时清空 `document.body`，只放一个到 `https://passport.bilibili.com/login` 的链接，文本是 `登录 B 站`。`redirect-home` 时调用 `replace("https://www.bilibili.com/")`。`show-home` 时清空 body 后 `renderHome`，`selectedMid` 为 `null`。`show-up` 时同样渲染首页，但 `selectedMid` 是该 UP 的 mid。点投稿时把地址设为 `https://www.bilibili.com/video/${bvid}`。`loadSubmissions` 在筛选和排序之后只取前 20 条。`video` 时用 `getVideoOwner` 和 `videoChrome` 决定模式；已关注时用 `listUpSubmissions` 填右侧，未关注时传空列表。关注按钮用 `readCsrfToken(env.cookie)` 调用 `followUp`。`resolve-work` 时用 `getWorkAuthor` 和 `decideWork`。`native-stripped` 和 `work-stripped` 时调用 `applyWatchPolicy(document, "native", [])`。用 `MutationObserver` 在 `document.documentElement` 上再次调用当前这次的 `applyWatchPolicy`，这样后出现的结束画面也会被删掉。`package.json` 增加 `build`，用 `tsc` 把 `src/content/main.ts` 编译到 `dist/content.js`，manifest 的脚本指向这个文件。不要申请 `cookies` 或 `storage` 权限。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/main.ts extension/manifest.json tests/content/main.test.ts package.json
git commit -m "feat: run the follows-only gate on bilibili pages"
```
