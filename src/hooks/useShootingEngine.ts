import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ShootingEngine, type EngineState } from "../lib/engine";
import { PLAYER_START_LIVES, STAGES } from "../lib/constants";

export function useShootingEngine() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShootingEngine | null>(null);
  const [state, setState] = useState<EngineState>({
    phase: "home",
    score: 0,
    lives: PLAYER_START_LIVES,
    shotLevel: 1,
    stage: 1,
    stageBanner: null,
    killsUntilBoss: STAGES[0].killsBeforeBoss,
    bossName: "",
    bossHpPercent: null,
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
    const engine = new ShootingEngine(setState);
    engineRef.current = engine;
    if (canvasRef.current) engine.init(canvasRef.current);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const startGame = useCallback(() => engineRef.current?.startGame(), []);
  const goHome = useCallback(() => engineRef.current?.goHome(), []);

  // useEffect依存配列でactions全体を使えるよう、参照を安定させる
  const actions = useMemo(() => ({ startGame, goHome }), [startGame, goHome]);

  return { canvasRef, state, actions };
}
