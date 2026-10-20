import type { Following, Submission } from "../domain/feed.js";
import { ensureUiStyle } from "./style.js";

export type HomeState = {
  followings: Following[];
  submissions: Submission[];
  selectedMid: number | null;
  hasMore: boolean;
  playingBvid: string | null;
};

export type HomeHandlers = {
  onSelect: (mid: number | null) => void;
  onOpenVideo: (bvid: string) => void;
  onPlay: (bvid: string) => void;
  onLoadMore: () => void;
};

export const HOME_COPY = {
  sidebar: "关注",
  all: "全部更新",
  emptyFollows: "还没有关注任何 UP 主",
  emptyVideos: "这些 UP 主还没有投稿",
  article: "专栏",
  collection: "合集",
  course: "课程",
  more: "继续看",
} as const;

export const PLAYER_COPY = {
  empty: "还没有在看的视频",
  openInBilibili: "在 B 站打开",
  collapse: "‹",
  restore: "›",
} as const;

function workLinks(mid: number): Array<{ text: string; href: string }> {
  return [
    {
      text: HOME_COPY.article,
      href: `https://space.bilibili.com/${mid}/article`,
    },
    {
      text: HOME_COPY.collection,
      href: `https://space.bilibili.com/${mid}/lists`,
    },
    {
      text: HOME_COPY.course,
      href: `https://space.bilibili.com/${mid}/cheese`,
    },
  ];
}

type PaneCache = {
  left: boolean;
  mid: boolean;
  pane: HTMLElement | null;
  paneBvid: string | null;
};

// 折叠状态和播放栏缓存都是渲染层的会话内 UI 状态:挂在渲染根节点的 WeakMap 上。
// 同一会话里反复重绘(选人/继续看/播放)保持折叠,并保活正在播放的右栏节点;
// 换根节点(新页面、测试夹具)自动回到展开和空栏,不用手动重置。
const paneCacheMap = new WeakMap<HTMLElement, PaneCache>();

function paneCacheOf(root: HTMLElement): PaneCache {
  let cache = paneCacheMap.get(root);
  if (cache === undefined) {
    cache = { left: false, mid: false, pane: null, paneBvid: null };
    paneCacheMap.set(root, cache);
  }
  return cache;
}

function embedUrl(bvid: string): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1&danmaku=1`;
}

function videoUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${bvid}`;
}

export function renderHome(
  root: HTMLElement,
  state: HomeState,
  handlers: HomeHandlers,
): void {
  root.id = "follows-root";
  root.textContent = "";

  const { followings, submissions, selectedMid, hasMore, playingBvid } = state;
  const cache = paneCacheOf(root);

  ensureUiStyle(root.ownerDocument);

  // 折叠/展开只切换 hidden,不重建 DOM:列表滚动位置天然不动。
  const restoreLeft = document.createElement("button");
  restoreLeft.type = "button";
  restoreLeft.dataset.action = "restore-left";
  restoreLeft.textContent = PLAYER_COPY.restore;
  restoreLeft.setAttribute("aria-label", "展开关注栏");
  restoreLeft.hidden = !cache.left;

  const sidebar = document.createElement("nav");
  sidebar.hidden = cache.left;
  const sideHead = document.createElement("header");
  const heading = document.createElement("h1");
  heading.textContent = HOME_COPY.sidebar;
  const collapseLeft = document.createElement("button");
  collapseLeft.type = "button";
  collapseLeft.dataset.action = "collapse-left";
  collapseLeft.textContent = PLAYER_COPY.collapse;
  collapseLeft.setAttribute("aria-label", "收起关注栏");
  collapseLeft.addEventListener("click", () => {
    cache.left = true;
    sidebar.hidden = true;
    restoreLeft.hidden = false;
  });
  restoreLeft.addEventListener("click", () => {
    cache.left = false;
    sidebar.hidden = false;
    restoreLeft.hidden = true;
  });
  sideHead.appendChild(heading);
  sideHead.appendChild(collapseLeft);
  sidebar.appendChild(sideHead);

  const followsList = document.createElement("ul");
  const allItem = document.createElement("li");
  allItem.textContent = HOME_COPY.all;
  allItem.dataset.follows = "all";
  if (selectedMid === null) {
    allItem.setAttribute("aria-current", "page");
  }
  allItem.addEventListener("click", () => handlers.onSelect(null));
  followsList.appendChild(allItem);

  for (const following of followings) {
    const item = document.createElement("li");
    item.textContent = following.name;
    item.dataset.followsMid = String(following.mid);
    if (selectedMid === following.mid) {
      item.setAttribute("aria-current", "page");
    }
    item.addEventListener("click", () => handlers.onSelect(following.mid));
    followsList.appendChild(item);
  }
  sidebar.appendChild(followsList);
  root.appendChild(sidebar);
  root.appendChild(restoreLeft);

  const restoreMid = document.createElement("button");
  restoreMid.type = "button";
  restoreMid.dataset.action = "restore-mid";
  restoreMid.textContent = PLAYER_COPY.restore;
  restoreMid.setAttribute("aria-label", "展开投稿列表");
  restoreMid.hidden = !cache.mid;

  const main = document.createElement("main");
  main.hidden = cache.mid;

  const mainHead = document.createElement("header");
  const collapseMid = document.createElement("button");
  collapseMid.type = "button";
  collapseMid.dataset.action = "collapse-mid";
  collapseMid.textContent = PLAYER_COPY.collapse;
  collapseMid.setAttribute("aria-label", "收起投稿列表");
  collapseMid.addEventListener("click", () => {
    cache.mid = true;
    main.hidden = true;
    restoreMid.hidden = false;
  });
  restoreMid.addEventListener("click", () => {
    cache.mid = false;
    main.hidden = false;
    restoreMid.hidden = true;
  });
  mainHead.appendChild(collapseMid);
  main.appendChild(mainHead);

  if (selectedMid !== null) {
    const works = document.createElement("nav");
    for (const { text, href } of workLinks(selectedMid)) {
      const link = document.createElement("a");
      link.textContent = text;
      link.href = href;
      works.appendChild(link);
    }
    main.appendChild(works);
  }

  const visible =
    selectedMid === null
      ? submissions
      : submissions.filter(
          (submission) => submission.authorMid === selectedMid,
        );

  if (followings.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = HOME_COPY.emptyFollows;
    main.appendChild(empty);
  } else if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = HOME_COPY.emptyVideos;
    main.appendChild(empty);
  } else {
    const feed = document.createElement("ol");
    for (const submission of visible) {
      const card = document.createElement("li");
      card.dataset.bvid = submission.bvid;

      const title = document.createElement("h2");
      title.textContent = submission.title;
      const author = document.createElement("span");
      author.textContent = submission.authorName;
      const time = document.createElement("time");
      const published = new Date(submission.publishedAt);
      time.dateTime = published.toISOString();
      time.textContent = published.toLocaleString();

      card.appendChild(title);
      card.appendChild(author);
      card.appendChild(time);
      card.addEventListener("click", () => handlers.onPlay(submission.bvid));
      feed.appendChild(card);
    }
    main.appendChild(feed);
  }

  if (hasMore) {
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = HOME_COPY.more;
    more.addEventListener("click", () => handlers.onLoadMore());
    main.appendChild(more);
  }

  root.appendChild(main);
  root.appendChild(restoreMid);

  // 右栏:B 站官方嵌入播放器,没有评论区;
  // 想看评论走「在 B 站打开」进完整播放页。
  // 播放中的视频跨重绘保活:bvid 没变就把缓存的栏节点搬回新树,
  // 同一个 iframe 元素被重新挂载,Chrome 里播放不中断;
  // bvid 变了才重建 iframe(换视频本来就该重开)。
  let playerPane: HTMLElement;
  if (playingBvid === null) {
    cache.pane = null;
    cache.paneBvid = null;
    playerPane = document.createElement("aside");
    const placeholder = document.createElement("p");
    placeholder.textContent = PLAYER_COPY.empty;
    playerPane.appendChild(placeholder);
  } else {
    const cachedPane =
      cache.pane !== null && cache.paneBvid === playingBvid ? cache.pane : null;
    const cachedFrame =
      cachedPane === null ? null : cachedPane.querySelector("iframe");

    let frame: HTMLIFrameElement;
    if (cachedPane !== null && cachedFrame !== null) {
      playerPane = cachedPane;
      frame = cachedFrame;
    } else {
      playerPane = document.createElement("aside");
      frame = document.createElement("iframe");
      frame.src = embedUrl(playingBvid);
      frame.setAttribute("allowfullscreen", "");
      playerPane.appendChild(frame);
    }
    playerPane.dataset.playing = "";

    // iframe 之后的部分按本次状态重建:标题随可见列表变化,链接接到本次 handlers。
    while (frame.nextSibling !== null) {
      frame.nextSibling.remove();
    }

    const playing = submissions.find((item) => item.bvid === playingBvid);
    if (playing !== undefined) {
      const title = document.createElement("h2");
      title.textContent = playing.title;
      playerPane.appendChild(title);
    }

    const open = document.createElement("a");
    open.href = videoUrl(playingBvid);
    open.textContent = PLAYER_COPY.openInBilibili;
    open.addEventListener("click", (event) => {
      event.preventDefault();
      handlers.onOpenVideo(playingBvid);
    });
    playerPane.appendChild(open);

    cache.pane = playerPane;
    cache.paneBvid = playingBvid;
  }
  root.appendChild(playerPane);
}
