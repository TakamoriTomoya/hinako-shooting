# ひなこシューティング

ひなこを撃って倒す縦スクロールシューティング。仕様は [doc/SPEC.md](doc/SPEC.md)。

あそぶ: https://hinako-shooting.vercel.app
(`main` に push すると Vercel に自動でデプロイされる)

```sh
npm install
npm run dev    # 開発サーバー
npm run build  # 本番ビルド(dist/)
npm test       # テスト
npm run lint
```

## 音楽について

BGM・ジングルは SketchyLogic さんの [NES Shooter Music (5 tracks, 3 jingles)](https://opengameart.org/content/nes-shooter-music-5-tracks-3-jingles)（CC0）を使っています。
効果音はコードで合成しています（`src/lib/sound.ts`）。

## 写真について

このリポジトリの写真（`public/images/` など）は実在の人物を撮影したものです。
写真の著作権・肖像権は撮影者と被写体本人にあります。
このゲームで遊ぶ以外の目的での利用・転載・加工・再配布はしないでください。
