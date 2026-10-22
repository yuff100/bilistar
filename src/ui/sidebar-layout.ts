// 侧栏折叠与拖拽排序是本机 UI 偏好,落在页面 localStorage,
// 不改 B 站服务器上的关注分组。读失败/写失败都静默降级。

export const SIDEBAR_LAYOUT_KEY = "follows-only-sidebar-layout";
export const UNGROUPED_KEY = "";

export type SidebarLayout = {
  collapsed: string[];
  groupOrder: number[];
  memberOrder: Record<string, number[]>;
};

export function emptySidebarLayout(): SidebarLayout {
  return { collapsed: [], groupOrder: [], memberOrder: {} };
}

export function groupKey(tagid: number | null): string {
  return tagid === null ? UNGROUPED_KEY : String(tagid);
}

export function isCollapsed(layout: SidebarLayout, key: string): boolean {
  return layout.collapsed.includes(key);
}

export function toggleCollapsed(
  layout: SidebarLayout,
  key: string,
): SidebarLayout {
  return {
    ...layout,
    collapsed: isCollapsed(layout, key)
      ? layout.collapsed.filter((item) => item !== key)
      : [...layout.collapsed, key],
  };
}

export function orderBy<T>(
  items: T[],
  preferred: number[],
  idOf: (item: T) => number,
): T[] {
  const remaining = new Map(items.map((item) => [idOf(item), item]));
  const ordered: T[] = [];
  for (const id of preferred) {
    const item = remaining.get(id);
    if (item !== undefined) {
      ordered.push(item);
      remaining.delete(id);
    }
  }
  for (const item of items) {
    if (remaining.has(idOf(item))) {
      ordered.push(item);
      remaining.delete(idOf(item));
    }
  }
  return ordered;
}

export function moveBefore(
  ids: number[],
  from: number,
  before: number | null,
): number[] {
  if (from === before) {
    return ids;
  }
  const without = ids.filter((id) => id !== from);
  if (before === null) {
    return [...without, from];
  }
  const index = without.indexOf(before);
  if (index === -1) {
    return [...without, from];
  }
  return [...without.slice(0, index), from, ...without.slice(index)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: number[] = [];
  for (const entry of value) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      ids.push(entry);
    } else if (typeof entry === "string" && entry.trim() !== "") {
      const n = Number(entry);
      if (Number.isFinite(n)) {
        ids.push(n);
      }
    }
  }
  return ids;
}

export function parseSidebarLayout(raw: string | null): SidebarLayout {
  if (raw === null || raw.trim() === "") {
    return emptySidebarLayout();
  }
  try {
    const record = asRecord(JSON.parse(raw));
    if (record === null) {
      return emptySidebarLayout();
    }
    const collapsed = Array.isArray(record.collapsed)
      ? record.collapsed.filter((item): item is string => typeof item === "string")
      : [];
    const groupOrder = asNumberArray(record.groupOrder);
    const memberOrder: Record<string, number[]> = {};
    const rawMembers = asRecord(record.memberOrder);
    if (rawMembers !== null) {
      for (const [key, value] of Object.entries(rawMembers)) {
        memberOrder[key] = asNumberArray(value);
      }
    }
    return { collapsed, groupOrder, memberOrder };
  } catch {
    return emptySidebarLayout();
  }
}

export function readSidebarLayout(storage: Storage | null): SidebarLayout {
  if (storage === null) {
    return emptySidebarLayout();
  }
  try {
    return parseSidebarLayout(storage.getItem(SIDEBAR_LAYOUT_KEY));
  } catch {
    return emptySidebarLayout();
  }
}

export function writeSidebarLayout(
  storage: Storage | null,
  layout: SidebarLayout,
): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // 配额满或被禁用时保留内存中的本次布局,下次打开会丢。
  }
}
