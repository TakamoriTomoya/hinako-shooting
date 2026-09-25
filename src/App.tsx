import { BasePage } from "./components/BasePage";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { ResultPage } from "./pages/ResultPage";
import { useShootingEngine } from "./hooks/useShootingEngine";

function App() {
  const { canvasRef, state, actions } = useShootingEngine();

  const slots =
    state.phase === "home"
      ? HomePage({ highScore: state.highScore, onStart: actions.startGame })
      : state.phase === "playing"
        ? BattlePage({
            stage: state.stage,
            stageBanner: state.stageBanner,
            score: state.score,
            lives: state.lives,
            killsUntilBoss: state.killsUntilBoss,
            bossName: state.bossName,
            bossHpPercent: state.bossHpPercent,
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
      <LoadingOverlay ready={state.assetsReady} />
    </>
  );
}

export default App;
