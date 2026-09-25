// 当たり判定・狙いなどの純粋な計算。描画や状態に依存しないのでテストしやすいようにまとめてある。

export interface Rect {
  cx: number; // 中心
  cy: number;
  w: number;
  h: number;
}

export function circlesIntersect(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

// 円と「中心座標で表した軸平行の四角」が重なっているか
export function circleIntersectsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const dx = Math.max(Math.abs(cx - rect.cx) - rect.w / 2, 0);
  const dy = Math.max(Math.abs(cy - rect.cy) - rect.h / 2, 0);
  return dx * dx + dy * dy <= r * r;
}

// (fromX, fromY) から (toX, toY) を向く角度。0が右向き、π/2が下向き(canvasの座標系)
export function aimAngle(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// 狙った方向を中心に、count発を spread(rad) 間隔で扇状に並べた角度の一覧
export function fanAngles(center: number, count: number, spread: number): number[] {
  const start = center - (spread * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => start + spread * i);
}

// 経過時間に応じて、出現の間隔を開始値から終了値へ直線的に縮める
export function spawnInterval(elapsedMs: number, totalMs: number, startMs: number, endMs: number): number {
  const t = clamp(elapsedMs / totalMs, 0, 1);
  return startMs + (endMs - startMs) * t;
}
