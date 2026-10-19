import type { Submission } from "../domain/feed.js";

export type WatchMode = "followed" | "unfollowed" | "native";

export const REMOVE_SELECTORS: {
  followed: string[];
  unfollowed: string[];
  native: string[];
} = {
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
};

const BACK_HOME_HREF = "https://www.bilibili.com/";

export function endingAutoplayAllowed(): false {
  return false;
}

function removeMatching(document: Document, selectors: string[]): void {
  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      node.remove();
    }
  }
}

function ensureBackHomeLink(document: Document): void {
  if (document.querySelector('a[data-action="back-home"]')) {
    return;
  }
  const backHome = document.createElement("a");
  backHome.setAttribute("data-action", "back-home");
  backHome.setAttribute("href", BACK_HOME_HREF);
  backHome.textContent = "返回关注";
  document.body.appendChild(backHome);
}

function ensureUpVideosSidebar(
  document: Document,
  submissions: Submission[],
): void {
  if (document.querySelector("#follows-up-videos")) {
    return;
  }
  const aside = document.createElement("aside");
  aside.id = "follows-up-videos";
  const list = document.createElement("ul");
  for (const submission of submissions) {
    const item = document.createElement("li");
    item.setAttribute("data-bvid", submission.bvid);
    item.textContent = submission.title;
    list.appendChild(item);
  }
  aside.appendChild(list);
  document.body.appendChild(aside);
}

function ensureFollowButton(document: Document): void {
  if (document.querySelector('button[data-action="follow"]')) {
    return;
  }
  const follow = document.createElement("button");
  follow.setAttribute("data-action", "follow");
  follow.setAttribute("type", "button");
  follow.textContent = "关注";
  document.body.appendChild(follow);
}

export function applyWatchPolicy(
  document: Document,
  mode: WatchMode,
  submissions: Submission[],
): void {
  removeMatching(document, REMOVE_SELECTORS[mode]);

  if (mode === "followed") {
    ensureBackHomeLink(document);
    ensureUpVideosSidebar(document, submissions);
  } else if (mode === "unfollowed") {
    ensureFollowButton(document);
  }
}
