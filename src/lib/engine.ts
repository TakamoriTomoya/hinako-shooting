// シューティングのゲームエンジン本体。
// Canvas描画・ポインタ/キー入力・敵や弾の動き・当たり判定をすべて内包する、Reactに依存しないクラス。
// 弾や敵の位置は毎フレーム変わるためReact stateにはせず、UIに関わる値(スコア・ライフ・画面)
// だけをEngineStateListener経由でReact側に伝える。
//
// 流れ(ステージごと): 「STAGE n」表示 → ザコひなこと決まった時間戦う → WARNING → ボス(でかひなこ)登場
// (ボス戦中もザコが出てくる) → 倒せば次のステージへ。最後のステージのボスを倒すとボーナスステージ
// (攻撃してこない硬いザコが大量に押し寄せてくる)になり、それが終わればクリア。
// ステージごとの難しさは constants.ts の STAGES。ライフが0になったらゲームオーバー。

import {
  BG_SCROLL_SPEED,
  BONUS_END_WAIT_MS,
  BONUS_ENEMY_HP,
  BONUS_ENEMY_SCORE,
  BONUS_MS,
  BONUS_ROW_COUNT,
  BONUS_ROW_INTERVAL_MS,
  BONUS_SPEED,
  PLANET_SCROLL_SPEED,
  BOSS_DYING_MS,
  BOSS_ENRAGE_RATIO,
  BOSS_ENTER_MS,
  BOSS_HEIGHT,
  TWIN_BOSS_HEIGHT,
  BOSS_PATTERN_MS,
  BOSS_PATTERN_REST_MS,
  BOSS_REST_Y,
  BOSS_SCORE,
  BOSS_WARNING_MS,
  ENEMY_DYING_MS,
  ENEMY_FIRE_MAX_Y_RATIO,
  ENEMY_FIRST_FIRE_MS,
  ENEMY_HEIGHT,
  ENEMY_SCORE,
  TANK_SCORE,
  ENEMY_SIZE_SCALE_MAX,
  ENEMY_SIZE_SCALE_MIN,
  FIELD_MAX_H,
  FIELD_MIN_H,
  FIELD_W,
  GAMEOVER_DELAY_MS,
  HIT_FLASH_MS,
  HITBOX_SCALE_X,
  HITBOX_SCALE_Y,
  ITEM_FALL_SPEED,
  ITEM_RADIUS,
  LIFE_ITEM_FULL_SCORE,
  LIFE_BONUS_SCORE,
  MAX_SHOT_LEVEL,
  SHOCKWAVE_DAMAGE,
  SHOCKWAVE_INTERVAL_MS,
  SHOCKWAVE_LEVEL,
  SHOCKWAVE_SPEED,
  HEAVY_SHOT_SPEED,
  HEAVY_SHOTS,
  MINI_CONTACT_DPS,
  MINI_FIGHTER_LEVEL,
  MINI_HIT_RADIUS,
  MINI_ORBIT_RADIUS,
  MINI_ORBIT_SPEED,
  OMNI_SHOT_COUNT,
  OMNI_SHOT_DAMAGE,
  OMNI_SHOT_INTERVAL_MS,
  OMNI_SHOT_LEVEL,
  OMNI_SHOT_SCALE,
  OUTER_MINI_LEVEL,
  OUTER_MINI_ORBIT_RADIUS,
  OUTER_MINI_ORBIT_SPEED,
  PLAYER_BOTTOM_MARGIN,
  PLAYER_EDGE_MARGIN,
  PLAYER_HIT_RADIUS,
  PLAYER_INVINCIBLE_MS,
  PLAYER_ITEM_RADIUS,
  PLAYER_KEY_SPEED,
  PLAYER_START_LIVES,
  PLAYER_TOP_LIMIT,
  SHOT_INTERVAL_MS,
  SHOT_RADIUS,
  SHOT_SPEED,
  SHOT_SPREAD,
  STAGE_CLEAR_MS,
  STAGE_INTRO_MS,
  STAGES,
  type FormationName,
  type StageConfig,
} from "./constants";
import { aimAngle, circleIntersectsRect, circlesIntersect, clamp, fanAngles, spawnInterval, type Rect } from "./collision";
import { loadHighScore, saveHighScore } from "./highScore";
import type { BgmId, SoundManager } from "./sound";
import { loadSprites, spriteWidthFor, SPRITE_OUTLINE_PX, type Sprite } from "./sprites";

export type EnginePhase = "home" | "playing" | "gameover" | "clear";

export interface BossHp {
  name: string;
  percent: number; // 0〜100
}

export interface EngineState {
  phase: EnginePhase;
  score: number;
  lives: number;
  shotLevel: number;
  stage: number; // 今のステージ(1から)
  stageBanner: string | null; // 画面中央に大きく出す「STAGE 2」「STAGE CLEAR!」。出していない時はnull
  bossHps: BossHp[] | null; // ボス戦中だけ、ボス1体につき1つ(2体の時は左から順)。それ以外はnull
  bossWarning: boolean; // 「WARNING」を出している間true
  hintVisible: boolean; // 始めてから最初に自機を動かすまで、操作方法を出しておく
  highScore: number;
  isNewRecord: boolean; // 結果画面で「ハイスコア更新」を出すか
  assetsReady: boolean;
}

export type EngineStateListener = (state: EngineState) => void;

export interface StartOptions {
  stageIndex?: number; // 始めるステージ(0から)。STAGES.length なら、最後のステージの後のボーナスステージから
  shotLevel?: number; // 始める時の攻撃レベル(1〜MAX_SHOT_LEVEL)
  startAtBoss?: boolean; // 最初のステージをザコ戦を飛ばしてボス戦から始める
}

type EnemyKind = "straight" | "zigzag" | "swoop" | "dive" | "beamer" | "laser" | "cross" | "guard" | "tank" | "orbit" | "bonus";

interface Enemy {
  sprite: Sprite;
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  ay: number; // 下向きの加速(swoopが弧を描いて落ちていくため)
  baseX: number; // zigzagの揺れの中心
  ageMs: number;
  hp: number;
  fireCooldownMs: number;
  flashMs: number;
  dyingMs: number | null; // 倒された後、消えるまでの演出の経過時間
  diveStep: "enter" | "pause" | "dive";
  diveStopY: number; // dive・beamer・laserが止まる高さ。crossは横切っていく高さ
  diveFromSide: boolean; // dive・beamerが横から入ってくるか(横から入ってきたものはbaseXの位置で止まり、beamerは横へ帰っていく)
  divePauseMs: number;
  beamShots: number; // beamerが1回に撃つ数(1発だけのものと、3連射のものがいる)
  beamLeft: number; // beamerの連射で、あと何発撃つか
  beamGapMs: number; // beamerの連射で、次の1発までの残り時間
  beamAngle: number; // beamerの連射の向き(撃ち始めに自機をねらって決め、連射の間は変えない)
  laserStep: "wait" | "charge" | "fire" | "done"; // laserの状態: 待つ → ためる(予告の細い線) → まっすぐ下へ撃つ → 撃ち終わって上へ帰っていく
  laserMs: number; // 今のlaserStepに入ってからの経過時間
  laserLen: number; // 口元から伸びているレーザーの長さ
  guardOf: Boss | null; // guardが守っているボス
  orbitAngle: number; // guardがボスのまわりを回っている角度。orbitが輪の中心のまわりを回っている角度
  orbitCy: number; // orbitの輪の中心の高さ(中心の横の位置はbaseX)
}

type BossStep = "entering" | "fighting" | "dying";
type BossPattern = "ring" | "aimed" | "spiral";
const BOSS_PATTERNS: BossPattern[] = ["aimed", "ring", "spiral"];

interface Boss {
  kind: StageConfig["bossType"];
  sprite: Sprite;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  homeX: number; // 戦っている間の基準の位置(bigRushは突っ込んだ後ここへ戻る)
  homeY: number;
  rushStep: "hover" | "windup" | "rush" | "return"; // bigRushの動き: 浮かぶ → 震えてためる → 突っ込む → 戻る
  rushMs: number; // 今のrushStepに入ってからの経過時間
  rushVx: number;
  rushVy: number;
  wanderX: number; // twinが向かっている場所(ときどき不規則に選び直す)
  wanderY: number;
  wanderMs: number; // 次に向かう場所を選び直すまでの残り時間
  wanderEase: number; // 向かう場所へ寄っていく速さ(選び直すたびにランダム)
  step: BossStep;
  stepMs: number; // 今のstepに入ってからの経過時間
  patternIndex: number;
  patternMs: number;
  fireMs: number; // 次に撃つまでの残り時間
  spinAngle: number; // ringとspiralで撃つ向きを少しずつずらすための角度
  flashMs: number;
  nextBlastMs: number; // 倒された後の爆発演出の間隔
  barrierHp: number; // 張っているバリアの残りHP(0なら張っていない)
  barrierMaxHp: number;
  barrierMs: number; // バリアを張ってからの時間(広がっていく演出用)
  barrierCooldownMs: number; // 次にバリアを張るまでの残り時間
  barrierFlashMs: number; // バリアに弾が当たって光っている残り時間
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  look: "beam" | "shot"; // beamは敵のビーム、shotは自機の弾
  damage?: number; // 自機の弾が敵に与えるダメージ(省略時は1)。強い弾だけ大きい
  scale?: number; // 自機の弾の見た目の大きさ(省略時は1)
  blast?: { radius: number; damage: number }; // 当たると爆発して、まわりのザコにもダメージを与える(レベル6以上の強い弾)
}

type ItemKind = "power" | "life";

interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  ageMs: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  lifeMs: number;
  maxLifeMs: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  lifeMs: number;
}

// intro: 「STAGE n」表示 / waves: ザコ戦 / clearing: 残ったザコがいなくなるのを待つ / warning: ボスの予告 /
// boss: ボス戦 / stage-clear: ボスを倒して次のステージへ進むまで /
// bonus-intro: 「BONUS STAGE」表示 / bonus: ボーナスステージ / bonus-end: 残ったザコがいなくなるのを待ってクリアへ
type StageStep = "intro" | "waves" | "clearing" | "warning" | "boss" | "stage-clear" | "bonus-intro" | "bonus" | "bonus-end";

// 敵の弾の色。背景がチーズ色なので黄色系は避け、白い縁取りで目立たせる
const BULLET_PINK = "#ff6f91";
// 敵のビームの色(撃ち方ごとに見分けられるように変える)
const BEAM_RED = "#ff3030";
// twin(2体で出てくる中くらいのボス)の動き
const TWIN_REST_Y = 130; // 浮かんでいる高さ
const TWIN_WANDER_MS: [number, number] = [400, 1300]; // 向かう場所を選び直す間隔(ランダム)
const TWIN_WANDER_Y: [number, number] = [90, 240]; // 動き回る高さの範囲
const TWIN_FIRE_MS = 1900; // 3方向の弾を撃つ間隔(弾は少なめ)
// ボスのバリア(STAGESのbossBarrier)
const BARRIER_FIRST_MS = 5000; // ボスが戦い始めてから、最初にバリアを張るまで
const BARRIER_RADIUS_SCALE = 0.62; // ボスの体の大きさ(幅と高さの大きい方)に対するバリアの半径
const BARRIER_COLOR = "#20d8ff";

// 2体の十字砲火。2体が左右対称の位置にそろって光をためてから、同時に斜め下へ弾を連射する。
// 撃つ向きを左右対称に振るので、2体の弾がX字に交差して、そのすき間が上下に動く
const CROSSFIRE_FIRST_MS = 3000; // 2体が戦い始めてから、最初に撃つまで
const CROSSFIRE_INTERVAL_MS: [number, number] = [6000, 8000]; // 撃ち終えてから、次に撃つまで(ランダム)
const CROSSFIRE_CHARGE_MS = 800; // 左右対称の位置へ動いて、光をためる時間(予告)
const CROSSFIRE_FIRE_MS = 2600; // 連射している時間(この間に撃つ向きを1往復振る)
const CROSSFIRE_SHOT_MS = 110; // 連射の間隔
const CROSSFIRE_SPOT: [number, number] = [0.2, 115]; // 撃つ位置。[画面の幅に対する左の1体の横の位置(右の1体は反対側), 高さ(px)]
const CROSSFIRE_SWEEP = 0.45; // 撃つ向きを振る幅(rad)
const CROSSFIRE_SPREAD = 0.32; // 1回に撃つ2発の開き(rad)
// 1体が倒れて残った1体は怒る: 画面の上の方全体を速く動き回り、5方向の弾をたくさん撃つ
const TWIN_ALONE_FIRE_SCALE = 0.55; // 撃つ間隔の倍率
// bigRush(弾を撃ちつつ体当たりしてくる大きなボス)の動き
const BIG_RUSH_HOVER_MS = 4200; // 弾を撃ちながら浮かんでから、体当たりを始めるまで(HPが半分を切ると短くなる)
const RUSH_WINDUP_MS = 600; // 突っ込む前に震えて知らせる時間
const BIG_RUSH_SPEED = 130; // 迫ってくる速さ(px/秒)。出始めはこの半分から、だんだん速くなる
const RUSH_MAX_MS = 3000; // 迫ってくるのをやめて戻り始めるまで(画面の端に着いたらその時点で戻る)
const RUSH_TURN_RATE = 1.4; // 迫っている間に、自機の方へ向きを変えられる速さ(rad/秒)
const RUSH_RETURN_SPEED = 260; // 元の位置へ戻る速さ(px/秒)

const SIDE_DIVE_ENTER_SPEED = 220; // 横から入ってくるdive・beamerの速さ(px/秒)
const SIDE_BEAMER_Y: [number, number] = [0.5, 0.7]; // 左右の下の方から入ってくるbeamer・diveの高さ(画面の高さに対する割合)

const BOSS_AURA = "#a23cff"; // ボスのオーラ(ふだん)
const BOSS_AURA_ENRAGED = "#ff2a2a"; // ボスのオーラ(HPが半分を切って怒っている時)

// ボスのオーラの元になる絵: 写真の形のシルエットを、上寄りにずらしながら何度も薄く重ねて、
// 体の輪郭に沿ってぼんやり広がり、頭の上ほど高く燃え上がる炎の形にする。
// (canvasのfilter: blurはブラウザによって使えないので、白いふちと同じくずらして重ねる方法にする)
// 重いので、ひなこと色の組み合わせごとに一度だけ作ってとっておく
const AURA_PAD = 70; // 元画像(480px高)の単位で、オーラが写真からはみ出す幅
const auraSprites = new Map<string, HTMLCanvasElement | null>();

function auraSprite(sprite: Sprite, color: string): HTMLCanvasElement | null {
  const key = `${sprite.name}/${color}`;
  if (auraSprites.has(key)) return auraSprites.get(key) ?? null;
  const silhouette = sprite.silhouette;
  const canvas = silhouette ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (silhouette && canvas && ctx) {
    canvas.width = silhouette.width + AURA_PAD * 2;
    canvas.height = silhouette.height + AURA_PAD * 2;
    const steps = 20;
    for (const ratio of [1, 0.75, 0.5, 0.25]) {
      const r = AURA_PAD * ratio;
      ctx.globalAlpha = 0.07;
      for (let i = 0; i < steps; i++) {
        const angle = (Math.PI * 2 * i) / steps;
        // 横と下へは狭く、上へは大きく広げる(炎は上へ燃え上がる)
        const dx = Math.cos(angle) * r * 0.8;
        const dy = Math.sin(angle) * r * 0.6 - r * 0.4;
        ctx.drawImage(silhouette, AURA_PAD + dx, AURA_PAD + dy);
      }
    }
    // 白いシルエットを、オーラの色に塗り替える
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  auraSprites.set(key, canvas);
  return canvas;
}
const BEAM_CYAN = "#20d8ff";
const BEAM_GREEN = "#40ff70";
const SHOT_NEON = "#ff3fd2"; // 自機の弾の蛍光ピンク(敵の弾と見まちがえない色)
const HEAVY_SHOT_NEON = "#ff8a1f"; // 自機の強い弾(レベル6以上)の蛍光オレンジ
const BLAST_MS = 320; // 強い弾の爆発の演出の長さ

// ビームを撃つザコ(beamer): 降りてきて止まり、光をためてから自機めがけて赤いビームを連射する
const BEAMER_CHARGE_MS = 550; // 撃つ前に光をためる(予告する)時間
const BEAMER_SHOT_GAP_MS = 90;
const BEAMER_STAY_MS = 6000; // 出てきてからこの時間が過ぎたら上へ帰っていく

// 横から一列に並んで入ってきて横切るザコ(cross)
const CROSS_SPEED = 140; // 横に進む速さ(px/秒)
const CROSS_GAP_MS = 420; // 列の中で、1体ずつ出てくる間隔(速さ×間隔 = 並ぶ間隔 約60px)

// 少し強いザコ(tank): ランダムな位置に1体、大きめの体でゆっくり降りてくる
const TANK_SCALE = 1.3; // ふつうのザコに対する大きさ
const TANK_HP_SCALE = 2; // ふつうのザコの何倍のHPか
const TANK_SPEED = 50; // 降りてくる速さ(px/秒)

// 輪になって回るザコ(orbit): orbitRingで6体が輪になり、回りながらゆっくり降りてくる
const ORBIT_COUNT = 6;
const ORBIT_RADIUS = 70;
const ORBIT_SPEED = 1.6; // 回る速さ(rad/秒)
const ORBIT_FALL_SPEED = 45; // 輪の中心が降りてくる速さ(px/秒)

// ボスのガード(guard): STAGESのbossGuardsの数だけ、ボスのまわりを回って自機の弾をふせぐ
const GUARD_ORBIT_SPEED = 1.1; // 回る速さ(rad/秒)
const GUARD_ORBIT_GAP = 34; // ボスの体のふちから、回る道までの距離
const GUARD_SCALE = 0.8; // ふつうのザコに対する大きさ
const GUARD_RESPAWN_MS = 6000; // 全部倒してから出し直すまで

// レーザーを撃つザコ(laser): 降りてきてぴたっと止まり、口元から真下へ一直線にレーザーを伸ばす。
// レーザーはLASER_FIRE_MSのあいだ出して止め、上へ帰っていく
const LASER_WAIT_MS = 500; // 止まってからためるまで
const LASER_CHARGE_MS = 800; // ためる間、撃つ場所に細い線を出して予告する
const LASER_EXTEND_SPEED = 900; // レーザーの先が伸びていく速さ(px/秒)
const LASER_FIRE_MS = 2000; // レーザーを出している時間
const LASER_LEAVE_SPEED = 320; // 帰っていく速さ(px/秒)
const LASER_HIT_W = 12; // 当たり判定の太さ
const EXPLOSION_COLORS = ["#ff6f91", "#ffffff", "#ffc93c", "#8cc63f"];
const OUTLINE_DARK = "#1b1450"; // 文字や自機のふち。index.cssの--color-outlineと同じ色

const STAR_COUNT = 70; // FIELD_W の幅あたりの星の数
const STAR_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#cfe6ff", "#ffd6e0", "#fff3c4"];
// 横長画面で、戦場の左右の外側に敵や弾が少しずつ消えていく幅。
// 境界線を引かずに済むよう、端でいきなり切れず、宇宙の背景に溶けこむように見せる
const EDGE_FADE_W = 48;

// ステージごとのBGM(STAGESと同じ順)。曲名が惑星の名前なので、宇宙を進んでいく順に並べる
const STAGE_BGM: BgmId[] = ["venus", "mars", "mercury"];

// 決着(クリア/ゲームオーバー)した理由。演出が終わった時にどちらの結果画面へ進むかを覚えておく
type Ending = { result: "gameover" | "clear"; remainingMs: number };

// URLに?debugを付けた時だけ、動作確認用にwindow.shootingEngineからエンジンを触れるようにする
const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

// 敵のビームは、光る見た目を毎フレーム作り直さないよう、色と太さごとに一度だけ小さなcanvasに描いてとっておく。
// 絵は右向き(進む向き)で、弾の位置(当たり判定の中心)が光の先頭、後ろに光の尾が伸びる
const BEAM_HEAD = 1.3; // 弾の半径rに対する、先頭から絵の右端までの長さ
const BEAM_TAIL = 4.5; // 弾の半径rに対する、尾の長さ
const BEAM_HALF_W = 1.6; // 弾の半径rに対する、光のにじみも含めた半分の太さ
const BEAM_SPRITE_SCALE = 3; // 高解像度の画面でもぼやけないよう、大きめに描いておく
const beamSprites = new Map<string, HTMLCanvasElement>();

function beamSprite(color: string, r: number): HTMLCanvasElement {
  const key = `${color}/${r}`;
  const cached = beamSprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(r * (BEAM_TAIL + BEAM_HEAD) * BEAM_SPRITE_SCALE);
  canvas.height = Math.ceil(r * BEAM_HALF_W * 2 * BEAM_SPRITE_SCALE);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(BEAM_SPRITE_SCALE, BEAM_SPRITE_SCALE);
    ctx.translate(r * BEAM_TAIL, r * BEAM_HALF_W); // 原点 = 光の先頭
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    // 外側のにじみ → 色のついた本体 → 真ん中の白く熱い芯、の順に重ねる。尾は後ろほど薄くなる
    const layers: { width: number; color: string; alpha: number }[] = [
      { width: 2.8, color, alpha: 0.18 },
      { width: 1.7, color, alpha: 0.4 },
      { width: 1.0, color, alpha: 1 },
      { width: 0.45, color: "#ffffff", alpha: 1 },
    ];
    for (const layer of layers) {
      const trail = ctx.createLinearGradient(-r * BEAM_TAIL, 0, 0, 0);
      trail.addColorStop(0, "rgba(0, 0, 0, 0)");
      trail.addColorStop(1, layer.color);
      ctx.globalAlpha = layer.alpha;
      ctx.strokeStyle = trail;
      ctx.lineWidth = r * layer.width;
      ctx.beginPath();
      ctx.moveTo(-r * (BEAM_TAIL - layer.width / 2), 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
    // 先頭のまぶしい光の玉
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * BEAM_HEAD);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.35, color);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * BEAM_HEAD, 0, Math.PI * 2);
    ctx.fill();
  }
  beamSprites.set(key, canvas);
  return canvas;
}

// 自機の弾: 蛍光ピンクに光る細長いカプセル。絵は右向き(進む向き)で、真ん中が弾の位置
const SHOT_LEN = 18; // 光の芯の長さ(px)
const SHOT_GLOW_W = 10; // にじみも含めた太さ(px)
const shotSprites = new Map<string, HTMLCanvasElement>();

// scaleは強い弾を大きく描くための倍率
function shotSprite(color: string, scale = 1): HTMLCanvasElement {
  const key = `${color}/${scale}`;
  const cached = shotSprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((SHOT_LEN + SHOT_GLOW_W) * scale * BEAM_SPRITE_SCALE);
  canvas.height = Math.ceil(SHOT_GLOW_W * scale * BEAM_SPRITE_SCALE);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(BEAM_SPRITE_SCALE * scale, BEAM_SPRITE_SCALE * scale);
    ctx.translate((SHOT_LEN + SHOT_GLOW_W) / 2, SHOT_GLOW_W / 2);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    // にじみ → 色のついた本体 → 白い芯
    for (const layer of [
      { width: SHOT_GLOW_W, color, alpha: 0.3 },
      { width: 5.5, color, alpha: 1 },
      { width: 2.2, color: "#ffffff", alpha: 1 },
    ]) {
      ctx.globalAlpha = layer.alpha;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.beginPath();
      ctx.moveTo(-(SHOT_LEN - layer.width) / 2, 0);
      ctx.lineTo((SHOT_LEN - layer.width) / 2, 0);
      ctx.stroke();
    }
  }
  shotSprites.set(key, canvas);
  return canvas;
}

function randomBetween([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export class ShootingEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private lastTime = 0;
  private disposed = false;

  // 画面サイズ(CSS px)と論理座標系の対応
  private lastCssW = 0;
  private lastCssH = 0;
  private dpr = 1;
  private renderScale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private fieldH = FIELD_MIN_H;

  private readonly sprites: Sprite[];
  private assetsReady = false;
  private homeSprite: Sprite | null = null; // ホーム画面で真ん中に浮かべておくひなこ

  private phase: EnginePhase = "home";
  private score = 0;
  private lives = PLAYER_START_LIVES;
  private shotLevel = 1;
  private highScore = loadHighScore();
  private isNewRecord = false;
  private practice = false; // 開発用に途中から始めた回(ハイスコアに残さない)
  private skipWaves = false; // 開発用に、最初のステージのザコ戦を飛ばしてボス戦から始める
  private hintVisible = false;

  private playerX = FIELD_W / 2;
  private playerY = FIELD_MIN_H - PLAYER_BOTTOM_MARGIN;
  private playerAlive = true;
  private invincibleMs = 0;
  private shotCooldownMs = 0;
  private heavyCooldownMs = 0; // オレンジの爆弾(レベル6以上)を次に撃つまでの残り時間
  private omniCooldownMs = 0; // 全方向のビーム(レベル8)を次に撃つまでの残り時間
  private omniRings = 0; // 撃った輪の数(1回ごとに向きを半分ずらして、すき間を埋めるため)
  private guardCooldownMs = 0; // ボスのガードを全部倒してから出し直すまでの残り時間
  // ミニ戦闘機の位置。内側(レベル4以上)は2機が自機をはさんで反対側にいて、まわりを回る。
  // 外側(レベル5以上)は3機が等間隔で、内側と反対向きに回る
  private miniAngle = 0;
  private minis = [
    { x: 0, y: 0, outer: false },
    { x: 0, y: 0, outer: false },
    { x: 0, y: 0, outer: true },
    { x: 0, y: 0, outer: true },
    { x: 0, y: 0, outer: true },
  ];
  private blasts: { x: number; y: number; radius: number; ms: number }[] = []; // 強い弾の爆発の輪(演出)
  private shockwaves: { x: number; y: number; r: number; maxR: number; hit: Set<Enemy> }[] = []; // レベル9の衝撃波の輪
  private shockwaveCooldownMs = 0;

  private stageIndex = 0;
  private stageStep: StageStep = "intro";
  private usedBossSprites: Sprite[] = []; // 同じひなこが続けてボスにならないよう、この回で出したボス
  private stepMs = 0;
  private timedStarsDropped = 0; // このステージで、決まったタイミングで落とした星の数(STAGESのpowerDropTimings)
  private spawnCooldownMs = 0;
  private pendingSpawns: { delayMs: number; spawn: () => void }[] = [];

  private enemies: Enemy[] = [];
  private bosses: Boss[] = []; // ふつうは1体。twinのステージは2体
  private crossfire: { step: "idle" | "charge" | "fire"; ms: number; cooldownMs: number; shotMs: number } = { step: "idle", ms: 0, cooldownMs: 0, shotMs: 0 }; // twinの2体の十字砲火
  private playerShots: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private items: Item[] = [];
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private ending: Ending | null = null;

  private bgScroll = 0;
  private readonly stars = Array.from({ length: STAR_COUNT }, () => {
    // 小さい(遠い)星ほど多く、ゆっくり流れる。大きさと速さをそろえて奥行きを出す
    const depth = Math.random() ** 2;
    return {
      x: Math.random() * FIELD_W,
      y: Math.random() * FIELD_MAX_H,
      r: 0.6 + depth * 1.8,
      speed: 0.25 + depth * 1.2,
      color: pickRandom(STAR_COLORS),
      twinkle: Math.random() * Math.PI * 2, // またたきの周期のずれ
    };
  });
  private timeMs = 0; // 起動してからの経過時間(ホームのひなこの揺れ・星のまたたき用)

  // 入力
  private readonly heldKeys = new Set<string>();
  private drag: { pointerId: number; startX: number; startY: number; playerX: number; playerY: number } | null = null;

  private lastEmitted: EngineState | null = null;
  private readonly listener: EngineStateListener;
  private readonly sound: SoundManager;

  constructor(listener: EngineStateListener, sound: SoundManager) {
    this.listener = listener;
    this.sound = sound;
    this.sound.playBgm("map"); // 画面を一度触るまでは鳴らない(触った時に始まる)
    if (DEBUG) (window as unknown as { shootingEngine?: ShootingEngine }).shootingEngine = this;
    this.sprites = loadSprites(() => this.checkAssetsReady());
  }

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.attachInput();
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.detachInput();
  }

  // ---- 公開操作 ----

  // 開発用に、途中のステージや強い攻撃レベルから始められる(ふつうはSTAGE 1・レベル1)。
  // 途中から始めた回はハイスコアに残さない
  startGame(options: StartOptions = {}): void {
    const requestedStage = Math.floor(options.stageIndex ?? 0);
    const bonus = requestedStage >= STAGES.length; // ボーナスステージは最後のステージの続きとして進める
    const stageIndex = clamp(requestedStage, 0, STAGES.length - 1);
    const shotLevel = clamp(Math.floor(options.shotLevel ?? 1), 1, MAX_SHOT_LEVEL);
    this.skipWaves = !bonus && (options.startAtBoss ?? false);
    this.practice = requestedStage !== 0 || shotLevel !== 1 || this.skipWaves;
    this.phase = "playing";
    this.sound.playJingle("intro");
    this.score = 0;
    this.lives = PLAYER_START_LIVES;
    this.shotLevel = shotLevel;
    this.stageIndex = stageIndex;
    this.usedBossSprites = [];
    this.isNewRecord = false;
    this.hintVisible = true;
    this.playerX = FIELD_W / 2;
    this.playerY = this.fieldH - PLAYER_BOTTOM_MARGIN;
    this.playerAlive = true;
    this.invincibleMs = 0;
    this.shotCooldownMs = 0;
    this.heavyCooldownMs = 0;
    this.omniCooldownMs = 0;
    this.shockwaveCooldownMs = SHOCKWAVE_INTERVAL_MS;
    this.miniAngle = 0;
    this.snapMinis();
    this.stageStep = bonus ? "bonus-intro" : "intro";
    this.timedStarsDropped = 0;
    this.stepMs = 0;
    this.spawnCooldownMs = 0;
    this.pendingSpawns = [];
    this.enemies = [];
    this.bosses = [];
    this.playerShots = [];
    this.enemyBullets = [];
    this.items = [];
    this.particles = [];
    this.blasts = [];
    this.shockwaves = [];
    this.texts = [];
    this.ending = null;
    this.drag = null;
    this.emit();
  }

  goHome(): void {
    this.phase = "home";
    this.sound.playBgm("map");
    this.enemies = [];
    this.bosses = [];
    this.playerShots = [];
    this.enemyBullets = [];
    this.items = [];
    this.particles = [];
    this.blasts = [];
    this.shockwaves = [];
    this.texts = [];
    this.pendingSpawns = [];
    this.ending = null;
    this.playerAlive = true;
    this.playerX = FIELD_W / 2;
    this.playerY = this.fieldH - PLAYER_BOTTOM_MARGIN;
    this.pickHomeSprite();
    this.emit();
  }

  // ---- 内部: 状態通知 ----

  private checkAssetsReady(): void {
    if (this.assetsReady) return;
    // 失敗した画像があっても、全部の読み込みが終わった(成功か失敗かが決まった)時点で進める
    if (!this.sprites.every((s) => s.ready || s.img.complete)) return;
    this.assetsReady = true;
    this.pickHomeSprite();
    this.emit();
  }

  private readySprites(): Sprite[] {
    return this.sprites.filter((s) => s.ready);
  }

  private pickHomeSprite(): void {
    const ready = this.readySprites();
    this.homeSprite = ready.length > 0 ? pickRandom(ready) : null;
  }

  private stageConfig(): StageConfig {
    return STAGES[this.stageIndex];
  }

  private isFinalStage(): boolean {
    return this.stageIndex === STAGES.length - 1;
  }

  private stageBanner(): string | null {
    if (this.phase !== "playing") return null;
    if (this.stageStep === "intro") return `STAGE ${this.stageIndex + 1}`;
    if (this.stageStep === "stage-clear") return "STAGE CLEAR!";
    if (this.stageStep === "bonus-intro") return "BONUS STAGE";
    return null;
  }

  private emit(): void {
    const bosses = this.bosses;
    const showHp = bosses.length > 0 && bosses.every((b) => b.step !== "entering");
    const state: EngineState = {
      phase: this.phase,
      score: this.score,
      lives: this.lives,
      shotLevel: this.shotLevel,
      stage: this.stageIndex + 1,
      stageBanner: this.stageBanner(),
      bossHps: showHp
        ? [...bosses]
            .sort((a, b) => a.homeX - b.homeX)
            .map((b) => ({
              name: b.kind === "twin" ? b.sprite.name : `でか${b.sprite.name}`,
              percent: Math.ceil((Math.max(0, b.hp) / b.maxHp) * 100),
            }))
        : null,
      bossWarning: this.stageStep === "warning" && this.phase === "playing",
      hintVisible: this.hintVisible && this.phase === "playing",
      highScore: this.highScore,
      isNewRecord: this.isNewRecord,
      assetsReady: this.assetsReady,
    };
    // 毎フレーム呼ばれても、値が変わった時だけReactへ伝えて再描画を抑える
    const last = this.lastEmitted;
    if (last && (Object.keys(state) as (keyof EngineState)[]).every((k) => state[k] === last[k])) return;
    this.lastEmitted = state;
    this.listener(state);
  }

  // ---- 内部: 画面サイズ ----

  // 毎フレーム自前で実サイズを測り、変わった時だけ描画バッファを張り直す(ResizeObserverの通知の遅れで
  // 一瞬ずれたコマを描かないように)。
  private syncSizeToContainer(): void {
    const canvas = this.canvas;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === this.lastCssW && rect.height === this.lastCssH) return;
    this.lastCssW = rect.width;
    this.lastCssH = rect.height;
    this.applySize(rect.width, rect.height);
  }

  // 横幅はFIELD_Wを画面幅いっぱいに、縦は画面の縦横比に合わせて論理座標系の高さ自体を伸び縮みさせる。
  // 横長のPC画面では高さに合わせて縮め、左右に宇宙の背景の余白を残して中央に置く。
  private applySize(cssW: number, cssH: number): void {
    if (!this.canvas || cssW <= 0 || cssH <= 0) return;

    const scale = Math.min(cssW / FIELD_W, cssH / FIELD_MIN_H);
    const prevFieldH = this.fieldH;
    this.renderScale = scale;
    this.fieldH = clamp(cssH / scale, FIELD_MIN_H, FIELD_MAX_H);
    this.offsetX = (cssW - FIELD_W * scale) / 2;
    this.offsetY = (cssH - this.fieldH * scale) / 2;

    // 高さが変わっても自機が画面外に取り残されないよう、下端からの距離を保つ
    this.playerY = clamp(this.playerY + (this.fieldH - prevFieldH), PLAYER_TOP_LIMIT, this.fieldH - PLAYER_EDGE_MARGIN);

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  // ---- 内部: 入力 ----

  private onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== "playing" || !this.playerAlive) return;
    this.canvas?.setPointerCapture(e.pointerId);
    // 指の真下に自機が来ると指で隠れて見えないので、触った位置に瞬間移動はさせず、
    // 指を動かした分だけ自機を動かす(画面のどこを触っても操作できる)
    this.drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, playerX: this.playerX, playerY: this.playerY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== e.pointerId || this.phase !== "playing" || !this.playerAlive) return;
    const k = 1 / this.renderScale;
    this.movePlayerTo(drag.playerX + (e.clientX - drag.startX) * k, drag.playerY + (e.clientY - drag.startY) * k);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.drag?.pointerId === e.pointerId) this.drag = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.phase !== "playing") return;
    if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault(); // 画面がスクロールしないように
    this.heldKeys.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.key.toLowerCase());
  };

  // 別のタブ等に移って離した時にキーが押しっぱなし扱いで残らないようにする
  private onBlur = (): void => {
    this.heldKeys.clear();
    this.drag = null;
  };

  private attachInput(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  private detachInput(): void {
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("pointerdown", this.onPointerDown);
      canvas.removeEventListener("pointermove", this.onPointerMove);
      canvas.removeEventListener("pointerup", this.onPointerUp);
      canvas.removeEventListener("pointercancel", this.onPointerUp);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private movePlayerTo(x: number, y: number): void {
    const nextX = clamp(x, PLAYER_EDGE_MARGIN, FIELD_W - PLAYER_EDGE_MARGIN);
    const nextY = clamp(y, PLAYER_TOP_LIMIT, this.fieldH - PLAYER_EDGE_MARGIN);
    if (nextX !== this.playerX || nextY !== this.playerY) this.hintVisible = false;
    this.playerX = nextX;
    this.playerY = nextY;
  }

  private updatePlayerByKeys(dt: number): void {
    const keys = this.heldKeys;
    const dx = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
    const dy = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    // 斜めだけ速くならないようにそろえる
    const len = Math.hypot(dx, dy);
    this.movePlayerTo(this.playerX + (dx / len) * PLAYER_KEY_SPEED * dt, this.playerY + (dy / len) * PLAYER_KEY_SPEED * dt);
  }

  // ---- 内部: 自機の攻撃 ----

  private updatePlayerShots(dtMs: number): void {
    if (this.playerAlive && this.ending === null) {
      this.shotCooldownMs -= dtMs;
      if (this.shotCooldownMs <= 0) {
        this.shotCooldownMs += SHOT_INTERVAL_MS;
        this.firePlayerShots();
        this.sound.playSfx("shot");
      }
      // 今のレベル以下で、いちばん上のレベルの設定を使う(レベル8でもレベル7の爆弾を撃ち続けるように)
      const heavyLevel = Math.max(0, ...Object.keys(HEAVY_SHOTS).map(Number).filter((l) => l <= this.shotLevel));
      const heavy = HEAVY_SHOTS[heavyLevel];
      if (heavy) {
        this.heavyCooldownMs -= dtMs;
        if (this.heavyCooldownMs <= 0) {
          this.heavyCooldownMs = heavy.intervalMs;
          // まっすぐ上に1発。sideSpreadがあれば、左右ななめ前にも1発ずつ
          const angles = heavy.sideSpread ? [0, -heavy.sideSpread, heavy.sideSpread] : [0];
          for (const a of angles) {
            this.playerShots.push({
              x: this.playerX,
              y: this.playerY - 26,
              vx: Math.sin(a) * HEAVY_SHOT_SPEED,
              vy: -Math.cos(a) * HEAVY_SHOT_SPEED,
              r: SHOT_RADIUS * heavy.scale,
              color: HEAVY_SHOT_NEON,
              look: "shot",
              damage: heavy.damage,
              scale: heavy.scale,
              blast: heavy.blast,
            });
          }
          this.sound.playSfx("heavyShot");
        }
      }
    }
    if (this.shotLevel >= OMNI_SHOT_LEVEL && this.playerAlive && this.ending === null) {
      this.omniCooldownMs -= dtMs;
      if (this.omniCooldownMs <= 0) {
        this.omniCooldownMs += OMNI_SHOT_INTERVAL_MS;
        this.fireOmniShots();
      }
    }
    if (this.shotLevel >= SHOCKWAVE_LEVEL && this.playerAlive && this.ending === null) {
      this.shockwaveCooldownMs -= dtMs;
      if (this.shockwaveCooldownMs <= 0) {
        this.shockwaveCooldownMs += SHOCKWAVE_INTERVAL_MS;
        // 画面のいちばん遠い角まで届いたら消える
        const maxR = Math.hypot(Math.max(this.playerX, FIELD_W - this.playerX), Math.max(this.playerY, this.fieldH - this.playerY));
        this.shockwaves.push({ x: this.playerX, y: this.playerY, r: 0, maxR, hit: new Set() });
        this.sound.playSfx("blast");
      }
    }
    this.updateShockwaves(dtMs);
    this.updateMinis(dtMs);
  }

  // レベル9の衝撃波: 輪が広がりながら、通ったところの敵の弾を消し、ザコに1回ずつダメージを与える(レーザー・ボスには効かない)
  private updateShockwaves(dtMs: number): void {
    for (const w of this.shockwaves) {
      w.r += SHOCKWAVE_SPEED * (dtMs / 1000);
      this.enemyBullets = this.enemyBullets.filter((b) => {
        if ((b.x - w.x) ** 2 + (b.y - w.y) ** 2 > w.r * w.r) return true;
        this.burst(b.x, b.y, 2, 60);
        return false;
      });
      for (const e of this.enemies) {
        if (e.dyingMs !== null || w.hit.has(e) || (e.x - w.x) ** 2 + (e.y - w.y) ** 2 > w.r * w.r) continue;
        w.hit.add(e);
        e.hp -= SHOCKWAVE_DAMAGE;
        e.flashMs = HIT_FLASH_MS;
        if (e.hp <= 0) this.onEnemyDefeated(e);
      }
    }
    this.shockwaves = this.shockwaves.filter((w) => w.r < w.maxR);
  }

  // レベル8: 自機から全方向へ、弱いビームを輪のように撃つ。1回ごとに向きを半分ずらす
  private fireOmniShots(): void {
    const step = (Math.PI * 2) / OMNI_SHOT_COUNT;
    const offset = (this.omniRings % 2) * (step / 2);
    this.omniRings += 1;
    for (let i = 0; i < OMNI_SHOT_COUNT; i++) {
      const angle = offset + step * i;
      this.playerShots.push({
        x: this.playerX,
        y: this.playerY,
        vx: Math.cos(angle) * SHOT_SPEED,
        vy: Math.sin(angle) * SHOT_SPEED,
        r: SHOT_RADIUS * OMNI_SHOT_SCALE,
        color: SHOT_NEON,
        look: "shot",
        damage: OMNI_SHOT_DAMAGE,
        scale: OMNI_SHOT_SCALE,
      });
    }
  }

  // ミニ戦闘機は撃たずに、自機のまわりをぐるぐる回る。触れた敵の弾を消し、触れたザコにダメージを与える(ボスには効かない)
  private updateMinis(dtMs: number): void {
    const dt = dtMs / 1000;
    this.miniAngle += MINI_ORBIT_SPEED * dt;
    this.snapMinis();
    if (this.shotLevel < MINI_FIGHTER_LEVEL || !this.playerAlive || this.phase !== "playing") return;
    for (const m of this.activeMinis()) {
      this.enemyBullets = this.enemyBullets.filter((b) => {
        if (!circlesIntersect(b.x, b.y, b.r, m.x, m.y, MINI_HIT_RADIUS)) return true;
        this.burst(b.x, b.y, 3, 80);
        return false;
      });
      for (const e of this.enemies) {
        if (e.dyingMs !== null || !circleIntersectsRect(m.x, m.y, MINI_HIT_RADIUS, this.hitbox(e.x, e.y, e.w, e.h))) continue;
        e.hp -= MINI_CONTACT_DPS * dt;
        e.flashMs = HIT_FLASH_MS;
        if (e.hp <= 0) this.onEnemyDefeated(e);
      }
    }
  }

  private snapMinis(): void {
    const inner = this.minis.filter((m) => !m.outer);
    const outer = this.minis.filter((m) => m.outer);
    const place = (group: typeof this.minis, angle0: number, radius: number) =>
      group.forEach((m, i) => {
        const angle = angle0 + (Math.PI * 2 * i) / group.length;
        m.x = this.playerX + Math.cos(angle) * radius;
        m.y = this.playerY + 2 + Math.sin(angle) * radius;
      });
    place(inner, this.miniAngle, MINI_ORBIT_RADIUS);
    place(outer, (this.miniAngle * OUTER_MINI_ORBIT_SPEED) / MINI_ORBIT_SPEED, OUTER_MINI_ORBIT_RADIUS);
  }

  // 今の攻撃レベルで出ているミニ戦闘機
  private activeMinis(): typeof this.minis {
    if (this.shotLevel < MINI_FIGHTER_LEVEL) return [];
    return this.shotLevel >= OUTER_MINI_LEVEL ? this.minis : this.minis.filter((m) => !m.outer);
  }

  private firePlayerShots(): void {
    const y = this.playerY - 20;
    const straight = (x: number): Bullet => ({ x, y, vx: 0, vy: -SHOT_SPEED, r: SHOT_RADIUS, color: SHOT_NEON, look: "shot" });
    if (this.shotLevel === 1) {
      this.playerShots.push(straight(this.playerX));
      return;
    }
    this.playerShots.push(straight(this.playerX - 7), straight(this.playerX + 7));
    if (this.shotLevel >= 3) {
      // 真上から左右に少し開いた2発を足す
      for (const side of [-1, 1]) {
        const angle = -Math.PI / 2 + side * SHOT_SPREAD;
        this.playerShots.push({
          x: this.playerX + side * 12,
          y: y + 6,
          vx: Math.cos(angle) * SHOT_SPEED,
          vy: Math.sin(angle) * SHOT_SPEED,
          r: SHOT_RADIUS,
          color: SHOT_NEON,
          look: "shot",
        });
      }
    }
  }

  // ---- 内部: ステージ進行 ----

  private updateStage(dtMs: number): void {
    this.stepMs += dtMs;

    // 編隊の2体目以降など、少し遅れて出てくる予定の敵
    for (const pending of this.pendingSpawns) pending.delayMs -= dtMs;
    this.pendingSpawns.filter((p) => p.delayMs <= 0).forEach((p) => p.spawn());
    this.pendingSpawns = this.pendingSpawns.filter((p) => p.delayMs > 0);

    const config = this.stageConfig();
    switch (this.stageStep) {
      case "intro":
        if (this.stepMs >= STAGE_INTRO_MS && this.skipWaves) {
          // 開発用: ザコ戦を飛ばして、すぐに「WARNING」からボス戦へ
          this.skipWaves = false;
          this.setStageStep("clearing");
        } else if (this.stepMs >= STAGE_INTRO_MS) {
          this.spawnCooldownMs = 300;
          this.sound.playBgm(STAGE_BGM[this.stageIndex % STAGE_BGM.length]);
          this.setStageStep("waves");
        }
        break;
      case "waves": {
        this.spawnCooldownMs -= dtMs;
        if (this.spawnCooldownMs <= 0) {
          const [startMs, endMs] = config.spawnIntervalMs;
          this.spawnCooldownMs = spawnInterval(this.stepMs, config.bossAfterMs, startMs, endMs);
          this.spawnFormation(pickRandom(config.waveFormations));
        }
        if (this.stepMs >= config.bossAfterMs) this.setStageStep("clearing");
        break;
      }
      case "clearing":
        // 残っているザコがいなくなる(または一定時間経つ)までボスを待たせる
        if ((this.enemies.length === 0 && this.pendingSpawns.length === 0) || this.stepMs > 4000) {
          this.pendingSpawns = [];
          this.setStageStep("warning");
          this.sound.stopMusic();
          this.sound.playSfx("warning");
        }
        break;
      case "warning":
        if (this.stepMs >= BOSS_WARNING_MS) {
          this.spawnBosses();
          // ボス戦中のザコは、ボスが降りてきて少し経ってから出し始める
          this.spawnCooldownMs = BOSS_ENTER_MS + randomBetween(config.bossMinionIntervalMs);
          this.setStageStep("boss");
          this.sound.playBgm("boss");
        }
        break;
      case "boss":
        this.updateGuards(dtMs, config.bossGuards);
        // ボスと戦っている間も、倒すまでずっとザコが出てくる(ハートを落としやすいザコ)
        // 十字砲火の間は新しいザコを出さない(終わった後にまとめて突っ込んでこないように)
        if (this.bosses.some((b) => b.step === "entering" || b.step === "fighting") && !this.isCrossfiring()) {
          this.spawnCooldownMs -= dtMs;
          if (this.spawnCooldownMs <= 0) {
            this.spawnCooldownMs = randomBetween(config.bossMinionIntervalMs);
            this.spawnFormation(pickRandom(config.bossFormations));
          }
        }
        break;
      case "stage-clear":
        if (this.stepMs >= STAGE_CLEAR_MS && this.isFinalStage()) {
          this.bosses = [];
          this.setStageStep("bonus-intro");
          this.sound.playJingle("intro");
        } else if (this.stepMs >= STAGE_CLEAR_MS) {
          this.bosses = [];
          this.stageIndex += 1;
          this.timedStarsDropped = 0;
          this.setStageStep("intro");
          this.sound.playJingle("intro");
        }
        break;
      case "bonus-intro":
        if (this.stepMs >= STAGE_INTRO_MS) {
          this.spawnCooldownMs = 0;
          this.sound.playBgm(STAGE_BGM[0]);
          this.setStageStep("bonus");
        }
        break;
      case "bonus":
        this.spawnCooldownMs -= dtMs;
        if (this.spawnCooldownMs <= 0) {
          this.spawnCooldownMs = randomBetween(BONUS_ROW_INTERVAL_MS);
          this.spawnBonusRow();
        }
        if (this.stepMs >= BONUS_MS) this.setStageStep("bonus-end");
        break;
      case "bonus-end":
        if (this.enemies.length === 0 || this.stepMs > BONUS_END_WAIT_MS) {
          this.ending = { result: "clear", remainingMs: BOSS_DYING_MS };
          this.sound.stopMusic(0.2);
        }
        break;
    }
  }

  // ボーナスステージ: 一列に並んだ群れが、上・下・左・右のどれかから入ってきて、反対側へ横切っていく
  private spawnBonusRow(): void {
    const count = Math.round(randomBetween(BONUS_ROW_COUNT));
    const speed = randomBetween(BONUS_SPEED);
    const side = pickRandom(["top", "bottom", "left", "right"] as const);
    const vertical = side === "top" || side === "bottom";
    // 上下から来る群れは横一列、左右から来る群れは縦一列に並べる
    const span = vertical ? FIELD_W - 60 : this.fieldH * 0.8;
    const gap = span / count;
    for (let i = 0; i < count; i++) {
      const along = (vertical ? 30 : this.fieldH * 0.1) + gap * (i + 0.5) + (Math.random() - 0.5) * gap * 0.4;
      const depth = 50 + Math.random() * 30; // 画面の外の、入ってくる手前の位置
      const e = this.spawnEnemy("bonus", 0, 0);
      if (!e) continue;
      e.hp = BONUS_ENEMY_HP;
      // 揺れる前の通り道の位置を(baseX, orbitCy)に持ち、そこから進む向きと直角に揺らす
      e.baseX = vertical ? along : side === "left" ? -depth : FIELD_W + depth;
      e.orbitCy = !vertical ? along : side === "top" ? -depth : this.fieldH + depth;
      e.vx = side === "left" ? speed : side === "right" ? -speed : 0;
      e.vy = side === "top" ? speed : side === "bottom" ? -speed : 0;
      e.x = e.baseX;
      e.y = e.orbitCy;
    }
  }

  private setStageStep(step: StageStep): void {
    this.stageStep = step;
    this.stepMs = 0;
  }

  // 横から一列に並んで入ってきて、同じ高さで波打ちながら反対側へ横切っていく列
  private spawnCrossLine(fromLeft: boolean, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.pendingSpawns.push({
        delayMs: i * CROSS_GAP_MS,
        spawn: () => this.spawnEnemy("cross", fromLeft ? -40 : FIELD_W + 40, y, fromLeft ? 1 : -1),
      });
    }
  }

  private spawnFormation(name: FormationName | undefined): void {
    switch (name) {
      case "crossLine":
        // 片側から一列に並んで入ってきて、横切っていく(数はステージごと。STAGESのcrossLineCounts)
        this.spawnCrossLine(Math.random() < 0.5, 90 + Math.random() * 110, this.stageConfig().crossLineCounts[0]);
        break;
      case "crossPair": {
        // 左右から1列ずつ、高さをずらして同時に入ってきてすれちがう
        const fromLeftHigh = Math.random() < 0.5;
        const count = this.stageConfig().crossLineCounts[1];
        this.spawnCrossLine(fromLeftHigh, 95, count);
        this.spawnCrossLine(!fromLeftHigh, 185, count);
        break;
      }
      case "straight": {
        // 横に3体並んでまっすぐ降りてくる
        const cx = FIELD_W / 2 + (Math.random() - 0.5) * 120;
        for (const dx of [-90, 0, 90]) this.spawnEnemy("straight", clamp(cx + dx, 40, FIELD_W - 40), -50);
        break;
      }
      case "zigzag":
        // 左右で2体、くねくね揺れながら降りてくる
        this.spawnEnemy("zigzag", FIELD_W * 0.3, -50);
        this.spawnEnemy("zigzag", FIELD_W * 0.7, -50);
        break;
      case "swoop": {
        // 片側の上の方から4体つながって、弧を描いて横切る
        const fromLeft = Math.random() < 0.5;
        const startY = 70 + Math.random() * 60;
        for (let i = 0; i < 4; i++) {
          this.pendingSpawns.push({
            delayMs: i * 260,
            spawn: () => this.spawnEnemy("swoop", fromLeft ? -40 : FIELD_W + 40, startY, fromLeft ? 1 : -1),
          });
        }
        break;
      }
      case "laser":
        // 1体が降りてきて止まり、真下へ一直線のレーザーを撃ってくる
        this.spawnEnemy("laser", 50 + Math.random() * (FIELD_W - 100), -50);
        break;
      case "beamerBurst":
        // 左右に1体ずつ降りてきて止まり、ビームを3連射してくる
        this.spawnEnemy("beamer", FIELD_W * 0.28, -50, 1, 3);
        this.pendingSpawns.push({ delayMs: 400, spawn: () => this.spawnEnemy("beamer", FIELD_W * 0.72, -50, 1, 3) });
        break;
      case "beamerLine":
        // 横に3体並んで降りてきて止まり、ビームを1発ずつ撃ってくる
        [0.2, 0.5, 0.8].forEach((ratio, i) => {
          this.pendingSpawns.push({ delayMs: i * 250, spawn: () => this.spawnEnemy("beamer", FIELD_W * ratio, -50) });
        });
        break;
      case "beamerSide":
        // 左右の下の方から1体ずつ横に入ってきて止まり、ビームを1発ずつ撃ってくる
        this.spawnSideBeamer(true);
        this.pendingSpawns.push({ delayMs: 400, spawn: () => this.spawnSideBeamer(false) });
        break;
      case "dive":
        // 1体が途中で止まり、自機めがけて突っ込んでくる
        this.spawnEnemy("dive", 60 + Math.random() * (FIELD_W - 120), -50);
        break;
      case "diveSide":
        // 突っ込んでくるザコが1体、左右どちらかの上の方から横に入ってくる
        this.spawnSideDive(Math.random() < 0.5, false);
        break;
      case "diveLow":
        // 突っ込んでくるザコが1体、左右どちらかの下の方から横に入ってくる
        this.spawnSideDive(Math.random() < 0.5, true);
        break;
      case "diveMix": {
        // 突っ込んでくるザコが1体。上から降りてくるもの・左右の上の方から入ってくるもの・左右の下の方から入ってくるものが3分の1ずつ
        const r = Math.random();
        if (r < 1 / 3) {
          this.spawnEnemy("dive", 60 + Math.random() * (FIELD_W - 120), -50);
        } else {
          this.spawnSideDive(Math.random() < 0.5, r >= 2 / 3);
        }
        break;
      }
      case "tank":
        this.spawnTank();
        break;
      case "orbitRing":
        this.spawnOrbitRing();
        break;
    }
  }

  // 少し強いザコが、ランダムな位置に1体、ゆっくり降りてくる
  private spawnTank(): void {
    const e = this.spawnEnemy("tank", 60 + Math.random() * (FIELD_W - 120), -70);
    if (!e) return;
    e.w *= TANK_SCALE;
    e.h *= TANK_SCALE;
    e.hp = this.stageConfig().enemyHp * TANK_HP_SCALE;
  }

  // 6体が輪になって、回りながらゆっくり降りてくる
  private spawnOrbitRing(): void {
    const cx = FIELD_W / 2 + (Math.random() - 0.5) * 100;
    const dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < ORBIT_COUNT; i++) {
      const e = this.spawnEnemy("orbit", cx, -ORBIT_RADIUS - 40, dir);
      if (!e) continue;
      e.orbitAngle = (Math.PI * 2 * i) / ORBIT_COUNT;
      this.updateOrbitEnemy(e, 0);
    }
  }

  // 横から入ってきて、画面の端の近くで止まってから自機めがけて突っ込んでくるザコ。
  // low なら、下の方からビームを撃つザコと同じ高さ(自機に近い高さ)から入ってくる
  private spawnSideDive(fromLeft: boolean, low: boolean): void {
    const y = low ? this.fieldH * randomBetween(SIDE_BEAMER_Y) : 120 + Math.random() * 180;
    const e = this.spawnEnemy("dive", fromLeft ? -40 : FIELD_W + 40, y);
    if (!e) return;
    e.diveFromSide = true;
    e.baseX = fromLeft ? 60 + Math.random() * 100 : FIELD_W - 60 - Math.random() * 100;
    e.vx = fromLeft ? SIDE_DIVE_ENTER_SPEED : -SIDE_DIVE_ENTER_SPEED;
    e.vy = 0;
  }

  // 画面の下の方(自機に近い高さ)に横から入ってきて、画面の端の近くで止まってビームを撃つザコ
  private spawnSideBeamer(fromLeft: boolean): void {
    const y = this.fieldH * randomBetween(SIDE_BEAMER_Y);
    const e = this.spawnEnemy("beamer", fromLeft ? -40 : FIELD_W + 40, y);
    if (!e) return;
    e.diveFromSide = true;
    e.diveStopY = y;
    e.baseX = fromLeft ? 45 + Math.random() * 40 : FIELD_W - 45 - Math.random() * 40;
    e.vx = fromLeft ? SIDE_DIVE_ENTER_SPEED : -SIDE_DIVE_ENTER_SPEED;
    e.vy = 0;
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, direction = 1, beamShots = 1): Enemy | null {
    const sprites = this.readySprites().filter((s) => !this.bosses.some((b) => b.sprite === s));
    if (sprites.length === 0) return null;
    const sprite = pickRandom(sprites);
    const h = ENEMY_HEIGHT * clamp(sprite.sizeScale, ENEMY_SIZE_SCALE_MIN, ENEMY_SIZE_SCALE_MAX);
    const enemy: Enemy = {
      sprite,
      kind,
      x,
      y,
      w: spriteWidthFor(sprite, h),
      h,
      vx: 0,
      vy: 0,
      ay: 0,
      baseX: x,
      ageMs: 0,
      hp: kind === "dive" || kind === "beamer" || kind === "laser" ? this.stageConfig().enemyHp + 1 : this.stageConfig().enemyHp,
      fireCooldownMs: randomBetween(ENEMY_FIRST_FIRE_MS),
      flashMs: 0,
      dyingMs: null,
      diveStep: "enter",
      diveStopY: 110 + Math.random() * 80,
      diveFromSide: false,
      divePauseMs: 0,
      beamShots,
      beamLeft: 0,
      beamGapMs: 0,
      beamAngle: 0,
      laserStep: "wait",
      laserMs: 0,
      laserLen: 0,
      guardOf: null,
      orbitAngle: 0,
      orbitCy: y,
    };
    switch (kind) {
      case "straight":
        enemy.vy = 85;
        break;
      case "zigzag":
        enemy.vy = 60;
        break;
      case "swoop":
        enemy.vx = 150 * direction;
        enemy.vy = 10;
        enemy.ay = 55;
        break;
      case "dive":
        enemy.vy = 140;
        break;
      case "tank":
        enemy.vy = TANK_SPEED;
        break;

      case "orbit":
        // 輪の中心(baseX, orbitCy)が降りていき、そのまわりをdirectionの向きに回る
        enemy.vx = direction;
        enemy.vy = ORBIT_FALL_SPEED;
        break;
      case "beamer":
        enemy.vy = 90;
        enemy.diveStopY = 90 + Math.random() * 70;
        break;
      case "laser":
        enemy.vy = 110;
        enemy.diveStopY = 80 + Math.random() * 60;
        break;
      case "cross":
        enemy.vx = CROSS_SPEED * direction;
        enemy.diveStopY = y;
        break;
    }
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnBosses(): void {
    const config = this.stageConfig();
    this.guardCooldownMs = 0;
    if (config.bossType === "big" || config.bossType === "bigRush") {
      this.spawnBoss(config.bossType, FIELD_W / 2, BOSS_REST_Y, BOSS_HEIGHT, config.bossHp);
    } else {
      // 左右に1体ずつ。HPは別々で、2体合わせてbossHp
      this.spawnBoss("twin", FIELD_W * 0.28, TWIN_REST_Y, TWIN_BOSS_HEIGHT, config.bossHp / 2);
      this.spawnBoss("twin", FIELD_W * 0.72, TWIN_REST_Y, TWIN_BOSS_HEIGHT, config.bossHp / 2);
      this.crossfire = { step: "idle", ms: 0, cooldownMs: BOSS_ENTER_MS + CROSSFIRE_FIRST_MS, shotMs: 0 };
    }
  }

  private spawnBoss(kind: Boss["kind"], homeX: number, homeY: number, h: number, hp: number): void {
    const ready = this.readySprites();
    const unused = ready.filter((s) => !this.usedBossSprites.includes(s));
    const sprite = pickRandom(unused.length > 0 ? unused : ready);
    if (!sprite) return;
    this.usedBossSprites.push(sprite);
    this.bosses.push({
      kind,
      sprite,
      x: homeX,
      y: -h / 2,
      w: spriteWidthFor(sprite, h),
      h,
      hp,
      maxHp: hp,
      homeX,
      homeY,
      rushStep: "hover",
      rushMs: 0,
      rushVx: 0,
      rushVy: 0,
      wanderX: homeX,
      wanderY: homeY,
      wanderMs: 0,
      wanderEase: 2,
      step: "entering",
      stepMs: 0,
      patternIndex: 0,
      patternMs: 0,
      fireMs: 0,
      spinAngle: 0,
      flashMs: 0,
      nextBlastMs: 0,
      barrierHp: 0,
      barrierMaxHp: 0,
      barrierMs: 0,
      barrierCooldownMs: BOSS_ENTER_MS + BARRIER_FIRST_MS,
      barrierFlashMs: 0,
    });
  }

  // ---- 内部: 敵の動き ----

  private updateEnemies(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const e of this.enemies) {
      e.flashMs = Math.max(0, e.flashMs - dtMs);
      if (e.dyingMs !== null) {
        e.dyingMs += dtMs;
        continue;
      }
      e.ageMs += dtMs;

      switch (e.kind) {
        case "cross":
          // 列の全員が同じ動きをするよう、揺れは出てきてからの時間で決める
          e.x += e.vx * dt;
          e.y = e.diveStopY + Math.sin((e.ageMs / 1000) * 3) * 14;
          break;
        case "zigzag":
          e.x = e.baseX + Math.sin(e.ageMs / 1000 * 2.4) * 55;
          e.y += e.vy * dt;
          break;
        case "dive":
          this.updateDiveEnemy(e, dtMs);
          break;
        case "orbit":
          this.updateOrbitEnemy(e, dt);
          break;

        case "beamer":
          this.updateBeamer(e, dtMs);
          continue; // 撃ち方がほかのザコとちがうので、下のふつうの弾は撃たない
        case "laser":
          this.updateLaser(e, dtMs);
          continue;
        case "guard":
          this.updateGuard(e, dt);
          continue; // ガードは弾を撃たず、ボスを守るだけ
        case "bonus": {
          // ボーナスステージのザコは、ゆらゆら揺れながら横切っていくだけで弾を撃たない
          e.baseX += e.vx * dt;
          e.orbitCy += e.vy * dt;
          const sway = Math.sin((e.ageMs / 1000) * 1.8) * 16;
          const speed = Math.hypot(e.vx, e.vy) || 1;
          e.x = e.baseX + (-e.vy / speed) * sway;
          e.y = e.orbitCy + (e.vx / speed) * sway;
          continue;
        }
        default:
          e.vy += e.ay * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
      }

      e.fireCooldownMs -= dtMs;
      if (e.fireCooldownMs <= 0) {
        e.fireCooldownMs = randomBetween(this.stageConfig().enemyFireIntervalMs);
        const onScreen = e.y > 20 && e.y < this.fieldH * ENEMY_FIRE_MAX_Y_RATIO && e.x > 0 && e.x < FIELD_W;
        if (onScreen && this.playerAlive && e.diveStep !== "dive" && !this.isCrossfiring()) {
          this.fireEnemyBullet(e.x, e.y + e.h * 0.2, aimAngle(e.x, e.y, this.playerX, this.playerY), this.stageConfig().enemyBulletSpeed, BEAM_RED, 6);
        }
      }
    }
    // 倒し終えた敵・画面の外へ出ていった敵を片付ける
    this.enemies = this.enemies.filter((e) => {
      if (e.dyingMs !== null) return e.dyingMs < ENEMY_DYING_MS;
      if (e.kind === "guard") return true; // ボスについて画面の端近くまで行くことがあるが、倒されるまで残す
      if (e.kind === "bonus") return e.y < this.fieldH + 200 && e.y > -200 && e.x > -140 && e.x < FIELD_W + 140; // 下から入ってくるものもいる
      return e.y < this.fieldH + e.h && e.y > -200 && e.x > -140 && e.x < FIELD_W + 140;
    });
  }

  private updateBeamer(e: Enemy, dtMs: number): void {
    const dt = dtMs / 1000;
    const leaving = e.ageMs > BEAMER_STAY_MS && e.beamLeft === 0;
    if (e.diveFromSide) {
      // 横から入ってきたものは、入ってきた側へ帰っていく
      const fromLeft = e.baseX < FIELD_W / 2;
      if (leaving) {
        e.x += (fromLeft ? -110 : 110) * dt;
        return;
      }
      if (e.vx !== 0) {
        e.x += e.vx * dt;
        if (fromLeft ? e.x >= e.baseX : e.x <= e.baseX) {
          e.x = e.baseX;
          e.vx = 0;
        }
        return;
      }
      e.y = e.diveStopY + Math.sin((e.ageMs - 1000) / 700) * 14; // 止まっている間は上下にゆっくり揺れる
    } else {
      if (leaving) {
        e.y -= 110 * dt;
        return;
      }
      if (e.y < e.diveStopY) {
        e.y = Math.min(e.diveStopY, e.y + e.vy * dt);
        return;
      }
      e.x = e.baseX + Math.sin((e.ageMs - 1000) / 700) * 18; // 止まっている間は左右にゆっくり揺れる
    }

    if (e.beamLeft > 0) {
      e.beamGapMs -= dtMs;
      if (e.beamGapMs <= 0) {
        e.beamLeft -= 1;
        e.beamGapMs = BEAMER_SHOT_GAP_MS;
        this.fireEnemyBullet(e.x, e.y + e.h * 0.3, e.beamAngle, this.stageConfig().enemyBulletSpeed * 1.6, BEAM_RED, 5);
      }
      return;
    }
    e.fireCooldownMs -= dtMs;
    if (e.fireCooldownMs <= 0) {
      e.fireCooldownMs = BEAMER_CHARGE_MS + randomBetween(this.stageConfig().enemyFireIntervalMs);
      if (this.playerAlive && e.ageMs < BEAMER_STAY_MS && !this.isCrossfiring()) {
        e.beamLeft = e.beamShots;
        e.beamGapMs = 0;
        e.beamAngle = aimAngle(e.x, e.y, this.playerX, this.playerY);
      }
    }
  }

  private updateLaser(e: Enemy, dtMs: number): void {
    const dt = dtMs / 1000;
    if (e.y < e.diveStopY && e.laserStep === "wait" && e.laserMs === 0) {
      e.y = Math.min(e.diveStopY, e.y + e.vy * dt);
      return;
    }
    e.laserMs += dtMs;
    switch (e.laserStep) {
      case "wait":
        if (e.laserMs >= LASER_WAIT_MS && this.playerAlive && !this.isCrossfiring()) {
          e.laserStep = "charge";
          e.laserMs = 0;
          this.sound.playSfx("laserCharge");
        }
        break;
      case "charge":
        if (e.laserMs >= LASER_CHARGE_MS) {
          e.laserStep = "fire";
          e.laserMs = 0;
          e.laserLen = 0;
          this.sound.playSfx("laser");
        }
        break;
      case "fire":
        e.laserLen = Math.min(this.fieldH, e.laserLen + LASER_EXTEND_SPEED * dt);
        if (e.laserMs >= LASER_FIRE_MS) {
          e.laserStep = "done";
          e.laserMs = 0;
          e.laserLen = 0;
        }
        break;
      case "done":
        e.y -= LASER_LEAVE_SPEED * dt;
        break;
    }
  }

  // 輪の中心が降りていき、そのまわりを回る
  private updateOrbitEnemy(e: Enemy, dt: number): void {
    e.orbitCy += e.vy * dt;
    e.orbitAngle += ORBIT_SPEED * e.vx * dt;
    e.x = e.baseX + Math.cos(e.orbitAngle) * ORBIT_RADIUS;
    e.y = e.orbitCy + Math.sin(e.orbitAngle) * ORBIT_RADIUS;
  }

  // ボスのまわりを回り続ける(ボスが体当たりしている間もついていく)。自機の弾はボスより先にガードに当たる
  private updateGuard(e: Enemy, dt: number): void {
    const boss = e.guardOf;
    if (!boss) return;
    e.orbitAngle += GUARD_ORBIT_SPEED * dt;
    e.x = boss.x + Math.cos(e.orbitAngle) * (boss.w * 0.5 + GUARD_ORBIT_GAP);
    e.y = boss.y + Math.sin(e.orbitAngle) * (boss.h * 0.5 + GUARD_ORBIT_GAP * 0.6);
  }

  // ガードを出す: ボスが戦い始めたらすぐ、全部倒されたら少しして、ボスのまわりに等間隔に並べる
  private updateGuards(dtMs: number, count: number): void {
    const boss = this.bosses.find((b) => b.step === "fighting");
    if (!boss || count <= 0) return;
    if (this.enemies.some((e) => e.kind === "guard" && e.dyingMs === null)) return;
    this.guardCooldownMs -= dtMs;
    if (this.guardCooldownMs > 0) return;
    this.guardCooldownMs = GUARD_RESPAWN_MS;
    for (let i = 0; i < count; i++) {
      const e = this.spawnEnemy("guard", boss.x, boss.y);
      if (!e) continue;
      // ボスより小さめにして、ボスの顔が隠れすぎないようにする
      e.h *= GUARD_SCALE;
      e.w *= GUARD_SCALE;
      e.hp = this.stageConfig().enemyHp + 2;
      e.guardOf = boss;
      e.orbitAngle = (Math.PI * 2 * i) / count;
      this.updateGuard(e, 0);
    }
    this.burst(boss.x, boss.y, 20, 220);
  }

  // レーザーの当たり判定: 口元から、今伸びているところまでの細長い四角
  private laserRect(e: Enemy): Rect {
    const top = e.y + e.h * 0.3;
    return { cx: e.x, cy: top + e.laserLen / 2, w: LASER_HIT_W, h: e.laserLen };
  }

  private updateDiveEnemy(e: Enemy, dtMs: number): void {
    const dt = dtMs / 1000;
    switch (e.diveStep) {
      case "enter": {
        let arrived: boolean;
        if (e.diveFromSide) {
          e.x += e.vx * dt;
          arrived = e.vx > 0 ? e.x >= e.baseX : e.x <= e.baseX;
          if (arrived) e.x = e.baseX;
        } else {
          e.y += e.vy * dt;
          arrived = e.y >= e.diveStopY;
        }
        if (arrived) {
          e.diveStep = "pause";
          e.divePauseMs = 0;
        }
        break;
      }
      case "pause":
        // 少し震えて「来るぞ」と知らせてから、その時の自機の位置めがけて突っ込む
        e.divePauseMs += dtMs;
        e.x = e.baseX + Math.sin(e.divePauseMs / 25) * 2;
        // 十字砲火の間は、震えたまま待って突っ込まない
        if (e.divePauseMs >= 650 && !this.isCrossfiring()) {
          const angle = aimAngle(e.x, e.y, this.playerX, this.playerY);
          e.vx = Math.cos(angle) * 270;
          e.vy = Math.sin(angle) * 270;
          e.diveStep = "dive";
        }
        break;
      case "dive":
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        break;
    }
  }

  private updateBosses(dtMs: number): void {
    if (this.bosses.some((b) => b.kind === "twin")) this.updateCrossfire(dtMs);
    for (const boss of this.bosses) this.updateBoss(boss, dtMs);
  }

  // ボスのバリア(STAGESのbossBarrier): 時間が来たら張り、壊されたらまた時間を数え始める
  private updateBarrier(boss: Boss, dtMs: number): void {
    const barrier = this.stageConfig().bossBarrier;
    if (!barrier) return;
    boss.barrierFlashMs = Math.max(0, boss.barrierFlashMs - dtMs);
    if (boss.barrierHp > 0) {
      boss.barrierMs += dtMs;
      return;
    }
    boss.barrierCooldownMs -= dtMs;
    if (boss.barrierCooldownMs <= 0) {
      boss.barrierHp = barrier.hp;
      boss.barrierMaxHp = barrier.hp;
      boss.barrierMs = 0;
      this.sound.playSfx("laserCharge");
    }
  }

  private barrierRadius(boss: Boss): number {
    return Math.max(boss.w, boss.h) * BARRIER_RADIUS_SCALE;
  }

  private hitBarrier(boss: Boss, damage: number): void {
    boss.barrierHp -= damage;
    boss.barrierFlashMs = HIT_FLASH_MS;
    if (boss.barrierHp > 0) {
      this.sound.playSfx("hit");
      return;
    }
    // 壊れた: バリアのふちから破片が飛び散る
    boss.barrierHp = 0;
    boss.barrierCooldownMs = this.stageConfig().bossBarrier?.intervalMs ?? 0;
    const r = this.barrierRadius(boss);
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      this.burst(boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r, 3, 160);
    }
    this.sound.playSfx("blast");
    this.addText(boss.x, boss.y - boss.h / 2, "BREAK!");
  }

  // twinの2体の十字砲火。2体とも戦っている間だけ撃つ(1体が倒れたらその場でやめる)
  private updateCrossfire(dtMs: number): void {
    const pair = this.bosses.filter((b) => b.kind === "twin" && b.step === "fighting");
    const c = this.crossfire;
    if (pair.length < 2) {
      c.step = "idle";
      return;
    }
    c.ms += dtMs;
    switch (c.step) {
      case "idle":
        c.cooldownMs -= dtMs;
        if (c.cooldownMs <= 0 && this.playerAlive) {
          c.step = "charge";
          c.ms = 0;
          this.sound.playSfx("laserCharge");
        }
        break;
      case "charge":
        if (c.ms >= CROSSFIRE_CHARGE_MS) {
          c.step = "fire";
          c.ms = 0;
          c.shotMs = 0;
        }
        break;
      case "fire": {
        c.shotMs -= dtMs;
        if (c.shotMs <= 0 && this.playerAlive) {
          c.shotMs = CROSSFIRE_SHOT_MS;
          const config = this.stageConfig();
          const sweep = Math.sin((c.ms / CROSSFIRE_FIRE_MS) * Math.PI * 2) * CROSSFIRE_SWEEP;
          for (const b of pair) {
            const left = b.homeX < FIELD_W / 2;
            // 画面の真ん中の下の方を向いた向きを中心に振る。右の1体は左の1体と左右対称の向き
            const muzzleY = b.y + b.h * 0.2;
            const base = aimAngle(b.x, muzzleY, FIELD_W / 2, this.fieldH * 0.8);
            const angle = base + (left ? sweep : -sweep);
            for (const a of fanAngles(angle, 2, CROSSFIRE_SPREAD)) {
              this.fireEnemyBullet(b.x, muzzleY, a, 190 * config.bossBulletSpeedScale, BEAM_CYAN, 6);
            }
          }
        }
        if (c.ms >= CROSSFIRE_FIRE_MS) {
          c.step = "idle";
          c.ms = 0;
          c.cooldownMs = randomBetween(CROSSFIRE_INTERVAL_MS);
          for (const b of pair) this.pickTwinWanderSpot(b);
        }
        break;
      }
    }
  }

  private updateBoss(boss: Boss, dtMs: number): void {
    boss.stepMs += dtMs;
    boss.flashMs = Math.max(0, boss.flashMs - dtMs);
    const t = boss.stepMs / 1000;

    switch (boss.step) {
      case "entering": {
        // 上からゆっくり降りてきて、止まる直前に減速する
        const p = Math.min(1, boss.stepMs / BOSS_ENTER_MS);
        const eased = 1 - (1 - p) ** 3;
        boss.y = -boss.h / 2 + (boss.homeY + boss.h / 2) * eased;
        if (p >= 1) {
          boss.step = "fighting";
          boss.stepMs = 0;
          boss.patternMs = 0;
          boss.fireMs = 400;
        }
        break;
      }
      case "fighting":
        this.updateBarrier(boss, dtMs);
        if (boss.kind === "twin") {
          this.updateTwinBoss(boss, dtMs);
        } else if (boss.kind === "bigRush") {
          this.updateRushBoss(boss, dtMs);
        } else {
          boss.x = boss.homeX + Math.sin(t * 0.7) * 95;
          boss.y = boss.homeY + Math.sin(t * 1.3) * 22;
          this.updateBossAttack(boss, dtMs);
        }
        break;
      case "dying":
        // 震えながら、ときどき爆発する
        boss.x += (Math.random() - 0.5) * 6;
        boss.y += 12 * (dtMs / 1000);
        boss.nextBlastMs -= dtMs;
        // 消えきった後(次のステージへ進むまでの間)は爆発させない
        if (boss.nextBlastMs <= 0 && boss.stepMs < BOSS_DYING_MS) {
          boss.nextBlastMs = 140;
          this.burst(boss.x + (Math.random() - 0.5) * boss.w * 0.7, boss.y + (Math.random() - 0.5) * boss.h * 0.7, 14, 180);
        }
        break;
    }
  }

  // twin: 中くらいの2体。HPは別々。それぞれ自分の側(左半分・右半分)の中で不規則に動き回りながら、ときどき3方向の弾を撃つ(弾は少なめ)。
  // ときどき2体で十字砲火をする(updateCrossfire)。その間はふだんの弾は撃たず、左右対称の位置で止まって撃つ。
  // 1体が倒れると、残った1体は怒って画面の上の方全体を速く動き回り、5方向の弾をたくさん撃つ。
  // 突っ込んでこないかわりに、ボス戦中は突っ込んでくるザコが次々に出てくる(STAGESのbossFormations)
  private updateTwinBoss(boss: Boss, dtMs: number): void {
    const dt = dtMs / 1000;
    const config = this.stageConfig();
    if (this.crossfire.step !== "idle") {
      // 光をためている間に左右対称の位置へ動き、撃っている間はそこで止まる
      const left = boss.homeX < FIELD_W / 2;
      const toX = left ? FIELD_W * CROSSFIRE_SPOT[0] : FIELD_W * (1 - CROSSFIRE_SPOT[0]);
      const ease = Math.min(1, 6 * dt);
      boss.x += (toX - boss.x) * ease;
      boss.y += (CROSSFIRE_SPOT[1] - boss.y) * ease;
      return;
    }
    const alone = this.isTwinAlone(boss);
    boss.wanderMs -= dtMs;
    if (boss.wanderMs <= 0) this.pickTwinWanderSpot(boss);
    const ease = Math.min(1, boss.wanderEase * (alone ? 1.6 : 1) * dt);
    boss.x += (boss.wanderX - boss.x) * ease;
    boss.y += (boss.wanderY - boss.y) * ease;
    boss.fireMs -= dtMs;
    if (boss.fireMs <= 0 && this.playerAlive) {
      boss.fireMs = TWIN_FIRE_MS * config.bossFireIntervalScale * (alone ? TWIN_ALONE_FIRE_SCALE : 1);
      const muzzleY = boss.y + boss.h * 0.2;
      const center = aimAngle(boss.x, muzzleY, this.playerX, this.playerY);
      for (const angle of fanAngles(center, alone ? 5 : 3, alone ? 0.26 : 0.3)) {
        this.fireEnemyBullet(boss.x, muzzleY, angle, (alone ? 200 : 170) * config.bossBulletSpeedScale, BEAM_RED, 6);
      }
    }
  }

  // twinの2体が十字砲火をしている(光をためている・撃っている)か。この間、ザコは攻撃してこない
  private isCrossfiring(): boolean {
    return this.crossfire.step !== "idle" && this.bosses.filter((b) => b.kind === "twin" && b.step === "fighting").length >= 2;
  }

  // twinの相方が倒れて、1体だけ残っているか
  private isTwinAlone(boss: Boss): boolean {
    return boss.kind === "twin" && this.bosses.some((b) => b !== boss && b.kind === "twin" && b.step === "dying");
  }

  // ボスが怒っているか: twinは相方が倒れた時、ほかはHPが半分を切った時
  private isBossEnraged(boss: Boss): boolean {
    return boss.kind === "twin" ? this.isTwinAlone(boss) : boss.hp <= boss.maxHp * BOSS_ENRAGE_RATIO;
  }

  // bigRush: 体当たりしてくる大きなボス。浮かんでいる間は大きなボスと同じ弾のパターンを撃ち、
  // 時間が来ると震えてためてから自機めがけて突っ込み、元の位置へ戻る
  private updateRushBoss(boss: Boss, dtMs: number): void {
    const dt = dtMs / 1000;
    const enraged = boss.hp <= boss.maxHp * BOSS_ENRAGE_RATIO;
    boss.rushMs += dtMs;
    switch (boss.rushStep) {
      case "hover": {
        const t = boss.stepMs / 1000;
        if (boss.rushMs >= (enraged ? BIG_RUSH_HOVER_MS * 0.6 : BIG_RUSH_HOVER_MS) && this.playerAlive) {
          boss.rushStep = "windup";
          boss.rushMs = 0;
          break;
        }
        boss.x = boss.homeX + Math.sin(t * 0.7) * 95;
        boss.y = boss.homeY + Math.sin(t * 1.3) * 22;
        this.updateBossAttack(boss, dtMs);
        break;
      }
      case "windup":
        // その場で震えて、突っ込んでくるのを知らせる
        boss.x += (Math.random() - 0.5) * 5;
        if (boss.rushMs >= RUSH_WINDUP_MS) {
          // 迫り始める向きは、ため終わった時の自機の位置で決める(速さは迫っている間に決める)
          const angle = aimAngle(boss.x, boss.y, this.playerX, this.playerY);
          boss.rushVx = Math.cos(angle);
          boss.rushVy = Math.sin(angle);
          boss.rushStep = "rush";
          boss.rushMs = 0;
        }
        break;
      case "rush": {
        // ゆっくり迫ってくる: 自機の方へ少しずつ向きを変えながら進み、だんだん速くなる。
        // 曲がれる速さに上限があるので、横へ大きく動けばかわせる
        const speed = (enraged ? BIG_RUSH_SPEED * 1.3 : BIG_RUSH_SPEED) * Math.min(1, 0.5 + boss.rushMs / 1600);
        const heading = Math.atan2(boss.rushVy, boss.rushVx);
        let turn = aimAngle(boss.x, boss.y, this.playerX, this.playerY) - heading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // -π〜πにそろえる
        const next = heading + clamp(turn, -RUSH_TURN_RATE * dt, RUSH_TURN_RATE * dt);
        boss.rushVx = Math.cos(next) * speed;
        boss.rushVy = Math.sin(next) * speed;
        boss.x += boss.rushVx * dt;
        boss.y += boss.rushVy * dt;
        // 画面の端まで行くか、一定時間たったら戻る
        const hitEdge = boss.y > this.fieldH - boss.h * 0.4 || boss.x < boss.w * 0.3 || boss.x > FIELD_W - boss.w * 0.3;
        if (hitEdge || boss.rushMs >= RUSH_MAX_MS) {
          boss.rushStep = "return";
          boss.rushMs = 0;
        }
        break;
      }
      case "return": {
        const dx = boss.homeX - boss.x;
        const dy = boss.homeY - boss.y;
        const dist = Math.hypot(dx, dy);
        const step = RUSH_RETURN_SPEED * dt;
        if (dist <= step) {
          boss.x = boss.homeX;
          boss.y = boss.homeY;
          boss.rushStep = "hover";
          boss.rushMs = 0;
          boss.stepMs = 0; // 浮かぶ揺れを基準の位置から始め直す
        } else {
          boss.x += (dx / dist) * step;
          boss.y += (dy / dist) * step;
        }
        break;
      }
    }
  }

  // twinが次に向かう場所: 自分の側(左の1体は左半分、右の1体は右半分)の上の方のどこか。
  // 1体だけ残ったら、画面の上の方全体から選び、選び直す間隔も短くする
  private pickTwinWanderSpot(boss: Boss): void {
    const left = boss.homeX < FIELD_W / 2;
    const alone = this.isTwinAlone(boss);
    const minX = alone || left ? boss.w * 0.6 : FIELD_W / 2 + boss.w * 0.3;
    const maxX = !alone && left ? FIELD_W / 2 - boss.w * 0.3 : FIELD_W - boss.w * 0.6;
    boss.wanderX = minX + Math.random() * Math.max(0, maxX - minX);
    boss.wanderY = randomBetween(TWIN_WANDER_Y);
    boss.wanderMs = randomBetween(TWIN_WANDER_MS) * (alone ? 0.6 : 1);
    boss.wanderEase = randomBetween([1.2, 3.5]);
  }

  private updateBossAttack(boss: Boss, dtMs: number): void {
    boss.patternMs += dtMs;
    if (boss.patternMs >= BOSS_PATTERN_MS + BOSS_PATTERN_REST_MS) {
      boss.patternMs = 0;
      boss.patternIndex = (boss.patternIndex + 1) % BOSS_PATTERNS.length;
      boss.fireMs = 0;
    }
    if (boss.patternMs >= BOSS_PATTERN_MS || !this.playerAlive) return; // 切り替わりの休み

    boss.fireMs -= dtMs;
    if (boss.fireMs > 0) return;

    const config = this.stageConfig();
    const enraged = boss.hp <= boss.maxHp * BOSS_ENRAGE_RATIO;
    const muzzleY = boss.y + boss.h * 0.15;
    // 先のステージほど弾が速く、撃つ間隔が短くなる
    const speed = (base: number) => base * config.bossBulletSpeedScale;
    const interval = (base: number) => base * config.bossFireIntervalScale;
    switch (BOSS_PATTERNS[boss.patternIndex]) {
      case "aimed": {
        // 自機めがけて扇状に
        boss.fireMs = interval(enraged ? 260 : 330);
        const center = aimAngle(boss.x, muzzleY, this.playerX, this.playerY);
        for (const angle of fanAngles(center, enraged ? 5 : 3, 0.24)) {
          this.fireEnemyBullet(boss.x, muzzleY, angle, speed(200), BEAM_RED, 6);
        }
        break;
      }
      case "ring": {
        // 全方向にまんべんなく。毎回少しずつ向きをずらして隙間の位置を変える
        boss.fireMs = interval(enraged ? 520 : 680);
        const count = enraged ? 20 : 14;
        boss.spinAngle += 0.21;
        for (let i = 0; i < count; i++) {
          this.fireEnemyBullet(boss.x, muzzleY, boss.spinAngle + (Math.PI * 2 * i) / count, speed(125), BEAM_CYAN, 7);
        }
        break;
      }
      case "spiral": {
        // うずまき。腕の数だけ等間隔に撃ちながら回していく
        boss.fireMs = interval(enraged ? 80 : 105);
        const arms = enraged ? 3 : 2;
        boss.spinAngle += 0.27;
        for (let i = 0; i < arms; i++) {
          this.fireEnemyBullet(boss.x, muzzleY, boss.spinAngle + (Math.PI * 2 * i) / arms, speed(140), BEAM_GREEN, 6);
        }
        break;
      }
    }
  }

  private fireEnemyBullet(x: number, y: number, angle: number, speed: number, color: string, r: number, look: Bullet["look"] = "beam"): void {
    this.enemyBullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, color, look });
  }

  // ---- 内部: 弾・アイテム・演出の動き ----

  private moveBullets(bullets: Bullet[], dt: number): Bullet[] {
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    const m = 20;
    // 左右は外側の消えていく幅まで飛ばしてから片付ける(端でいきなり消えて見えないように)
    return bullets.filter((b) => b.x > -EDGE_FADE_W && b.x < FIELD_W + EDGE_FADE_W && b.y > -m && b.y < this.fieldH + m);
  }

  private updateItems(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const item of this.items) {
      item.ageMs += dtMs;
      // 出た直後は少し跳ね上がってから落ちる(倒した位置で目に留まるように)
      item.y += (item.ageMs < 300 ? -60 : ITEM_FALL_SPEED) * dt;
    }
    this.items = this.items.filter((item) => item.y < this.fieldH + ITEM_RADIUS);
  }

  private updateEffects(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.particles) {
      p.lifeMs -= dtMs;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.particles = this.particles.filter((p) => p.lifeMs > 0);
    for (const b of this.blasts) b.ms += dtMs;
    this.blasts = this.blasts.filter((b) => b.ms < BLAST_MS);
    for (const t of this.texts) {
      t.lifeMs -= dtMs;
      t.y -= 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.lifeMs > 0);
  }

  private burst(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 350 + Math.random() * 350;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        r: 2 + Math.random() * 3.5,
        color: pickRandom(EXPLOSION_COLORS),
        lifeMs: life,
        maxLifeMs: life,
      });
    }
  }

  private addText(x: number, y: number, text: string): void {
    this.texts.push({ x, y, text, lifeMs: 800 });
  }

  // ---- 内部: 当たり判定 ----

  private hitbox(x: number, y: number, w: number, h: number): Rect {
    return { cx: x, cy: y, w: w * HITBOX_SCALE_X, h: h * HITBOX_SCALE_Y };
  }

  private handleCollisions(): void {
    this.handleShotHits();
    this.handleItemPickups();
    if (!this.playerAlive || this.invincibleMs > 0 || this.ending) return;

    const hitByBullet = this.enemyBullets.some((b) => circlesIntersect(b.x, b.y, b.r * 0.8, this.playerX, this.playerY, PLAYER_HIT_RADIUS));
    const hitByLaser = this.enemies.some(
      (e) => e.kind === "laser" && e.dyingMs === null && e.laserStep === "fire" && circleIntersectsRect(this.playerX, this.playerY, PLAYER_HIT_RADIUS, this.laserRect(e)),
    );
    const hitByBody =
      this.enemies.some((e) => e.dyingMs === null && e.kind !== "bonus" && circleIntersectsRect(this.playerX, this.playerY, PLAYER_HIT_RADIUS, this.hitbox(e.x, e.y, e.w, e.h))) ||
      this.bosses.some((b) => b.step === "fighting" && circleIntersectsRect(this.playerX, this.playerY, PLAYER_HIT_RADIUS, this.hitbox(b.x, b.y, b.w, b.h)));
    if (hitByBullet || hitByLaser || hitByBody) this.onPlayerHit();
  }

  private handleShotHits(): void {
    this.playerShots = this.playerShots.filter((shot) => {
      for (const e of this.enemies) {
        if (e.dyingMs !== null || e.y < -e.h / 2) continue; // 画面に入りきる前は当たらない
        if (!circleIntersectsRect(shot.x, shot.y, shot.r, this.hitbox(e.x, e.y, e.w, e.h))) continue;
        e.hp -= shot.damage ?? 1;
        e.flashMs = HIT_FLASH_MS;
        // 倒した時は撃破音だけを鳴らす(命中音と重なって聞こえにくくならないように)
        if (e.hp <= 0) this.onEnemyDefeated(e);
        else this.sound.playSfx("hit");
        if (shot.blast) this.explodeShot(shot.x, shot.y, shot.blast, e);
        return false;
      }
      // バリアを張っているボスは、バリアに当たった弾をすべて受け止める(ボスには効かない)
      const shielded = this.bosses.find((b) => b.step === "fighting" && b.barrierHp > 0 && circlesIntersect(shot.x, shot.y, shot.r, b.x, b.y, this.barrierRadius(b)));
      if (shielded) {
        this.hitBarrier(shielded, shot.damage ?? 1);
        if (shot.blast) this.explodeShot(shot.x, shot.y, shot.blast, null);
        return false;
      }
      const boss = this.bosses.find((b) => b.step === "fighting" && circleIntersectsRect(shot.x, shot.y, shot.r, this.hitbox(b.x, b.y, b.w, b.h)));
      if (boss) {
        const damage = shot.damage ?? 1;
        boss.hp -= damage;
        boss.flashMs = HIT_FLASH_MS;
        this.sound.playSfx("hit");
        this.score += 10 * damage;
        if (boss.hp <= 0) this.onBossDefeated(boss);
        if (shot.blast) this.explodeShot(shot.x, shot.y, shot.blast, null);
        return false;
      }
      return true;
    });
  }

  // レベル6以上の強い弾の爆発: まわりのザコ(直接当たった1体は除く)にダメージを与える。
  // ボスには直接当たった分だけ
  private explodeShot(x: number, y: number, blast: { radius: number; damage: number }, directHit: Enemy | null): void {
    this.blasts.push({ x, y, radius: blast.radius, ms: 0 });
    this.burst(x, y, 16, 240);
    this.sound.playSfx("blast");
    for (const e of this.enemies) {
      if (e === directHit || e.dyingMs !== null || e.y < -e.h / 2) continue;
      if (!circleIntersectsRect(x, y, blast.radius, this.hitbox(e.x, e.y, e.w, e.h))) continue;
      e.hp -= blast.damage;
      e.flashMs = HIT_FLASH_MS;
      if (e.hp <= 0) this.onEnemyDefeated(e);
    }
  }

  private handleItemPickups(): void {
    if (!this.playerAlive) return;
    this.items = this.items.filter((item) => {
      if (!circlesIntersect(item.x, item.y, ITEM_RADIUS, this.playerX, this.playerY, PLAYER_ITEM_RADIUS)) return true;
      if (item.kind === "life") {
        if (this.lives < PLAYER_START_LIVES) {
          this.lives += 1;
          this.sound.playSfx("life");
          this.addText(item.x, item.y - 16, "ライフ +1");
        } else {
          this.score += LIFE_ITEM_FULL_SCORE;
          this.sound.playSfx("life");
          this.addText(item.x, item.y - 16, `+${LIFE_ITEM_FULL_SCORE}`);
        }
      } else if (this.shotLevel < MAX_SHOT_LEVEL) {
        this.shotLevel += 1;
        this.sound.playSfx("powerUp");
        this.addText(item.x, item.y - 16, "パワーアップ！");
      } else {
        this.score += 500;
        this.sound.playSfx("powerUp");
        this.addText(item.x, item.y - 16, "+500");
      }
      return false;
    });
  }

  private onEnemyDefeated(e: Enemy): void {
    e.dyingMs = 0;
    this.sound.playSfx("defeat");
    const score = e.kind === "tank" ? TANK_SCORE : e.kind === "bonus" ? BONUS_ENEMY_SCORE : ENEMY_SCORE;
    this.score += score;
    this.burst(e.x, e.y, e.kind === "tank" ? 24 : 12, 160);
    this.addText(e.x, e.y - e.h / 2, `+${score}`);
    if (e.kind === "bonus") return; // ボーナスステージのザコはアイテムを落とさない
    // 決まったタイミングの星が出る番なら必ず星を落とす。そうでなければライフを先に抽選し、
    // 出なかった時だけパワーアップを抽選する(1体から2つは落とさない)。確率はどちらも[ザコ戦, ボス戦中]の組で持っている
    const config = this.stageConfig();
    const phase = this.stageStep === "boss" ? 1 : 0;
    if (this.timedStarsDropped < this.timedStarsDue()) {
      this.timedStarsDropped += 1;
      this.items.push({ kind: "power", x: e.x, y: e.y, ageMs: 0 });
    } else if (Math.random() < config.lifeDropChance[phase]) {
      this.items.push({ kind: "life", x: e.x, y: e.y, ageMs: 0 });
    } else if (Math.random() < config.powerDropChance[phase]) {
      this.items.push({ kind: "power", x: e.x, y: e.y, ageMs: 0 });
    }
  }

  // 決まったタイミングの星(STAGESのpowerDropTimings)が、今までにいくつ出る番になったか
  private timedStarsDue(): number {
    const timings = this.stageConfig().powerDropTimings;
    if (!timings || this.stageStep === "intro") return 0;
    if (this.stageStep === "waves") {
      const progress = this.stepMs / this.stageConfig().bossAfterMs;
      return timings.waves.filter((t) => progress >= t).length;
    }
    const bossDue = this.stageStep === "boss" ? timings.boss.filter((ms) => this.stepMs >= ms).length : 0;
    return timings.waves.length + bossDue;
  }

  private onBossDefeated(boss: Boss): void {
    boss.step = "dying";
    this.sound.playSfx("bossDefeat");
    boss.stepMs = 0;
    // 2体の時は、最後の1体を倒すまでステージは終わらない(点数は2体で分ける)
    const allDefeated = this.bosses.every((b) => b.step === "dying");
    const isFinal = this.isFinalStage();
    const bonus = Math.round((BOSS_SCORE * (this.stageIndex + 1)) / this.bosses.length) + (allDefeated && isFinal ? this.lives * LIFE_BONUS_SCORE : 0);
    this.score += bonus;
    this.addText(boss.x, boss.y - boss.h / 2, `+${bonus}`);
    if (!allDefeated) return;
    // 残っている弾やザコは消して、クリアの演出をじゃましないようにする
    this.enemyBullets.forEach((b) => this.burst(b.x, b.y, 2, 60));
    this.enemyBullets = [];
    this.enemies.filter((e) => e.dyingMs === null).forEach((e) => this.burst(e.x, e.y, 10, 140));
    this.enemies = [];
    this.pendingSpawns = [];
    // 最後のステージでも、クリアの前にボーナスステージへ進む
    this.setStageStep("stage-clear");
    this.sound.playJingle("warp");
  }

  private onPlayerHit(): void {
    this.lives -= 1;
    this.sound.playSfx("playerHit");
    this.burst(this.playerX, this.playerY, 26, 220);
    // ドラッグは解除しない(当たっても指を離さずにそのまま操作を続けられるように)
    if (this.lives <= 0) {
      this.playerAlive = false;
      this.ending = { result: "gameover", remainingMs: GAMEOVER_DELAY_MS };
      this.sound.stopMusic(0.6);
      this.sound.playSfx("gameOver");
      return;
    }
    this.invincibleMs = PLAYER_INVINCIBLE_MS;
    this.shotLevel = Math.max(1, this.shotLevel - 1);
    // 立て直せるよう、画面上の敵の弾を全部消す(レーザーは消さない。無敵の間に抜け出せる)
    this.enemyBullets.forEach((b) => this.burst(b.x, b.y, 2, 60));
    this.enemyBullets = [];
  }

  private finishGame(result: "gameover" | "clear"): void {
    this.phase = result;
    if (result === "clear") this.sound.playJingle("win");
    this.hintVisible = false;
    // 結果画面の裏で敵が止まったまま残らないよう、残っている敵や弾ははじけさせて片付ける
    this.enemies.filter((e) => e.dyingMs === null).forEach((e) => this.burst(e.x, e.y, 10, 140));
    this.enemyBullets.forEach((b) => this.burst(b.x, b.y, 2, 60));
    this.enemies = [];
    this.enemyBullets = [];
    this.playerShots = [];
    this.items = [];
    this.pendingSpawns = [];
    this.isNewRecord = !this.practice && this.score > this.highScore;
    if (this.isNewRecord) {
      this.highScore = this.score;
      saveHighScore(this.score);
    }
  }

  // ---- 内部: 1フレームの更新 ----

  private update(dtMs: number): void {
    const dt = dtMs / 1000;
    if (this.playerAlive) this.updatePlayerByKeys(dt);
    this.invincibleMs = Math.max(0, this.invincibleMs - dtMs);

    this.updatePlayerShots(dtMs);
    if (!this.ending) this.updateStage(dtMs);
    this.updateEnemies(dtMs);
    this.updateBosses(dtMs);
    this.playerShots = this.moveBullets(this.playerShots, dt);
    this.enemyBullets = this.moveBullets(this.enemyBullets, dt);
    this.updateItems(dtMs);
    this.handleCollisions();

    if (this.ending) {
      this.ending.remainingMs -= dtMs;
      if (this.ending.remainingMs <= 0) {
        const { result } = this.ending;
        this.ending = null;
        if (result === "clear") this.bosses = [];
        this.finishGame(result);
      }
    }
  }

  // ---- 内部: 描画 ----

  private render(): void {
    this.syncSizeToContainer();
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.offsetX, this.dpr * this.offsetY);
    ctx.scale(this.renderScale, this.renderScale);

    // 戦場の外(横長画面の左右の余白)に敵や弾が遠くまではみ出して見えないよう切り取る
    ctx.save();
    ctx.beginPath();
    ctx.rect(-EDGE_FADE_W, 0, FIELD_W + EDGE_FADE_W * 2, this.fieldH);
    ctx.clip();

    if (this.phase === "home") {
      this.drawHomeSprite(ctx);
    } else {
      this.items.forEach((item) => this.drawItem(ctx, item));
      this.bosses.forEach((b) => this.drawBoss(ctx, b));
      this.enemies.forEach((e) => this.drawEnemy(ctx, e));
      this.playerShots.forEach((b) => this.drawPlayerShot(ctx, b));
    }
    // ホームではスタートボタンと重なるので自機は出さない
    if (this.playerAlive && this.phase !== "home" && this.phase !== "gameover") this.drawPlayer(ctx);
    this.particles.forEach((p) => this.drawParticle(ctx, p));
    this.blasts.forEach((b) => this.drawBlast(ctx, b));
    this.shockwaves.forEach((w) => this.drawShockwave(ctx, w));
    // 敵の弾は一番見落としてはいけないので、演出より手前に描く
    this.enemies.forEach((e) => this.drawLaser(ctx, e));
    this.drawCrossfireCharge(ctx);
    this.enemyBullets.forEach((b) => this.drawEnemyBullet(ctx, b));
    this.texts.forEach((t) => this.drawText(ctx, t));

    this.fadeOutsideField(ctx);
    ctx.restore();

    // 背景の粒は、ここまでに描いたものの後ろに敷く(戦場の外の消えていく処理の影響を受けないように)
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    this.drawBackground(ctx);
    ctx.restore();
  }

  // 戦場の左右の外側に描かれた分を、外へ行くほど透明になるよう消していく
  private fadeOutsideField(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = "destination-out";
    for (const [from, to] of [
      [0, -EDGE_FADE_W],
      [FIELD_W, FIELD_W + EDGE_FADE_W],
    ]) {
      const gradient = ctx.createLinearGradient(from, 0, to, 0);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(Math.min(from, to), 0, EDGE_FADE_W, this.fieldH);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // 宇宙の背景(CSS)の上に、下へ流れていく星と遠くの惑星を描いて、自機が前へ進んでいるように見せる。
  // 呼び出し側でdestination-over(すでに描いたものの後ろに敷く)にしているので、先に描いたものほど手前になる。
  // そのため星を先に、惑星を後に描く(星が惑星の手前に見える)
  private drawBackground(ctx: CanvasRenderingContext2D): void {
    this.drawStars(ctx);
    this.drawCheesePlanet(ctx);
  }

  // 横長画面でも戦場の範囲だけが目立たないよう、同じ並びを左右にくり返して画面の横いっぱいに敷く
  private drawStars(ctx: CanvasRenderingContext2D): void {
    const visibleLeft = -this.offsetX / this.renderScale;
    const visibleRight = FIELD_W - visibleLeft;
    const t = this.timeMs / 1000;
    for (let tile = Math.floor(visibleLeft / FIELD_W); tile * FIELD_W < visibleRight; tile++) {
      for (const star of this.stars) {
        const y = (star.y + this.bgScroll * star.speed) % FIELD_MAX_H;
        if (y > this.fieldH) continue;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2 + star.twinkle);
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(star.x + tile * FIELD_W, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // 遠くをゆっくり横切っていく、チーズでできた惑星
  private drawCheesePlanet(ctx: CanvasRenderingContext2D): void {
    const r = 40; // 画面に出る半径
    const R = 52; // 下の模様(穴の位置など)を書いてある時の半径。rに合わせて縮めて描く
    const loop = this.fieldH + r * 4;
    const y = ((this.timeMs / 1000) * PLANET_SCROLL_SPEED + this.fieldH * 0.35) % loop - r * 2;
    const x = FIELD_W * 0.8;
    ctx.save();
    // 弾やライフ表示より目立たないよう、うすくして遠くにあるように見せる
    ctx.globalAlpha = 0.5;
    ctx.translate(x, y);
    ctx.scale(r / R, r / R);

    // 左上から光が当たっているように、中心をずらしたグラデーションで丸みを出す
    const body = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
    body.addColorStop(0, "#fff1a8");
    body.addColorStop(0.6, "#ffcf4d");
    body.addColorStop(1, "#d98f1f");
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // チーズの穴
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(196, 120, 20, 0.45)";
    for (const [hx, hy, hr] of [
      [-18, -14, 11],
      [16, 8, 8],
      [-4, 24, 6],
      [26, -22, 5],
      [-30, 14, 5],
    ]) {
      ctx.beginPath();
      ctx.ellipse(hx, hy, hr, hr * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, w: number, h: number, flash: number): void {
    if (sprite.outline) {
      const pad = SPRITE_OUTLINE_PX * (w / sprite.img.naturalWidth);
      ctx.drawImage(sprite.outline, -w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
    }
    ctx.drawImage(sprite.img, -w / 2, -h / 2, w, h);
    if (flash > 0 && sprite.silhouette) {
      ctx.globalAlpha *= flash;
      ctx.drawImage(sprite.silhouette, -w / 2, -h / 2, w, h);
    }
  }

  private drawHomeSprite(ctx: CanvasRenderingContext2D): void {
    const sprite = this.homeSprite;
    if (!sprite) return;
    const t = this.timeMs / 1000;
    const h = BOSS_HEIGHT;
    ctx.save();
    ctx.translate(FIELD_W / 2 + Math.sin(t * 0.8) * 30, this.fieldH * 0.54 + Math.sin(t * 1.6) * 10);
    ctx.rotate(Math.sin(t * 1.2) * 0.06);
    this.drawSprite(ctx, sprite, spriteWidthFor(sprite, h), h, 0);
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.dyingMs !== null) {
      // 回りながら小さくなって消える
      const p = e.dyingMs / ENEMY_DYING_MS;
      ctx.globalAlpha = 1 - p;
      ctx.rotate(p * Math.PI * 1.5);
      ctx.scale(1 - p * 0.7, 1 - p * 0.7);
      this.drawSprite(ctx, e.sprite, e.w, e.h, 1);
    } else {
      ctx.rotate(Math.sin(e.ageMs / 1000 * 4) * 0.12); // ゆらゆら揺らして生き物らしく
      this.drawSprite(ctx, e.sprite, e.w, e.h, e.flashMs > 0 ? 0.8 : 0);
      this.drawBeamerCharge(ctx, e);
    }
    ctx.restore();
  }

  // 十字砲火の予告: 2体の口元に水色の光がだんだん大きくなる
  private drawCrossfireCharge(ctx: CanvasRenderingContext2D): void {
    if (this.crossfire.step !== "charge") return;
    const p = this.crossfire.ms / CROSSFIRE_CHARGE_MS;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bosses) {
      if (b.kind !== "twin" || b.step !== "fighting") continue;
      this.drawMuzzleGlow(ctx, b.x, b.y + b.h * 0.2, 6 + p * 18, p, BEAM_CYAN);
    }
    ctx.restore();
  }

  // laserの予告の細い線と、撃っている間の太いレーザー
  private drawLaser(ctx: CanvasRenderingContext2D, e: Enemy): void {
    if (e.kind !== "laser" || e.dyingMs !== null || e.laserStep === "wait" || e.laserStep === "done") return;
    const top = e.y + e.h * 0.3;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (e.laserStep === "charge") {
      // 点滅する細い線で、これから撃つ場所を知らせる。口元の光はだんだん大きく
      const p = e.laserMs / LASER_CHARGE_MS;
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(e.laserMs / 60));
      ctx.fillStyle = BEAM_RED;
      ctx.fillRect(e.x - 1, top, 2, this.fieldH - top);
      ctx.globalAlpha = 1;
      this.drawMuzzleGlow(ctx, e.x, top, 4 + p * 14, p);
    } else {
      // 口元から先が伸びていく。出始めは細く、すぐ太くなり、出ている間は少し脈打つ
      const len = Math.min(e.laserLen, this.fieldH - top);
      const grow = Math.min(1, e.laserMs / 90);
      const pulse = 1 + Math.sin(e.laserMs / 25) * 0.08;
      for (const layer of [
        { w: 30, color: BEAM_RED, alpha: 0.25 },
        { w: 16, color: BEAM_RED, alpha: 0.85 },
        { w: 6, color: "#ffffff", alpha: 1 },
      ]) {
        const w = layer.w * grow * pulse;
        ctx.globalAlpha = layer.alpha;
        ctx.fillStyle = layer.color;
        ctx.fillRect(e.x - w / 2, top, w, len);
      }
      ctx.globalAlpha = 1;
      this.drawMuzzleGlow(ctx, e.x, top, 18 * pulse, 1);
      // 伸びている途中の先端も光らせる
      if (len < this.fieldH - top) this.drawMuzzleGlow(ctx, e.x, top + len, 14 * pulse, 1);
    }
    ctx.restore();
  }

  private drawMuzzleGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, p: number, color = BEAM_RED): void {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.35, color);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.4 + p * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // beamerが撃つ直前、口元に赤い光がふくらんでいく(ビームが来る予告)
  private drawBeamerCharge(ctx: CanvasRenderingContext2D, e: Enemy): void {
    if (e.kind !== "beamer" || e.y < e.diveStopY || e.ageMs > BEAMER_STAY_MS) return;
    const firing = e.beamLeft > 0;
    if (!firing && e.fireCooldownMs > BEAMER_CHARGE_MS) return;
    const p = firing ? 1 : 1 - e.fireCooldownMs / BEAMER_CHARGE_MS;
    const radius = 4 + p * 12 + (firing ? 0 : Math.sin(e.ageMs / 30) * 1.5);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, e.h * 0.3, 0, 0, e.h * 0.3, radius);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.35, BEAM_RED);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.4 + p * 0.6;
    ctx.beginPath();
    ctx.arc(0, e.h * 0.3, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBoss(ctx: CanvasRenderingContext2D, boss: Boss): void {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.step === "dying") {
      const p = Math.min(1, boss.stepMs / BOSS_DYING_MS);
      ctx.globalAlpha = 1 - p * p; // 倒したボスはオーラを消す
      ctx.rotate(Math.sin(boss.stepMs / 40) * 0.08);
      this.drawSprite(ctx, boss.sprite, boss.w, boss.h, 0.3 + 0.3 * Math.sin(boss.stepMs / 60));
    } else {
      ctx.rotate(Math.sin(boss.stepMs / 1000 * 1.7) * 0.05);
      this.drawBossAura(ctx, boss);
      this.drawSprite(ctx, boss.sprite, boss.w, boss.h, boss.flashMs > 0 ? 0.6 : 0);
    }
    ctx.restore();
    if (boss.step === "fighting" && boss.barrierHp > 0) this.drawBarrier(ctx, boss);
  }

  // ボスのバリア: 水色に光る丸い膜。張った時にふくらんで出てきて、残りHPが減るほど薄く、ちらつくようになる
  private drawBarrier(ctx: CanvasRenderingContext2D, boss: Boss): void {
    const grow = Math.min(1, boss.barrierMs / 300);
    const r = this.barrierRadius(boss) * (0.6 + 0.4 * (1 - (1 - grow) ** 3));
    const left = boss.barrierHp / boss.barrierMaxHp;
    const flicker = left < 0.35 ? 0.6 + 0.4 * Math.abs(Math.sin(boss.barrierMs / 45)) : 1;
    const hit = boss.barrierFlashMs > 0 ? 1 : 0;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fill = ctx.createRadialGradient(boss.x, boss.y, r * 0.6, boss.x, boss.y, r);
    fill.addColorStop(0, "rgba(32, 216, 255, 0)");
    fill.addColorStop(1, `rgba(32, 216, 255, ${(0.18 + 0.2 * left + 0.25 * hit) * flicker})`);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (0.45 + 0.5 * left + 0.3 * hit) * flicker;
    ctx.strokeStyle = hit ? "#ffffff" : BARRIER_COLOR;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // ボスの後ろに描く、強そうに見せるためのオーラ。体の形に沿って燃え上がる炎と、立ちのぼる火の粉。
  // HPが半分を切って攻撃が激しくなると、紫から赤に変わって大きく速く揺らめく
  private drawBossAura(ctx: CanvasRenderingContext2D, boss: Boss): void {
    const enraged = this.isBossEnraged(boss);
    const color = enraged ? BOSS_AURA_ENRAGED : BOSS_AURA;
    const aura = auraSprite(boss.sprite, color);
    if (!aura) return;
    const speed = enraged ? 1.8 : 1;
    const t = (this.timeMs / 1000) * speed;
    const k = boss.w / boss.sprite.img.naturalWidth; // 元画像のpx → 画面のpx
    const pad = AURA_PAD * k;
    const w = boss.w + pad * 2;
    const h = boss.h + pad * 2;
    const bottom = boss.h / 2 + pad;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // 炎を3枚重ね、それぞれ足元を支点に縦へ伸び縮み・左右に揺らして、燃え上がっているように見せる
    for (let i = 0; i < 3; i++) {
      const stretch = (enraged ? 1.14 : 1.06) + Math.sin(t * 7 + i * 2.1) * 0.05;
      const sway = Math.sin(t * 5 + i * 1.3) * 3;
      ctx.save();
      ctx.translate(sway, bottom);
      ctx.scale(1 + Math.sin(t * 6 + i) * 0.02, stretch);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(aura, -w / 2, -h, w, h);
      ctx.restore();
    }
    // 下から上へ立ちのぼって消えていく火の粉
    ctx.fillStyle = color;
    for (let i = 0; i < 12; i++) {
      const p = (t * 0.6 + i / 12) % 1;
      const x = Math.sin(i * 12.9898) * boss.w * 0.45 + Math.sin(t * 3 + i) * 6;
      const y = boss.h * 0.45 - p * boss.h * 1.2;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 2.5 * (1 - p) + 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 自機は上向きの戦闘機。機首・三角の主翼・2枚の尾翼の形で、中心の白い点が当たり判定
  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    // 無敵の間は点滅させる(ミニ戦闘機も一緒に)
    if (this.invincibleMs > 0 && Math.floor(this.invincibleMs / 90) % 2 === 0) return;
    for (const m of this.activeMinis()) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(0.5, 0.5);
      this.drawFighter(ctx);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    this.drawFighter(ctx);
    ctx.beginPath();
    ctx.arc(0, 2, PLAYER_HIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = BULLET_PINK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 戦闘機の機体(原点が機体の中心)。自機とミニ戦闘機で使う
  private drawFighter(ctx: CanvasRenderingContext2D): void {
    ctx.lineJoin = "round";

    // エンジンの炎(機体の下に描く)。長さをちらつかせて、噴射しているように見せる
    const flameLen = 9 + Math.sin(this.timeMs / 35) * 2.5 + Math.random() * 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flame = ctx.createLinearGradient(0, 19, 0, 19 + flameLen);
    flame.addColorStop(0, "#ffffff");
    flame.addColorStop(0.35, SHOT_NEON);
    flame.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-3.5, 19);
    ctx.lineTo(3.5, 19);
    ctx.lineTo(0, 19 + flameLen);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 機体の輪郭(左右対称なので右半分の点を並べ、左は反転して使う)
    const right: [number, number][] = [
      [0, -26], // 機首
      [4, -16],
      [5, -4],
      [19, 8], // 主翼の先
      [19, 13],
      [6, 10],
      [6, 15],
      [11, 21], // 尾翼の先
      [4, 20],
    ];
    ctx.beginPath();
    right.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    [...right].reverse().forEach(([x, y]) => ctx.lineTo(-x, y));
    ctx.closePath();
    // 暗い背景や敵の中でも見失わないよう、白い太めのふちを下に敷く
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 7;
    ctx.stroke();
    const body = ctx.createLinearGradient(-19, 0, 19, 0);
    body.addColorStop(0, "#7d8fb0");
    body.addColorStop(0.5, "#eef3fa");
    body.addColorStop(1, "#7d8fb0");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 主翼のピンクの線(弾と同じ色)
    ctx.strokeStyle = SHOT_NEON;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 8, 3);
      ctx.lineTo(side * 16, 9.5);
      ctx.stroke();
    }

    // 操縦席の窓
    const canopy = ctx.createLinearGradient(0, -17, 0, -5);
    canopy.addColorStop(0, "#c9f4ff");
    canopy.addColorStop(1, "#1f7fd1");
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(0, -11, 2.8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  private drawPlayerShot(ctx: CanvasRenderingContext2D, b: Bullet): void {
    const sprite = shotSprite(b.color, b.scale);
    const w = sprite.width / BEAM_SPRITE_SCALE;
    const h = sprite.height / BEAM_SPRITE_SCALE;
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // 光が重なるほど明るくなるように
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // 敵の弾は、光の尾を引いて飛ぶビーム。当たり判定は先頭の光の玉のあたりの円(b.r * 0.8)で、尾には当たらない
  private drawEnemyBullet(ctx: CanvasRenderingContext2D, b: Bullet): void {
    const sprite = beamSprite(b.color, b.r);
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // 光が重なるほど明るくなるように
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.drawImage(sprite, -b.r * BEAM_TAIL, -b.r * BEAM_HALF_W, sprite.width / BEAM_SPRITE_SCALE, sprite.height / BEAM_SPRITE_SCALE);
    ctx.restore();
  }

  private drawItem(ctx: CanvasRenderingContext2D, item: Item): void {
    const pulse = 1 + Math.sin(item.ageMs / 120) * 0.08;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.scale(pulse, pulse);
    if (item.kind === "life") {
      this.drawLifeItem(ctx);
      ctx.restore();
      return;
    }
    this.drawPowerItem(ctx, item.ageMs);
    ctx.restore();
  }

  // パワーアップは、きらきら光る金色の星。まわりの光がまたたき、星はゆっくり回る
  private drawPowerItem(ctx: CanvasRenderingContext2D, ageMs: number): void {
    const twinkle = 0.75 + Math.sin(ageMs / 90) * 0.25;
    const outer = ITEM_RADIUS * 1.35;
    const inner = outer * 0.45;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glowR = ITEM_RADIUS * 2.4;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    glow.addColorStop(0, `rgba(255, 240, 150, ${0.75 * twinkle})`);
    glow.addColorStop(0.4, `rgba(255, 200, 40, ${0.35 * twinkle})`);
    glow.addColorStop(1, "rgba(255, 180, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    // 十字の光の筋
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = "rgba(255, 250, 220, 0.9)";
    const ray = ITEM_RADIUS * 2.3;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-ray, 0);
      ctx.quadraticCurveTo(0, -1.5, ray, 0);
      ctx.quadraticCurveTo(0, 1.5, -ray, 0);
      ctx.fill();
      ctx.rotate(Math.PI / 2);
    }
    ctx.restore();

    ctx.save();
    ctx.rotate(ageMs / 900);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    const body = ctx.createRadialGradient(0, -outer * 0.2, 0, 0, 0, outer);
    body.addColorStop(0, "#fffbe0");
    body.addColorStop(0.5, "#ffd84a");
    body.addColorStop(1, "#ffab00");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // ライフのハート。ヘッダーのライフ表示(HeartIcon)と同じ、白いふちのピンクのハート
  private drawLifeItem(ctx: CanvasRenderingContext2D): void {
    const s = (ITEM_RADIUS * 1.25) / 12; // HeartIconの24x24の座標を、アイテムの大きさに合わせる
    ctx.scale(s, s);
    ctx.translate(-12, -12.5);
    const heart = new Path2D(
      "M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z",
    );
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke(heart);
    ctx.fillStyle = BULLET_PINK;
    ctx.fill(heart);
  }

  // レベル9の衝撃波: 蛍光ピンクの光の輪。広がるほど薄くなる
  private drawShockwave(ctx: CanvasRenderingContext2D, w: { x: number; y: number; r: number; maxR: number }): void {
    const fade = 1 - w.r / w.maxR;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35 * fade;
    ctx.strokeStyle = SHOT_NEON;
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.globalAlpha = 0.9 * fade;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  // 強い弾の爆発: オレンジの光が一瞬ふくらみ、輪が広がって消える
  private drawBlast(ctx: CanvasRenderingContext2D, b: { x: number; y: number; radius: number; ms: number }): void {
    const p = b.ms / BLAST_MS;
    const r = b.radius * (0.4 + 0.6 * (1 - (1 - p) ** 3));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.3, HEAVY_SHOT_NEON);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = HEAVY_SHOT_NEON;
    ctx.lineWidth = 3 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    ctx.globalAlpha = Math.max(0, p.lifeMs / p.maxLifeMs);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawText(ctx: CanvasRenderingContext2D, t: FloatingText): void {
    ctx.globalAlpha = Math.min(1, t.lifeMs / 300);
    ctx.font = "800 15px 'Baloo 2', 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = 4;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(t.text, t.x, t.y);
    ctx.globalAlpha = 1;
  }

  // ---- メインループ ----

  private loop = (now: number): void => {
    if (this.disposed) return;
    // タブを離れて戻った時などに1フレームで大きく進みすぎないよう上限をつける
    const dtMs = clamp(now - this.lastTime, 0, 33);
    this.lastTime = now;

    this.bgScroll += BG_SCROLL_SPEED * (dtMs / 1000);
    this.timeMs += dtMs;

    if (this.phase === "playing") this.update(dtMs);
    // 結果画面の裏でも、爆発などの演出は最後まで流しきる
    this.updateEffects(dtMs);

    this.render();
    this.emit();
    this.rafId = requestAnimationFrame(this.loop);
  };
}
