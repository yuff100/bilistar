import { describe, expect, it } from "vitest";
import {
  classifyUrl,
  decide,
  decideWork,
  videoChrome,
} from "../../src/domain/route.js";
import type { Decision, PageClass } from "../../src/domain/types.js";

const loggedInSession = { loggedIn: true as const, mid: 1 };
const loggedOutSession = { loggedIn: false as const };
const followed = new Set([2]);

type Case = {
  href: string;
  page: PageClass;
  loggedInDecision: Decision;
  loggedOutDecision: Decision;
};

const cases: Case[] = [
  {
    href: "https://www.bilibili.com/",
    page: { kind: "home" },
    loggedInDecision: { type: "show-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/index.html",
    page: { kind: "home" },
    loggedInDecision: { type: "show-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://passport.bilibili.com/login",
    page: { kind: "login" },
    loggedInDecision: { type: "leave-login" },
    loggedOutDecision: { type: "leave-login" },
  },
  {
    href: "https://www.bilibili.com/video/BV1xx",
    page: { kind: "video", id: "BV1xx" },
    loggedInDecision: { type: "video", id: "BV1xx" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/video/av42/",
    page: { kind: "video", id: "av42" },
    loggedInDecision: { type: "video", id: "av42" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/1/favlist",
    page: { kind: "native", page: "favorites" },
    loggedInDecision: { type: "native-stripped", page: "favorites" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/history",
    page: { kind: "native", page: "history" },
    loggedInDecision: { type: "native-stripped", page: "history" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/watchlater",
    page: { kind: "native", page: "watchlater" },
    loggedInDecision: { type: "native-stripped", page: "watchlater" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/v/popular/rank/all",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://search.bilibili.com/all?keyword=a",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://live.bilibili.com/1",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://t.bilibili.com/",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/v/popular/all",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/anime",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://message.bilibili.com/",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://member.bilibili.com/platform/home",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://account.bilibili.com/account/home",
    page: { kind: "blocked" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/2",
    page: { kind: "work", work: "space", mid: 2, id: "" },
    loggedInDecision: { type: "show-up", mid: 2 },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/2/video",
    page: { kind: "work", work: "space", mid: 2, id: "" },
    loggedInDecision: { type: "show-up", mid: 2 },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/999",
    page: { kind: "work", work: "space", mid: 999, id: "" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/2/article",
    page: { kind: "work", work: "article", mid: 2, id: "" },
    loggedInDecision: { type: "work-stripped" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/2/lists/5",
    page: { kind: "work", work: "collection", mid: 2, id: "5" },
    loggedInDecision: { type: "work-stripped" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://space.bilibili.com/999/cheese",
    page: { kind: "work", work: "course", mid: 999, id: "" },
    loggedInDecision: { type: "redirect-home" },
    loggedOutDecision: { type: "prompt-login" },
  },
  {
    href: "https://www.bilibili.com/read/cv1",
    page: { kind: "work", work: "article", mid: null, id: "cv1" },
    loggedInDecision: {
      type: "resolve-work",
      work: "article",
      id: "cv1",
    },
    loggedOutDecision: { type: "prompt-login" },
  },
];

describe("classifyUrl and decide", () => {
  it.each(cases)("$href", ({ href, page, loggedInDecision, loggedOutDecision }) => {
    expect(classifyUrl(href)).toEqual(page);
    expect(decide(page, loggedInSession, followed)).toEqual(loggedInDecision);
    expect(decide(page, loggedOutSession, followed)).toEqual(
      loggedOutDecision,
    );
  });
});

describe("decideWork", () => {
  it("returns work-stripped when author is followed", () => {
    expect(decideWork(true)).toBe("work-stripped");
  });

  it("returns redirect-home when author is not followed", () => {
    expect(decideWork(false)).toBe("redirect-home");
  });
});

describe("videoChrome", () => {
  it("returns followed when author is followed", () => {
    expect(videoChrome(true)).toBe("followed");
  });

  it("returns unfollowed when author is not followed", () => {
    expect(videoChrome(false)).toBe("unfollowed");
  });
});
