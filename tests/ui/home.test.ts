import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Following, Submission } from "../../src/domain/feed.js";
import {
  GROUP_COPY,
  HOME_COPY,
  renderHome,
  type HomeHandlers,
  type HomeState,
  type NativeGroup,
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
  onMoveGroup: ReturnType<typeof vi.fn>;
  onOpenVideo: ReturnType<typeof vi.fn>;
  onPlay: ReturnType<typeof vi.fn>;
  onLoadMore: ReturnType<typeof vi.fn>;
} {
  return {
    onSelect: vi.fn(),
    onMoveGroup: vi.fn(async () => true),
    onOpenVideo: vi.fn(),
    onPlay: vi.fn(),
    onLoadMore: vi.fn(),
  };
}

function makeState(overrides: Partial<HomeState> = {}): HomeState {
  return {
    followings,
    groups: [],
    submissions,
    selection: { kind: "all" },
    hasMore: false,
    playingBvid: null,
    moveErrorMid: null,
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

// happy-dom 的 iframe.contentDocument 是 null(不支持浏览器的同源子文档),
// 用 implementation.createHTMLDocument() 按 iframe 实例稳定地伪造一份,
// 让注入逻辑走真实的 renderHome 代码路径;返回还原函数。
function stubIframeDocuments(): () => void {
  const docs = new WeakMap<HTMLIFrameElement, Document>();
  const original = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentDocument",
  );
  Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
    configurable: true,
    get(this: HTMLIFrameElement): Document {
      let doc = docs.get(this);
      if (doc === undefined) {
        doc = document.implementation.createHTMLDocument("player");
        docs.set(this, doc);
      }
      return doc;
    },
  });
  return () => {
    if (original !== undefined) {
      Object.defineProperty(
        HTMLIFrameElement.prototype,
        "contentDocument",
        original,
      );
    } else {
      delete (
        HTMLIFrameElement.prototype as { contentDocument?: unknown }
      ).contentDocument;
    }
  };
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
    const { root } = setup(
      makeState({ selection: { kind: "up", mid: 2 } }),
    );

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
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: "up", mid: 3 });

    (root.querySelector('[data-follows="all"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: "all" });

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
    const { root } = setup(
      makeState({ selection: { kind: "up", mid: 2 }, hasMore: true }),
    );

    expect(root.querySelector("input")).toBeNull();
  });

  it("injects the shared follows-only-ui stylesheet once", () => {
    setup(makeState());
    setup(makeState({ selection: { kind: "up", mid: 2 } }));

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
        selection: { kind: "up", mid: 3 },
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

  it("injects the player-chrome override style into the iframe document, once per document", () => {
    const restore = stubIframeDocuments();
    try {
      const state = makeState({ playingBvid: "BV1" });
      const handlers = createHandlers();
      const root = document.createElement("div");
      document.body.appendChild(root);

      renderHome(root, state, handlers);
      const frame = root.querySelector(
        "aside iframe",
      ) as HTMLIFrameElement;
      const doc = frame.contentDocument as Document;
      expect(doc).not.toBeNull();

      const style = doc.getElementById("follows-only-player-chrome");
      expect(style).not.toBeNull();
      expect(style?.textContent).toContain(
        ".mplayer .mplayer-control-bar-hide .mplayer-control-bar",
      );
      expect(style?.textContent).toContain("opacity: 1 !important");
      expect(style?.textContent).toContain("transform: none !important");
      expect(style?.textContent).toContain("visibility: visible !important");

      // 缓存 pane 复用同一个 iframe:重绘不重复注入。
      renderHome(root, state, handlers);
      expect(
        doc.querySelectorAll("#follows-only-player-chrome").length,
      ).toBe(1);

      // 换视频重建 iframe:新文档也会注入。
      renderHome(root, makeState({ playingBvid: "BV2" }), handlers);
      const frameAfter = root.querySelector(
        "aside iframe",
      ) as HTMLIFrameElement;
      expect(frameAfter.contentDocument).not.toBe(doc);
      expect(
        frameAfter.contentDocument?.getElementById(
          "follows-only-player-chrome",
        ),
      ).not.toBeNull();
    } finally {
      restore();
    }
  });

  it("re-injects the player-chrome override style when the iframe load fires", () => {
    const restore = stubIframeDocuments();
    try {
      const handlers = createHandlers();
      const root = document.createElement("div");
      document.body.appendChild(root);

      renderHome(root, makeState({ playingBvid: "BV1" }), handlers);
      const frame = root.querySelector(
        "aside iframe",
      ) as HTMLIFrameElement;
      const doc = frame.contentDocument as Document;
      doc.getElementById("follows-only-player-chrome")?.remove();

      frame.dispatchEvent(new Event("load"));

      expect(doc.getElementById("follows-only-player-chrome")).not.toBeNull();
    } finally {
      restore();
    }
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

describe("renderHome 原生分组", () => {
  const groupedFollowings: Following[] = [
    { mid: 2, name: "影视飓风" },
    { mid: 3, name: "何同学" },
    { mid: 4, name: "老番茄" },
  ];

  const nativeGroups: NativeGroup[] = [
    { tagid: 10, name: "科技", mids: [2, 4] },
    { tagid: 11, name: "生活", mids: [4, 99] },
  ];

  function sidebarEntries(root: HTMLElement): string[] {
    return [...root.querySelectorAll("nav ul>li")].map((li) => {
      if (li.hasAttribute("data-follows")) {
        return "all";
      }
      if (li.hasAttribute("data-follows-mid")) {
        return `mid:${li.getAttribute("data-follows-mid")}`;
      }
      return `group:${li.getAttribute("data-group-id") ?? ""}`;
    });
  }

  function openPicker(root: HTMLElement, mid: number): HTMLElement {
    const button = root.querySelector(
      `[data-group-edit="${mid}"]`,
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    const picker = root.querySelector(
      `[data-group-picker="${mid}"]`,
    ) as HTMLElement | null;
    expect(picker).not.toBeNull();
    return picker as HTMLElement;
  }

  it("没有任何分组时保持扁平列表，不出现分组头", () => {
    const { root } = setup(makeState({ followings: groupedFollowings }));

    expect(root.querySelectorAll("[data-group-id]").length).toBe(0);
    expect(sidebarEntries(root)).toEqual(["all", "mid:2", "mid:3", "mid:4"]);
  });

  it("组按接口顺序排，组内只列已关注成员，UP 可在多组重复出现，未分组垫底", () => {
    const { root } = setup(
      makeState({ followings: groupedFollowings, groups: nativeGroups }),
    );

    // 组 99(未关注)不出现在侧栏;4 号在科技、生活两组都出现;
    // 3 号没进任何自定义组,落进「未分组」。
    expect(sidebarEntries(root)).toEqual([
      "all",
      "group:10",
      "mid:2",
      "mid:4",
      "group:11",
      "mid:4",
      "group:",
      "mid:3",
    ]);
    expect(
      root.querySelector('[data-group-id="10"]')?.textContent,
    ).toBe("科技");
    expect(
      root.querySelector('[data-group-id=""]')?.textContent,
    ).toBe(GROUP_COPY.ungrouped);
  });

  it("没有任何已关注成员的自定义组存在时也保持扁平列表", () => {
    const { root } = setup(
      makeState({
        followings: groupedFollowings,
        groups: [{ tagid: 10, name: "科技", mids: [99] }],
      }),
    );

    expect(root.querySelectorAll("[data-group-id]").length).toBe(0);
    expect(sidebarEntries(root)).toEqual(["all", "mid:2", "mid:3", "mid:4"]);
  });

  it("点组头选中分组，点 UP 行选人，点全部更新清空选中", () => {
    const { root, handlers } = setup(
      makeState({ followings: groupedFollowings, groups: nativeGroups }),
    );

    (root.querySelector('[data-group-id="10"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith({
      kind: "group",
      tagid: 10,
      mids: [2, 4],
    });

    (root.querySelector('[data-group-id=""]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith({
      kind: "group",
      tagid: null,
      mids: [3],
    });

    (root.querySelector('li[data-follows-mid="3"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: "up", mid: 3 });

    (root.querySelector('[data-follows="all"]') as HTMLElement).click();
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: "all" });
  });

  it("选中的组和选中的 UP 行都 aria-current 高亮", () => {
    const { root } = setup(
      makeState({
        followings: groupedFollowings,
        groups: nativeGroups,
        selection: { kind: "group", tagid: 10, mids: [2, 4] },
      }),
    );

    expect(
      root.querySelector('[data-group-id="10"]')?.getAttribute("aria-current"),
    ).toBe("page");
    expect(
      root.querySelector('[data-group-id=""]')?.hasAttribute("aria-current"),
    ).toBe(false);
    expect(
      root
        .querySelector('li[data-follows-mid="2"]')
        ?.hasAttribute("aria-current"),
    ).toBe(false);

    document.body.innerHTML = "";
    const up = setup(
      makeState({
        followings: groupedFollowings,
        groups: nativeGroups,
        selection: { kind: "up", mid: 2 },
      }),
    );
    expect(
      up.root
        .querySelector('li[data-follows-mid="2"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("分组选中时投稿按传入原样展示，不再按组二次过滤", () => {
    const { root } = setup(
      makeState({
        selection: { kind: "group", tagid: 10, mids: [2, 4] },
        submissions: submissions.filter((item) => item.authorMid === 2),
      }),
    );

    expect(root.querySelectorAll("[data-bvid]").length).toBe(1);
    expect(root.querySelector('[data-bvid="BV1"]')).not.toBeNull();
    // 组视图没有对应的 UP,也就没有专栏/合集/课程入口。
    expect(root.textContent).not.toContain("专栏");
  });

  it("点 ✎ 打开分组浮层：列出所有自定义组(含无关注成员的组)加未分组，不冒泡选人", () => {
    const { root, handlers } = setup(
      makeState({
        followings: groupedFollowings,
        groups: [
          ...nativeGroups,
          { tagid: 12, name: "空组", mids: [99] },
        ],
      }),
    );

    const picker = openPicker(root, 3);
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(
      [...picker.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["科技", "生活", "空组", "未分组"]);
    expect(picker.querySelectorAll('[data-group-option="12"]').length).toBe(1);
    // 3 号当前未分组:「未分组」选项带 aria-current,其余不带。
    expect(
      picker
        .querySelector('[data-group-option=""]')
        ?.getAttribute("aria-current"),
    ).toBe("true");
    expect(
      picker
        .querySelector('[data-group-option="10"]')
        ?.hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("点浮层选项调用 onMoveGroup 并立刻关闭浮层，再点 ✎ 可切换关闭", () => {
    const { root, handlers } = setup(
      makeState({ followings: groupedFollowings, groups: nativeGroups }),
    );

    let picker = openPicker(root, 2);
    (picker.querySelector('[data-group-option="11"]') as HTMLElement).click();
    expect(handlers.onMoveGroup).toHaveBeenCalledWith(2, 11);
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(root.querySelector("[data-group-picker]")).toBeNull();

    // 再打开后选择「未分组」选项,tagid 传 null。
    picker = openPicker(root, 2);
    (picker.querySelector('[data-group-option=""]') as HTMLElement).click();
    expect(handlers.onMoveGroup).toHaveBeenCalledWith(2, null);

    // 已开着时再点一次 ✎ 是关闭,不新建浮层。
    const firstEdit = (): HTMLButtonElement =>
      root.querySelector('[data-group-edit="4"]') as HTMLButtonElement;
    firstEdit().click();
    expect(root.querySelectorAll("[data-group-picker]").length).toBe(1);
    firstEdit().click();
    expect(root.querySelector("[data-group-picker]")).toBeNull();
  });

  it("浮层随重绘保留在同一根节点上，换根节点消失", () => {
    const state = makeState({
      followings: groupedFollowings,
      groups: nativeGroups,
    });
    const { root, handlers } = setup(state);

    openPicker(root, 2);
    renderHome(root, state, handlers);
    expect(root.querySelector('[data-group-picker="2"]')).not.toBeNull();

    const fresh = document.createElement("div");
    document.body.appendChild(fresh);
    renderHome(fresh, state, handlers);
    expect(fresh.querySelector("[data-group-picker]")).toBeNull();
  });

  it("移动失败时在该行挂出提示，打开浮层时先藏起来", () => {
    const { root } = setup(
      makeState({
        followings: groupedFollowings,
        groups: nativeGroups,
        moveErrorMid: 2,
      }),
    );

    const error = root.querySelector("[data-group-error]");
    expect(error?.textContent).toBe(GROUP_COPY.moveFailed);
    expect(
      root
        .querySelector('li[data-follows-mid="2"]')
        ?.textContent,
    ).toContain(GROUP_COPY.moveFailed);
    expect(
      root
        .querySelector('li[data-follows-mid="3"]')
        ?.querySelector("[data-group-error]"),
    ).toBeNull();

    openPicker(root, 2);
    expect(
      root
        .querySelector('li[data-follows-mid="2"]')
        ?.querySelector("[data-group-error]"),
    ).toBeNull();
  });

  it("使用固定的文案常量", () => {
    expect(GROUP_COPY).toEqual({
      ungrouped: "未分组",
      editLabel: "移动分组",
      moveFailed: "移动失败，请重试",
    });
  });
});
