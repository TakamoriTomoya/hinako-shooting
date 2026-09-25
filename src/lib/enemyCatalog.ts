// 敵に使う画像の設定。
// sizeScaleは基準の高さ(ENEMY_HEIGHT)に対する倍率(ボスには使わない)。見た目のバランスを見ながら手動調整する。
// nameはボスとして出てきた時に「でか○○」と表示する名前。
// 新しい画像ファイルを public/images/ に追加したら、ここに{file, name, sizeScale}を追記する。

export interface EnemyImageDef {
  file: string;
  name: string;
  sizeScale: number;
}

export const ENEMY_IMAGE_FILES: EnemyImageDef[] = [
  { file: "boy-hinako.PNG", name: "しょうねんひなこ", sizeScale: 1.1 },
  { file: "dance-hinako.PNG", name: "だんすひなこ", sizeScale: 1.05 },
  { file: "gassho-hinako.PNG", name: "がっしょうひなこ", sizeScale: 1.0 },
  { file: "gorori-hinako.PNG", name: "ごろりひなこ", sizeScale: 0.9 },
  { file: "gyaku-hinako.PNG", name: "ぎゃくぅひなこ", sizeScale: 1.2 },
  { file: "lego-hinako.PNG", name: "れごひなこ", sizeScale: 1.15 },
  { file: "mouhu-hinako.PNG", name: "もうふひなこ", sizeScale: 0.95 },
  { file: "neko-hinako.PNG", name: "ねこひなこ", sizeScale: 0.9 },
  { file: "perm-hinako.PNG", name: "ぱーまひなこ", sizeScale: 1.0 },
  { file: "sit-hinako.PNG", name: "おすわりひなこ", sizeScale: 0.9 },
  { file: "tako-hinako.PNG", name: "たこひなこ", sizeScale: 1.0 },
  { file: "goo-hinako.PNG", name: "ぐぅーひなこ", sizeScale: 1.05 },
  { file: "panpan-hinako.PNG", name: "ぱんぱんひなこ", sizeScale: 1.05 },
  { file: "red-hinako.PNG", name: "あかひなこ", sizeScale: 1.05 },
  { file: "sorori-hinako.PNG", name: "そろりひなこ", sizeScale: 1.0 },
  { file: "yazirusi-hinako.PNG", name: "やじるしひなこ", sizeScale: 1.05 },
];
