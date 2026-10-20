import type { Session } from "../domain/types.js";
import type { Following, RawDynamic } from "../domain/feed.js";

// 安全约定:本模块只使用页面自身会话(credentials: "include")发请求,
// 不读取 SESSDATA,不写 chrome.storage,也不需要 cookies 权限。

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function dataOf(body: unknown): UnknownRecord | null {
  return asRecord(asRecord(body)?.data);
}

/** 只从 cookie 字符串中提取 bili_jct(csrf),绝不读取 SESSDATA。 */
export function readCsrfToken(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("bili_jct=")) {
      const value = trimmed.slice("bili_jct=".length);
      return value === "" ? null : value;
    }
  }
  return null;
}

export function parseSession(body: unknown): Session {
  const data = dataOf(body);
  if (data?.isLogin === true) {
    const mid = asNumber(data.mid);
    if (mid !== null) {
      return { loggedIn: true, mid };
    }
  }
  return { loggedIn: false };
}

export function parseFollowings(body: unknown): {
  items: Following[];
  total: number;
} {
  const data = dataOf(body);
  const list = Array.isArray(data?.list) ? data.list : [];
  const items: Following[] = [];
  for (const entry of list) {
    const record = asRecord(entry);
    const mid = asNumber(record?.mid);
    const name = asString(record?.uname);
    if (mid !== null && name !== null) {
      items.push({ mid, name });
    }
  }
  return { items, total: asNumber(data?.total) ?? 0 };
}

const MAJOR_TYPE_MAP: Record<string, string> = {
  MAJOR_TYPE_ARCHIVE: "archive",
  MAJOR_TYPE_LIVE_RCMD: "live",
  MAJOR_TYPE_OPUS: "opus",
};

export function parseDynamics(body: unknown): {
  items: RawDynamic[];
  nextOffset: string | null;
} {
  const data = dataOf(body);
  const list = Array.isArray(data?.items) ? data.items : [];
  const items: RawDynamic[] = [];
  for (const entry of list) {
    const record = asRecord(entry);
    const modules = asRecord(record?.modules);
    const author = asRecord(modules?.module_author);
    const major = asRecord(asRecord(modules?.module_dynamic)?.major);
    const rawType = asString(major?.type);
    const majorType =
      rawType !== null ? (MAJOR_TYPE_MAP[rawType] ?? rawType) : "unknown";
    const base = {
      id: asString(record?.id_str) ?? "",
      majorType,
      authorMid: asNumber(author?.mid) ?? 0,
      authorName: asString(author?.name) ?? "",
      publishedAt: (asNumber(author?.pub_ts) ?? 0) * 1000,
    };
    if (majorType === "archive") {
      const archive = asRecord(major?.archive);
      const bvid = asString(archive?.bvid);
      if (bvid === null || bvid === "") {
        // 丢弃没有可用 bvid 的 archive,避免空 bvid 在 collapseParts 里被折叠成一条。
        continue;
      }
      items.push({
        ...base,
        bvid,
        title: asString(archive?.title) ?? "",
      });
    } else {
      items.push(base);
    }
  }
  const offset = asString(data?.offset);
  return { items, nextOffset: offset !== null && offset !== "" ? offset : null };
}

export function parseViewOwner(
  body: unknown,
): { mid: number; name: string; bvid: string } | null {
  const data = dataOf(body);
  const owner = asRecord(data?.owner);
  const mid = asNumber(owner?.mid);
  if (owner === null || mid === null || mid <= 0) {
    return null;
  }
  return {
    mid,
    name: asString(owner.name) ?? "",
    bvid: asString(data?.bvid) ?? "",
  };
}

export function parseWorkAuthor(body: unknown): { mid: number } {
  const data = dataOf(body);
  const mid =
    asNumber(data?.mid) ??
    asNumber(asRecord(data?.meta)?.mid) ??
    asNumber(asRecord(data?.up_info)?.mid) ??
    0;
  return { mid };
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, { ...init, credentials: "include" });
  return response.json();
}

export async function getSession(fetchImpl: typeof fetch): Promise<Session> {
  return parseSession(
    await fetchJson("https://api.bilibili.com/x/web-interface/nav", fetchImpl),
  );
}

export async function listFollowings(
  mid: number,
  page: number,
  fetchImpl: typeof fetch,
): Promise<{ items: Following[]; total: number }> {
  const url = `https://api.bilibili.com/x/relation/followings?vmid=${mid}&pn=${page}&ps=50&order=desc`;
  return parseFollowings(await fetchJson(url, fetchImpl));
}

export async function listAllSubmissions(
  offset: string | null,
  fetchImpl: typeof fetch,
): Promise<{ items: RawDynamic[]; nextOffset: string | null }> {
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=video&features=itemOpusStyle&offset=${encodeURIComponent(offset ?? "")}`;
  return parseDynamics(await fetchJson(url, fetchImpl));
}

export async function listUpSubmissions(
  mid: number,
  offset: string | null,
  fetchImpl: typeof fetch,
): Promise<{ items: RawDynamic[]; nextOffset: string | null }> {
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}&type=video&offset=${encodeURIComponent(offset ?? "")}`;
  return parseDynamics(await fetchJson(url, fetchImpl));
}

export async function getVideoOwner(
  id: string,
  fetchImpl: typeof fetch,
): Promise<{ mid: number; name: string; bvid: string }> {
  const aidMatch = id.match(/^av(\d+)$/i);
  const query = aidMatch
    ? `aid=${aidMatch[1]}`
    : `bvid=${encodeURIComponent(id)}`;
  const owner = parseViewOwner(
    await fetchJson(
      `https://api.bilibili.com/x/web-interface/view?${query}`,
      fetchImpl,
    ),
  );
  if (owner === null) {
    throw new Error("video owner unavailable");
  }
  return owner;
}

export async function getWorkAuthor(
  work: "article" | "collection" | "course",
  id: string,
  fetchImpl: typeof fetch,
): Promise<{ mid: number }> {
  let url: string;
  if (work === "article") {
    const articleId = id.replace(/^cv/i, "");
    url = `https://api.bilibili.com/x/article/viewinfo?id=${encodeURIComponent(articleId)}`;
  } else if (work === "collection") {
    url = `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?season_id=${encodeURIComponent(id)}&page_num=1&page_size=1`;
  } else {
    url = `https://api.bilibili.com/pugv/view/web/season?season_id=${encodeURIComponent(id)}`;
  }
  return parseWorkAuthor(await fetchJson(url, fetchImpl));
}

// ---- 原生关注分组(服务器端) ----
// 字段名按接口文档整理,未逐一在登录态验证过,一律防御式解析:
// 解析不出来的条目跳过,不抛错,调用方拿到的最多是空结果。

/** tagid<=0 的「特别关注」等隐含分组,以及名字叫「全部/默认分组」的兜底项。 */
const IMPLICIT_TAG_NAMES = new Set(["全部", "默认分组"]);

export type RelationTag = { tagid: number; name: string };

/** data 可能直接是数组,也可能是 {list:[...]};隐含分组剔除,只留自定义分组。 */
export function parseRelationTags(body: unknown): RelationTag[] {
  const data = dataOf(body) ?? asRecord(body)?.data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : [];
  const tags: RelationTag[] = [];
  for (const entry of list) {
    const record = asRecord(entry);
    const tagid = asNumber(record?.tagid);
    const rawName = asString(record?.name);
    if (tagid === null || tagid <= 0 || rawName === null) {
      continue;
    }
    const name = rawName.trim();
    if (name === "" || IMPLICIT_TAG_NAMES.has(name)) {
      continue;
    }
    tags.push({ tagid, name });
  }
  return tags;
}

export async function listRelationTags(
  fetchImpl: typeof fetch,
): Promise<RelationTag[]> {
  return parseRelationTags(
    await fetchJson("https://api.bilibili.com/x/relation/tags", fetchImpl),
  );
}

/** 只取成员 mid(展示用的名字来自关注列表);同样兼容 data 为数组或 {list}。 */
export function parseGroupMembers(body: unknown): number[] {
  const data = dataOf(body) ?? asRecord(body)?.data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : [];
  const mids: number[] = [];
  for (const entry of list) {
    const mid = asNumber(asRecord(entry)?.mid);
    if (mid !== null) {
      mids.push(mid);
    }
  }
  return mids;
}

export async function listGroupMembers(
  tagid: number,
  page: number,
  fetchImpl: typeof fetch,
): Promise<number[]> {
  const url = `https://api.bilibili.com/x/relation/tag?tagid=${tagid}&pn=${page}&ps=50`;
  return parseGroupMembers(await fetchJson(url, fetchImpl));
}

async function postRelationTagUsers(
  action: "addUsers" | "delUsers",
  mid: number,
  tagids: number[],
  csrf: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    const url = `https://api.bilibili.com/x/relation/tags/${action}?csrf=${encodeURIComponent(csrf)}`;
    const payload = await fetchJson(url, fetchImpl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `fids=${mid}&tagids=${tagids.join(",")}`,
    });
    return asNumber(asRecord(payload)?.code) === 0;
  } catch {
    return false;
  }
}

export function addUserToGroups(
  mid: number,
  tagids: number[],
  csrf: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  return postRelationTagUsers("addUsers", mid, tagids, csrf, fetchImpl);
}

export function removeUserFromGroups(
  mid: number,
  tagids: number[],
  csrf: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  return postRelationTagUsers("delUsers", mid, tagids, csrf, fetchImpl);
}

export async function followUp(
  mid: number,
  csrf: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const body = `fid=${mid}&act=1&re_src=11&csrf=${encodeURIComponent(csrf)}`;
    const payload = await fetchJson(
      "https://api.bilibili.com/x/relation/modify",
      fetchImpl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    return asNumber(asRecord(payload)?.code) === 0
      ? { ok: true }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}
