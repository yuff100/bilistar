import { describe, expect, it, vi } from "vitest";
import {
  addUserToGroups,
  followUp,
  getSession,
  getVideoOwner,
  getWorkAuthor,
  listAllSubmissions,
  listFollowings,
  listGroupMembers,
  listRelationTags,
  listUpSubmissions,
  parseDynamics,
  parseFollowings,
  parseGroupMembers,
  parseRelationTags,
  parseSession,
  parseViewOwner,
  parseWorkAuthor,
  readCsrfToken,
  removeUserFromGroups,
} from "../../src/api/client.js";

function fakeFetch(payload: unknown) {
  const mock = vi.fn(async (_input: unknown, _init?: unknown) => ({
    json: async () => payload,
  }));
  return { mock, fetchImpl: mock as unknown as typeof fetch };
}

describe("readCsrfToken", () => {
  it("extracts bili_jct from the cookie string", () => {
    expect(readCsrfToken("SESSDATA=secret; bili_jct=abc")).toBe("abc");
    expect(readCsrfToken("bili_jct=abc; SESSDATA=secret")).toBe("abc");
  });

  it("returns null when bili_jct is missing or empty", () => {
    expect(readCsrfToken("SESSDATA=secret")).toBeNull();
    expect(readCsrfToken("bili_jct=")).toBeNull();
  });

  it("does not confuse other cookie names with bili_jct", () => {
    expect(readCsrfToken("xbili_jct=zzz; SESSDATA=secret")).toBeNull();
  });
});

describe("parseSession", () => {
  it("reads a logged-in session", () => {
    expect(parseSession({ code: 0, data: { isLogin: true, mid: 7 } })).toEqual({
      loggedIn: true,
      mid: 7,
    });
  });

  it("reads a logged-out session", () => {
    expect(parseSession({ code: 0, data: { isLogin: false } })).toEqual({
      loggedIn: false,
    });
  });
});

describe("getSession", () => {
  it("requests the nav endpoint with the page session", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { isLogin: true, mid: 7 },
    });

    await expect(getSession(fetchImpl)).resolves.toEqual({
      loggedIn: true,
      mid: 7,
    });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/web-interface/nav",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

describe("parseFollowings", () => {
  it("reads followings and the total count", () => {
    const body = {
      code: 0,
      data: {
        list: [
          { mid: 1, uname: "甲" },
          { mid: 2, uname: "乙" },
        ],
        total: 2,
      },
    };

    expect(parseFollowings(body)).toEqual({
      items: [
        { mid: 1, name: "甲" },
        { mid: 2, name: "乙" },
      ],
      total: 2,
    });
  });
});

describe("listFollowings", () => {
  it("requests the relation endpoint with the page session", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { list: [{ mid: 1, uname: "甲" }], total: 1 },
    });

    await expect(listFollowings(7, 1, fetchImpl)).resolves.toEqual({
      items: [{ mid: 1, name: "甲" }],
      total: 1,
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/relation/followings?vmid=7&pn=1&ps=50&order=desc",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

function dynamicItem(
  idStr: string,
  majorType: string,
  major: Record<string, unknown>,
) {
  return {
    id_str: idStr,
    modules: {
      module_author: { mid: 10, name: "UP主", pub_ts: 1729 },
      module_dynamic: { major: { type: majorType, ...major } },
    },
  };
}

describe("parseDynamics", () => {
  it("maps major types and reads archive details", () => {
    const body = {
      code: 0,
      data: {
        offset: "next-cursor",
        items: [
          dynamicItem("1001", "MAJOR_TYPE_ARCHIVE", {
            archive: { bvid: "BV1archive", title: "投稿标题" },
          }),
          dynamicItem("1002", "MAJOR_TYPE_LIVE_RCMD", {}),
          dynamicItem("1003", "MAJOR_TYPE_OPUS", {}),
        ],
      },
    };

    expect(parseDynamics(body)).toEqual({
      items: [
        {
          id: "1001",
          majorType: "archive",
          bvid: "BV1archive",
          title: "投稿标题",
          authorMid: 10,
          authorName: "UP主",
          publishedAt: 1_729_000,
        },
        {
          id: "1002",
          majorType: "live",
          authorMid: 10,
          authorName: "UP主",
          publishedAt: 1_729_000,
        },
        {
          id: "1003",
          majorType: "opus",
          authorMid: 10,
          authorName: "UP主",
          publishedAt: 1_729_000,
        },
      ],
      nextOffset: "next-cursor",
    });
  });

  it("drops archive entries without a usable bvid", () => {
    const body = {
      code: 0,
      data: {
        offset: "",
        items: [
          dynamicItem("1001", "MAJOR_TYPE_ARCHIVE", {
            archive: { bvid: "", title: "空 BV" },
          }),
          dynamicItem("1002", "MAJOR_TYPE_ARCHIVE", {}),
          dynamicItem("1003", "MAJOR_TYPE_ARCHIVE", {
            archive: { bvid: "BV1ok", title: "正常" },
          }),
        ],
      },
    };

    expect(parseDynamics(body)).toEqual({
      items: [
        {
          id: "1003",
          majorType: "archive",
          bvid: "BV1ok",
          title: "正常",
          authorMid: 10,
          authorName: "UP主",
          publishedAt: 1_729_000,
        },
      ],
      nextOffset: null,
    });
  });

  it("returns null nextOffset when offset is missing", () => {
    expect(parseDynamics({ code: 0, data: { items: [] } }).nextOffset).toBeNull();
  });

  it("accepts pub_ts as a numeric string from the live API", () => {
    const body = {
      code: 0,
      data: {
        items: [
          {
            id_str: "2001",
            modules: {
              module_author: {
                mid: 10,
                name: "UP主",
                pub_ts: "1792207804",
              },
              module_dynamic: {
                major: {
                  type: "MAJOR_TYPE_LIVE_RCMD",
                },
              },
            },
          },
        ],
      },
    };

    expect(parseDynamics(body).items[0]?.publishedAt).toBe(1_792_207_804_000);
  });
});

describe("listAllSubmissions", () => {
  it("requests the all-feed endpoint with an empty offset", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { items: [], offset: "cursor-2" },
    });

    await expect(listAllSubmissions(null, fetchImpl)).resolves.toEqual({
      items: [],
      nextOffset: "cursor-2",
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=video&features=itemOpusStyle&offset=",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

describe("listUpSubmissions", () => {
  it("requests the space-feed endpoint with the given offset", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { items: [], offset: "" },
    });

    await expect(listUpSubmissions(2, "cursor", fetchImpl)).resolves.toEqual({
      items: [],
      nextOffset: null,
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=2&type=video&offset=cursor",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

describe("parseViewOwner", () => {
  it("reads the video owner", () => {
    expect(
      parseViewOwner({
        code: 0,
        data: { bvid: "BV1xx", owner: { mid: 9, name: "九" } },
      }),
    ).toEqual({ mid: 9, name: "九", bvid: "BV1xx" });
  });

  it("returns null when the owner mid is missing or zero", () => {
    expect(parseViewOwner({ code: 0, data: {} })).toBeNull();
    expect(
      parseViewOwner({ code: 0, data: { owner: { mid: 0, name: "零" } } }),
    ).toBeNull();
  });
});

describe("getVideoOwner", () => {
  it("requests the view endpoint by bvid", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { owner: { mid: 9, name: "九" } },
    });

    await expect(getVideoOwner("BV1xx", fetchImpl)).resolves.toEqual({
      mid: 9,
      name: "九",
      bvid: "",
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/web-interface/view?bvid=BV1xx",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });

  it("requests the view endpoint by aid", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { owner: { mid: 9, name: "九" } },
    });

    await getVideoOwner("av42", fetchImpl);
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/web-interface/view?aid=42",
    );
  });

  it("rejects when the owner cannot be parsed", async () => {
    const { fetchImpl } = fakeFetch({ code: 0, data: {} });
    await expect(getVideoOwner("BV1xx", fetchImpl)).rejects.toThrow(
      /video owner unavailable/,
    );
  });
});

describe("parseWorkAuthor", () => {
  it("reads article, collection, and course author shapes", () => {
    expect(parseWorkAuthor({ code: 0, data: { mid: 33 } })).toEqual({
      mid: 33,
    });
    expect(
      parseWorkAuthor({ code: 0, data: { meta: { mid: 44 } } }),
    ).toEqual({ mid: 44 });
    expect(
      parseWorkAuthor({ code: 0, data: { up_info: { mid: 55 } } }),
    ).toEqual({ mid: 55 });
  });
});

describe("getWorkAuthor", () => {
  it("requests the article endpoint", async () => {
    const { mock, fetchImpl } = fakeFetch({ code: 0, data: { mid: 33 } });

    await expect(getWorkAuthor("article", "cv1", fetchImpl)).resolves.toEqual({
      mid: 33,
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/article/viewinfo?id=1",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });

  it("requests the collection endpoint", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { meta: { mid: 44 } },
    });

    await expect(getWorkAuthor("collection", "5", fetchImpl)).resolves.toEqual({
      mid: 44,
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?season_id=5&page_num=1&page_size=1",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });

  it("requests the course endpoint", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { up_info: { mid: 55 } },
    });

    await expect(getWorkAuthor("course", "9", fetchImpl)).resolves.toEqual({
      mid: 55,
    });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/pugv/view/web/season?season_id=9",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

describe("followUp", () => {
  it("posts a form-encoded follow request without leaking cookies", async () => {
    const { mock, fetchImpl } = fakeFetch({ code: 0 });

    await expect(followUp(2, "abc", fetchImpl)).resolves.toEqual({ ok: true });
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/relation/modify",
    );
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init.body).toBe("fid=2&act=1&re_src=11&csrf=abc");
    expect(String(init.body)).not.toContain("secret");
  });

  it("reports failure when the api rejects", async () => {
    const { fetchImpl } = fakeFetch({ code: -101 });

    await expect(followUp(2, "abc", fetchImpl)).resolves.toEqual({
      ok: false,
    });
  });
});

describe("parseRelationTags", () => {
  it("keeps custom groups and drops implicit ones", () => {
    expect(
      parseRelationTags({
        code: 0,
        data: [
          { tagid: 0, name: "特别关注" },
          { tagid: -10, name: "默认分组" },
          { tagid: 10, name: " 影视 " },
          { tagid: 11, name: "全部" },
          { tagid: 12, name: "科技" },
        ],
      }),
    ).toEqual([
      { tagid: 10, name: "影视" },
      { tagid: 12, name: "科技" },
    ]);
  });

  it("also reads data.list", () => {
    expect(
      parseRelationTags({
        code: 0,
        data: { list: [{ tagid: 8, name: "生活" }] },
      }),
    ).toEqual([{ tagid: 8, name: "生活" }]);
  });
});

describe("listRelationTags", () => {
  it("requests the tags endpoint with the page session", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: [{ tagid: 10, name: "影视" }],
    });

    await expect(listRelationTags(fetchImpl)).resolves.toEqual([
      { tagid: 10, name: "影视" },
    ]);
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/relation/tags",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

describe("parseGroupMembers", () => {
  it("reads member mids from data.list", () => {
    expect(
      parseGroupMembers({
        code: 0,
        data: { list: [{ mid: 2 }, { mid: "3" }, { uname: "无 mid" }] },
      }),
    ).toEqual([2, 3]);
  });
});

describe("listGroupMembers", () => {
  it("requests a page of group members", async () => {
    const { mock, fetchImpl } = fakeFetch({
      code: 0,
      data: { list: [{ mid: 2 }] },
    });

    await expect(listGroupMembers(10, 1, fetchImpl)).resolves.toEqual([2]);
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/relation/tag?tagid=10&pn=1&ps=50",
    );
    expect(mock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });
});

describe("addUserToGroups / removeUserFromGroups", () => {
  it("posts form-encoded membership changes", async () => {
    const { mock, fetchImpl } = fakeFetch({ code: 0 });

    await expect(addUserToGroups(2, [10], "abc", fetchImpl)).resolves.toBe(
      true,
    );
    expect(mock.mock.calls[0][0]).toBe(
      "https://api.bilibili.com/x/relation/tags/addUsers?csrf=abc",
    );
    const addInit = mock.mock.calls[0][1] as RequestInit;
    expect(addInit.method).toBe("POST");
    expect(addInit.credentials).toBe("include");
    expect(addInit.body).toBe("fids=2&tagids=10");

    await expect(removeUserFromGroups(2, [10, 11], "abc", fetchImpl)).resolves.toBe(
      true,
    );
    expect(mock.mock.calls[1][0]).toBe(
      "https://api.bilibili.com/x/relation/tags/delUsers?csrf=abc",
    );
    expect((mock.mock.calls[1][1] as RequestInit).body).toBe(
      "fids=2&tagids=10,11",
    );
  });

  it("reports failure when the api rejects", async () => {
    const { fetchImpl } = fakeFetch({ code: -403 });
    await expect(addUserToGroups(2, [10], "abc", fetchImpl)).resolves.toBe(
      false,
    );
  });
});
