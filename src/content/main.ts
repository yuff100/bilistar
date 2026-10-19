// 内容脚本入口:把 route/feed/api/ui 各模块接到真实页面上。
// 安全约定:只使用页面自身会话(credentials: "include")发请求,
// 不读取 SESSDATA,不用 chrome.storage,manifest 也不申请 cookies/storage 权限。

import {
  collapseParts,
  newestFirst,
  onlySubmissions,
  orderFollowings,
  type Following,
  type Submission,
} from "../domain/feed.js";
import {
  classifyUrl,
  decide,
  decideWork,
  videoChrome,
} from "../domain/route.js";
import type { PageClass } from "../domain/types.js";
import {
  followUp,
  getSession,
  getVideoOwner,
  getWorkAuthor,
  listAllSubmissions,
  listFollowings,
  listUpSubmissions,
  readCsrfToken,
} from "../api/client.js";
import { renderHome, type HomeState } from "../ui/home.js";
import { applyWatchPolicy } from "../ui/watch.js";

export type PageEnv = {
  href: string;
  document: Document;
  fetchImpl: typeof fetch;
  cookie: string;
  replace: (url: string) => void;
  reload: () => void;
};

const HOME_URL = "https://www.bilibili.com/";
const PAGE_SIZE = 20;
const COVER_STYLE_ID = "follows-only-cover-style";
const COVER_ID = "follows-only-cover";
const LOGIN_ID = "follows-login";
const ROOT_ID = "follows-root";

/** 请求上限:防止接口异常(total 异常增大)时无限翻页。 */
const FOLLOWINGS_MAX_PAGES = 100;
/** 单次凑满一页时最多再向服务器要多少次,避免坏游标死循环。 */
const SUBMISSION_MAX_FETCHES = 20;

const COVER_CSS = [
  "html.follows-only-covered{background:#fff!important}",
  `html.follows-only-covered body>*:not(#${COVER_ID}):not(#${ROOT_ID}):not(#${LOGIN_ID}){display:none!important}`,
  `#${COVER_ID}{position:fixed;inset:0;z-index:2147483647;background:#fff}`,
].join("");

export type SubmissionCursor = {
  serverOffset: string | null;
  pending: Submission[];
  emitted: string[];
  serverExhausted: boolean;
};

type LoadedSubmissions = { items: Submission[]; cursor: SubmissionCursor };

type EraseWatch = { active: boolean; observer: MutationObserver };

const eraseWatchers = new WeakMap<Document, EraseWatch>();

function shouldConceal(page: PageClass): boolean {
  return page.kind !== "native" && page.kind !== "login";
}

function shouldEraseStock(page: PageClass): boolean {
  if (page.kind === "home" || page.kind === "blocked") {
    return true;
  }
  if (page.kind === "work" && page.work === "space") {
    return true;
  }
  return false;
}

function eraseStockNodes(document: Document): void {
  const body = document.body;
  if (body === null) {
    return;
  }
  for (const child of Array.from(body.children)) {
    if (child.id === COVER_ID || child.id === ROOT_ID || child.id === LOGIN_ID) {
      continue;
    }
    child.remove();
  }
}

function ensureCoverElement(document: Document): void {
  if (document.body === null || document.getElementById(COVER_ID) !== null) {
    return;
  }
  const cover = document.createElement("div");
  cover.id = COVER_ID;
  document.body.appendChild(cover);
}

function watchErase(document: Document): void {
  if (eraseWatchers.has(document) || typeof MutationObserver === "undefined") {
    return;
  }
  const watch: EraseWatch = { active: true, observer: undefined as unknown as MutationObserver };
  watch.observer = new MutationObserver(() => {
    if (!watch.active) {
      return;
    }
    if (!document.documentElement.classList.contains("follows-only-covered")) {
      return;
    }
    eraseStockNodes(document);
    ensureCoverElement(document);
  });
  watch.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  eraseWatchers.set(document, watch);
}

function stopEraseWatch(document: Document): void {
  const watch = eraseWatchers.get(document);
  if (watch === undefined) {
    return;
  }
  watch.active = false;
  watch.observer.disconnect();
  eraseWatchers.delete(document);
}

function conceal(document: Document, erase: boolean): void {
  const root = document.documentElement;
  root.classList.add("follows-only-covered");
  if (document.getElementById(COVER_STYLE_ID) === null) {
    const style = document.createElement("style");
    style.id = COVER_STYLE_ID;
    style.textContent = COVER_CSS;
    (document.head ?? root).appendChild(style);
  }
  if (erase) {
    eraseStockNodes(document);
    watchErase(document);
  }
  ensureCoverElement(document);
}

/** document_start 同步调用:非原生页立刻盖住,且在任何 await 之前。 */
export function prepareDocument(document: Document, href: string): void {
  const page = classifyUrl(href);
  if (!shouldConceal(page)) {
    return;
  }
  conceal(document, shouldEraseStock(page));
}

export function revealDocument(document: Document): void {
  stopEraseWatch(document);
  document.documentElement.classList.remove("follows-only-covered");
  document.getElementById(COVER_STYLE_ID)?.remove();
  document.getElementById(COVER_ID)?.remove();
}

/** 测试之间卸掉遮罩和观察器，避免上一页的接管清掉下一页的夹具。 */
export function resetPageRuntime(document: Document): void {
  stopLateDomWatch(document);
  revealDocument(document);
}

function holdBlank(document: Document): void {
  stopEraseWatch(document);
  const body = document.body;
  if (body !== null) {
    while (body.firstChild !== null) {
      body.removeChild(body.firstChild);
    }
  }
  conceal(document, true);
}

export function hasMoreSubmissions(cursor: SubmissionCursor): boolean {
  return cursor.pending.length > 0 || !cursor.serverExhausted;
}

export async function loadFollowings(
  mid: number,
  fetchImpl: typeof fetch,
): Promise<Following[]> {
  const first = await listFollowings(mid, 1, fetchImpl);
  const items: Following[] = [...first.items];
  const total = first.total;
  let page = 2;
  while (items.length < total && page <= FOLLOWINGS_MAX_PAGES) {
    const next = await listFollowings(mid, page, fetchImpl);
    if (next.items.length === 0) {
      break;
    }
    items.push(...next.items);
    page += 1;
  }
  return items;
}

export async function loadSubmissions(
  mode: { scope: "all" } | { scope: "up"; mid: number },
  cursor: SubmissionCursor | null,
  fetchImpl: typeof fetch,
): Promise<LoadedSubmissions> {
  const pending = [...(cursor?.pending ?? [])];
  const emitted = new Set(cursor?.emitted ?? []);
  const seen = new Set<string>([
    ...emitted,
    ...pending.map((item) => item.bvid),
  ]);
  let serverOffset = cursor?.serverOffset ?? null;
  let serverExhausted = cursor?.serverExhausted ?? false;
  let fetches = 0;

  while (pending.length < PAGE_SIZE && !serverExhausted) {
    if (fetches >= SUBMISSION_MAX_FETCHES) {
      break;
    }
    fetches += 1;
    const requestedOffset = serverOffset;
    const response =
      mode.scope === "all"
        ? await listAllSubmissions(requestedOffset, fetchImpl)
        : await listUpSubmissions(mode.mid, requestedOffset, fetchImpl);

    let added = 0;
    for (const item of onlySubmissions(response.items)) {
      if (item.bvid === "" || seen.has(item.bvid)) {
        continue;
      }
      seen.add(item.bvid);
      pending.push(item);
      added += 1;
    }

    const nextOffset = response.nextOffset;
    if (nextOffset === null || response.items.length === 0) {
      serverExhausted = true;
    } else if (added === 0 && nextOffset === requestedOffset) {
      serverExhausted = true;
    } else {
      serverOffset = nextOffset;
    }
  }

  const ordered = newestFirst(pending);
  const items = ordered.slice(0, PAGE_SIZE);
  const rest = ordered.slice(PAGE_SIZE);
  for (const item of items) {
    emitted.add(item.bvid);
  }

  return {
    items,
    cursor: {
      serverOffset,
      pending: rest,
      emitted: [...emitted],
      serverExhausted,
    },
  };
}

export async function start(env: PageEnv): Promise<void> {
  const page = classifyUrl(env.href);
  prepareDocument(env.document, env.href);
  stopLateDomWatch(env.document);
  if (page.kind === "login") {
    return;
  }
  try {
    await dispatch(env, page);
  } catch (error) {
    holdBlank(env.document);
    throw error;
  }
}

async function dispatch(env: PageEnv, page: PageClass): Promise<void> {
  const session = await getSession(env.fetchImpl);

  let followings: Following[] = [];
  const followed = new Set<number>();
  let followStateReady = false;
  const ensureFollowState = async (): Promise<void> => {
    if (!session.loggedIn || followStateReady) {
      return;
    }
    followings = await loadFollowings(session.mid, env.fetchImpl);
    for (const following of followings) {
      followed.add(following.mid);
    }
    followStateReady = true;
  };

  // decide 只在 work 分支查询 followed;其余页面不必先拉关注列表。
  if (session.loggedIn && page.kind === "work" && page.mid !== null) {
    await ensureFollowState();
  }
  const decision = decide(page, session, followed);

  switch (decision.type) {
    case "leave-login":
      return;
    case "prompt-login":
      promptLogin(env);
      return;
    case "redirect-home":
      redirectHome(env);
      return;
    case "show-home":
      await ensureFollowState();
      await runHome(env, followings, null);
      return;
    case "show-up":
      await ensureFollowState();
      await runHome(env, followings, decision.mid);
      return;
    case "native-stripped":
    case "work-stripped":
      applyWatch(env, "native", []);
      revealDocument(env.document);
      return;
    case "resolve-work": {
      const author = await getWorkAuthor(
        decision.work,
        decision.id,
        env.fetchImpl,
      );
      await ensureFollowState();
      const outcome = decideWork(followed.has(author.mid));
      if (outcome === "work-stripped") {
        applyWatch(env, "native", []);
        revealDocument(env.document);
        return;
      }
      redirectHome(env);
      return;
    }
    case "video":
      await ensureFollowState();
      await runVideo(env, followed, decision.id);
      return;
  }
}

function clearBody(document: Document): void {
  const body = document.body;
  if (body === null) {
    return;
  }
  while (body.firstChild !== null) {
    body.removeChild(body.firstChild);
  }
}

function promptLogin(env: PageEnv): void {
  clearBody(env.document);
  const box = env.document.createElement("div");
  box.id = LOGIN_ID;
  const link = env.document.createElement("a");
  link.href = "https://passport.bilibili.com/login";
  link.textContent = "登录 B 站";
  box.appendChild(link);
  env.document.body.appendChild(box);
  revealDocument(env.document);
}

function redirectHome(env: PageEnv): void {
  holdBlank(env.document);
  env.replace(HOME_URL);
}

function navigate(env: PageEnv, url: string): void {
  const location = env.document.location as Location | null;
  if (location === null) {
    return;
  }
  location.href = url;
}

type FeedSlot = {
  items: Submission[];
  cursor: SubmissionCursor;
};

async function loadFeedSlot(
  env: PageEnv,
  mode: { scope: "all" } | { scope: "up"; mid: number },
): Promise<FeedSlot> {
  const page = await loadSubmissions(mode, null, env.fetchImpl);
  return { items: page.items, cursor: page.cursor };
}

async function runHome(
  env: PageEnv,
  followings: Following[],
  selectedMid: number | null,
): Promise<void> {
  clearBody(env.document);
  const root = env.document.createElement("div");
  root.id = ROOT_ID;
  env.document.body.appendChild(root);

  const upSlots = new Map<number, FeedSlot>();
  const allPromise = loadFeedSlot(env, { scope: "all" });
  const upPromise =
    selectedMid === null
      ? null
      : loadFeedSlot(env, { scope: "up", mid: selectedMid });
  const allSlot = await allPromise;
  if (selectedMid !== null && upPromise !== null) {
    upSlots.set(selectedMid, await upPromise);
  }

  let currentMid = selectedMid;
  let loadingMore = false;
  let selectionToken = 0;

  // 侧栏顺序只用已经拿到的「全部更新」页,再加上当前选中 UP 的已加载投稿。
  // 这样点进某个人时不会把他挤到最后,也不会为了排序把动态翻完。
  // 某一页被一个 UP 占满时,没出现在已加载页里的人仍按关注列表原顺序排在后面。
  function rankingSubmissions(): Submission[] {
    const selected =
      currentMid === null ? [] : (upSlots.get(currentMid)?.items ?? []);
    return [...allSlot.items, ...selected];
  }

  function currentSlot(): FeedSlot | null {
    if (currentMid === null) {
      return allSlot;
    }
    return upSlots.get(currentMid) ?? null;
  }

  async function loadMore(): Promise<void> {
    if (loadingMore) {
      return;
    }
    const mid = currentMid;
    const slot = currentSlot();
    if (slot === null || !hasMoreSubmissions(slot.cursor)) {
      return;
    }
    loadingMore = true;
    try {
      const mode =
        mid === null
          ? ({ scope: "all" } as const)
          : ({ scope: "up", mid } as const);
      const page = await loadSubmissions(mode, slot.cursor, env.fetchImpl);
      if (mid !== currentMid) {
        return;
      }
      slot.items = newestFirst(collapseParts([...slot.items, ...page.items]));
      slot.cursor = page.cursor;
      render();
    } finally {
      loadingMore = false;
    }
  }

  function render(): void {
    const slot = currentSlot();
    const state: HomeState = {
      followings: orderFollowings(followings, rankingSubmissions()),
      submissions: slot?.items ?? [],
      selectedMid: currentMid,
      hasMore: slot !== null && hasMoreSubmissions(slot.cursor),
    };
    renderHome(root, state, {
      onSelect(mid: number | null): void {
        currentMid = mid;
        const token = ++selectionToken;
        if (mid === null || upSlots.has(mid)) {
          render();
          return;
        }
        render();
        void (async () => {
          try {
            const loaded = await loadFeedSlot(env, { scope: "up", mid });
            if (token !== selectionToken) {
              return;
            }
            upSlots.set(mid, loaded);
            render();
          } catch {
            // 选人失败时留在插件自己的页面里,不恢复 B 站原页面。
          }
        })();
      },
      onOpenVideo(bvid: string): void {
        navigate(env, `https://www.bilibili.com/video/${bvid}`);
      },
      onLoadMore(): void {
        void loadMore();
      },
    });
  }

  render();
  revealDocument(env.document);
}

async function runVideo(
  env: PageEnv,
  followed: ReadonlySet<number>,
  videoId: string,
): Promise<void> {
  const owner = await getVideoOwner(videoId, env.fetchImpl);
  const authorFollowed = followed.has(owner.mid);
  const mode = videoChrome(authorFollowed);

  let submissions: Submission[] = [];
  if (mode === "followed") {
    const page = await loadSubmissions(
      { scope: "up", mid: owner.mid },
      null,
      env.fetchImpl,
    );
    const currentIds = new Set(
      [videoId, owner.bvid].filter((id) => id !== ""),
    );
    submissions = page.items.filter((item) => !currentIds.has(item.bvid));
  }
  applyWatch(env, mode, submissions);
  revealDocument(env.document);

  if (mode === "unfollowed") {
    wireFollowButton(env, owner.mid);
  }
}

function wireFollowButton(env: PageEnv, ownerMid: number): void {
  const button = env.document.querySelector('button[data-action="follow"]');
  if (button === null) {
    return;
  }
  button.addEventListener("click", (): void => {
    void followOwnerFromPage(env, ownerMid, button);
  });
}

async function followOwnerFromPage(
  env: PageEnv,
  ownerMid: number,
  button: Element,
): Promise<void> {
  const csrf = readCsrfToken(env.cookie);
  const result =
    csrf === null ? { ok: false } : await followUp(ownerMid, csrf, env.fetchImpl);
  if (!result.ok) {
    showFollowError(env.document, button);
    return;
  }
  env.reload();
}

function showFollowError(document: Document, button: Element): void {
  let error = document.querySelector('[data-role="follow-error"]');
  if (error === null) {
    const parent = button.parentNode;
    if (parent === null) {
      return;
    }
    error = document.createElement("span");
    error.setAttribute("data-role", "follow-error");
    parent.insertBefore(error, button.nextSibling);
  }
  error.textContent = "没有关注上，请再试一次";
}

type WatchMode = "followed" | "unfollowed" | "native";

const lateDomWatchers = new WeakMap<Document, MutationObserver>();

function stopLateDomWatch(document: Document): void {
  const previous = lateDomWatchers.get(document);
  if (previous !== undefined) {
    previous.disconnect();
    lateDomWatchers.delete(document);
  }
}

function applyWatch(
  env: PageEnv,
  mode: WatchMode,
  submissions: Submission[],
): void {
  const apply = (): void => {
    applyWatchPolicy(env.document, mode, submissions);
  };
  apply();
  watchAndReapply(env, apply);
}

function watchAndReapply(env: PageEnv, apply: () => void): void {
  stopLateDomWatch(env.document);
  if (typeof MutationObserver === "undefined") {
    return;
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    // applyWatchPolicy 幂等:对我们自己注入的节点产生的变动,
    // 每个微任务轮次只重跑一遍,节点齐全后就不再产生新变动,不会死循环。
    if (scheduled) {
      return;
    }
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      try {
        apply();
      } catch {
        // 文档卸载中途的查询可能失败,忽略这次重试,下一个变动会再触发。
      }
    });
  });
  observer.observe(env.document.documentElement, {
    childList: true,
    subtree: true,
  });
  lateDomWatchers.set(env.document, observer);
}

// ---- 浏览器自启动(vitest 的 happy-dom 环境下有 happyDOM 标记,不会执行)----

function inTestHarness(): boolean {
  const frame = window as unknown as { happyDOM?: unknown };
  return frame.happyDOM !== undefined;
}

function browserEnv(): PageEnv {
  return {
    href: window.location.href,
    document: window.document,
    fetchImpl: window.fetch.bind(window),
    cookie: window.document.cookie,
    replace(url: string): void {
      window.location.replace(url);
    },
    reload(): void {
      window.location.reload();
    },
  };
}

function boot(): void {
  const env = browserEnv();
  prepareDocument(env.document, env.href);
  void start(env).catch(() => {
    if (classifyUrl(env.href).kind !== "login") {
      holdBlank(env.document);
    }
  });
}

if (!inTestHarness()) {
  boot();
}
