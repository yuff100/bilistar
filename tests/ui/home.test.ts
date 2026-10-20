import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Following, Submission } from "../../src/domain/feed.js";
import {
  HOME_COPY,
  TAGS_STORAGE_KEY,
  TAG_COPY,
  renderHome,
  type HomeHandlers,
  type HomeState,
} from "../../src/ui/home.js";

const followings: Following[] = [
  { mid: 2, name: "影视飓风" },
  { mid: 3, name: "何同学" },
];

const submissions: Submission[] = [
  {
    bvid: "BV1",
    title: "影视飓风的新片",
    authorMid: 2,
    authorName: "影视飓风",
    publishedAt: 1_700_000_002_000,
  },
  {
    bvid: "BV2",
    title: "何同学的新视频",
    authorMid: 3,
    authorName: "何同学",
    publishedAt: 1_700_000_001_000,
  },
];

function createHandlers(): HomeHandlers & {
  onSelect: ReturnType<typeof vi.fn>;
  onOpenVideo: ReturnType<typeof vi.fn>;
  onPlay: ReturnType<typeof vi.fn>;
  onLoadMore: ReturnType<typeof vi.fn>;
} {
  return {
    onSelect: vi.fn(),
    onOpenVideo: vi.fn(),
    onPlay: vi.fn(),
    onLoadMore: vi.fn(),
  };
}

function makeState(overrides: Partial<HomeState> = {}): HomeState {
  return {
    followings,
    submissions,
    selectedMid: null,
    hasMore: false,
    playingBvid: null,
    ...overrides,
  };
}

function setup(state: HomeState) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const handlers = createHandlers();
  renderHome(root, state, handlers);
  return { root, handlers };
}

function findButtonByText(root: HTMLElement, text: string) {
  return [...root.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("renderHome", () => {
  it("renders into the follows-root element", () => {
    const { root } = setup(makeState());

    expect(root.id).toBe("follows-root");
    expect(document.getElementById("follows-root")).toBe(root);
  });

  it("shows the sidebar title and lists 全部更新 first, then followings in order", () => {
    const { root } = setup(makeState());

    expect(root.querySelector("h1")?.textContent).toBe("关注");

    const entries = root.querySelectorAll("[data-follows], [data-follows-mid]");
    expect(entries.length).toBe(3);
    expect(entries[0].getAttribute("data-follows")).toBe("all");
    expect(entries[0].textContent).toBe("全部更新");
    expect(entries[1].getAttribute("data-follows-mid")).toBe("2");
    expect(entries[1].textContent).toBe("影视飓风");
    expect(entries[2].getAttribute("data-follows-mid")).toBe("3");
    expect(entries[2].textContent).toBe("何同学");
  });

  it("shows every submission with title, author and publish time when selectedMid is null", () => {
    const { root } = setup(makeState());

    const cards = root.querySelectorAll("[data-bvid]");
    expect(cards.length).toBe(2);

    for (const submission of submissions) {
      const card = root.querySelector(`[data-bvid="${submission.bvid}"]`);
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain(submission.title);
      expect(card?.textContent).toContain(submission.authorName);
      const time = card?.querySelector("time");
      expect(time?.textContent).toBe(
        new Date(submission.publishedAt).toLocaleString(),
      );
      expect(time?.dateTime).toBe(
        new Date(submission.publishedAt).toISOString(),
      );
    }
    expect(root.querySelector('[data-bvid="BV1"] time')?.dateTime).toBe(
      "2023-11-14T22:13:22.000Z",
    );
    expect(root.querySelector('[data-bvid="BV1"] time')?.dateTime).not.toBe(
      new Date(1_700_000_002).toISOString(),
    );

    expect(root.textContent).not.toContain("专栏");
  });

  it("filters submissions and shows work links when an UP is selected", () => {
    const { root } = setup(makeState({ selectedMid: 2 }));

    expect(root.querySelectorAll("[data-bvid]").length).toBe(1);
    expect(root.querySelector('[data-bvid="BV1"]')).not.toBeNull();
    expect(root.querySelector('[data-bvid="BV2"]')).toBeNull();

    const article = root.querySelector(
      'a[href="https://space.bilibili.com/2/article"]',
    );
    expect(article?.textContent).toBe("专栏");
    const collection = root.querySelector(
      'a[href="https://space.bilibili.com/2/lists"]',
    );
    expect(collection?.textContent).toBe("合集");
    const course = root.querySelector(
      'a[href="https://space.bilibili.com/2/cheese"]',
    );
    expect(course?.textContent).toBe("课程");
  });

  it("calls onSelect when entries are clicked, and onPlay instead of onOpenVideo when a card is clicked", () => {
    const { root, handlers } = setup(makeState());

    (root.querySelector('[data-follows-mid="3"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith(3);

    (root.querySelector('[data-follows="all"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith(null);

    (root.querySelector('[data-bvid="BV1"]') as HTMLElement).click();
    expect(handlers.onPlay).toHaveBeenCalledWith("BV1");
    expect(handlers.onOpenVideo).not.toHaveBeenCalled();
  });

  it("shows the empty-follows message and no videos when there are no followings", () => {
    const { root } = setup(
      makeState({ followings: [], submissions: [] }),
    );

    expect(root.textContent).toContain("还没有关注任何 UP 主");
    expect(root.querySelector("[data-bvid]")).toBeNull();
  });

  it("shows the empty-videos message when followings have no submissions", () => {
    const { root } = setup(makeState({ submissions: [] }));

    expect(root.textContent).toContain("这些 UP 主还没有投稿");
  });

  it("shows the 继续看 button only when hasMore is true, and wires onLoadMore", () => {
    const withMore = setup(makeState({ hasMore: true }));
    const more = findButtonByText(withMore.root, "继续看");
    expect(more).toBeDefined();
    (more as HTMLButtonElement).click();
    expect(withMore.handlers.onLoadMore).toHaveBeenCalledTimes(1);

    document.body.innerHTML = "";
    const withoutMore = setup(makeState());
    expect(findButtonByText(withoutMore.root, "继续看")).toBeUndefined();
  });

  it("renders no input element on the page", () => {
    const { root } = setup(makeState({ selectedMid: 2, hasMore: true }));

    expect(root.querySelector("input")).toBeNull();
  });

  it("injects the shared follows-only-ui stylesheet once", () => {
    setup(makeState());
    setup(makeState({ selectedMid: 2 }));

    const styles = document.querySelectorAll("#follows-only-ui");
    expect(styles.length).toBe(1);
    expect(styles[0]?.textContent).toContain("#follows-root");
  });

  it("shows a placeholder instead of a player when nothing is playing", () => {
    const { root } = setup(makeState());

    const pane = root.querySelector("aside");
    expect(pane).not.toBeNull();
    expect(pane?.querySelector("iframe")).toBeNull();
    expect(pane?.textContent).toContain("还没有在看的视频");
  });

  it("plays the clicked video in the right pane with embed iframe, title and 在 B 站打开 link", () => {
    const { root, handlers } = setup(makeState({ playingBvid: "BV1" }));

    const pane = root.querySelector("aside") as HTMLElement;
    expect(pane.textContent).not.toContain("还没有在看的视频");

    const frame = pane.querySelector("iframe") as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("src")).toBe(
      "https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=BV1&danmaku=1&autoplay=1",
    );
    expect(frame?.hasAttribute("allowfullscreen")).toBe(true);

    expect(pane.querySelector("h2")?.textContent).toBe("影视飓风的新片");

    const open = [...pane.querySelectorAll("a")].find(
      (link) => link.textContent === "在 B 站打开",
    ) as HTMLAnchorElement | undefined;
    expect(open).toBeDefined();
    expect(open?.getAttribute("href")).toBe(
      "https://www.bilibili.com/video/BV1",
    );
    (open as HTMLAnchorElement).click();
    expect(handlers.onOpenVideo).toHaveBeenCalledWith("BV1");
  });

  it("keeps the iframe but skips the title when the playing video is not in the list", () => {
    const { root } = setup(makeState({ playingBvid: "BV404" }));

    const pane = root.querySelector("aside") as HTMLElement;
    expect(
      pane.querySelector("iframe")?.getAttribute("src"),
    ).toContain("bvid=BV404");
    expect(pane.querySelector("h2")).toBeNull();
  });

  it("collapses and restores the left column with the edge buttons", () => {
    const { root } = setup(makeState());

    const sidebar = root.querySelector("nav") as HTMLElement;
    const collapse = root.querySelector(
      '[data-action="collapse-left"]',
    ) as HTMLButtonElement;
    const restore = root.querySelector(
      '[data-action="restore-left"]',
    ) as HTMLButtonElement;
    expect(collapse.textContent).toBe("‹");
    expect(restore.textContent).toBe("›");
    expect(sidebar.hidden).toBe(false);
    expect(restore.hidden).toBe(true);

    collapse.click();
    expect(sidebar.hidden).toBe(true);
    expect(restore.hidden).toBe(false);

    restore.click();
    expect(sidebar.hidden).toBe(false);
    expect(restore.hidden).toBe(true);

    // 中栏不受影响
    expect((root.querySelector("main") as HTMLElement).hidden).toBe(false);
    expect(
      (root.querySelector('[data-action="restore-mid"]') as HTMLButtonElement)
        .hidden,
    ).toBe(true);
  });

  it("collapses and restores the middle column independently", () => {
    const { root } = setup(makeState());

    const main = root.querySelector("main") as HTMLElement;
    const collapse = root.querySelector(
      '[data-action="collapse-mid"]',
    ) as HTMLButtonElement;
    const restore = root.querySelector(
      '[data-action="restore-mid"]',
    ) as HTMLButtonElement;
    expect(main.hidden).toBe(false);
    expect(restore.hidden).toBe(true);

    collapse.click();
    expect(main.hidden).toBe(true);
    expect(restore.hidden).toBe(false);
    expect((root.querySelector("nav") as HTMLElement).hidden).toBe(false);

    restore.click();
    expect(main.hidden).toBe(false);
    expect(restore.hidden).toBe(true);
  });

  it("keeps the collapse state when re-rendering into the same root", () => {
    const state = makeState();
    const { root, handlers } = setup(state);

    (root.querySelector('[data-action="collapse-left"]') as HTMLButtonElement)
      .click();
    (root.querySelector('[data-action="collapse-mid"]') as HTMLButtonElement)
      .click();

    renderHome(root, state, handlers);

    expect((root.querySelector("nav") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("main") as HTMLElement).hidden).toBe(true);
    expect(
      (root.querySelector('[data-action="restore-left"]') as HTMLButtonElement)
        .hidden,
    ).toBe(false);
    expect(
      (root.querySelector('[data-action="restore-mid"]') as HTMLButtonElement)
        .hidden,
    ).toBe(false);
  });

  it("keeps the same iframe element across a load-more re-render", () => {
    const handlers = createHandlers();
    const root = document.createElement("div");
    document.body.appendChild(root);

    renderHome(
      root,
      makeState({ playingBvid: "BV1", hasMore: true }),
      handlers,
    );
    const frameBefore = root.querySelector("aside iframe");

    const loadedMore: Submission[] = [
      ...submissions,
      {
        bvid: "BV3",
        title: "继续看加载出来的投稿",
        authorMid: 2,
        authorName: "影视飓风",
        publishedAt: 1_700_000_000_000,
      },
    ];
    renderHome(
      root,
      makeState({
        submissions: loadedMore,
        playingBvid: "BV1",
        hasMore: false,
      }),
      handlers,
    );

    expect(root.querySelector("aside iframe")).toBe(frameBefore);
    expect(root.querySelector('[data-bvid="BV3"]')).not.toBeNull();
  });

  it("keeps the same iframe element across a selection re-render", () => {
    const handlers = createHandlers();
    const root = document.createElement("div");
    document.body.appendChild(root);

    renderHome(root, makeState({ playingBvid: "BV1" }), handlers);
    const frameBefore = root.querySelector("aside iframe");

    renderHome(
      root,
      makeState({
        // 选中 UP 后 main.ts 会传入该 UP 的投稿,BV1 不在其中。
        submissions: submissions.filter((item) => item.authorMid === 3),
        selectedMid: 3,
        playingBvid: "BV1",
      }),
      handlers,
    );

    expect(root.querySelector("aside iframe")).toBe(frameBefore);
    // 播放器之外的部分仍按本次状态重建:播放的视频不在列表里就不再显示标题。
    expect(root.querySelector("aside h2")).toBeNull();
  });

  it("rebuilds the iframe when the playing video changes", () => {
    const handlers = createHandlers();
    const root = document.createElement("div");
    document.body.appendChild(root);

    renderHome(root, makeState({ playingBvid: "BV1" }), handlers);
    const frameBefore = root.querySelector("aside iframe");

    renderHome(root, makeState({ playingBvid: "BV2" }), handlers);
    const frameAfter = root.querySelector("aside iframe");

    expect(frameAfter).not.toBe(frameBefore);
    expect(frameAfter?.getAttribute("src")).toContain("bvid=BV2");
  });

  it("uses the exact copy strings", () => {
    expect(HOME_COPY).toEqual({
      sidebar: "关注",
      all: "全部更新",
      emptyFollows: "还没有关注任何 UP 主",
      emptyVideos: "这些 UP 主还没有投稿",
      article: "专栏",
      collection: "合集",
      course: "课程",
      more: "继续看",
    });
  });
});

describe("renderHome 标签分组", () => {
  const taggedFollowings: Following[] = [
    { mid: 2, name: "影视飓风" },
    { mid: 3, name: "何同学" },
    { mid: 4, name: "老番茄" },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  function seedTags(tags: Record<string, string>): void {
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
  }

  function storedTags(): Record<string, string> {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    return raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
  }

  function sidebarEntries(root: HTMLElement): string[] {
    return [...root.querySelectorAll("nav ul>li")].map((li) => {
      if (li.hasAttribute("data-follows")) {
        return "all";
      }
      if (li.hasAttribute("data-follows-mid")) {
        return `mid:${li.getAttribute("data-follows-mid")}`;
      }
      return `tag:${li.getAttribute("data-tag-group") ?? ""}`;
    });
  }

  function startEditing(root: HTMLElement, mid: number): HTMLInputElement {
    const button = root.querySelector(
      `[data-tag-edit="${mid}"]`,
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    const input = root.querySelector(
      `[data-tag-input="${mid}"]`,
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    return input as HTMLInputElement;
  }

  function pressKey(input: HTMLInputElement, key: string): void {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  }

  it("没有任何标签时保持扁平列表，不出现分组头", () => {
    const { root } = setup(makeState({ followings: taggedFollowings }));

    expect(root.querySelectorAll("[data-tag-group]").length).toBe(0);
    expect(sidebarEntries(root)).toEqual(["all", "mid:2", "mid:3", "mid:4"]);
  });

  it("组按标签首次出现顺序排，组内保持原顺序，未分组垫底", () => {
    seedTags({ "2": "书法", "3": "物理", "4": "书法" });
    const { root } = setup(makeState({ followings: taggedFollowings }));

    expect(sidebarEntries(root)).toEqual([
      "all",
      "tag:书法",
      "mid:2",
      "mid:4",
      "tag:物理",
      "mid:3",
    ]);
  });

  it("有标签时没打标签的 UP 进「未分组」，排在所有分组之后", () => {
    seedTags({ "2": "书法" });
    const { root } = setup(makeState({ followings: taggedFollowings }));

    expect(sidebarEntries(root)).toEqual([
      "all",
      "tag:书法",
      "mid:2",
      "tag:",
      "mid:3",
      "mid:4",
    ]);
    expect(root.querySelector('[data-tag-group=""]')?.textContent).toBe(
      TAG_COPY.ungrouped,
    );
  });

  it("点 ✎ 不触发选人，Enter 保存写入 localStorage 并立刻重新分组", () => {
    const { root, handlers } = setup(
      makeState({ followings: taggedFollowings }),
    );

    const input = startEditing(root, 2);
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-label")).toBe("打标签");
    expect(input.maxLength).toBe(12);

    input.value = "书法";
    pressKey(input, "Enter");

    expect(storedTags()).toEqual({ "2": "书法" });
    expect(root.querySelector("[data-tag-input]")).toBeNull();
    expect(sidebarEntries(root)).toEqual([
      "all",
      "tag:书法",
      "mid:2",
      "tag:",
      "mid:3",
      "mid:4",
    ]);
  });

  it("编辑态预填已有标签，清空后 Enter 视为清除", () => {
    seedTags({ "2": "书法" });
    const { root } = setup(makeState());

    const input = startEditing(root, 2);
    expect(input.value).toBe("书法");

    input.value = "";
    pressKey(input, "Enter");

    expect(storedTags()).toEqual({});
    expect(root.querySelectorAll("[data-tag-group]").length).toBe(0);
  });

  it("Escape 取消编辑，不写 localStorage", () => {
    const { root } = setup(makeState());

    const input = startEditing(root, 3);
    input.value = "物理";
    pressKey(input, "Escape");

    expect(localStorage.getItem(TAGS_STORAGE_KEY)).toBeNull();
    expect(root.querySelector("[data-tag-input]")).toBeNull();
    expect(root.querySelectorAll("[data-tag-group]").length).toBe(0);
  });

  it("失焦(blur)同样保存", () => {
    const { root } = setup(makeState());

    const input = startEditing(root, 2);
    input.value = "科普";
    input.dispatchEvent(new FocusEvent("blur"));

    expect(storedTags()).toEqual({ "2": "科普" });
    expect(root.querySelector("[data-tag-input]")).toBeNull();
  });

  it("保存时去掉首尾空格，超过 12 字的部分被截断", () => {
    const { root } = setup(makeState());

    const input = startEditing(root, 2);
    input.value = "  物理科普经济书法AI知识区  ";
    pressKey(input, "Enter");

    expect(storedTags()).toEqual({ "2": "物理科普经济书法AI知识" });
  });

  it("选中的 UP 在分组里仍然 aria-current 高亮，行点击照常选人", () => {
    seedTags({ "2": "书法" });
    const { root, handlers } = setup(
      makeState({ followings: taggedFollowings, selectedMid: 2 }),
    );

    const row = root.querySelector('li[data-follows-mid="2"]');
    expect(row?.getAttribute("aria-current")).toBe("page");

    (root.querySelector('li[data-follows-mid="3"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith(3);
  });

  it("编辑态随重绘保留在同一根节点上，换根节点消失", () => {
    const state = makeState();
    const { root, handlers } = setup(state);

    startEditing(root, 2);
    renderHome(root, state, handlers);
    expect(root.querySelector('[data-tag-input="2"]')).not.toBeNull();

    const fresh = document.createElement("div");
    document.body.appendChild(fresh);
    renderHome(fresh, state, handlers);
    expect(fresh.querySelector("[data-tag-input]")).toBeNull();
  });

  it("localStorage 里存了坏数据时按无标签渲染", () => {
    localStorage.setItem(TAGS_STORAGE_KEY, "{oops");
    const { root } = setup(makeState());

    expect(root.querySelectorAll("[data-tag-group]").length).toBe(0);
    expect(sidebarEntries(root)).toEqual(["all", "mid:2", "mid:3"]);
  });
});
