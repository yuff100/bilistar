import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadFollowings,
  loadSubmissions,
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
  viewOwner: { mid: number; name: string };
  workAuthorMid: number;
  modifyCode: number;
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
            items: [
              rawArchive(`s${mid}-1`, `BVSP${mid}1`, `UP${mid}的投稿一`, mid, `UP${mid}`, 2001),
              rawArchive(`s${mid}-2`, `BVSP${mid}2`, `UP${mid}的投稿二`, mid, `UP${mid}`, 2002),
            ],
            offset: "",
          },
        };
      }
      if (url.includes("/x/relation/modify")) {
        return { code: state.modifyCode };
      }
      if (url.includes("/x/web-interface/view")) {
        return { code: 0, data: { owner: state.viewOwner } };
      }
      if (url.includes("/x/article/viewinfo")) {
        return { code: 0, data: { mid: state.workAuthorMid } };
      }
      throw new Error(`unexpected url: ${url}`);
    },
  }));

  const replace = vi.fn();
  const env: PageEnv = {
    href,
    document,
    fetchImpl: fetchMock as unknown as typeof fetch,
    cookie: "SESSDATA=secret; bili_jct=tok123",
    replace,
  };
  return { env, replace, fetchMock, state };
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

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

beforeEach(() => {
  document.body.innerHTML = "";
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
    expect(page.nextOffset).toBeNull();
    for (const item of page.items) {
      expect(item.bvid).toMatch(/^BVA/);
      expect(item.title).not.toContain("直播");
    }
    // 从新到旧排列：最新的 BVA20 在最前，最旧的 BVA0 被截掉。
    expect(page.items[0].bvid).toBe("BVA20");
    expect(page.items[1].bvid).toBe("BVA19");
    expect(page.items[19].bvid).toBe("BVA1");
    for (let i = 0; i + 1 < page.items.length; i += 1) {
      expect(page.items[i].publishedAt).toBeGreaterThan(
        page.items[i + 1].publishedAt,
      );
    }
  });

  it("scope up: 走空间动态接口并在原地按 bvid 去重排序", async () => {
    const fetchMock = vi.fn(async (_input: unknown) => ({
      json: async () => ({
        code: 0,
        data: {
          items: [
            rawArchive("u1", "BVU1", "第一支", 5, "UP5", 200),
            rawArchive("u2", "BVU2", "第二支", 5, "UP5", 300),
            rawArchive("u3", "BVU2", "第二支（重复）", 5, "UP5", 400),
          ],
          offset: "cursor-up",
        },
      }),
    }));

    const page = await loadSubmissions(
      { scope: "up", mid: 5 },
      null,
      fetchMock as unknown as typeof fetch,
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("host_mid=5");
    expect(page.items.map((item) => item.bvid)).toEqual(["BVU2", "BVU1"]);
    expect(page.nextOffset).toBe("cursor-up");
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

  it("首页点投稿卡片时把地址设为视频页", async () => {
    const world = makeWorld("https://www.bilibili.com/");

    await start(world.env);

    document
      .querySelector('[data-bvid="BVUP2"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

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
    const more = document.querySelector(
      "#follows-root main button",
    ) as HTMLButtonElement | null;
    expect(more?.textContent).toBe("继续看");

    more?.click();
    await settle();

    const allFeeds = world.fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("feed/all"),
    );
    expect(allFeeds).toHaveLength(2);
    expect(String(allFeeds[1][0])).toContain("offset=cursor-2");
    expect(
      document.querySelectorAll("#follows-root main [data-bvid]").length,
    ).toBe(20);
  });

  it("已关注的空间页变成首页且只显示这个 UP 的投稿", async () => {
    const world = makeWorld("https://space.bilibili.com/2");

    await start(world.env);

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("#follows-root")).not.toBeNull();
    const cards = [...document.querySelectorAll("#follows-root main [data-bvid]")].map(
      (node) => node.getAttribute("data-bvid"),
    );
    expect(cards).toEqual(["BVUP2"]);
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

  it("关注成功后进入已关注界面，再跑一次策略后评论区留在夹具里", async () => {
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

    expect(world.replace).not.toHaveBeenCalled();
    expect(document.querySelector("[data-role='follow-error']")).toBeNull();
    expect(
      document.querySelector('a[data-action="back-home"]')?.textContent,
    ).toBe("返回关注");
    const sideBvids = [...document.querySelectorAll("#follows-up-videos [data-bvid]")].map(
      (node) => node.getAttribute("data-bvid"),
    );
    expect(sideBvids).toEqual(["BVSP9992", "BVSP9991"]);

    // 关注关系已变化（模拟刷新后重新执行策略）
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
    expect(document.querySelector("#follows-up-videos")).not.toBeNull();
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
});

describe("extension manifest", () => {
  type Manifest = {
    manifest_version: number;
    name: string;
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

  it("不申请 cookies 或 storage 权限", () => {
    expect(manifest.permissions ?? []).not.toContain("cookies");
    expect(manifest.permissions ?? []).not.toContain("storage");
  });

  it("document_start 注入，matches 覆盖 bilibili 站点且不含 b23.tv", () => {
    const script = manifest.content_scripts[0];
    expect(script?.run_at).toBe("document_start");
    expect(script?.matches).toContain("https://*.bilibili.com/*");
    expect(
      (script?.matches ?? []).some((match) => match.includes("b23.tv")),
    ).toBe(false);
    expect(script?.js).toContain("dist/content.js");
  });

  it("host_permissions 只有 bilibili 站点与 api", () => {
    expect([...(manifest.host_permissions ?? [])].sort()).toEqual([
      "https://*.bilibili.com/*",
      "https://api.bilibili.com/*",
    ]);
  });
});