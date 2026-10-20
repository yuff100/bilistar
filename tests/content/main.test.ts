import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasMoreSubmissions,
  loadFollowings,
  loadSubmissions,
  resetPageRuntime,
  start,
  type PageEnv,
} from "../../src/content/main.js";

const HOME_URL = "https://www.bilibili.com/";

function rawArchive(
  id: string,
  bvid: string,
  title: string,
  authorMid: number,
  authorName: string,
  pubTs: number,
) {
  return {
    id_str: id,
    modules: {
      module_author: { mid: authorMid, name: authorName, pub_ts: pubTs },
      module_dynamic: {
        major: { type: "MAJOR_TYPE_ARCHIVE", archive: { bvid, title } },
      },
    },
  };
}

function rawLive(id: string, authorMid: number, pubTs: number) {
  return {
    id_str: id,
    modules: {
      module_author: { mid: authorMid, name: "UP主", pub_ts: pubTs },
      module_dynamic: { major: { type: "MAJOR_TYPE_LIVE_RCMD" } },
    },
  };
}

type WorldState = {
  loggedIn: boolean;
  viewerMid: number;
  followings: Array<{ mid: number; name: string }>;
  feedAll: unknown[];
  feedAllOffset: string;
  viewOwner: { mid: number; name: string; bvid?: string };
  workAuthorMid: number;
  modifyCode: number;
  spaceOffset: string;
  spaceItems: unknown[] | null;
  relationTags: Array<{ tagid: number; name: string }>;
  relationMembers: Record<number, number[]>;
  addUsersCode: number;
  delUsersCode: number;
};

function makeWorld(href: string, overrides: Partial<WorldState> = {}) {
  const state: WorldState = {
    loggedIn: true,
    viewerMid: 7,
    followings: [
      { mid: 2, name: "影视飓风" },
      { mid: 3, name: "何同学" },
    ],
    feedAll: [
      rawArchive("d1", "BVUP3", "何同学的新视频", 3, "何同学", 1003),
      rawArchive("d2", "BVUP2", "影视飓风的新片", 2, "影视飓风", 1001),
    ],
    feedAllOffset: "",
    viewOwner: { mid: 2, name: "影视飓风" },
    workAuthorMid: 2,
    modifyCode: 0,
    spaceOffset: "",
    spaceItems: null,
    relationTags: [],
    relationMembers: {},
    addUsersCode: 0,
    delUsersCode: 0,
    ...overrides,
  };

  const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => ({
    json: async () => {
      const url = String(input);
      if (url.includes("/x/web-interface/nav")) {
        return state.loggedIn
          ? { code: 0, data: { isLogin: true, mid: state.viewerMid } }
          : { code: 0, data: { isLogin: false } };
      }
      if (url.includes("/x/relation/tags/addUsers")) {
        return { code: state.addUsersCode };
      }
      if (url.includes("/x/relation/tags/delUsers")) {
        return { code: state.delUsersCode };
      }
      if (url.includes("/x/relation/tags")) {
        return { code: 0, data: state.relationTags };
      }
      if (url.includes("/x/relation/tag?")) {
        const match = /tagid=(\d+)/.exec(url);
        const tagid = match === null ? 0 : Number(match[1]);
        return {
          code: 0,
          data: {
            list: (state.relationMembers[tagid] ?? []).map((mid) => ({ mid })),
          },
        };
      }
      if (url.includes("/x/relation/followings")) {
        return {
          code: 0,
          data: {
            list: state.followings.map((f) => ({
              mid: f.mid,
              uname: f.name,
            })),
            total: state.followings.length,
          },
        };
      }
      if (url.includes("/x/polymer/web-dynamic/v1/feed/all")) {
        return {
          code: 0,
          data: { items: state.feedAll, offset: state.feedAllOffset },
        };
      }
      if (url.includes("/x/polymer/web-dynamic/v1/feed/space")) {
        const match = /host_mid=(\d+)/.exec(url);
        const mid = match === null ? 0 : Number(match[1]);
        return {
          code: 0,
          data: {
            items:
              state.spaceItems ??
              [
                rawArchive(`s${mid}-1`, `BVSP${mid}1`, `UP${mid}的投稿一`, mid, `UP${mid}`, 2001),
                rawArchive(`s${mid}-2`, `BVSP${mid}2`, `UP${mid}的投稿二`, mid, `UP${mid}`, 2002),
              ],
            offset: state.spaceOffset,
          },
        };
      }
      if (url.includes("/x/relation/modify")) {
        return { code: state.modifyCode };
      }
      if (url.includes("/x/web-interface/view")) {
        return {
          code: 0,
          data: {
            bvid: state.viewOwner.bvid ?? "",
            owner: { mid: state.viewOwner.mid, name: state.viewOwner.name },
          },
        };
      }
      if (url.includes("/x/article/viewinfo")) {
        return { code: 0, data: { mid: state.workAuthorMid } };
      }
      throw new Error(`unexpected url: ${url}`);
    },
  }));

  const replace = vi.fn();
  const reload = vi.fn();
  const env: PageEnv = {
    href,
    document,
    fetchImpl: fetchMock as unknown as typeof fetch,
    cookie: "SESSDATA=secret; bili_jct=tok123",
    replace,
    reload,
  };
  return { env, replace, reload, fetchMock, state };
}

const VIDEO_FIXTURE = `
  <div id="biliMainHeader"><a href="/v/popular/rank/all">排行榜</a></div>
  <div class="bpx-player-video-wrap"><video controls></video></div>
  <div class="bpx-player-ending-wrap"></div>
  <div id="reco_list"></div>
  <div id="comment"></div>
  <div class="video-toolbar-left"></div>
  <div id="arc_toolbar_report"></div>
`;

function setFixture(html: string): void {
  document.body.innerHTML = html;
}

function moreButton(): HTMLButtonElement | null {
  const buttons = [...document.querySelectorAll("#follows-root main button")];
  return (
    (buttons.find((button) => button.textContent === "继续看") as
      | HTMLButtonElement
      | undefined) ?? null
  );
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

beforeEach(() => {
  resetPageRuntime(document);
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("loadFollowings", () => {
  it("在 total 大于 50 时请求第 2 页，拼接两页关注列表", async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => ({
      mid: 1000 + i,
      uname: `UP${1000 + i}`,
    }));
    const secondPage = Array.from({ length: 10 }, (_, i) => ({
      mid: 1050 + i,
      uname: `UP${1050 + i}`,
    }));
    const fetchMock = vi.fn(async (input: unknown) => ({
      json: async () => {
        const url = String(input);
        if (url.includes("pn=1")) {
          return { code: 0, data: { list: firstPage, total: 60 } };
        }
        if (url.includes("pn=2")) {
          return { code: 0, data: { list: secondPage, total: 60 } };
        }
        throw new Error(`unexpected url: ${url}`);
      },
    }));

    const result = await loadFollowings(
      7,
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toHaveLength(60);
    expect(result[0]).toEqual({ mid: 1000, name: "UP1000" });
    expect(result[59]).toEqual({ mid: 1059, name: "UP1059" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("pn=1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("pn=2");
  });

  it("total 不超过一页时只请求一次", async () => {
    const fetchMock = vi.fn(async (_input: unknown) => ({
      json: async () => ({
        code: 0,
        data: { list: [{ mid: 2, uname: "影视飓风" }], total: 1 },
      }),
    }));

    const result = await loadFollowings(
      7,
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual([{ mid: 2, name: "影视飓风" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("loadSubmissions", () => {
  it("scope all: 只留 archive，按 bvid 合并，按发布时间降序，最多 20 条", async () => {
    const archives = Array.from({ length: 21 }, (_, i) =>
      rawArchive(`id${i}`, `BVA${i}`, `第${i}稿`, 2, "影视飓风", 1000 + i),
    );
    const response = {
      code: 0,
      data: { items: [...archives, rawLive("live1", 3, 9999)], offset: "" },
    };
    const fetchMock = vi.fn(async (_input: unknown) => ({ json: async () => response }));

    const page = await loadSubmissions(
      { scope: "all" },
      null,
      fetchMock as unknown as typeof fetch,
    );

    expect(page.items).toHaveLength(20);
    expect(hasMoreSubmissions(page.cursor)).toBe(true);
    for (const item of page.items) {
      expect(item.bvid).toMatch(/^BVA/);
      expect(item.title).not.toContain("直播");
    }
    // 从新到旧排列：最新的 BVA20 在最前，最旧的 BVA0 留到下一页。
    expect(page.items[0].bvid).toBe("BVA20");
    expect(page.items[1].bvid).toBe("BVA19");
    expect(page.items[19].bvid).toBe("BVA1");
    for (let i = 0; i + 1 < page.items.length; i += 1) {
      expect(page.items[i].publishedAt).toBeGreaterThan(
        page.items[i + 1].publishedAt,
      );
    }
    expect(page.items[0].publishedAt).toBe(1020 * 1000);

    const rest = await loadSubmissions(
      { scope: "all" },
      page.cursor,
      fetchMock as unknown as typeof fetch,
    );
    expect(rest.items.map((item) => item.bvid)).toEqual(["BVA0"]);
    expect(hasMoreSubmissions(rest.cursor)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("第二页从第 21 条开始，不重复也不遗漏", async () => {
    const first = Array.from({ length: 25 }, (_, i) =>
      rawArchive(`a${i}`, `BVA${i}`, `稿${i}`, 2, "UP", 3000 - i),
    );
    const second = Array.from({ length: 5 }, (_, i) =>
      rawArchive(`b${i}`, `BVB${i}`, `续${i}`, 2, "UP", 2000 - i),
    );
    let call = 0;
    const fetchMock = vi.fn(async (input: unknown) => ({
      json: async () => {
        call += 1;
        if (call === 1) {
          return { code: 0, data: { items: first, offset: "page-2" } };
        }
        return { code: 0, data: { items: second, offset: "" } };
      },
    }));

    const page1 = await loadSubmissions(
      { scope: "all" },
      null,
      fetchMock as unknown as typeof fetch,
    );
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].bvid).toBe("BVA0");
    expect(page1.items[19].bvid).toBe("BVA19");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const page2 = await loadSubmissions(
      { scope: "all" },
      page1.cursor,
      fetchMock as unknown as typeof fetch,
    );
    expect(page2.items[0].bvid).toBe("BVA20");
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=page-2");
    const all = [...page1.items, ...page2.items].map((item) => item.bvid);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual([
      ...Array.from({ length: 25 }, (_, i) => `BVA${i}`),
      ...Array.from({ length: 5 }, (_, i) => `BVB${i}`),
    ]);
    expect(hasMoreSubmissions(page2.cursor)).toBe(false);
  });

  it("scope up: 走空间动态接口并在原地按 bvid 去重排序", async () => {
    let call = 0;
    const fetchMock = vi.fn(async (_input: unknown) => ({
      json: async () => {
        call += 1;
        if (call === 1) {
          return {
            code: 0,
            data: {
              items: [
                rawArchive("u1", "BVU1", "第一支", 5, "UP5", 200),
                rawArchive("u2", "BVU2", "第二支", 5, "UP5", 300),
                rawArchive("u3", "BVU2", "第二支（重复）", 5, "UP5", 400),
              ],
              offset: "cursor-up",
            },
          };
        }
        return { code: 0, data: { items: [], offset: "" } };
      },
    }));

    const page = await loadSubmissions(
      { scope: "up", mid: 5 },
      null,
      fetchMock as unknown as typeof fetch,
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("host_mid=5");
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=cursor-up");
    expect(page.items.map((item) => item.bvid)).toEqual(["BVU2", "BVU1"]);
    expect(hasMoreSubmissions(page.cursor)).toBe(false);
  });
});

describe("start", () => {
  it("首页未登录：清空文档，只留通往 passport 的登录链接", async () => {
    setFixture(
      `<input placeholder="搜索" /><li data-bvid="BV推荐">热门推荐</li>`,
    );
    const world = makeWorld("https://www.bilibili.com/", {
      loggedIn: false,
    });

    await start(world.env);

    expect(document.querySelector("input")).toBeNull();
    expect(document.querySelector("[data-bvid]")).toBeNull();
    expect(document.querySelector("#follows-root")).toBeNull();

    const link = document.querySelector(
      'a[href="https://passport.bilibili.com/login"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("登录 B 站");
    expect(world.replace).not.toHaveBeenCalled();
  });

  it("首页已登录：文档被换成首页，关注与投稿可见", async () => {
    setFixture(`<div id="biliMainHeader"><a href="/v/popular/all">推荐</a></div>`);
    const world = makeWorld("https://www.bilibili.com/");

    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#follows-root")).not.toBeNull();
    expect(document.querySelector("#biliMainHeader")).toBeNull();

    const mids = [...document.querySelectorAll("#follows-root li[data-follows-mid]")].map((node) =>
      node.getAttribute("data-follows-mid"),
    );
    expect(mids).toEqual(["3", "2"]);
    expect(
      document.querySelector('#follows-root li[data-follows="all"]')?.textContent,
    ).toBe("全部更新");

    const cards = [...document.querySelectorAll("#follows-root main [data-bvid]")].map(
      (node) => node.getAttribute("data-bvid"),
    );
    expect(cards).toEqual(["BVUP3", "BVUP2"]);
  });

  it("首页侧栏按 B 站原生关注分组排列，未分组排在最后", async () => {
    const world = makeWorld("https://www.bilibili.com/", {
      relationTags: [{ tagid: 10, name: "影视" }],
      relationMembers: { 10: [2] },
    });

    await start(world.env);

    const entries = [
      ...document.querySelectorAll("#follows-root nav ul>li"),
    ].map((li) => {
      if (li.hasAttribute("data-follows")) {
        return "all";
      }
      if (li.hasAttribute("data-follows-mid")) {
        return `mid:${li.getAttribute("data-follows-mid")}`;
      }
      return `group:${li.getAttribute("data-group-id") ?? ""}`;
    });
    expect(entries).toEqual(["all", "group:10", "mid:2", "group:", "mid:3"]);
    expect(
      document.querySelector('#follows-root [data-group-id="10"]')?.textContent,
    ).toBe("影视");
  });

  it("点分组头后中栏只显示该组成员的投稿", async () => {
    const world = makeWorld("https://www.bilibili.com/", {
      relationTags: [{ tagid: 10, name: "影视" }],
      relationMembers: { 10: [2] },
    });

    await start(world.env);
    (document.querySelector('[data-group-id="10"]') as HTMLElement).click();
    await settle();

    const cards = [
      ...document.querySelectorAll("#follows-root main [data-bvid]"),
    ].map((node) => node.getAttribute("data-bvid"));
    expect(cards).toEqual(["BVUP2"]);
  });

  it("移动分组成功后侧栏立刻按新组重排", async () => {
    const world = makeWorld("https://www.bilibili.com/", {
      relationTags: [{ tagid: 10, name: "影视" }],
      relationMembers: { 10: [2] },
    });

    await start(world.env);
    (
      document.querySelector(
        '[data-group-edit="3"]',
      ) as HTMLButtonElement
    ).click();
    (
      document.querySelector(
        '[data-group-option="10"]',
      ) as HTMLButtonElement
    ).click();
    await settle();

    const mids = [
      ...document.querySelectorAll("#follows-root li[data-follows-mid]"),
    ].map((node) => node.getAttribute("data-follows-mid"));
    expect(new Set(mids)).toEqual(new Set(["2", "3"]));
    expect(document.querySelector('[data-group-id=""]')).toBeNull();
    expect(world.fetchMock.mock.calls.some(([url]) =>
      String(url).includes("/x/relation/tags/addUsers"),
    )).toBe(true);
  });

  it("首页点投稿卡片时在右侧窗格内嵌播放，不离开首页", async () => {
    const world = makeWorld("https://www.bilibili.com/");

    await start(world.env);

    const before = document.location.href;
    document
      .querySelector('[data-bvid="BVUP2"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.location.href).toBe(before);
    const frame = document.querySelector(
      "#follows-root aside iframe",
    ) as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("src")).toBe(
      "https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=BVUP2&danmaku=1&autoplay=1",
    );
    expect(frame?.hasAttribute("allowfullscreen")).toBe(true);
  });

  it("点播放窗里的「在 B 站打开」才去视频页", async () => {
    const world = makeWorld("https://www.bilibili.com/");

    await start(world.env);

    (document.querySelector('[data-bvid="BVUP2"]') as HTMLElement).click();
    const open = [...document.querySelectorAll("#follows-root aside a")].find(
      (link) => link.textContent === "在 B 站打开",
    ) as HTMLAnchorElement | undefined;
    expect(open).toBeDefined();
    expect(open?.getAttribute("href")).toBe(
      "https://www.bilibili.com/video/BVUP2",
    );

    (open as HTMLAnchorElement).click();

    expect(document.location.href).toBe("https://www.bilibili.com/video/BVUP2");
  });

  it("首页出现继续看按钮时按 offset 翻页并保持去重", async () => {
    const feed = Array.from({ length: 21 }, (_, i) =>
      rawArchive(`m${i}`, `BVM${i}`, `稿${i}`, 2, "影视飓风", 2000 - i),
    );
    const world = makeWorld("https://www.bilibili.com/", {
      feedAll: feed,
      feedAllOffset: "cursor-2",
    });

    await start(world.env);

    expect(
      document.querySelectorAll("#follows-root main [data-bvid]").length,
    ).toBe(20);
    const more = moreButton();
    expect(more).not.toBeNull();

    more?.click();
    await settle();

    const allFeeds = world.fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("feed/all"),
    );
    expect(allFeeds).toHaveLength(2);
    expect(String(allFeeds[1][0])).toContain("offset=cursor-2");
    const cards = [
      ...document.querySelectorAll("#follows-root main [data-bvid]"),
    ].map((node) => node.getAttribute("data-bvid"));
    expect(cards).toHaveLength(21);
    expect(new Set(cards).size).toBe(21);
    expect(cards[cards.length - 1]).toBe("BVM20");
  });

  it("点继续看后在重绘后保持滚动位置", async () => {
    const feed = Array.from({ length: 21 }, (_, i) =>
      rawArchive(`m${i}`, `BVM${i}`, `稿${i}`, 2, "影视飓风", 2000 - i),
    );
    const world = makeWorld("https://www.bilibili.com/", {
      feedAll: feed,
      feedAllOffset: "cursor-2",
    });

    await start(world.env);

    const feedMain = document.querySelector(
      "#follows-root main",
    ) as HTMLElement | null;
    expect(feedMain).not.toBeNull();
    feedMain!.scrollTop = 480;

    moreButton()?.click();
    await settle();

    expect(feedMain!.scrollTop).toBe(480);
  });

  it("切换 UP 后滚动回到顶部", async () => {
    const world = makeWorld("https://www.bilibili.com/");

    await start(world.env);

    const feedMain = document.querySelector(
      "#follows-root main",
    ) as HTMLElement | null;
    expect(feedMain).not.toBeNull();
    feedMain!.scrollTop = 480;

    const upItem = [...document.querySelectorAll("#follows-root nav li")].find(
      (li) => li.textContent === "何同学",
    );
    upItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();

    const feedMainAfter = document.querySelector(
      "#follows-root main",
    ) as HTMLElement | null;
    expect(feedMainAfter).not.toBeNull();
    expect(feedMainAfter!.scrollTop).toBe(0);
  });

  it("已关注的空间页变成首页且只显示这个 UP 的投稿", async () => {
    const world = makeWorld("https://space.bilibili.com/2");

    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#follows-root")).not.toBeNull();
    const cards = [...document.querySelectorAll("#follows-root main [data-bvid]")].map(
      (node) => node.getAttribute("data-bvid"),
    );
    expect(cards).toEqual(["BVSP22", "BVSP21"]);
    expect(
      document.querySelector('a[href="https://space.bilibili.com/2/article"]'),
    ).not.toBeNull();
  });

  it("未关注的空间页重定向回首页", async () => {
    const world = makeWorld("https://space.bilibili.com/999");

    await start(world.env);

    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith(HOME_URL);
  });

  it("排行榜页重定向回首页", async () => {
    const world = makeWorld("https://www.bilibili.com/v/popular/rank/all");

    await start(world.env);

    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith(HOME_URL);
  });

  it("历史页不重定向，顶栏节点被去掉", async () => {
    setFixture(
      `<div id="biliMainHeader"><a href="/x">顶栏</a></div><ul id="history-list"><li>看过</li></ul>`,
    );
    const world = makeWorld("https://www.bilibili.com/history");

    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("#history-list")).not.toBeNull();
  });

  it("未关注视频页相当于 unfollowed 策略，关注失败时给出提示", async () => {
    setFixture(VIDEO_FIXTURE);
    const world = makeWorld("https://www.bilibili.com/video/BV1xx", {
      viewOwner: { mid: 999, name: "路人" },
      modifyCode: -101,
    });

    await start(world.env);

    expect(document.querySelector("video")).not.toBeNull();
    expect(document.querySelector("#comment")).toBeNull();
    expect(document.querySelector(".video-toolbar-left")).toBeNull();
    expect(document.querySelector("#arc_toolbar_report")).toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(document.querySelector(".bpx-player-ending-wrap")).toBeNull();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("#follows-up-videos")).toBeNull();
    expect(document.querySelector('a[data-action="back-home"]')).toBeNull();

    const button = document.querySelector(
      'button[data-action="follow"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("关注");
    expect(world.replace).not.toHaveBeenCalled();

    button?.click();
    await settle();

    const error = document.querySelector("[data-role='follow-error']");
    expect(error?.textContent).toBe("没有关注上，请再试一次");
    expect(button?.nextElementSibling).toBe(error);
    expect(document.querySelector("#comment")).toBeNull();
    expect(document.querySelector('a[data-action="back-home"]')).toBeNull();

    const modifyCall = world.fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/x/relation/modify"),
    );
    expect(modifyCall).toBeDefined();
    const init = modifyCall?.[1] as RequestInit;
    expect(String(init.body)).toContain("fid=999");
    expect(String(init.body)).toContain("csrf=tok123");
  });

  it("关注成功后刷新，重新进入已关注播放页时评论还在", async () => {
    setFixture(VIDEO_FIXTURE);
    const world = makeWorld("https://www.bilibili.com/video/BV1xx", {
      viewOwner: { mid: 999, name: "路人" },
      modifyCode: 0,
    });

    await start(world.env);

    const button = document.querySelector(
      'button[data-action="follow"]',
    ) as HTMLButtonElement | null;

    button?.click();
    await settle();

    expect(world.reload).toHaveBeenCalledTimes(1);
    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#comment")).toBeNull();

    world.state.followings.push({ mid: 999, name: "路人" });
    setFixture(VIDEO_FIXTURE);
    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#comment")).not.toBeNull();
    expect(document.querySelector(".video-toolbar-left")).not.toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(
      document.querySelector('a[data-action="back-home"]')?.textContent,
    ).toBe("返回关注");
    const sideLinks = [
      ...document.querySelectorAll("#follows-up-videos a[data-bvid]"),
    ];
    expect(sideLinks.map((node) => node.getAttribute("data-bvid"))).toEqual([
      "BVSP9992",
      "BVSP9991",
    ]);
    expect(sideLinks[0]?.getAttribute("href")).toBe(
      "https://www.bilibili.com/video/BVSP9992",
    );
    expect(
      document.querySelector('button[data-action="follow"]'),
    ).toBeNull();
  });

  it("已关注视频页保留评论，并通过 MutationObserver 清掉后出现的结束画面", async () => {
    setFixture(VIDEO_FIXTURE);
    const world = makeWorld("https://www.bilibili.com/video/BV1xx");

    await start(world.env);

    expect(document.querySelector("video")).not.toBeNull();
    expect(document.querySelector("#comment")).not.toBeNull();
    expect(document.querySelector(".video-toolbar-left")).not.toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("button[data-action='follow']")).toBeNull();

    const ending = document.createElement("div");
    ending.className = "bpx-player-ending-wrap";
    document.body.appendChild(ending);
    const related = document.createElement("div");
    related.className = "bpx-player-ending-related";
    document.body.appendChild(related);

    await settle();

    expect(document.querySelector(".bpx-player-ending-wrap")).toBeNull();
    expect(document.querySelector(".bpx-player-ending-related")).toBeNull();
    expect(
      document.querySelectorAll('a[data-action="back-home"]').length,
    ).toBe(1);
    expect(document.querySelectorAll("#follows-up-videos").length).toBe(1);
  });

  it("专栏作者是关注的人：按 native 策略处理，不重定向", async () => {
    setFixture(
      `<div id="biliMainHeader"></div><div id="article-content">正文</div>`,
    );
    const world = makeWorld("https://www.bilibili.com/read/cv1", {
      workAuthorMid: 2,
    });

    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("#article-content")).not.toBeNull();
  });

  it("专栏作者不在关注里：重定向回首页", async () => {
    const world = makeWorld("https://www.bilibili.com/read/cv1", {
      workAuthorMid: 999,
    });

    await start(world.env);

    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith(HOME_URL);
  });

  it("请求返回之前，首页上的原站内容已经不在", async () => {
    setFixture(
      `<div id="biliMainHeader">推荐</div><li data-bvid="BV推荐">热门</li>`,
    );
    const world = makeWorld("https://www.bilibili.com/");
    const release = holdFirstFetch(world.fetchMock);

    const pending = start(world.env);

    expect(world.fetchMock).toHaveBeenCalled();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector('[data-bvid="BV推荐"]')).toBeNull();
    expect(document.getElementById("follows-only-cover")).not.toBeNull();
    release();
    await pending;
    expect(document.querySelector("#follows-root")).not.toBeNull();
  });

  it("请求失败后页面保持空白，不回到原站", async () => {
    setFixture(VIDEO_FIXTURE);
    const world = makeWorld("https://www.bilibili.com/video/BV1xx");
    world.fetchMock.mockRejectedValue(new Error("down"));

    await expect(start(world.env)).rejects.toThrow("down");

    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(document.querySelector("#comment")).toBeNull();
    expect(document.querySelector("#follows-root")).toBeNull();
    expect(
      document.documentElement.classList.contains("follows-only-covered"),
    ).toBe(true);
  });

  it("历史页在决策前保留列表，请求失败后也不留原站", async () => {
    setFixture(`<ul id="history-list"><li>看过</li></ul>`);
    const world = makeWorld("https://www.bilibili.com/history");
    const release = holdFirstFetch(world.fetchMock);

    const pending = start(world.env);
    expect(document.querySelector("#history-list")).not.toBeNull();
    release();
    await pending;
    expect(document.querySelector("#history-list")).not.toBeNull();

    resetPageRuntime(document);
    setFixture(`<ul id="history-list"><li>看过</li></ul>`);
    const failed = makeWorld("https://www.bilibili.com/history");
    failed.fetchMock.mockRejectedValue(new Error("down"));
    await expect(start(failed.env)).rejects.toThrow("down");
    expect(document.querySelector("#history-list")).toBeNull();
  });

  it("登录页不被清掉，也不发请求", async () => {
    setFixture(`<form id="login-form"></form>`);
    const world = makeWorld("https://passport.bilibili.com/login");

    await start(world.env);

    expect(world.fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector("#login-form")).not.toBeNull();
    expect(
      document.documentElement.classList.contains("follows-only-covered"),
    ).toBe(false);
  });

  it("未关注专栏在作者查询完成前就被盖住", async () => {
    setFixture(`<div id="article-content"><a href="/v/popular">推荐</a></div>`);
    const world = makeWorld("https://www.bilibili.com/read/cv1", {
      workAuthorMid: 999,
    });
    const release = holdFirstFetch(world.fetchMock);

    const pending = start(world.env);
    const article = document.querySelector("#article-content") as HTMLElement;
    expect(article).not.toBeNull();
    expect(
      document.documentElement.classList.contains("follows-only-covered"),
    ).toBe(true);
    expect(getComputedStyle(article).display).toBe("none");
    release();
    await pending;
    expect(world.replace).toHaveBeenCalledWith(HOME_URL);
    expect(document.querySelector("#article-content")).toBeNull();
  });

  it("首页点某个 UP 后改拉他的投稿，继续看走他的游标", async () => {
    const spaceItems = Array.from({ length: 21 }, (_, i) =>
      rawArchive(`p${i}`, `BVSEL${i}`, `投稿${i}`, 2, "影视飓风", 4000 - i),
    );
    const world = makeWorld("https://www.bilibili.com/", {
      spaceItems,
      spaceOffset: "space-2",
    });

    await start(world.env);
    (document.querySelector('[data-follows-mid="2"]') as HTMLElement).click();
    await settle();

    let cards = [
      ...document.querySelectorAll("#follows-root main [data-bvid]"),
    ].map((node) => node.getAttribute("data-bvid"));
    expect(cards).toHaveLength(20);
    expect(cards[0]).toBe("BVSEL0");
    expect(cards).not.toContain("BVUP3");
    const spaceCalls = () =>
      world.fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("feed/space"),
      );
    expect(spaceCalls()).toHaveLength(1);
    expect(String(spaceCalls()[0][0])).toContain("host_mid=2");

    const more = moreButton() as HTMLButtonElement;
    expect(more).not.toBeNull();
    more.click();
    await settle();

    expect(spaceCalls()).toHaveLength(2);
    expect(String(spaceCalls()[1][0])).toContain("offset=space-2");
    cards = [
      ...document.querySelectorAll("#follows-root main [data-bvid]"),
    ].map((node) => node.getAttribute("data-bvid"));
    expect(cards).toHaveLength(21);
    expect(cards[20]).toBe("BVSEL20");
    expect(new Set(cards).size).toBe(21);

    (document.querySelector('[data-follows="all"]') as HTMLElement).click();
    await settle();
    cards = [
      ...document.querySelectorAll("#follows-root main [data-bvid]"),
    ].map((node) => node.getAttribute("data-bvid"));
    expect(cards).toEqual(["BVUP3", "BVUP2"]);
  });

  it("已关注合集目录留在页面上，不回首页", async () => {
    setFixture(
      `<div id="biliMainHeader"></div><div id="lists">合集</div>`,
    );
    const world = makeWorld("https://space.bilibili.com/2/lists");

    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("#lists")).not.toBeNull();
  });

  it("侧栏不包含正在看的这一条，并且链到视频页", async () => {
    setFixture(VIDEO_FIXTURE);
    const world = makeWorld("https://www.bilibili.com/video/BVSP21", {
      viewOwner: { mid: 2, name: "影视飓风", bvid: "BVSP21" },
    });

    await start(world.env);

    const links = [
      ...document.querySelectorAll("#follows-up-videos a[data-bvid]"),
    ];
    expect(links.map((node) => node.getAttribute("data-bvid"))).toEqual([
      "BVSP22",
    ]);
    expect(links[0]?.getAttribute("href")).toBe(
      "https://www.bilibili.com/video/BVSP22",
    );
  });

  it("首页时间把秒级 pub_ts 换成毫秒，而不是 1970 附近的误读", async () => {
    const seconds = 1_700_000_002;
    const world = makeWorld("https://www.bilibili.com/", {
      feedAll: [
        rawArchive("d1", "BVUP3", "何同学的新视频", 3, "何同学", seconds),
      ],
      feedAllOffset: "",
    });

    await start(world.env);

    const time = document.querySelector("#follows-root time");
    expect(time?.dateTime).toBe("2023-11-14T22:13:22.000Z");
    expect(time?.dateTime).not.toBe(new Date(seconds).toISOString());
  });

  it("视频作者解析失败时留在空白页", async () => {
    setFixture(VIDEO_FIXTURE);
    const world = makeWorld("https://www.bilibili.com/video/BV1xx");
    const original = world.fetchMock.getMockImplementation();
    world.fetchMock.mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes("/x/web-interface/view")) {
        return { json: async () => ({ code: 0, data: {} }) };
      }
      return original!(input, init);
    });

    await expect(start(world.env)).rejects.toThrow(/video owner unavailable/);
    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(
      document.documentElement.classList.contains("follows-only-covered"),
    ).toBe(true);
  });
});

function holdFirstFetch(
  fetchMock: ReturnType<typeof vi.fn>,
): () => void {
  const original = fetchMock.getMockImplementation();
  if (original === undefined) {
    throw new Error("missing fetch implementation");
  }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  fetchMock.mockImplementation(async (input: unknown, init?: unknown) => {
    if (first) {
      first = false;
      await gate;
    }
    return original(input, init);
  });
  return () => release();
}

describe("extension manifest", () => {
  type Manifest = {
    manifest_version: number;
    name: string;
    version: string;
    permissions?: string[];
    content_scripts: Array<{
      matches: string[];
      js?: string[];
      run_at?: string;
    }>;
    host_permissions?: string[];
  };

  const manifest = JSON.parse(
    readFileSync("extension/manifest.json", "utf8"),
  ) as Manifest;

  it("是 MV3 清单，名字为「只看关注」", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("只看关注");
  });

  it("版本号是 1.0.0", () => {
    expect(manifest.version).toBe("1.0.0");
  });

  it("不申请 cookies 或 storage 权限", () => {
    expect(manifest.permissions ?? []).not.toContain("cookies");
    expect(manifest.permissions ?? []).not.toContain("storage");
  });

  it("不申请任何 permissions(分组走页面登录态请求)", () => {
    expect(manifest.permissions ?? []).toEqual([]);
  });

  it("document_start 注入，matches 覆盖 bilibili 站点且不含 b23.tv", () => {
    const script = manifest.content_scripts[0];
    expect(script?.run_at).toBe("document_start");
    expect(script?.matches).toContain("https://*.bilibili.com/*");
    expect(
      (script?.matches ?? []).some((match) => match.includes("b23.tv")),
    ).toBe(false);
    expect(script?.js).toEqual(["content.js"]);
  });

  it("清单里的脚本路径相对 manifest 能落到打包后的经典脚本", () => {
    const scriptPath = manifest.content_scripts[0]?.js?.[0];
    expect(scriptPath).toBe("content.js");
    const manifestDir = path.resolve("extension");
    const resolved = path.resolve(manifestDir, scriptPath ?? "");
    expect(path.relative(manifestDir, resolved)).toBe("content.js");
    expect(resolved.includes(`${path.sep}dist${path.sep}`)).toBe(false);
    expect(existsSync(resolved)).toBe(true);

    const source = readFileSync(resolved, "utf8");
    const trimmed = source.trim();
    expect(source).toMatch(/\(\(\)\s*=>\s*\{/);
    expect(trimmed).toMatch(/\}\)\(\);$/);
    expect(source).not.toMatch(/^\s*import[\s{]/m);
    expect(source).not.toMatch(/^\s*export[\s{]/m);
    expect(source).toContain('credentials: "include"');
    expect(source).not.toContain("chrome.storage");
    expect(source).not.toContain("chrome.cookies");
  });

  it("入口不等待 DOMContentLoaded", () => {
    const source = readFileSync("src/content/main.ts", "utf8");
    expect(source).not.toContain("DOMContentLoaded");
  });

  it("host_permissions 只有 bilibili 站点与 api", () => {
    expect([...(manifest.host_permissions ?? [])].sort()).toEqual([
      "https://*.bilibili.com/*",
      "https://api.bilibili.com/*",
    ]);
  });
});
