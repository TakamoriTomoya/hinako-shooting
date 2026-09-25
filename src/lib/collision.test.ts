import { describe, expect, it } from "vitest";
import { aimAngle, circleIntersectsRect, circlesIntersect, clamp, fanAngles, spawnInterval } from "./collision";

describe("circlesIntersect", () => {
  it("接している・重なっている時はtrue", () => {
    expect(circlesIntersect(0, 0, 5, 10, 0, 5)).toBe(true);
    expect(circlesIntersect(0, 0, 5, 3, 4, 1)).toBe(true);
  });

  it("離れている時はfalse", () => {
    expect(circlesIntersect(0, 0, 5, 10.1, 0, 5)).toBe(false);
  });
});

describe("circleIntersectsRect", () => {
  const rect = { cx: 100, cy: 100, w: 40, h: 20 };

  it("四角の内側にある円はtrue", () => {
    expect(circleIntersectsRect(100, 100, 1, rect)).toBe(true);
  });

  it("辺に届く円はtrue、届かない円はfalse", () => {
    expect(circleIntersectsRect(125, 100, 5, rect)).toBe(true);
    expect(circleIntersectsRect(126, 100, 5, rect)).toBe(false);
  });

  it("角の近くは四角ではなく角からの距離で判定する", () => {
    // 角(120, 110)から(3, 4)離れた点: 距離5
    expect(circleIntersectsRect(123, 114, 5, rect)).toBe(true);
    expect(circleIntersectsRect(123, 114, 4.9, rect)).toBe(false);
  });
});

describe("aimAngle", () => {
  it("真下は π/2", () => {
    expect(aimAngle(0, 0, 0, 10)).toBeCloseTo(Math.PI / 2);
  });
});

describe("fanAngles", () => {
  it("中心の向きを軸に左右対称に並ぶ", () => {
    const angles = fanAngles(1, 3, 0.2);
    expect(angles[0]).toBeCloseTo(0.8);
    expect(angles[1]).toBeCloseTo(1);
    expect(angles[2]).toBeCloseTo(1.2);
  });

  it("1発なら中心の向きのまま", () => {
    expect(fanAngles(0.5, 1, 0.3)).toEqual([0.5]);
  });
});

describe("clamp / spawnInterval", () => {
  it("範囲外は端に丸める", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("倒した数に応じて開始値から終了値へ縮み、それ以上は縮まない", () => {
    expect(spawnInterval(0, 20, 1700, 1100)).toBe(1700);
    expect(spawnInterval(10, 20, 1700, 1100)).toBe(1400);
    expect(spawnInterval(40, 20, 1700, 1100)).toBe(1100);
  });
});
