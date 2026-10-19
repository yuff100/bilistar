import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Submission } from "../../src/domain/feed.js";
import {
  applyWatchPolicy,
  endingAutoplayAllowed,
  REMOVE_SELECTORS,
} from "../../src/ui/watch.js";

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

function buildWatchDocument(): void {
  document.body.innerHTML = `
    <div id="biliMainHeader">
      <a href="/v/popular/rank/all">排行榜</a>
    </div>
    <div class="bpx-player-video-wrap">
      <video></video>
      <div class="bpx-player-dm"></div>
    </div>
    <div id="comment"></div>
    <div class="video-toolbar-left"></div>
    <div id="reco_list"></div>
    <div class="bpx-player-ending-wrap"></div>
    <ul id="fav-list"></ul>
  `;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("REMOVE_SELECTORS", () => {
  it("exposes the exact removal selector lists", () => {
    expect(REMOVE_SELECTORS).toEqual({
      followed: [
        "#biliMainHeader",
        ".bili-header",
        "#reco_list",
        ".rec-footer",
        ".recommend-list-container",
        ".bpx-player-ending-wrap",
        ".bpx-player-ending-related",
      ],
      unfollowed: [
        "#biliMainHeader",
        ".bili-header",
        "#reco_list",
        ".rec-footer",
        ".recommend-list-container",
        ".bpx-player-ending-wrap",
        ".bpx-player-ending-related",
        "#comment",
        "#commentapp",
        "bili-comments",
        ".video-toolbar-left",
        "#arc_toolbar_report",
      ],
      native: ["#biliMainHeader", ".bili-header"],
    });
  });
});

describe("endingAutoplayAllowed", () => {
  it("never allows ending autoplay", () => {
    expect(endingAutoplayAllowed()).toBe(false);
  });
});

describe("applyWatchPolicy", () => {
  it("followed: strips recommendations, keeps player/comments/toolbar, adds back-home link and up-videos sidebar", () => {
    buildWatchDocument();

    applyWatchPolicy(document, "followed", submissions);

    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(document.querySelector(".bpx-player-ending-wrap")).toBeNull();

    expect(document.querySelector("video")).not.toBeNull();
    expect(document.querySelector("#comment")).not.toBeNull();
    expect(document.querySelector(".video-toolbar-left")).not.toBeNull();
    expect(document.querySelector(".bpx-player-dm")).not.toBeNull();

    const backHome = document.querySelector('a[data-action="back-home"]');
    expect(backHome).not.toBeNull();
    expect(backHome?.textContent).toBe("返回关注");
    expect(backHome?.getAttribute("href")).toBe("https://www.bilibili.com/");

    const items = document.querySelectorAll("#follows-up-videos [data-bvid]");
    expect(items.length).toBe(submissions.length);
    submissions.forEach((submission, index) => {
      expect(items[index].getAttribute("data-bvid")).toBe(submission.bvid);
      expect(items[index].textContent).toContain(submission.title);
      expect(items[index].getAttribute("href")).toBe(
        `https://www.bilibili.com/video/${submission.bvid}`,
      );
    });
  });

  it("followed: ended 事件在捕获阶段被拦住,播放器上的连播监听不会执行", () => {
    buildWatchDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    let reachedPlayer = false;
    video.addEventListener("ended", () => {
      reachedPlayer = true;
    });
    const pause = vi.spyOn(video, "pause");

    applyWatchPolicy(document, "followed", submissions);
    video.dispatchEvent(new Event("ended", { bubbles: true, cancelable: true }));

    expect(endingAutoplayAllowed()).toBe(false);
    expect(reachedPlayer).toBe(false);
    expect(pause).toHaveBeenCalled();
  });

  it("followed: removes the ending wrap again when re-applied after the player injects it, without duplicating chrome", () => {
    buildWatchDocument();
    applyWatchPolicy(document, "followed", submissions);

    const ending = document.createElement("div");
    ending.className = "bpx-player-ending-wrap";
    document.body.appendChild(ending);

    applyWatchPolicy(document, "followed", submissions);

    expect(document.querySelector(".bpx-player-ending-wrap")).toBeNull();
    expect(
      document.querySelectorAll('a[data-action="back-home"]').length,
    ).toBe(1);
    expect(
      document.querySelectorAll("#follows-up-videos [data-bvid]").length,
    ).toBe(submissions.length);
  });

  it("unfollowed: keeps the video, strips comments/toolbar/recommendations, adds follow button and no back-home link", () => {
    buildWatchDocument();

    applyWatchPolicy(document, "unfollowed", []);

    expect(document.querySelector("video")).not.toBeNull();

    expect(document.querySelector("#comment")).toBeNull();
    expect(document.querySelector(".video-toolbar-left")).toBeNull();
    expect(document.querySelector("#reco_list")).toBeNull();
    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector("#follows-up-videos")).toBeNull();

    const follow = document.querySelector('button[data-action="follow"]');
    expect(follow).not.toBeNull();
    expect(follow?.textContent).toBe("关注");

    expect(document.querySelector('a[data-action="back-home"]')).toBeNull();
    expect(document.body.textContent).not.toContain("返回关注");
  });

  it("native: removes the header but keeps the video and the original list", () => {
    buildWatchDocument();

    applyWatchPolicy(document, "native", []);

    expect(document.querySelector("#biliMainHeader")).toBeNull();
    expect(document.querySelector('a[href="/v/popular/rank/all"]')).toBeNull();
    expect(document.querySelector("video")).not.toBeNull();
    expect(document.querySelector("#fav-list")).not.toBeNull();
  });
});
