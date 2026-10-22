export type Submission = {
  bvid: string;
  title: string;
  authorMid: number;
  authorName: string;
  publishedAt: number;
};

export type Following = {
  mid: number;
  name: string;
};

export type RawDynamic = {
  id: string;
  majorType: string;
  bvid?: string;
  title?: string;
  authorMid: number;
  authorName: string;
  publishedAt: number;
};

export function onlySubmissions(items: RawDynamic[]): Submission[] {
  return items
    .filter((item) => item.majorType === "archive")
    .map((item) => ({
      bvid: item.bvid ?? "",
      title: item.title ?? "",
      authorMid: item.authorMid,
      authorName: item.authorName,
      publishedAt: item.publishedAt,
    }));
}

export function collapseParts(items: Submission[]): Submission[] {
  const seen = new Set<string>();
  const result: Submission[] = [];
  for (const item of items) {
    if (seen.has(item.bvid)) {
      continue;
    }
    seen.add(item.bvid);
    result.push(item);
  }
  return result;
}

export function newestFirst(items: Submission[]): Submission[] {
  return [...items].sort((a, b) => b.publishedAt - a.publishedAt);
}

export function orderFollowings(
  followings: Following[],
  submissions: Submission[],
): Following[] {
  const latestByMid = new Map<number, number>();
  for (const submission of submissions) {
    const prev = latestByMid.get(submission.authorMid);
    if (prev === undefined || submission.publishedAt > prev) {
      latestByMid.set(submission.authorMid, submission.publishedAt);
    }
  }

  const withSubmissions: Following[] = [];
  const withoutSubmissions: Following[] = [];

  for (const following of followings) {
    if (latestByMid.has(following.mid)) {
      withSubmissions.push(following);
    } else {
      withoutSubmissions.push(following);
    }
  }

  withSubmissions.sort(
    (a, b) =>
      (latestByMid.get(b.mid) ?? 0) - (latestByMid.get(a.mid) ?? 0),
  );

  return [...withSubmissions, ...withoutSubmissions];
}
