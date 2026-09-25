// BGM(フリー素材の曲)と効果音(コードで合成)を鳴らす。Reactにもゲームエンジンにも依存しないクラス。
//
// BGMは SketchyLogic「NES Shooter Music」(CC0) を public/audio/ にAACで置いている。
// HTMLのaudio要素のloopは曲の継ぎ目で一瞬途切れるため、Web Audioで読み込んだ音をループ再生して切れ目なくつなぐ。
//
// ブラウザは、ユーザーが画面を一度触るまで音を出させてくれない。最初の操作(タップ・クリック・キー)で
// AudioContextを作って鳴らし始め、それまでに頼まれたBGMはその時に始める。

import { SOUND_MUTED_STORAGE_KEY } from "./constants";

export type BgmId = "map" | "venus" | "mars" | "mercury" | "boss";
export type JingleId = "intro" | "warp" | "win";
export type SfxId = "shot" | "hit" | "defeat" | "playerHit" | "powerUp" | "life" | "warning" | "bossDefeat" | "gameOver" | "laserCharge" | "laser" | "heavyShot" | "blast";

// lengthは元のWAVでの正確な長さ(秒)。AACに変換すると末尾にわずかな無音が付くことがあるので、
// ファイルの長さではなくこの長さでループさせて、継ぎ目で途切れないようにする
const TRACKS = {
  map: { file: "map.m4a", length: 36.61 },
  venus: { file: "venus.m4a", length: 25.69 },
  mars: { file: "mars.m4a", length: 46.83 },
  mercury: { file: "mercury.m4a", length: 40.39 },
  "boss-intro": { file: "boss-intro.m4a", length: 2.1 },
  "boss-main": { file: "boss-main.m4a", length: 32.13 },
  "jingle-intro": { file: "jingle-intro.m4a", length: 2.24 },
  "jingle-warp": { file: "jingle-warp.m4a", length: 2.24 },
  "jingle-win": { file: "jingle-win.m4a", length: 4.41 },
} as const;

type TrackId = keyof typeof TRACKS;

const MUSIC_VOLUME = 0.45;
const SFX_VOLUME = 0.5;
const BGM_FADE_SEC = 0.35;

// 同じ効果音が短い間に何度も重なると耳障りなので、鳴らす最短の間隔(秒)を決めておく。
// 自機の弾は110msごとに自動で撃ち続けるので、鳴らすのはおよそ2発に1回
const SFX_MIN_INTERVAL_SEC: Partial<Record<SfxId, number>> = {
  shot: 0.2,
  hit: 0.05,
  defeat: 0.04,
  blast: 0.06,
};

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend", "click"] as const;

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(SOUND_MUTED_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // 保存できなくても遊ぶのに支障はないので無視する
  }
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private crunchBuffer: AudioBuffer | null = null;

  private readonly buffers = new Map<TrackId, Promise<AudioBuffer | null>>();
  // 今鳴っている(または、読み込みが終わり次第鳴らす)BGM。ジングルもここで扱う
  private wantedMusic: { kind: "bgm"; id: BgmId } | { kind: "jingle"; id: JingleId } | null = null;
  private playing: { sources: AudioBufferSourceNode[]; gain: GainNode } | null = null;
  private musicToken = 0; // 読み込みを待っている間に別の曲へ切り替わった時、古い方を鳴らさないための番号
  private readonly lastSfxAt = new Map<SfxId, number>();
  private muted = loadMuted();
  private disposed = false;

  constructor() {
    UNLOCK_EVENTS.forEach((type) => window.addEventListener(type, this.unlock, { capture: true }));
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  dispose(): void {
    this.disposed = true;
    UNLOCK_EVENTS.forEach((type) => window.removeEventListener(type, this.unlock, { capture: true }));
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    void this.ctx?.close();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  // ---- BGM ----

  playBgm(id: BgmId): void {
    if (this.wantedMusic?.kind === "bgm" && this.wantedMusic.id === id) return;
    this.wantedMusic = { kind: "bgm", id };
    this.startWantedMusic();
  }

  // 短い曲を1回だけ鳴らす(鳴らしている間、BGMは止める)
  playJingle(id: JingleId): void {
    this.wantedMusic = { kind: "jingle", id };
    this.startWantedMusic();
  }

  stopMusic(fadeSec = BGM_FADE_SEC): void {
    this.wantedMusic = null;
    this.musicToken += 1;
    this.fadeOutPlaying(fadeSec);
  }

  private startWantedMusic(): void {
    const wanted = this.wantedMusic;
    const token = ++this.musicToken;
    this.fadeOutPlaying(BGM_FADE_SEC);
    if (!wanted || !this.ctx) return; // まだ画面を触っていない: 触った時(unlock)に始める

    // ボスの曲は、出だし(1回だけ)の後に本体をくり返す
    const parts: { track: TrackId; loop: boolean }[] =
      wanted.kind === "jingle"
        ? [{ track: `jingle-${wanted.id}`, loop: false }]
        : wanted.id === "boss"
          ? [
              { track: "boss-intro", loop: false },
              { track: "boss-main", loop: true },
            ]
          : [{ track: wanted.id, loop: true }];

    void Promise.all(parts.map((p) => this.loadTrack(p.track))).then((buffers) => {
      const ctx = this.ctx;
      const bus = this.musicBus;
      if (token !== this.musicToken || !ctx || !bus || buffers.some((b) => !b)) return;

      const gain = ctx.createGain();
      gain.connect(bus);
      const sources: AudioBufferSourceNode[] = [];
      let at = ctx.currentTime + 0.05;
      parts.forEach((part, i) => {
        const buffer = buffers[i] as AudioBuffer;
        const length = Math.min(TRACKS[part.track].length, buffer.duration);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        if (part.loop) {
          source.loop = true;
          source.loopStart = 0;
          source.loopEnd = length;
          source.start(at);
        } else {
          source.start(at, 0, length);
        }
        sources.push(source);
        at += length;
      });
      this.playing = { sources, gain };
    });
  }

  private fadeOutPlaying(fadeSec: number): void {
    const playing = this.playing;
    const ctx = this.ctx;
    this.playing = null;
    if (!playing || !ctx) return;
    const now = ctx.currentTime;
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
    playing.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
    playing.sources.forEach((s) => {
      try {
        s.stop(now + fadeSec + 0.05);
      } catch {
        // まだ始まっていない/すでに止まっている音は無視する
      }
    });
  }

  private loadTrack(id: TrackId): Promise<AudioBuffer | null> {
    let promise = this.buffers.get(id);
    if (!promise) {
      promise = fetch(`/audio/${TRACKS[id].file}`)
        .then((res) => res.arrayBuffer())
        .then((data) => (this.ctx ? this.ctx.decodeAudioData(data) : null))
        .catch(() => null); // 読み込めなかった曲は鳴らさない(ゲームは続けられる)
      this.buffers.set(id, promise);
    }
    return promise;
  }

  // ---- 効果音(コードで合成する) ----

  playSfx(id: SfxId): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const minInterval = SFX_MIN_INTERVAL_SEC[id];
    if (minInterval !== undefined && now - (this.lastSfxAt.get(id) ?? -Infinity) < minInterval) return;
    this.lastSfxAt.set(id, now);

    switch (id) {
      case "shot":
        this.tone(now, { type: "square", from: 1400, to: 900, dur: 0.04, vol: 0.035 });
        break;
      case "heavyShot":
        // 強い弾の「ドゥン」
        this.tone(now, { type: "square", from: 420, to: 140, dur: 0.1, vol: 0.06 });
        break;
      case "blast":
        // 強い弾の爆発の「ボンッ」(ザコを倒した音より短く軽く)
        this.crunch(now, { dur: 0.22, vol: 0.28, rateFrom: 1.1, rateTo: 0.2 });
        break;
      case "hit":
        this.tone(now, { type: "triangle", from: 320, to: 180, dur: 0.05, vol: 0.12 });
        break;
      case "defeat":
        // ファミコン風の「ボフッ」という爆発音(BGMのファミコン風の曲になじむように)。
        // ザラザラしたノイズの音程を一気に下げていき、短い「ドン」を重ねて手ごたえを出す
        this.crunch(now, { dur: 0.38, vol: 0.4, rateFrom: 1.4, rateTo: 0.12 });
        this.tone(now, { type: "triangle", from: 180, to: 40, dur: 0.16, vol: 0.45 });
        break;
      case "laserCharge":
        // レーザーをためている「キュイーン」(音程が上がっていく)
        this.tone(now, { type: "sine", from: 300, to: 1500, dur: 0.75, vol: 0.08 });
        break;
      case "laser":
        // 太いレーザーの「ビーーッ」
        this.tone(now, { type: "sawtooth", from: 180, to: 150, dur: 0.9, vol: 0.07 });
        this.tone(now, { type: "square", from: 720, to: 600, dur: 0.9, vol: 0.03 });
        break;
      case "playerHit":
        this.noise(now, { dur: 0.45, vol: 0.4, filterFrom: 1800, filterTo: 150 });
        this.tone(now, { type: "sawtooth", from: 440, to: 55, dur: 0.5, vol: 0.14 });
        break;
      case "powerUp":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(now + i * 0.06, { type: "square", from: f, to: f, dur: 0.07, vol: 0.09 }));
        break;
      case "life":
        [784, 988, 1319].forEach((f, i) => this.tone(now + i * 0.09, { type: "triangle", from: f, to: f, dur: 0.14, vol: 0.2 }));
        break;
      case "warning":
        // ボスの予告(WARNING)を出している間、低い警報を4回鳴らす
        for (let i = 0; i < 4; i++) {
          this.tone(now + i * 0.55, { type: "square", from: 440, to: 440, dur: 0.22, vol: 0.09 });
          this.tone(now + i * 0.55 + 0.22, { type: "square", from: 330, to: 330, dur: 0.22, vol: 0.09 });
        }
        break;
      case "bossDefeat":
        this.noise(now, { dur: 1.6, vol: 0.5, filterFrom: 3000, filterTo: 80 });
        this.tone(now, { type: "sine", from: 160, to: 30, dur: 1.4, vol: 0.35 });
        break;
      case "gameOver":
        [392, 330, 262, 196].forEach((f, i) => this.tone(now + 0.3 + i * 0.22, { type: "triangle", from: f, to: f * 0.97, dur: 0.24, vol: 0.2 }));
        break;
    }
  }

  private tone(at: number, o: { type: OscillatorType; from: number; to: number; dur: number; vol: number }): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, at);
    if (o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, at + o.dur);
    // 鳴り始めと終わりに「プツッ」と入らないよう、音量をごく短く上げ下げする
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(o.vol, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + o.dur + 0.02);
  }

  // 爆発などのザーッという音。ノイズを、高い音から低い音へ移っていくフィルターに通す
  private noise(at: number, o: { dur: number; vol: number; filterFrom: number; filterTo: number }): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(o.filterFrom, at);
    filter.frequency.exponentialRampToValueAtTime(o.filterTo, at + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(o.vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    source.connect(filter).connect(gain).connect(bus);
    source.start(at, Math.random() * 0.5, o.dur);
  }

  // ファミコンのノイズのような、粗くザラザラした音。再生速度を下げていくと音程が下がって「ボフッ」と崩れる
  private crunch(at: number, o: { dur: number; vol: number; rateFrom: number; rateTo: number }): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.crunchBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.crunchBuffer;
    source.playbackRate.setValueAtTime(o.rateFrom, at);
    source.playbackRate.exponentialRampToValueAtTime(o.rateTo, at + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(o.vol, at);
    gain.gain.setValueAtTime(o.vol, at + o.dur * 0.15); // 出だしは大きいまま少し保って、勢いを出す
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    source.connect(gain).connect(bus);
    source.start(at, Math.random() * 0.5, o.dur * 2);
  }

  // ---- 内部: 鳴らせるようにする ----

  private unlock = (): void => {
    if (this.disposed) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOLUME;
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.master);
      this.noiseBuffer = this.createNoiseBuffer(ctx);
      this.crunchBuffer = this.createCrunchBuffer(ctx);
      // 曲はどれも小さいので、最初に全部読み込んでおいて切り替えで待たないようにする
      (Object.keys(TRACKS) as TrackId[]).forEach((id) => void this.loadTrack(id));
    }
    if (this.ctx.state === "suspended" && document.visibilityState === "visible") void this.ctx.resume();
    if (this.wantedMusic && !this.playing) this.startWantedMusic();
    // 一度鳴らせるようになれば、以降は見張らなくてよい
    if (this.ctx.state === "running") {
      UNLOCK_EVENTS.forEach((type) => window.removeEventListener(type, this.unlock, { capture: true }));
    }
  };

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // 同じ値を数サンプルずつ続けたノイズ。ふつうのノイズ(サーッ)より粗く、ファミコンっぽいザラザラした音になる
  private createCrunchBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const hold = Math.round(ctx.sampleRate / 4000);
    let value = 0;
    for (let i = 0; i < data.length; i++) {
      if (i % hold === 0) value = Math.random() < 0.5 ? -1 : 1;
      data[i] = value;
    }
    return buffer;
  }

  // ほかのタブに移ったら音を止め、戻ってきたら続きから鳴らす
  private onVisibilityChange = (): void => {
    if (!this.ctx) return;
    if (document.visibilityState === "hidden") void this.ctx.suspend();
    else void this.ctx.resume();
  };
}
