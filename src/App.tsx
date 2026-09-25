import { BasePage } from "./components/BasePage";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SoundToggle } from "./components/SoundToggle";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { ResultPage } from "./pages/ResultPage";
import { useShootingEngine } from "./hooks/useShootingEngine";

function App() {
  const { canvasRef, state, muted, devStart, actions } = useShootingEngine();

  const slots =
    state.phase === "home"
      ? HomePage({ highScore: state.highScore, onStart: actions.startGame, devStart, onDevStartChange: actions.setDevStart })
      : state.phase === "playing"
        ? BattlePage({
            stage: state.stage,
            stageBanner: state.stageBanner,
            score: state.score,
            lives: state.lives,
            bossHps: state.bossHps,
            bossWarning: state.bossWarning,
            hintVisible: state.hintVisible,
          })
        : ResultPage({
            cleared: state.phase === "clear",
            stage: state.stage,
            score: state.score,
            highScore: state.highScore,
            isNewRecord: state.isNewRecord,
            onHome: actions.goHome,
            onRestart: actions.startGame,
          });

  return (
    <>
      <BasePage canvasRef={canvasRef} {...slots} />
      <SoundToggle muted={muted} onToggle={actions.toggleMuted} />
      <LoadingOverlay ready={state.assetsReady} />
    </>
  );
}

export default App;
