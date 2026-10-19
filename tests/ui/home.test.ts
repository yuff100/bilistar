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
  onLoadMore: ReturnType<typeof vi.fn>;
} {
  return {
    onSelect: vi.fn(),
    onOpenVideo: vi.fn(),
    onLoadMore: vi.fn(),
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
    const { root } = setup({
      followings,
      submissions,
      selectedMid: null,
      hasMore: false,
    });

    expect(root.id).toBe("follows-root");
    expect(document.getElementById("follows-root")).toBe(root);
  });

  it("shows the sidebar title and lists 全部更新 first, then followings in order", () => {
    const { root } = setup({
      followings,
      submissions,
      selectedMid: null,
      hasMore: false,
    });

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
    const { root } = setup({
      followings,
      submissions,
      selectedMid: null,
      hasMore: false,
    });

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
    const { root } = setup({
      followings,
      submissions,
      selectedMid: 2,
      hasMore: false,
    });

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

  it("calls onSelect, onOpenVideo when entries are clicked", () => {
    const { root, handlers } = setup({
      followings,
      submissions,
      selectedMid: null,
      hasMore: false,
    });

    (root.querySelector('[data-follows-mid="3"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith(3);

    (root.querySelector('[data-follows="all"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith(null);

    (root.querySelector('[data-bvid="BV1"]') as HTMLElement).click();
    expect(handlers.onOpenVideo).toHaveBeenCalledWith("BV1");
  });

  it("shows the empty-follows message and no videos when there are no followings", () => {
    const { root } = setup({
      followings: [],
      submissions: [],
      selectedMid: null,
      hasMore: false,
    });

    expect(root.textContent).toContain("还没有关注任何 UP 主");
    expect(root.querySelector("[data-bvid]")).toBeNull();
  });

  it("shows the empty-videos message when followings have no submissions", () => {
    const { root } = setup({
      followings,
      submissions: [],
      selectedMid: null,
      hasMore: false,
    });

    expect(root.textContent).toContain("这些 UP 主还没有投稿");
  });

  it("shows the 继续看 button only when hasMore is true, and wires onLoadMore", () => {
    const withMore = setup({
      followings,
      submissions,
      selectedMid: null,
      hasMore: true,
    });
    const more = findButtonByText(withMore.root, "继续看");
    expect(more).toBeDefined();
    (more as HTMLButtonElement).click();
    expect(withMore.handlers.onLoadMore).toHaveBeenCalledTimes(1);

    document.body.innerHTML = "";
    const withoutMore = setup({
      followings,
      submissions,
      selectedMid: null,
      hasMore: false,
    });
    expect(findButtonByText(withoutMore.root, "继续看")).toBeUndefined();
  });

  it("renders no input element on the page", () => {
    const { root } = setup({
      followings,
      submissions,
      selectedMid: 2,
      hasMore: true,
    });

    expect(root.querySelector("input")).toBeNull();
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
