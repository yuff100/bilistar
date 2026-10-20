import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Following, Submission } from "../../src/domain/feed.js";
import {
  HOME_COPY,
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
      "https://player.bilibili.com/player.html?bvid=BV1&autoplay=1&danmaku=1",
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
