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
export const MAX_SHOT_LEVEL = 6;
// レベル4からは、ふつうの弾(レベル3と同じ4発)に加えて、次のものが増えていく(弾は広げない)。
// レベル4: 自機から真横(左右)にも弾を撃つ
// レベル5: さらに、ミニ戦闘機2機が自機のまわりをぐるぐる回る。撃たないが、敵の弾を消し、触れたザコにダメージを与える
// レベル6: さらに、大きなオレンジの爆弾をまっすぐ、ふつうの弾より遅い間隔で撃つ。当たると爆発して、まわりのザコにもダメージを与える(blast)
export const HEAVY_SHOTS: Record<number, { intervalMs: number; damage: number; scale: number; blast?: { radius: number; damage: number } }> = {
  6: { intervalMs: 450, damage: 3, scale: 2.3, blast: { radius: 70, damage: 3 } },
};
export const SIDE_SHOT_LEVEL = 4; // このレベルから、自機が真横にも撃つ
export const SIDE_SHOT_INTERVAL_MS = 260;
export const MINI_FIGHTER_LEVEL = 5; // このレベルからミニ戦闘機が自機のまわりを回る
export const MINI_ORBIT_RADIUS = 46; // 自機の中心からミニ戦闘機までの距離
export const MINI_ORBIT_SPEED = 4; // 回る速さ(rad/秒)
export const MINI_HIT_RADIUS = 11; // ミニ戦闘機が敵の弾を消す・ザコに触れる範囲
export const MINI_CONTACT_DPS = 12; // 触れているザコに与える1秒あたりのダメージ
export const HEAVY_SHOT_SPEED = 560; // ふつうの弾より少し遅く、重そうに飛ぶ

// ---- ザコひなこ ----
export const ENEMY_HEIGHT = 64; // 基準の高さ。画像ごとの sizeScale を掛ける
export const ENEMY_SIZE_SCALE_MIN = 0.85;
export const ENEMY_SIZE_SCALE_MAX = 1.25;
export const ENEMY_SCORE = 100;
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
export interface StageConfig {
  bossAfterMs: number; // ザコ戦がこの時間続くとボスが出てくる(倒した数は関係ない)
  spawnIntervalMs: [number, number]; // ザコの出現の間隔。[始め, ボス直前]。時間が経つほど短くなり、ザコが増えていく
  enemyHp: number; // ザコのHP(突っ込んでくるザコ・ビームやレーザーを撃つザコは+1)
  enemyBulletSpeed: number;
  enemyFireIntervalMs: [number, number]; // ザコが撃つ間隔(ランダム)
  bossHp: number; // ボスが2体の時は、2体の合計
  // big: 大きなボス1体が弾を撃つ / twinRush: 中くらいのボス2体が交互に自機へ突っ込んでくる(弾は少なめ) /
  // bigRush: 大きなボス1体が弾を撃ちつつ、ときどき自機へ体当たりしてくる
  bossType: "big" | "twinRush" | "bigRush";
  bossBulletSpeedScale: number; // ボスの弾の速さの倍率
  bossFireIntervalScale: number; // ボスが撃つ間隔の倍率(小さいほど弾が多い)
  bossMinionIntervalMs: [number, number]; // ボス戦中にザコの編隊が出てくる間隔(ランダム)
  bossGuards: number; // ボスのまわりを回って弾をふせぐガードの数(0なら出さない)。全部倒すと少しして出し直す
  // ザコがパワーアップを落とす確率。[ザコ戦, ボス戦中]。最初のステージは少なめ、敵が強いステージほど多め
  powerDropChance: [number, number];
  powerGuaranteedEvery: [number, number]; // この体数を倒すごとに必ず落とす(運が悪くてもパワーアップできるように)。[ザコ戦, ボス戦中]
  lifeDropChance: [number, number]; // ザコがハートを落とす確率。[ザコ戦, ボス戦中]
}

export const STAGES: StageConfig[] = [
  {
    bossAfterMs: 30000,
    // STAGE 1は、始めはゆっくり少なめにして慣れてもらい、だんだん増やす
    spawnIntervalMs: [1400, 550],
    enemyHp: 3,
    enemyBulletSpeed: 140,
    enemyFireIntervalMs: [2000, 3200],
    bossHp: 320,
    bossType: "big",
    bossBulletSpeedScale: 1,
    bossFireIntervalScale: 1,
    bossMinionIntervalMs: [3200, 4400],
    bossGuards: 0,
    powerDropChance: [0.04, 0.04],
    powerGuaranteedEvery: [18, 18],
    lifeDropChance: [0.02, 0.12],
  },
  {
    bossAfterMs: 35000,
    spawnIntervalMs: [900, 420],
    enemyHp: 5,
    enemyBulletSpeed: 170,
    enemyFireIntervalMs: [1400, 2300],
    bossHp: 420,
    bossType: "twinRush",
    bossBulletSpeedScale: 1.1,
    bossFireIntervalScale: 0.85,
    bossMinionIntervalMs: [2800, 3800],
    bossGuards: 0,
    powerDropChance: [0.06, 0.06],
    powerGuaranteedEvery: [14, 14],
    lifeDropChance: [0.02, 0.12],
  },
  {
    bossAfterMs: 40000,
    // STAGE 3はザコがとても多いぶん、パワーアップとハートも出やすくする
    spawnIntervalMs: [600, 280],
    enemyHp: 6,
    enemyBulletSpeed: 190,
    enemyFireIntervalMs: [1200, 2000],
    bossHp: 520,
    bossType: "bigRush",
    bossBulletSpeedScale: 1.2,
    bossFireIntervalScale: 0.72,
    bossMinionIntervalMs: [1500, 2300],
    bossGuards: 6,
    // ザコ戦はザコがとても多いので少なめにし、ボス戦中は多めにする
    powerDropChance: [0.06, 0.14],
    powerGuaranteedEvery: [15, 8],
    lifeDropChance: [0.05, 0.2],
  },
];

export const STAGE_INTRO_MS = 2200; // ステージの始めに「STAGE 1」などを出している時間(この間はザコが出ない)
export const STAGE_CLEAR_MS = 2800; // ボスを倒してから次のステージに進むまで(ボスが爆発する演出を含む)

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
