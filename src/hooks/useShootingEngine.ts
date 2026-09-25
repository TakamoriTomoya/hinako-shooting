import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ShootingEngine, type EngineState, type StartOptions } from "../lib/engine";
import { loadMuted, SoundManager } from "../lib/sound";
import { DEV_TOOLS, PLAYER_START_LIVES } from "../lib/constants";

export function useShootingEngine() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShootingEngine | null>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const [muted, setMutedState] = useState(loadMuted);
  const [state, setState] = useState<EngineState>({
    phase: "home",
    score: 0,
    lives: PLAYER_START_LIVES,
    shotLevel: 1,
    stage: 1,
    stageBanner: null,
    bossHps: null,
    bossWarning: false,
    hintVisible: false,
    highScore: 0,
    isNewRecord: false,
    assetsReady: false,
  });

  // useEffectだとブラウザが一度ペイントした後に実行されるため、
  // 初期状態(canvasの初期サイズ300x150)がごく一瞬見えてしまうことがある。
  // useLayoutEffectでペイント前に実サイズへ張り直す。
  useLayoutEffect(() => {
    const sound = new SoundManager();
    soundRef.current = sound;
    const engine = new ShootingEngine(setState, sound);
    engineRef.current = engine;
    if (canvasRef.current) engine.init(canvasRef.current);
    return () => {
      engine.dispose();
      sound.dispose();
      engineRef.current = null;
      soundRef.current = null;
    };
  }, []);

  // 開発用のスタート設定(ステージ・攻撃レベル)。結果画面の「もう一度」でも同じ設定で始める
  const [devStart, setDevStart] = useState<Required<StartOptions>>({ stageIndex: 0, shotLevel: 1, startAtBoss: false });
  const startGame = useCallback(() => engineRef.current?.startGame(DEV_TOOLS ? devStart : {}), [devStart]);
  const goHome = useCallback(() => engineRef.current?.goHome(), []);
  const toggleMuted = useCallback(() => {
    const sound = soundRef.current;
    if (!sound) return;
    sound.setMuted(!sound.isMuted());
    setMutedState(sound.isMuted());
  }, []);

  // useEffect依存配列でactions全体を使えるよう、参照を安定させる
  const actions = useMemo(() => ({ startGame, goHome, toggleMuted, setDevStart }), [startGame, goHome, toggleMuted]);

  return { canvasRef, state, muted, devStart, actions };
}
