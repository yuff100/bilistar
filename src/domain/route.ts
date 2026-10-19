import type { Decision, PageClass, Session } from "./types.js";

function isBilibiliHost(hostname: string): boolean {
  return hostname === "bilibili.com" || hostname.endsWith(".bilibili.com");
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function classifyUrl(href: string): PageClass {
  const url = new URL(href);
  const host = url.hostname;
  const path = normalizePath(url.pathname);

  if (host === "passport.bilibili.com" && (path === "/login" || path.startsWith("/login/"))) {
    return { kind: "login" };
  }

  if (host === "www.bilibili.com") {
    if (path === "/" || path === "/index.html") {
      return { kind: "home" };
    }
    if (path === "/history") {
      return { kind: "native", page: "history" };
    }
    if (path === "/watchlater") {
      return { kind: "native", page: "watchlater" };
    }
    const videoMatch = path.match(/^\/video\/([^/]+)$/);
    if (videoMatch) {
      return { kind: "video", id: videoMatch[1] };
    }
    const readMatch = path.match(/^\/read\/([^/]+)$/);
    if (readMatch) {
      return {
        kind: "work",
        work: "article",
        mid: null,
        id: readMatch[1],
      };
    }
    return { kind: "blocked" };
  }

  if (host === "space.bilibili.com") {
    const favMatch = path.match(/^\/(\d+)\/favlist$/);
    if (favMatch) {
      return { kind: "native", page: "favorites" };
    }
    const cheeseMatch = path.match(/^\/(\d+)\/cheese$/);
    if (cheeseMatch) {
      return {
        kind: "work",
        work: "course",
        mid: Number(cheeseMatch[1]),
        id: "",
      };
    }
    const articleMatch = path.match(/^\/(\d+)\/article$/);
    if (articleMatch) {
      return {
        kind: "work",
        work: "article",
        mid: Number(articleMatch[1]),
        id: "",
      };
    }
    const listsMatch = path.match(/^\/(\d+)\/lists\/([^/]+)$/);
    if (listsMatch) {
      return {
        kind: "work",
        work: "collection",
        mid: Number(listsMatch[1]),
        id: listsMatch[2],
      };
    }
    const spaceVideoMatch = path.match(/^\/(\d+)\/video$/);
    if (spaceVideoMatch) {
      return {
        kind: "work",
        work: "space",
        mid: Number(spaceVideoMatch[1]),
        id: "",
      };
    }
    const spaceMatch = path.match(/^\/(\d+)$/);
    if (spaceMatch) {
      return {
        kind: "work",
        work: "space",
        mid: Number(spaceMatch[1]),
        id: "",
      };
    }
    return { kind: "blocked" };
  }

  if (isBilibiliHost(host)) {
    return { kind: "blocked" };
  }

  return { kind: "blocked" };
}

export function decide(
  page: PageClass,
  session: Session,
  followed: ReadonlySet<number>,
): Decision {
  if (page.kind === "login") {
    return { type: "leave-login" };
  }

  if (!session.loggedIn) {
    return { type: "prompt-login" };
  }

  switch (page.kind) {
    case "home":
      return { type: "show-home" };
    case "video":
      return { type: "video", id: page.id };
    case "native":
      return { type: "native-stripped", page: page.page };
    case "blocked":
      return { type: "redirect-home" };
    case "work":
      if (page.mid === null) {
        return {
          type: "resolve-work",
          work: page.work as "article" | "collection" | "course",
          id: page.id,
        };
      }
      if (page.work === "space") {
        if (followed.has(page.mid)) {
          return { type: "show-up", mid: page.mid };
        }
        return { type: "redirect-home" };
      }
      if (followed.has(page.mid)) {
        return { type: "work-stripped" };
      }
      return { type: "redirect-home" };
  }
}

export function decideWork(
  authorFollowed: boolean,
): "work-stripped" | "redirect-home" {
  return authorFollowed ? "work-stripped" : "redirect-home";
}

export function videoChrome(
  authorFollowed: boolean,
): "followed" | "unfollowed" {
  return authorFollowed ? "followed" : "unfollowed";
}
