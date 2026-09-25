// ゲーム全体の設定値。挙動を変えたい時はここだけを触ればよいようにまとめてある。
// 速さはすべて「px/秒」、時間は「ms」。

// 論理座標系の幅は固定。高さは画面の縦横比に合わせて FIELD_MIN_H〜FIELD_MAX_H の間で伸び縮みする
// (縦長のスマホでも上下に余白を作らず、画面いっぱいを戦場にするため)
export const FIELD_W = 380;
export const FIELD_MIN_H = 560;
export const FIELD_MAX_H = 860;

// 開発用の道具(スタート画面でステージ・攻撃レベルを選んで始める)を出すか。
// 開発サーバー(npm run dev)では常に出し、公開版でもURLに ?dev を付けると出す
export const DEV_TOOLS = import.meta.env.DEV || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev"));

// ---- 自機(戦闘機) ----
export const PLAYER_BOTTOM_MARGIN = 110; // 開始時、画面下端からこれだけ上に置く
export const PLAYER_TOP_LIMIT = 90; // これより上には行けない(ヘッダーの下に隠れないように)
export const PLAYER_EDGE_MARGIN = 16; // 左右・下端からはみ出さないための余白
export const PLAYER_HIT_RADIUS = 5; // 当たり判定(見た目の中心の小さな白い点)
export const PLAYER_ITEM_RADIUS = 26; // アイテムを拾える範囲。当たり判定より広くして拾いやすくする
export const PLAYER_KEY_SPEED = 280; // キーボード操作時の移動速度
export const PLAYER_START_LIVES = 3;
export const PLAYER_INVINCIBLE_MS = 2000; // やられた直後の無敵時間(点滅して表示)

// ---- 自機の弾 ----
export const SHOT_INTERVAL_MS = 110; // 押さなくても自動で撃ち続ける
export const SHOT_SPEED = 720;
export const SHOT_RADIUS = 5;
export const SHOT_SPREAD = 0.12; // レベル3の左右の弾の広がり(rad)
export const MAX_SHOT_LEVEL = 9;
// レベル4からは、ふつうの弾(レベル3と同じ4発)に加えて、次のものが増えていく(弾は広げない)。
// レベル4: ミニ戦闘機2機が自機のまわりをぐるぐる回る。撃たないが、敵の弾を消し、触れたザコにダメージを与える
// レベル5: さらに、その外側をミニ戦闘機3機が反対回りに回る
// レベル6: さらに、大きなオレンジの爆弾をまっすぐ、ふつうの弾より遅い間隔で撃つ。当たると爆発して、まわりのザコにもダメージを与える(blast)
// レベル7: さらに、オレンジの爆弾を左右ななめ前の2方向にも撃つ(sideSpread)
// レベル8: さらに、自機から全方向へ弱いビーム(ふつうの弾と同じ大きさ)を、ときどき輪のように撃つ
// レベル9: さらに、定期的に自機から衝撃波の輪が画面の端まで広がり、通ったところの敵の弾を消して、ザコにもダメージを与える
export const HEAVY_SHOTS: Record<number, { intervalMs: number; damage: number; scale: number; blast?: { radius: number; damage: number }; sideSpread?: number }> = {
  6: { intervalMs: 450, damage: 3, scale: 2.3, blast: { radius: 70, damage: 3 } },
  7: { intervalMs: 450, damage: 3, scale: 2.3, blast: { radius: 70, damage: 3 }, sideSpread: 0.4 },
};
export const MINI_FIGHTER_LEVEL = 4; // このレベルからミニ戦闘機(内側の2機)が自機のまわりを回る
export const MINI_ORBIT_RADIUS = 46; // 自機の中心から内側のミニ戦闘機までの距離
export const MINI_ORBIT_SPEED = 5; // 回る速さ(rad/秒)
export const OUTER_MINI_LEVEL = 5; // このレベルから、外側にもミニ戦闘機3機が回る
export const OUTER_MINI_ORBIT_RADIUS = 86; // 自機の中心から外側のミニ戦闘機までの距離
export const OUTER_MINI_ORBIT_SPEED = -3.8; // 外側は内側と反対向きに、少しゆっくり回る(rad/秒)
export const MINI_HIT_RADIUS = 11; // ミニ戦闘機が敵の弾を消す・ザコに触れる範囲
export const MINI_CONTACT_DPS = 12; // 触れているザコに与える1秒あたりのダメージ
export const OMNI_SHOT_LEVEL = 8; // このレベルから、全方向へ弱いビームを撃つ
export const OMNI_SHOT_INTERVAL_MS = 450; // 全方向のビームを撃つ間隔
export const OMNI_SHOT_COUNT = 12; // 1回に撃つ数(等間隔に全方向へ)
export const OMNI_SHOT_DAMAGE = 0.5; // ふつうの弾(1)より弱い
export const OMNI_SHOT_SCALE = 1; // 見た目と当たりの大きさ(ふつうの弾に対して)
export const SHOCKWAVE_LEVEL = 9; // このレベルから、定期的に衝撃波を出す
export const SHOCKWAVE_INTERVAL_MS = 3000; // 衝撃波を出す間隔
export const SHOCKWAVE_SPEED = 650; // 輪が広がる速さ(px/秒)
export const SHOCKWAVE_DAMAGE = 3; // 輪が通ったザコに与えるダメージ(ボスには効かない)
export const HEAVY_SHOT_SPEED = 560; // ふつうの弾より少し遅く、重そうに飛ぶ

// ---- ザコひなこ ----
export const ENEMY_HEIGHT = 64; // 基準の高さ。画像ごとの sizeScale を掛ける
export const ENEMY_SIZE_SCALE_MIN = 0.85;
export const ENEMY_SIZE_SCALE_MAX = 1.25;
export const ENEMY_SCORE = 100;
export const TANK_SCORE = 300; // 少し強いザコ(tank)
export const ENEMY_FIRST_FIRE_MS: [number, number] = [700, 1800]; // 出現から最初に撃つまで(ランダム)
export const ENEMY_FIRE_MAX_Y_RATIO = 0.6; // 自機に近すぎる位置からは撃たない(避けようがないため)
// ライフが1つ回復するハート。落とす確率はステージごと(STAGESのlifeDropChance)。
// ザコ戦ではめったに出さず、ボス戦中に出てくるザコからは出やすくする
// (弾幕の中でザコを狙いに行くかどうかの駆け引きになるように)。ボス自身は落とさない。
// ライフの上限は開始時の数(PLAYER_START_LIVES)で、満タンの時に拾うと LIFE_ITEM_FULL_SCORE 点になる
export const LIFE_ITEM_FULL_SCORE = 1000;
export const ITEM_FALL_SPEED = 90;
export const ITEM_RADIUS = 11;

// ---- ステージ ----
// ステージごとに変わる難しさ。上から順に遊び、最後のステージのボスを倒すとクリア。
// ステージを増やしたい時はここに1つ足すだけでよい。
// ザコの編隊。
// crossLine: 片側から一列に入ってきて横切る / crossPair: 左右から1列ずつ入ってきてすれちがう /
// straight: 横に3体並んでまっすぐ降りてくる / zigzag: 左右で2体、くねくね揺れながら降りてくる /
// swoop: 上の方の横から4体つながって弧を描いて横切る /
// beamerLine: 横に3体並んで止まり、ビームを1発ずつ撃つ / beamerBurst: 左右に止まり、ビームを3連射する /
// beamerSide: 左右の下の方から横に入ってきて止まり、ビームを1発ずつ撃つ / laser: 止まって真下へレーザーを撃つ /
// dive: 止まってから自機めがけて突っ込んでくる / diveSide: 突っ込んでくるザコが左右の上の方から1体 /
// diveLow: 突っ込んでくるザコが左右の下の方から1体 / diveMix: 突っ込んでくるザコが上・左右の上の方・左右の下の方のどこかから1体 /
// tank: 大きめで少し硬いザコが1体ゆっくり降りてくる / orbitRing: 6体が輪になって回りながら降りてくる
export type FormationName =
  | "crossLine"
  | "crossPair"
  | "straight"
  | "zigzag"
  | "swoop"
  | "beamerLine"
  | "beamerBurst"
  | "beamerSide"
  | "laser"
  | "dive"
  | "diveSide"
  | "diveLow"
  | "diveMix"
  | "tank"
  | "orbitRing";

// いままでの編隊(STAGE 2のザコ戦・STAGE 3のボス戦中)。ビームを3連射するザコ・少し強いザコ・回る輪は一旦出さない
const CLASSIC_FORMATIONS: FormationName[] = ["crossLine", "crossPair", "straight", "zigzag", "swoop", "beamerLine", "beamerSide", "laser", "dive"];
// STAGE 1のやさしい編隊(ビームを3連射するザコ・下の方からビームを撃つザコ・レーザー・突っ込んでくるザコは出さない)
const EASY_FORMATIONS: FormationName[] = ["crossLine", "crossPair", "straight", "zigzag", "swoop", "beamerLine"];

export interface StageConfig {
  bossAfterMs: number; // ザコ戦がこの時間続くとボスが出てくる(倒した数は関係ない)
  spawnIntervalMs: [number, number]; // ザコの出現の間隔。[始め, ボス直前]。時間が経つほど短くなり、ザコが増えていく
  enemyHp: number; // ザコのHP(突っ込んでくるザコ・ビームやレーザーを撃つザコは+1)
  enemyBulletSpeed: number;
  enemyFireIntervalMs: [number, number]; // ザコが撃つ間隔(ランダム)
  bossHp: number; // ボスが2体の時は、2体の合計
  // big: 大きなボス1体が弾を撃つ / twin: 中くらいのボス2体が動き回りながら弾を撃つ(弾は少なめ) /
  // bigRush: 大きなボス1体が弾を撃ちつつ、ときどき自機へ体当たりしてくる
  bossType: "big" | "twin" | "bigRush";
  bossBulletSpeedScale: number; // ボスの弾の速さの倍率
  bossFireIntervalScale: number; // ボスが撃つ間隔の倍率(小さいほど弾が多い)
  bossMinionIntervalMs: [number, number]; // ボス戦中にザコが出てくる間隔(ランダム)。ボスを倒すまでずっと出てくる
  // ザコ戦・ボス戦中に出てくる編隊。毎回この中からランダムに1つ選ぶ(同じ名前を2回書くと2倍出やすくなる)
  waveFormations: FormationName[];
  bossFormations: FormationName[];
  crossLineCounts: [number, number]; // 横から一列に入ってきて横切るザコの数。[片側から1列, 左右からすれちがう時の1列]
  bossGuards: number; // ボスのまわりを回って弾をふせぐガードの数(0なら出さない)。全部倒すと少しして出し直す
  // ボスが定期的にまわりに張るバリア(nullなら張らない)。張っている間はボスに弾が効かず、hpの分だけ当てて壊すと、intervalMs後にまた張る
  bossBarrier: { hp: number; intervalMs: number } | null;
  lifeDropChance: [number, number]; // ザコがハートを落とす確率。[ザコ戦, ボス戦中]
  powerDropChance: [number, number]; // ザコがパワーアップの星を落とす確率。[ザコ戦, ボス戦中]
  // 星を確率ではなく、決まったタイミングで必ず出す(運で差がつかないように)。nullなら確率だけ。
  // waves: ザコ戦の進み具合(0〜1)、boss: ボス戦が始まってからの時間(ミリ秒)。その時点を過ぎて最初に倒したザコが星を落とす
  powerDropTimings: { waves: number[]; boss: number[] } | null;
}

export const STAGES: StageConfig[] = [
  {
    bossAfterMs: 30000,
    // STAGE 1は、始めはゆっくり少なめにして慣れてもらい、だんだん増やす(後半も増やしすぎない)
    spawnIntervalMs: [1400, 850],
    enemyHp: 3,
    enemyBulletSpeed: 140,
    enemyFireIntervalMs: [2000, 3200],
    bossHp: 320,
    bossType: "big",
    bossBulletSpeedScale: 1,
    bossFireIntervalScale: 1,
    bossMinionIntervalMs: [3200, 4400],
    bossGuards: 0,
    bossBarrier: null,
    waveFormations: EASY_FORMATIONS,
    bossFormations: EASY_FORMATIONS,
    crossLineCounts: [5, 4],
    // 倒すザコをザコ戦100体(出てくるほぼ全部)・ボス戦中50体(ボス戦1分くらい)として、ハートは2.5つ(ザコ戦1.5・ボス戦中1)出るくらい
    lifeDropChance: [0.015, 0.02],
    // STAGE 1の星は運で差がつかないよう、確率では出さずに決まったタイミングで3つ(ザコ戦2・ボス戦中1)必ず出す
    powerDropChance: [0, 0],
    powerDropTimings: { waves: [0.35, 0.75], boss: [15000] },
  },
  {
    bossAfterMs: 35000,
    spawnIntervalMs: [900, 520], // 後半も増やしすぎない
    enemyHp: 5,
    enemyBulletSpeed: 170,
    enemyFireIntervalMs: [1400, 2300],
    bossHp: 420,
    bossType: "twin",
    bossBulletSpeedScale: 1.1,
    bossFireIntervalScale: 0.85,
    // ボスは突っ込んでこないかわりに、突っ込んでくるザコが次々に出てくる
    bossMinionIntervalMs: [700, 1200],
    bossGuards: 0,
    bossBarrier: null,
    waveFormations: CLASSIC_FORMATIONS,
    bossFormations: ["diveMix"],
    crossLineCounts: [3, 3], // 横から次々に流れてきて多く感じるので少なめ
    // 倒すザコをザコ戦130体・ボス戦中35体として、ハートは2.5つ(ザコ戦1.5・ボス戦中1)・星は3つ出るくらい(ザコが多いぶん確率は低め)
    lifeDropChance: [0.012, 0.029],
    powerDropChance: [0.018, 0.018],
    powerDropTimings: null,
  },
  {
    bossAfterMs: 40000,
    spawnIntervalMs: [600, 360], // 後半も増やしすぎない
    enemyHp: 6,
    enemyBulletSpeed: 190,
    enemyFireIntervalMs: [1200, 2000],
    bossHp: 700,
    bossType: "bigRush",
    bossBulletSpeedScale: 1.2,
    bossFireIntervalScale: 0.72,
    bossMinionIntervalMs: [1500, 2300],
    bossGuards: 0, // ボスのまわりを回るガードは一旦出さない(出す時は6)
    bossBarrier: { hp: 90, intervalMs: 10000 },
    // ザコ戦は、前(上)から3割・左右から4割・下の方(左右の下)から3割くらいの割合で出てくる
    waveFormations: [
      // 前(上)から: 6
      "straight", "zigzag", "beamerLine", "beamerLine", "laser", "dive",
      // 左右から: 8
      "crossLine", "crossLine", "crossPair", "crossPair", "swoop", "swoop", "diveSide", "diveSide",
      // 下の方(左右の下)から: 6
      "beamerSide", "beamerSide", "beamerSide", "diveLow", "diveLow", "diveLow",
    ],
    bossFormations: CLASSIC_FORMATIONS,
    crossLineCounts: [5, 4],
    // 倒すザコをザコ戦200体・ボス戦中50体として、ハートは2.5つ(ザコ戦1.5・ボス戦中1)・星は3つ(ザコ戦2・ボス戦中1)出るくらい
    lifeDropChance: [0.0075, 0.02],
    powerDropChance: [0.01, 0.02],
    powerDropTimings: null,
  },
];

export const STAGE_INTRO_MS = 2200; // ステージの始めに「STAGE 1」などを出している時間(この間はザコが出ない)
export const STAGE_CLEAR_MS = 2800; // ボスを倒してから次のステージに進むまで(ボスが爆発する演出を含む)

// ---- ボーナスステージ ----
// 最後のステージのボスを倒した後、攻撃してこない(弾を撃たず、体に当たってもやられない)硬いザコが大量に押し寄せてくる
// 上下左右のどこかから、一列に並んだ群れが反対側へ横切っていく
export const BONUS_MS = 30000; // ザコが押し寄せてくる時間
export const BONUS_ENEMY_HP = 20;
export const BONUS_ENEMY_SCORE = 200;
export const BONUS_ROW_INTERVAL_MS: [number, number] = [300, 550]; // 群れが出てくる間隔(ランダム)
export const BONUS_ROW_COUNT: [number, number] = [5, 7]; // 1列に並ぶ数(ランダム)
export const BONUS_SPEED: [number, number] = [70, 125]; // 進む速さ(px/秒。群れごとにランダム)
export const BONUS_END_WAIT_MS = 5000; // 押し寄せ終えてから、残ったザコがいなくなるのを待つ最大の時間

// ---- ボス(でかひなこ) ----
export const BOSS_HEIGHT = 190;
export const TWIN_BOSS_HEIGHT = 125; // 2体で出てくる中くらいのボスの高さ
export const BOSS_SCORE = 5000; // ステージの番号を掛ける(STAGE 3のボスは15000点)
export const LIFE_BONUS_SCORE = 1000; // 最後のステージをクリアした時、残っているライフ1つにつき加算
export const BOSS_REST_Y = 150; // 戦っている間の基準の高さ
export const BOSS_ENTER_MS = 2200; // 画面上から降りてくる時間(この間は弾が効かない)
export const BOSS_WARNING_MS = 2400; // 「WARNING」を出している時間
export const BOSS_PATTERN_MS = 2800; // 1つの攻撃パターンを続ける時間
export const BOSS_PATTERN_REST_MS = 700; // パターンの切り替わりに挟む休み
export const BOSS_ENRAGE_RATIO = 0.5; // 残りHPがこの割合を切ると攻撃が激しくなる
export const BOSS_DYING_MS = 2000; // 倒してから結果画面に進むまでの演出時間

// ---- 当たり判定 ----
// 写真は腕や小物が横に張り出していて、画像の四角そのままだと「当たっていないのに当たった」になる。
// 画像の中央寄りの一回り小さい四角を当たり判定にする。
export const HITBOX_SCALE_X = 0.6;
export const HITBOX_SCALE_Y = 0.82;

// ---- 演出 ----
export const HIT_FLASH_MS = 70; // 弾が当たった瞬間に白く光る時間
export const ENEMY_DYING_MS = 380; // 倒されたザコが回りながら小さくなって消える時間
export const GAMEOVER_DELAY_MS = 1300; // やられてから結果画面に進むまで
export const BG_SCROLL_SPEED = 60; // 背景の星が流れる速さの基準(前に進んでいる感じを出す)。近くの大きい星ほど速く流れる
export const PLANET_SCROLL_SPEED = 9; // 遠くのチーズの惑星が流れる速さ(ごくゆっくり)

export const HIGH_SCORE_STORAGE_KEY = "hinako-shooting:highScore";
export const SOUND_MUTED_STORAGE_KEY = "hinako-shooting:soundMuted";

export function enemyImageSrc(file: string): string {
  return `/images/${file}`;
}
