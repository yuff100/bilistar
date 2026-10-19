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
};

const HOME_URL = "https://www.bilibili.com/";
const PAGE_SIZE = 20;

/** 请求上限:防止接口异常(total 异常增大)时无限翻页。 */
const FOLLOWINGS_MAX_PAGES = 100;

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

type LoadedSubmissions = { items: Submission[]; nextOffset: string | null };

export async function loadSubmissions(
  mode: { scope: "all" } | { scope: "up"; mid: number },
  offset: string | null,
  fetchImpl: typeof fetch,
): Promise<LoadedSubmissions> {
  const response =
    mode.scope === "all"
      ? await listAllSubmissions(offset, fetchImpl)
      : await listUpSubmissions(mode.mid, offset, fetchImpl);
  const items = newestFirst(
    collapseParts(onlySubmissions(response.items)),
  ).slice(0, PAGE_SIZE);
  return { items, nextOffset: response.nextOffset };
}

export async function start(env: PageEnv): Promise<void> {
  stopLateDomWatch(env.document);

  const page = classifyUrl(env.href);
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
      env.replace(HOME_URL);
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
        return;
      }
      env.replace(HOME_URL);
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
  while (body.firstChild !== null) {
    body.removeChild(body.firstChild);
  }
}

function promptLogin(env: PageEnv): void {
  clearBody(env.document);
  const link = env.document.createElement("a");
  link.href = "https://passport.bilibili.com/login";
  link.textContent = "登录 B 站";
  env.document.body.appendChild(link);
}

function navigate(env: PageEnv, url: string): void {
  const location = env.document.location as Location | null;
  if (location === null) {
    return;
  }
  location.href = url;
}

async function runHome(
  env: PageEnv,
  followings: Following[],
  selectedMid: number | null,
): Promise<void> {
  clearBody(env.document);
  const root = env.document.createElement("div");
  env.document.body.appendChild(root);

  let submissions: Submission[] = [];
  let nextOffset: string | null = null;
  let loadingMore = false;

  const firstPage = await loadSubmissions(
    { scope: "all" },
    null,
    env.fetchImpl,
  );
  submissions = firstPage.items;
  nextOffset = firstPage.nextOffset;

  async function loadMore(): Promise<void> {
    if (loadingMore || nextOffset === null) {
      return;
    }
    loadingMore = true;
    try {
      const page = await loadSubmissions(
        { scope: "all" },
        nextOffset,
        env.fetchImpl,
      );
      submissions = newestFirst(collapseParts([...submissions, ...page.items]));
      nextOffset = page.nextOffset;
      render();
    } finally {
      loadingMore = false;
    }
  }

  function render(): void {
    const state: HomeState = {
      followings: orderFollowings(followings, submissions),
      submissions,
      selectedMid,
      hasMore: nextOffset !== null,
    };
    renderHome(root, state, {
      onSelect(mid: number | null): void {
        selectedMid = mid;
        render();
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
    submissions = page.items;
  }
  applyWatch(env, mode, submissions);

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
  env.document.querySelector('[data-role="follow-error"]')?.remove();
  button.remove();
  const page = await loadSubmissions(
    { scope: "up", mid: ownerMid },
    null,
    env.fetchImpl,
  );
  applyWatch(env, "followed", page.items);
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

function boot(): void {
  void start({
    href: window.location.href,
    document: window.document,
    fetchImpl: window.fetch.bind(window),
    cookie: window.document.cookie,
    replace(url: string): void {
      window.location.replace(url);
    },
  });
}

if (!inTestHarness()) {
  if (window.document.readyState === "loading") {
    window.document.addEventListener(
      "DOMContentLoaded",
      () => {
        boot();
      },
      { once: true },
    );
  } else {
    boot();
  }
}