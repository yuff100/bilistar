import { describe, expect, it } from "vitest";
import {
  collapseParts,
  newestFirst,
  onlySubmissions,
  orderFollowings,
  type RawDynamic,
  type Submission,
} from "../../src/domain/feed.js";

describe("onlySubmissions", () => {
  it("keeps archive entries and drops live and opus", () => {
    const items: RawDynamic[] = [
      {
        id: "1",
        majorType: "archive",
        bvid: "BV1archive",
        title: "投稿标题",
        authorMid: 10,
        authorName: "UP主",
        publishedAt: 100,
      },
      {
        id: "2",
        majorType: "live",
        bvid: "BV1live",
        title: "直播",
        authorMid: 10,
        authorName: "UP主",
        publishedAt: 200,
      },
      {
        id: "3",
        majorType: "opus",
        title: "图文",
        authorMid: 10,
        authorName: "UP主",
        publishedAt: 300,
      },
    ];

    expect(onlySubmissions(items)).toEqual([
      {
        bvid: "BV1archive",
        title: "投稿标题",
        authorMid: 10,
        authorName: "UP主",
        publishedAt: 100,
      },
    ]);
  });
});

describe("collapseParts", () => {
  it("keeps one entry when the same bvid appears twice", () => {
    const base: Submission = {
      bvid: "BV1same",
      title: "分 P 1",
      authorMid: 1,
      authorName: "A",
      publishedAt: 100,
    };
    const duplicate: Submission = {
      ...base,
      title: "分 P 2",
      publishedAt: 200,
    };

    expect(collapseParts([base, duplicate])).toEqual([base]);
  });
});

describe("newestFirst", () => {
  it("orders by publishedAt descending", () => {
    const a: Submission = {
      bvid: "BVa",
      title: "a",
      authorMid: 1,
      authorName: "A",
      publishedAt: 300,
    };
    const b: Submission = {
      bvid: "BVb",
      title: "b",
      authorMid: 1,
      authorName: "A",
      publishedAt: 100,
    };
    const c: Submission = {
      bvid: "BVc",
      title: "c",
      authorMid: 1,
      authorName: "A",
      publishedAt: 200,
    };

    expect(newestFirst([b, c, a]).map((s) => s.publishedAt)).toEqual([
      300, 200, 100,
    ]);
  });
});

describe("orderFollowings", () => {
  it("puts followings with newer submissions first, then others in original order", () => {
    const followings = [
      { mid: 1, name: "一" },
      { mid: 2, name: "二" },
      { mid: 3, name: "三" },
    ];
    const submissions: Submission[] = [
      {
        bvid: "BV3",
        title: "三",
        authorMid: 3,
        authorName: "三",
        publishedAt: 500,
      },
      {
        bvid: "BV1",
        title: "一",
        authorMid: 1,
        authorName: "一",
        publishedAt: 100,
      },
    ];

    expect(orderFollowings(followings, submissions).map((f) => f.mid)).toEqual([
      3, 1, 2,
    ]);
  });
});
