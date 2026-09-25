import { enemyImageSrc } from "./constants";
import { ENEMY_IMAGE_FILES } from "./enemyCatalog";

export interface Sprite {
  name: string;
  img: HTMLImageElement;
  sizeScale: number;
  ready: boolean;
  // 弾が当たった瞬間に重ねて描く、写真と同じ形の真っ白なシルエット(読み込み時に1回だけ作る)
  silhouette: HTMLCanvasElement | null;
  // 写真のまわりの白いふち(ステッカー風)。暗い宇宙の背景に黒い服などが溶けこまないように敷く。
  // 元画像より SPRITE_OUTLINE_PX だけ四方に大きい
  outline: HTMLCanvasElement | null;
}

export const SPRITE_OUTLINE_PX = 14; // 元画像(480px高)の単位。敵の大きさ(64px高)ではおよそ2px

function createSilhouette(img: HTMLImageElement): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  // 描いた写真の不透明な部分だけを白で塗りつぶす
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// 白いシルエットを周りに少しずつずらして何度も重ね、写真の輪郭に沿った太いふちを作る。
// (canvasのfilter: blurはブラウザによって使えないので、どこでも同じ見た目になるこの方法にする)
function createOutline(silhouette: HTMLCanvasElement): HTMLCanvasElement | null {
  const pad = SPRITE_OUTLINE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = silhouette.width + pad * 2;
  canvas.height = silhouette.height + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    ctx.drawImage(silhouette, pad + Math.cos(angle) * pad, pad + Math.sin(angle) * pad);
  }
  return canvas;
}

export function loadSprites(onEachLoad: () => void): Sprite[] {
  return ENEMY_IMAGE_FILES.map(({ file, name, sizeScale }) => {
    const sprite: Sprite = { name, img: new Image(), sizeScale, ready: false, silhouette: null, outline: null };
    sprite.img.onload = () => {
      sprite.silhouette = createSilhouette(sprite.img);
      sprite.outline = sprite.silhouette && createOutline(sprite.silhouette);
      sprite.ready = true;
      onEachLoad();
    };
    // 読み込みに失敗した画像はreadyにしないまま進める(その画像は敵として出てこない)
    sprite.img.onerror = onEachLoad;
    sprite.img.src = enemyImageSrc(file);
    return sprite;
  });
}

// 高さを決めた時の、写真の縦横比どおりの幅
export function spriteWidthFor(sprite: Sprite, height: number): number {
  return (height * sprite.img.naturalWidth) / sprite.img.naturalHeight;
}
