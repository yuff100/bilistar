import { describe, expect, it } from "vitest";
import {
  emptySidebarLayout,
  groupKey,
  isCollapsed,
  moveBefore,
  orderBy,
  parseSidebarLayout,
  toggleCollapsed,
} from "../../src/ui/sidebar-layout.js";

describe("sidebar-layout", () => {
  it("toggles collapse by group key", () => {
    const first = toggleCollapsed(emptySidebarLayout(), "10");
    expect(isCollapsed(first, "10")).toBe(true);
    expect(isCollapsed(first, "")).toBe(false);
    const second = toggleCollapsed(first, "10");
    expect(isCollapsed(second, "10")).toBe(false);
  });

  it("uses empty string as the ungrouped key", () => {
    expect(groupKey(null)).toBe("");
    expect(groupKey(10)).toBe("10");
  });

  it("orders items by the preferred ids, then keeps leftover original order", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ];
    expect(orderBy(items, [3, 1], (item) => item.id).map((item) => item.id)).toEqual(
      [3, 1, 2],
    );
    expect(orderBy(items, [9], (item) => item.id).map((item) => item.id)).toEqual(
      [1, 2, 3],
    );
  });

  it("moves an id before another, or to the end", () => {
    expect(moveBefore([10, 11, 12], 12, 10)).toEqual([12, 10, 11]);
    expect(moveBefore([10, 11, 12], 10, 12)).toEqual([11, 10, 12]);
    expect(moveBefore([10, 11, 12], 10, null)).toEqual([11, 12, 10]);
    expect(moveBefore([10, 11], 10, 10)).toEqual([10, 11]);
  });

  it("parses stored layout and ignores junk", () => {
    expect(parseSidebarLayout(null)).toEqual(emptySidebarLayout());
    expect(parseSidebarLayout("{")).toEqual(emptySidebarLayout());
    expect(
      parseSidebarLayout(
        JSON.stringify({
          collapsed: ["10", 1, ""],
          groupOrder: [11, "12", "x"],
          memberOrder: { "10": [2, "4"], bad: "no" },
        }),
      ),
    ).toEqual({
      collapsed: ["10", ""],
      groupOrder: [11, 12],
      memberOrder: { "10": [2, 4], bad: [] },
    });
  });
});
