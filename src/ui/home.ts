import type { Following, Submission } from "../domain/feed.js";

export type HomeState = {
  followings: Following[];
  submissions: Submission[];
  selectedMid: number | null;
  hasMore: boolean;
};

export type HomeHandlers = {
  onSelect: (mid: number | null) => void;
  onOpenVideo: (bvid: string) => void;
  onLoadMore: () => void;
};

export const HOME_COPY = {
  sidebar: "关注",
  all: "全部更新",
  emptyFollows: "还没有关注任何 UP 主",
  emptyVideos: "这些 UP 主还没有投稿",
  article: "专栏",
  collection: "合集",
  course: "课程",
  more: "继续看",
} as const;

function workLinks(mid: number): Array<{ text: string; href: string }> {
  return [
    {
      text: HOME_COPY.article,
      href: `https://space.bilibili.com/${mid}/article`,
    },
    {
      text: HOME_COPY.collection,
      href: `https://space.bilibili.com/${mid}/lists`,
    },
    {
      text: HOME_COPY.course,
      href: `https://space.bilibili.com/${mid}/cheese`,
    },
  ];
}

export function renderHome(
  root: HTMLElement,
  state: HomeState,
  handlers: HomeHandlers,
): void {
  root.id = "follows-root";
  root.textContent = "";

  const { followings, submissions, selectedMid, hasMore } = state;

  const sidebar = document.createElement("nav");
  const heading = document.createElement("h1");
  heading.textContent = HOME_COPY.sidebar;
  sidebar.appendChild(heading);

  const followsList = document.createElement("ul");
  const allItem = document.createElement("li");
  allItem.textContent = HOME_COPY.all;
  allItem.dataset.follows = "all";
  allItem.addEventListener("click", () => handlers.onSelect(null));
  followsList.appendChild(allItem);

  for (const following of followings) {
    const item = document.createElement("li");
    item.textContent = following.name;
    item.dataset.followsMid = String(following.mid);
    item.addEventListener("click", () => handlers.onSelect(following.mid));
    followsList.appendChild(item);
  }
  sidebar.appendChild(followsList);
  root.appendChild(sidebar);

  const main = document.createElement("main");

  if (selectedMid !== null) {
    const works = document.createElement("nav");
    for (const { text, href } of workLinks(selectedMid)) {
      const link = document.createElement("a");
      link.textContent = text;
      link.href = href;
      works.appendChild(link);
    }
    main.appendChild(works);
  }

  const visible =
    selectedMid === null
      ? submissions
      : submissions.filter(
          (submission) => submission.authorMid === selectedMid,
        );

  if (followings.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = HOME_COPY.emptyFollows;
    main.appendChild(empty);
  } else if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = HOME_COPY.emptyVideos;
    main.appendChild(empty);
  } else {
    const feed = document.createElement("ol");
    for (const submission of visible) {
      const card = document.createElement("li");
      card.dataset.bvid = submission.bvid;

      const title = document.createElement("h2");
      title.textContent = submission.title;
      const author = document.createElement("span");
      author.textContent = submission.authorName;
      const time = document.createElement("time");
      time.textContent = new Date(submission.publishedAt).toLocaleString();

      card.appendChild(title);
      card.appendChild(author);
      card.appendChild(time);
      card.addEventListener("click", () =>
        handlers.onOpenVideo(submission.bvid),
      );
      feed.appendChild(card);
    }
    main.appendChild(feed);
  }

  if (hasMore) {
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = HOME_COPY.more;
    more.addEventListener("click", () => handlers.onLoadMore());
    main.appendChild(more);
  }

  root.appendChild(main);
}
