// シューティングのゲームエンジン本体。
// Canvas描画・ポインタ/キー入力・敵や弾の動き・当たり判定をすべて内包する、Reactに依存しないクラス。
// 弾や敵の位置は毎フレーム変わるためReact stateにはせず、UIに関わる値(スコア・ライフ・画面)
// だけをEngineStateListener経由でReact側に伝える。
//
// 流れ(ステージごと): 「STAGE n」表示 → ザコひなこを決まった数倒す → WARNING → ボス(でかひなこ)登場
// (ボス戦中もザコが出てくる) → 倒せば次のステージへ。最後のステージのボスを倒せばクリア。
// ステージごとの難しさは constants.ts の STAGES。ライフが0になったらゲームオーバー。

import {
  BG_SCROLL_SPEED,
  PLANET_SCROLL_SPEED,
  BOSS_DYING_MS,
  BOSS_ENRAGE_RATIO,
  BOSS_ENTER_MS,
  BOSS_HEIGHT,
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
  ENEMY_SIZE_SCALE_MAX,
  ENEMY_SIZE_SCALE_MIN,
  FIELD_MAX_H,
  FIELD_MIN_H,
  FIELD_W,
  GAMEOVER_DELAY_MS,
  HIT_FLASH_MS,
  HITBOX_SCALE_X,
  HITBOX_SCALE_Y,
  ITEM_DROP_CHANCE,
  ITEM_FALL_SPEED,
  ITEM_GUARANTEED_EVERY,
  ITEM_RADIUS,
  LIFE_DROP_CHANCE,
  LIFE_DROP_CHANCE_BOSS_FIGHT,
  LIFE_ITEM_FULL_SCORE,
  LIFE_BONUS_SCORE,
  MAX_SHOT_LEVEL,
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
  type StageConfig,
} from "./constants";
import { aimAngle, circleIntersectsRect, circlesIntersect, clamp, fanAngles, spawnInterval, type Rect } from "./collision";
import { loadHighScore, saveHighScore } from "./highScore";
import { loadSprites, spriteWidthFor, SPRITE_OUTLINE_PX, type Sprite } from "./sprites";

export type EnginePhase = "home" | "playing" | "gameover" | "clear";

export interface EngineState {
  phase: EnginePhase;
  score: number;
  lives: number;
  shotLevel: number;
  stage: number; // 今のステージ(1から)
  stageBanner: string | null; // 画面中央に大きく出す「STAGE 2」「STAGE CLEAR!」。出していない時はnull
  killsUntilBoss: number; // ボスが出てくるまでに倒す残りの数(ボス戦中は0)
  bossName: string; // ボス戦中だけ中身がある
  bossHpPercent: number | null; // ボス戦中だけ0〜100、それ以外はnull
  bossWarning: boolean; // 「WARNING」を出している間true
  hintVisible: boolean; // 始めてから最初に自機を動かすまで、操作方法を出しておく
  highScore: number;
  isNewRecord: boolean; // 結果画面で「ハイスコア更新」を出すか
  assetsReady: boolean;
}

export type EngineStateListener = (state: EngineState) => void;

type EnemyKind = "straight" | "zigzag" | "swoop" | "dive";

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
  diveStopY: number;
  divePauseMs: number;
}

type BossStep = "entering" | "fighting" | "dying";
type BossPattern = "ring" | "aimed" | "spiral";
const BOSS_PATTERNS: BossPattern[] = ["aimed", "ring", "spiral"];

interface Boss {
  sprite: Sprite;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  step: BossStep;
  stepMs: number; // 今のstepに入ってからの経過時間
  patternIndex: number;
  patternMs: number;
  fireMs: number; // 次に撃つまでの残り時間
  spinAngle: number; // ringとspiralで撃つ向きを少しずつずらすための角度
  flashMs: number;
  nextBlastMs: number; // 倒された後の爆発演出の間隔
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
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
// boss: ボス戦 / stage-clear: ボスを倒して次のステージへ進むまで
type StageStep = "intro" | "waves" | "clearing" | "warning" | "boss" | "stage-clear";

// 敵の弾の色。背景がチーズ色なので黄色系は避け、白い縁取りで目立たせる
const BULLET_PINK = "#ff6f91";
const BULLET_BLUE = "#3fa7ff";
const BULLET_PURPLE = "#9b5de5";
const EXPLOSION_COLORS = ["#ff6f91", "#ffffff", "#ffc93c", "#8cc63f"];
const OUTLINE_DARK = "#1b1450"; // 文字や自機のふち。index.cssの--color-outlineと同じ色

const STAR_COUNT = 70; // FIELD_W の幅あたりの星の数
const STAR_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#cfe6ff", "#ffd6e0", "#fff3c4"];
// 横長画面で、戦場の左右の外側に敵や弾が少しずつ消えていく幅。
// 境界線を引かずに済むよう、端でいきなり切れず、宇宙の背景に溶けこむように見せる
const EDGE_FADE_W = 48;

// 決着(クリア/ゲームオーバー)した理由。演出が終わった時にどちらの結果画面へ進むかを覚えておく
type Ending = { result: "gameover" | "clear"; remainingMs: number };

// URLに?debugを付けた時だけ、動作確認用にwindow.shootingEngineからエンジンを触れるようにする
const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

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
  private kills = 0;
  private highScore = loadHighScore();
  private isNewRecord = false;
  private hintVisible = false;

  private playerX = FIELD_W / 2;
  private playerY = FIELD_MIN_H - PLAYER_BOTTOM_MARGIN;
  private playerAlive = true;
  private invincibleMs = 0;
  private shotCooldownMs = 0;

  private stageIndex = 0;
  private stageStep: StageStep = "intro";
  private usedBossSprites: Sprite[] = []; // 同じひなこが続けてボスにならないよう、この回で出したボス
  private stepMs = 0;
  private spawnCooldownMs = 0;
  private pendingSpawns: { delayMs: number; spawn: () => void }[] = [];

  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
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

  constructor(listener: EngineStateListener) {
    this.listener = listener;
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

  startGame(): void {
    this.phase = "playing";
    this.score = 0;
    this.lives = PLAYER_START_LIVES;
    this.shotLevel = 1;
    this.kills = 0;
    this.stageIndex = 0;
    this.usedBossSprites = [];
    this.isNewRecord = false;
    this.hintVisible = true;
    this.playerX = FIELD_W / 2;
    this.playerY = this.fieldH - PLAYER_BOTTOM_MARGIN;
    this.playerAlive = true;
    this.invincibleMs = 0;
    this.shotCooldownMs = 0;
    this.stageStep = "intro";
    this.stepMs = 0;
    this.spawnCooldownMs = 0;
    this.pendingSpawns = [];
    this.enemies = [];
    this.boss = null;
    this.playerShots = [];
    this.enemyBullets = [];
    this.items = [];
    this.particles = [];
    this.texts = [];
    this.ending = null;
    this.drag = null;
    this.emit();
  }

  goHome(): void {
    this.phase = "home";
    this.enemies = [];
    this.boss = null;
    this.playerShots = [];
    this.enemyBullets = [];
    this.items = [];
    this.particles = [];
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
    return null;
  }

  private emit(): void {
    const boss = this.boss;
    const config = this.stageConfig();
    const state: EngineState = {
      phase: this.phase,
      score: this.score,
      lives: this.lives,
      shotLevel: this.shotLevel,
      stage: this.stageIndex + 1,
      stageBanner: this.stageBanner(),
      killsUntilBoss: this.stageStep === "intro" || this.stageStep === "waves" ? Math.max(0, config.killsBeforeBoss - this.kills) : 0,
      bossName: boss ? `でか${boss.sprite.name}` : "",
      bossHpPercent: boss && boss.step !== "entering" ? Math.ceil((Math.max(0, boss.hp) / config.bossHp) * 100) : null,
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
      }
    }
  }

  private firePlayerShots(): void {
    const y = this.playerY - 20;
    const straight = (x: number): Bullet => ({ x, y, vx: 0, vy: -SHOT_SPEED, r: SHOT_RADIUS, color: "#ffffff" });
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
          color: "#ffffff",
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
        if (this.stepMs >= STAGE_INTRO_MS) {
          this.spawnCooldownMs = 300;
          this.setStageStep("waves");
        }
        break;
      case "waves": {
        this.spawnCooldownMs -= dtMs;
        if (this.spawnCooldownMs <= 0) {
          const [startMs, endMs] = config.spawnIntervalMs;
          this.spawnCooldownMs = spawnInterval(this.kills, config.killsBeforeBoss, startMs, endMs);
          this.spawnFormation();
        }
        if (this.kills >= config.killsBeforeBoss) this.setStageStep("clearing");
        break;
      }
      case "clearing":
        // 残っているザコがいなくなる(または一定時間経つ)までボスを待たせる
        if ((this.enemies.length === 0 && this.pendingSpawns.length === 0) || this.stepMs > 4000) {
          this.pendingSpawns = [];
          this.setStageStep("warning");
        }
        break;
      case "warning":
        if (this.stepMs >= BOSS_WARNING_MS) {
          this.spawnBoss();
          // ボス戦中のザコは、ボスが降りてきて少し経ってから出し始める
          this.spawnCooldownMs = BOSS_ENTER_MS + randomBetween(config.bossMinionIntervalMs);
          this.setStageStep("boss");
        }
        break;
      case "boss":
        // ボスと戦っている間も、ときどきザコの編隊が出てくる(ハートを落としやすいザコ)
        if (this.boss?.step === "entering" || this.boss?.step === "fighting") {
          this.spawnCooldownMs -= dtMs;
          if (this.spawnCooldownMs <= 0) {
            this.spawnCooldownMs = randomBetween(config.bossMinionIntervalMs);
            this.spawnFormation();
          }
        }
        break;
      case "stage-clear":
        if (this.stepMs >= STAGE_CLEAR_MS) {
          this.boss = null;
          this.stageIndex += 1;
          this.kills = 0;
          this.setStageStep("intro");
        }
        break;
    }
  }

  private setStageStep(step: StageStep): void {
    this.stageStep = step;
    this.stepMs = 0;
  }

  private spawnFormation(): void {
    const formations: (() => void)[] = [
      () => {
        // 横に3体並んでまっすぐ降りてくる
        const cx = FIELD_W / 2 + (Math.random() - 0.5) * 120;
        for (const dx of [-90, 0, 90]) this.spawnEnemy("straight", clamp(cx + dx, 40, FIELD_W - 40), -50);
      },
      () => {
        // 左右で2体、くねくね揺れながら降りてくる
        this.spawnEnemy("zigzag", FIELD_W * 0.3, -50);
        this.spawnEnemy("zigzag", FIELD_W * 0.7, -50);
      },
      () => {
        // 片側の上の方から4体つながって、弧を描いて横切る
        const fromLeft = Math.random() < 0.5;
        const startY = 70 + Math.random() * 60;
        for (let i = 0; i < 4; i++) {
          this.pendingSpawns.push({
            delayMs: i * 260,
            spawn: () => this.spawnEnemy("swoop", fromLeft ? -40 : FIELD_W + 40, startY, fromLeft ? 1 : -1),
          });
        }
      },
      () => {
        // 1体が途中で止まり、自機めがけて突っ込んでくる
        this.spawnEnemy("dive", 60 + Math.random() * (FIELD_W - 120), -50);
      },
    ];
    pickRandom(formations)();
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, direction = 1): void {
    const sprites = this.readySprites().filter((s) => s !== this.boss?.sprite);
    if (sprites.length === 0) return;
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
      hp: kind === "dive" ? this.stageConfig().enemyHp + 1 : this.stageConfig().enemyHp,
      fireCooldownMs: randomBetween(ENEMY_FIRST_FIRE_MS),
      flashMs: 0,
      dyingMs: null,
      diveStep: "enter",
      diveStopY: 110 + Math.random() * 80,
      divePauseMs: 0,
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
    }
    this.enemies.push(enemy);
  }

  private spawnBoss(): void {
    const ready = this.readySprites();
    const unused = ready.filter((s) => !this.usedBossSprites.includes(s));
    const sprite = pickRandom(unused.length > 0 ? unused : ready);
    if (!sprite) return;
    this.usedBossSprites.push(sprite);
    this.boss = {
      sprite,
      x: FIELD_W / 2,
      y: -BOSS_HEIGHT / 2,
      w: spriteWidthFor(sprite, BOSS_HEIGHT),
      h: BOSS_HEIGHT,
      hp: this.stageConfig().bossHp,
      step: "entering",
      stepMs: 0,
      patternIndex: 0,
      patternMs: 0,
      fireMs: 0,
      spinAngle: 0,
      flashMs: 0,
      nextBlastMs: 0,
    };
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
        case "zigzag":
          e.x = e.baseX + Math.sin(e.ageMs / 1000 * 2.4) * 55;
          e.y += e.vy * dt;
          break;
        case "dive":
          this.updateDiveEnemy(e, dtMs);
          break;
        default:
          e.vy += e.ay * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
      }

      e.fireCooldownMs -= dtMs;
      if (e.fireCooldownMs <= 0) {
        e.fireCooldownMs = randomBetween(this.stageConfig().enemyFireIntervalMs);
        const onScreen = e.y > 20 && e.y < this.fieldH * ENEMY_FIRE_MAX_Y_RATIO && e.x > 0 && e.x < FIELD_W;
        if (onScreen && this.playerAlive && e.diveStep !== "dive") {
          this.fireEnemyBullet(e.x, e.y + e.h * 0.2, aimAngle(e.x, e.y, this.playerX, this.playerY), this.stageConfig().enemyBulletSpeed, BULLET_PINK, 6);
        }
      }
    }
    // 倒し終えた敵・画面の外へ出ていった敵を片付ける
    this.enemies = this.enemies.filter((e) => {
      if (e.dyingMs !== null) return e.dyingMs < ENEMY_DYING_MS;
      return e.y < this.fieldH + e.h && e.y > -200 && e.x > -140 && e.x < FIELD_W + 140;
    });
  }

  private updateDiveEnemy(e: Enemy, dtMs: number): void {
    const dt = dtMs / 1000;
    switch (e.diveStep) {
      case "enter":
        e.y += e.vy * dt;
        if (e.y >= e.diveStopY) {
          e.diveStep = "pause";
          e.divePauseMs = 0;
        }
        break;
      case "pause":
        // 少し震えて「来るぞ」と知らせてから、その時の自機の位置めがけて突っ込む
        e.divePauseMs += dtMs;
        e.x = e.baseX + Math.sin(e.divePauseMs / 25) * 2;
        if (e.divePauseMs >= 650) {
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

  private updateBoss(dtMs: number): void {
    const boss = this.boss;
    if (!boss) return;
    boss.stepMs += dtMs;
    boss.flashMs = Math.max(0, boss.flashMs - dtMs);
    const t = boss.stepMs / 1000;

    switch (boss.step) {
      case "entering": {
        // 上からゆっくり降りてきて、止まる直前に減速する
        const p = Math.min(1, boss.stepMs / BOSS_ENTER_MS);
        const eased = 1 - (1 - p) ** 3;
        boss.y = -boss.h / 2 + (BOSS_REST_Y + boss.h / 2) * eased;
        if (p >= 1) {
          boss.step = "fighting";
          boss.stepMs = 0;
          boss.patternMs = 0;
          boss.fireMs = 400;
        }
        break;
      }
      case "fighting":
        boss.x = FIELD_W / 2 + Math.sin(t * 0.7) * 95;
        boss.y = BOSS_REST_Y + Math.sin(t * 1.3) * 22;
        this.updateBossAttack(boss, dtMs);
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
    const enraged = boss.hp <= config.bossHp * BOSS_ENRAGE_RATIO;
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
          this.fireEnemyBullet(boss.x, muzzleY, angle, speed(200), BULLET_PINK, 6);
        }
        break;
      }
      case "ring": {
        // 全方向にまんべんなく。毎回少しずつ向きをずらして隙間の位置を変える
        boss.fireMs = interval(enraged ? 520 : 680);
        const count = enraged ? 20 : 14;
        boss.spinAngle += 0.21;
        for (let i = 0; i < count; i++) {
          this.fireEnemyBullet(boss.x, muzzleY, boss.spinAngle + (Math.PI * 2 * i) / count, speed(125), BULLET_BLUE, 7);
        }
        break;
      }
      case "spiral": {
        // うずまき。腕の数だけ等間隔に撃ちながら回していく
        boss.fireMs = interval(enraged ? 80 : 105);
        const arms = enraged ? 3 : 2;
        boss.spinAngle += 0.27;
        for (let i = 0; i < arms; i++) {
          this.fireEnemyBullet(boss.x, muzzleY, boss.spinAngle + (Math.PI * 2 * i) / arms, speed(140), BULLET_PURPLE, 6);
        }
        break;
      }
    }
  }

  private fireEnemyBullet(x: number, y: number, angle: number, speed: number, color: string, r: number): void {
    this.enemyBullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, color });
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
    const hitByBody =
      this.enemies.some((e) => e.dyingMs === null && circleIntersectsRect(this.playerX, this.playerY, PLAYER_HIT_RADIUS, this.hitbox(e.x, e.y, e.w, e.h))) ||
      (this.boss?.step === "fighting" &&
        circleIntersectsRect(this.playerX, this.playerY, PLAYER_HIT_RADIUS, this.hitbox(this.boss.x, this.boss.y, this.boss.w, this.boss.h)));
    if (hitByBullet || hitByBody) this.onPlayerHit();
  }

  private handleShotHits(): void {
    const boss = this.boss;
    this.playerShots = this.playerShots.filter((shot) => {
      for (const e of this.enemies) {
        if (e.dyingMs !== null || e.y < -e.h / 2) continue; // 画面に入りきる前は当たらない
        if (!circleIntersectsRect(shot.x, shot.y, shot.r, this.hitbox(e.x, e.y, e.w, e.h))) continue;
        e.hp -= 1;
        e.flashMs = HIT_FLASH_MS;
        if (e.hp <= 0) this.onEnemyDefeated(e);
        return false;
      }
      if (boss && boss.step === "fighting" && circleIntersectsRect(shot.x, shot.y, shot.r, this.hitbox(boss.x, boss.y, boss.w, boss.h))) {
        boss.hp -= 1;
        boss.flashMs = HIT_FLASH_MS;
        this.score += 10;
        if (boss.hp <= 0) this.onBossDefeated(boss);
        return false;
      }
      return true;
    });
  }

  private handleItemPickups(): void {
    if (!this.playerAlive) return;
    this.items = this.items.filter((item) => {
      if (!circlesIntersect(item.x, item.y, ITEM_RADIUS, this.playerX, this.playerY, PLAYER_ITEM_RADIUS)) return true;
      if (item.kind === "life") {
        if (this.lives < PLAYER_START_LIVES) {
          this.lives += 1;
          this.addText(item.x, item.y - 16, "ライフ +1");
        } else {
          this.score += LIFE_ITEM_FULL_SCORE;
          this.addText(item.x, item.y - 16, `+${LIFE_ITEM_FULL_SCORE}`);
        }
      } else if (this.shotLevel < MAX_SHOT_LEVEL) {
        this.shotLevel += 1;
        this.addText(item.x, item.y - 16, "パワーアップ！");
      } else {
        this.score += 500;
        this.addText(item.x, item.y - 16, "+500");
      }
      return false;
    });
  }

  private onEnemyDefeated(e: Enemy): void {
    e.dyingMs = 0;
    this.kills += 1;
    this.score += ENEMY_SCORE;
    this.burst(e.x, e.y, 12, 160);
    this.addText(e.x, e.y - e.h / 2, `+${ENEMY_SCORE}`);
    // ライフを先に抽選し、出なかった時だけパワーアップを抽選する(1体から2つは落とさない)。
    // ライフはボス戦中に出てくるザコからの方が出やすい
    const lifeChance = this.stageStep === "boss" ? LIFE_DROP_CHANCE_BOSS_FIGHT : LIFE_DROP_CHANCE;
    if (Math.random() < lifeChance) {
      this.items.push({ kind: "life", x: e.x, y: e.y, ageMs: 0 });
    } else if (this.kills % ITEM_GUARANTEED_EVERY === 0 || Math.random() < ITEM_DROP_CHANCE) {
      this.items.push({ kind: "power", x: e.x, y: e.y, ageMs: 0 });
    }
  }

  private onBossDefeated(boss: Boss): void {
    boss.step = "dying";
    boss.stepMs = 0;
    const isFinal = this.isFinalStage();
    const bonus = BOSS_SCORE * (this.stageIndex + 1) + (isFinal ? this.lives * LIFE_BONUS_SCORE : 0);
    this.score += bonus;
    this.addText(boss.x, boss.y - boss.h / 2, `+${bonus}`);
    // 残っている弾やザコは消して、クリアの演出をじゃましないようにする
    this.enemyBullets.forEach((b) => this.burst(b.x, b.y, 2, 60));
    this.enemyBullets = [];
    this.enemies.filter((e) => e.dyingMs === null).forEach((e) => this.burst(e.x, e.y, 10, 140));
    this.enemies = [];
    this.pendingSpawns = [];
    if (isFinal) this.ending = { result: "clear", remainingMs: BOSS_DYING_MS };
    else this.setStageStep("stage-clear");
  }

  private onPlayerHit(): void {
    this.lives -= 1;
    this.burst(this.playerX, this.playerY, 26, 220);
    this.drag = null;
    if (this.lives <= 0) {
      this.playerAlive = false;
      this.ending = { result: "gameover", remainingMs: GAMEOVER_DELAY_MS };
      return;
    }
    this.invincibleMs = PLAYER_INVINCIBLE_MS;
    this.shotLevel = Math.max(1, this.shotLevel - 1);
    // 立て直せるよう、画面上の敵の弾を全部消す
    this.enemyBullets.forEach((b) => this.burst(b.x, b.y, 2, 60));
    this.enemyBullets = [];
  }

  private finishGame(result: "gameover" | "clear"): void {
    this.phase = result;
    this.hintVisible = false;
    // 結果画面の裏で敵が止まったまま残らないよう、残っている敵や弾ははじけさせて片付ける
    this.enemies.filter((e) => e.dyingMs === null).forEach((e) => this.burst(e.x, e.y, 10, 140));
    this.enemyBullets.forEach((b) => this.burst(b.x, b.y, 2, 60));
    this.enemies = [];
    this.enemyBullets = [];
    this.playerShots = [];
    this.items = [];
    this.pendingSpawns = [];
    this.isNewRecord = this.score > this.highScore;
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
    this.updateBoss(dtMs);
    this.playerShots = this.moveBullets(this.playerShots, dt);
    this.enemyBullets = this.moveBullets(this.enemyBullets, dt);
    this.updateItems(dtMs);
    this.handleCollisions();

    if (this.ending) {
      this.ending.remainingMs -= dtMs;
      if (this.ending.remainingMs <= 0) {
        const { result } = this.ending;
        this.ending = null;
        if (result === "clear") this.boss = null;
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
      if (this.boss) this.drawBoss(ctx, this.boss);
      this.enemies.forEach((e) => this.drawEnemy(ctx, e));
      this.playerShots.forEach((b) => this.drawPlayerShot(ctx, b));
    }
    // ホームではスタートボタンと重なるので自機は出さない
    if (this.playerAlive && this.phase !== "home" && this.phase !== "gameover") this.drawPlayer(ctx);
    this.particles.forEach((p) => this.drawParticle(ctx, p));
    // 敵の弾は一番見落としてはいけないので、演出より手前に描く
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
    }
    ctx.restore();
  }

  private drawBoss(ctx: CanvasRenderingContext2D, boss: Boss): void {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.step === "dying") {
      const p = Math.min(1, boss.stepMs / BOSS_DYING_MS);
      ctx.globalAlpha = 1 - p * p;
      ctx.rotate(Math.sin(boss.stepMs / 40) * 0.08);
      this.drawSprite(ctx, boss.sprite, boss.w, boss.h, 0.3 + 0.3 * Math.sin(boss.stepMs / 60));
    } else {
      ctx.rotate(Math.sin(boss.stepMs / 1000 * 1.7) * 0.05);
      this.drawSprite(ctx, boss.sprite, boss.w, boss.h, boss.flashMs > 0 ? 0.6 : 0);
    }
    ctx.restore();
  }

  // 自機はチーズのかけら。三角の中に穴を描き、中心の白い点が当たり判定
  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    // 無敵の間は点滅させる
    if (this.invincibleMs > 0 && Math.floor(this.invincibleMs / 90) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(18, 14);
    ctx.lineTo(-18, 14);
    ctx.closePath();
    // 背景もチーズ色なので、白い太めのふちを下に敷き、中身も背景より濃い色にして目立たせる
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#ffb627";
    ctx.fill();
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#e08a1e";
    for (const [hx, hy, hr] of [
      [-7, 6, 3.5],
      [7, 3, 2.5],
      [2, -9, 2.2],
    ]) {
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 2, PLAYER_HIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = BULLET_PINK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawPlayerShot(ctx: CanvasRenderingContext2D, b: Bullet): void {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
    ctx.beginPath();
    ctx.roundRect(-3, -9, 6, 18, 3);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.strokeStyle = BULLET_PINK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawEnemyBullet(ctx: CanvasRenderingContext2D, b: Bullet): void {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
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
    ctx.beginPath();
    ctx.arc(0, 0, ITEM_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#34a853";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 14px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P", 0, 1);
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
