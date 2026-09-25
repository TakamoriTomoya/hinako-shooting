import { HIGH_SCORE_STORAGE_KEY } from "./constants";

// ハイスコアは端末のlocalStorageに残す。プライベートブラウズ等で使えない時は0扱いで遊べるようにする。
export function loadHighScore(): number {
  try {
    const value = Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(score));
  } catch {
    // 保存できなくても遊ぶのに支障はないので無視する
  }
}
