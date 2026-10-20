import type { Following, Submission } from "../domain/feed.js";
import { ensureUiStyle } from "./style.js";

/** 原生关注分组:服务器端的自定义分组(tagid>0),mids 是该组的全部成员,
 *  可能包含没有关注的人——侧栏渲染时再和关注列表求交集。 */
export type NativeGroup = {
  tagid: number;
  name: string;
  mids: number[];
};

/** 侧栏选中状态:全部 / 单个 UP / 一个分组(含「未分组」,tagid 为 null)。 */
export type HomeSelection =
  | { kind: "all" }
  | { kind: "up"; mid: number }
  | { kind: "group"; tagid: number | null; mids: number[] };

export type HomeState = {
  followings: Following[];
  groups: NativeGroup[];
  submissions: Submission[];
  selection: HomeSelection;
  hasMore: boolean;
  playingBvid: string | null;
  /** 最近一次移动分组失败的那个 UP;由 main.ts 维护,渲染层只负责展示。 */
  moveErrorMid: number | null;
};

export type HomeHandlers = {
  onSelect: (selection: HomeSelection) => void;
  /** 把 UP 移入分组(tagid 为 null 表示移出所有自定义分组);返回是否成功。 */
  onMoveGroup: (mid: number, tagid: number | null) => Promise<boolean>;
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

// ---- 侧栏原生分组 ----
// 分组来自 B 站服务器(关注分组),本地不再存标签;移动分组走原生接口。
// 「正在给哪一行开分组选择浮层」是会话内的渲染层状态,挂在根节点 WeakMap 上
// (和 PaneCache 同理),重绘保留、换根节点(新页面/测试夹具)自动消失,不落盘。
//
// 新增 data-* 约定:
//   li[data-group-id="<tagid>"]   自定义分组头;「未分组」头的值为空串;
//                                 点击组头=按该组成员过滤中栏投稿
//   button[data-group-edit="<mid>"] 行内「移动分组」入口(悬停/聚焦才可见;字形由 CSS
//                                 ::after 提供,按钮本身没有文本,行的 textContent 仍是 UP 名)
//   div[data-group-picker="<mid>"] 分组选择浮层(选项列已有的自定义分组 + 「未分组」;
//                                 不提供建组入口,建组去 B 站)
//   button[data-group-option="<tagid>"] 浮层里的组选项;「未分组」的值为空串;
//                                 当前所在组带 aria-current="true"
//   span[data-group-error]        移动失败的提示文本
export const GROUP_COPY = {
  ungrouped: "未分组",
  editLabel: "移动分组",
  moveFailed: "移动失败，请重试",
} as const;

type GroupPickerCache = {
  openMid: number | null;
};

const groupPickerMap = new WeakMap<HTMLElement, GroupPickerCache>();

function groupPickerCacheOf(root: HTMLElement): GroupPickerCache {
  let cache = groupPickerMap.get(root);
  if (cache === undefined) {
    cache = { openMid: null };
    groupPickerMap.set(root, cache);
  }
  return cache;
}

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
  return `https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=${bvid}&danmaku=1&autoplay=1`;
}

// ---- H5 播放器控制条常显 ----
// html5mobileplayer 在我们的窄栏里会误判为移动场景,给 .mplayer-display 挂上
// .mplayer-control-bar-hide 后控制条/顶栏就再不出现。嵌入页与主站同源,
// 可以直接往 iframe.contentDocument 注入一段 !important 覆盖样式强制常显。
// 样式元素随 iframe 文档存续,跨重绘保活(同一个 iframe 被重新挂载)不需要重注;
// 换 bvid 重建 iframe 或 iframe 重新 load 时再补一次。
export const PLAYER_CHROME_STYLE_ID = "follows-only-player-chrome";

const PLAYER_CHROME_CSS = [
  ".mplayer .mplayer-control-bar-hide .mplayer-control-bar,",
  ".mplayer .mplayer-control-bar-hide .mplayer-right,",
  ".mplayer-display.mplayer-control-bar-hide .mplayer-top {",
  "opacity: 1 !important;",
  "transform: none !important;",
  "visibility: visible !important;",
  "}",
].join("");

function injectPlayerChromeStyle(frame: HTMLIFrameElement): void {
  try {
    const doc = frame.contentDocument;
    if (doc === null) {
      return;
    }
    if (doc.getElementById(PLAYER_CHROME_STYLE_ID) !== null) {
      return;
    }
    const style = doc.createElement("style");
    style.id = PLAYER_CHROME_STYLE_ID;
    style.textContent = PLAYER_CHROME_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  } catch {
    // 跨域或文档尚未就绪时 contentDocument 会抛错/为 null,静默放弃;
    // load 事件里会再试一次。
  }
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

  const {
    followings,
    groups,
    submissions,
    selection,
    hasMore,
    playingBvid,
    moveErrorMid,
  } = state;
  const cache = paneCacheOf(root);
  const picker = groupPickerCacheOf(root);

  ensureUiStyle(root.ownerDocument);

  // 开/关分组浮层、移动分组成功与否都由外层重绘收尾,
  // 这里只重放同一份 state;两栏滚动位置是用户正在看的内容,重绘前后手动保持。
  const rerender = (): void => {
    const navBefore = root.querySelector("nav");
    const mainBefore = root.querySelector("main");
    const navTop = navBefore instanceof HTMLElement ? navBefore.scrollTop : 0;
    const mainTop = mainBefore instanceof HTMLElement ? mainBefore.scrollTop : 0;
    renderHome(root, state, handlers);
    const navAfter = root.querySelector("nav");
    const mainAfter = root.querySelector("main");
    if (navAfter instanceof HTMLElement) {
      navAfter.scrollTop = navTop;
    }
    if (mainAfter instanceof HTMLElement) {
      mainAfter.scrollTop = mainTop;
    }
  };

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
  if (selection.kind === "all") {
    allItem.setAttribute("aria-current", "page");
  }
  allItem.addEventListener("click", () =>
    handlers.onSelect({ kind: "all" }),
  );
  followsList.appendChild(allItem);

  // 侧栏分组:自定义组按接口顺序排,组内只列已关注的成员
  // (组里没有关注任何人就整组隐藏);没进任何自定义组的关注进「未分组」垫底。
  // 一个自定义组都用不上时保持旧版扁平列表,不画组头。
  const groupMidSets = groups.map((group) => new Set(group.mids));
  const memberFollowings = (index: number): Following[] =>
    followings.filter((following) => groupMidSets[index]!.has(following.mid));
  const inAnyGroup = (mid: number): boolean =>
    groupMidSets.some((mids) => mids.has(mid));
  const visibleGroups = groups
    .map((group, index) => ({ group, members: memberFollowings(index) }))
    .filter((section) => section.members.length > 0);

  const appendGroupHeader = (
    tagid: number | null,
    text: string,
    mids: number[],
  ): void => {
    const header = document.createElement("li");
    header.dataset.groupId = tagid === null ? "" : String(tagid);
    header.textContent = text;
    if (selection.kind === "group" && selection.tagid === tagid) {
      header.setAttribute("aria-current", "page");
    }
    header.addEventListener("click", () =>
      handlers.onSelect({ kind: "group", tagid, mids }),
    );
    followsList.appendChild(header);
  };

  const groupOption = (
    tagid: number | null,
    text: string,
    mid: number,
    current: boolean,
  ): HTMLButtonElement => {
    const option = document.createElement("button");
    option.type = "button";
    option.dataset.groupOption = tagid === null ? "" : String(tagid);
    option.textContent = text;
    if (current) {
      option.setAttribute("aria-current", "true");
    }
    option.addEventListener("click", (event) => {
      // 行点击是选人,浮层里的选项不能冒泡触发选人。
      event.stopPropagation();
      // 选中即关浮层;成败由 onMoveGroup 结算后外层重绘收尾——
      // 失败时分组保持原样,只在那一行挂出失败提示,不做假成功。
      picker.openMid = null;
      void handlers.onMoveGroup(mid, tagid);
      rerender();
    });
    return option;
  };

  const appendFollowing = (
    following: Following,
    showPicker: boolean,
  ): void => {
    const item = document.createElement("li");
    item.dataset.followsMid = String(following.mid);
    if (selection.kind === "up" && selection.mid === following.mid) {
      item.setAttribute("aria-current", "page");
    }

    const name = document.createElement("span");
    name.textContent = following.name;
    item.appendChild(name);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.groupEdit = String(following.mid);
    edit.setAttribute("aria-label", GROUP_COPY.editLabel);
    edit.addEventListener("click", (event) => {
      // 行点击是选人,移动分组入口不能冒泡触发选人。
      event.stopPropagation();
      picker.openMid = picker.openMid === following.mid ? null : following.mid;
      rerender();
    });
    item.appendChild(edit);

    if (showPicker) {
      const popover = document.createElement("div");
      popover.dataset.groupPicker = String(following.mid);
      // 浮层列出所有自定义分组(含组内没有关注成员的)+「未分组」;
      // 不提供新建分组入口,建组去 B 站。
      for (const group of groups) {
        popover.appendChild(
          groupOption(
            group.tagid,
            group.name,
            following.mid,
            group.mids.includes(following.mid),
          ),
        );
      }
      popover.appendChild(
        groupOption(
          null,
          GROUP_COPY.ungrouped,
          following.mid,
          !groups.some((group) => group.mids.includes(following.mid)),
        ),
      );
      item.appendChild(popover);
    }

    if (moveErrorMid === following.mid && picker.openMid !== following.mid) {
      const error = document.createElement("span");
      error.dataset.groupError = "";
      error.textContent = GROUP_COPY.moveFailed;
      item.appendChild(error);
    }

    item.addEventListener("click", () =>
      handlers.onSelect({ kind: "up", mid: following.mid }),
    );
    followsList.appendChild(item);
  };

  let pickerAttached = false;
  const appendFollowingOncePicker = (following: Following): void => {
    const showPicker =
      picker.openMid === following.mid && !pickerAttached;
    if (showPicker) {
      pickerAttached = true;
    }
    appendFollowing(following, showPicker);
  };

  if (visibleGroups.length === 0) {
    for (const following of followings) {
      appendFollowingOncePicker(following);
    }
  } else {
    for (const { group, members } of visibleGroups) {
      appendGroupHeader(group.tagid, group.name, members.map((f) => f.mid));
      for (const following of members) {
        appendFollowingOncePicker(following);
      }
    }
    const ungrouped = followings.filter(
      (following) => !inAnyGroup(following.mid),
    );
    if (ungrouped.length > 0) {
      appendGroupHeader(
        null,
        GROUP_COPY.ungrouped,
        ungrouped.map((f) => f.mid),
      );
      for (const following of ungrouped) {
        appendFollowingOncePicker(following);
      }
    }
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

  if (selection.kind === "up") {
    const works = document.createElement("nav");
    for (const { text, href } of workLinks(selection.mid)) {
      const link = document.createElement("a");
      link.textContent = text;
      link.href = href;
      works.appendChild(link);
    }
    main.appendChild(works);
  }

  // 分组视图的投稿已由外层筛好并截页,这里只对「单选 UP」再按 mid 过滤一道。
  const visible =
    selection.kind === "up"
      ? submissions.filter(
          (submission) => submission.authorMid === selection.mid,
        )
      : submissions;

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
      // load 时补注入:iframe 文档就绪后样式才挂得上(同一元素跨重绘保活,
      // 监听器随元素存续,后续 src 变化导致的重新 load 也会再覆盖一次)。
      frame.addEventListener("load", () => {
        injectPlayerChromeStyle(frame);
      });
      playerPane.appendChild(frame);
    }
    // 立刻注入一次:文档已就绪(缓存 pane 复用)时当场生效;未就绪则等 load。
    injectPlayerChromeStyle(frame);
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
