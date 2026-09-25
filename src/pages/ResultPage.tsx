import { CenterSlot } from "../components/CenterSlot";
import { GameOverControls } from "../components/GameOverControls";
import { BackButton } from "../components/BackButton";
import type { PageSlots } from "../components/BasePage";

interface Props {
  cleared: boolean;
  stage: number; // やられた時にいたステージ
  score: number;
  highScore: number;
  isNewRecord: boolean;
  onHome: () => void;
  onRestart: () => void;
}

export function ResultPage({ cleared, stage, score, highScore, isNewRecord, onHome, onRestart }: Props): PageSlots {
  return {
    header: <BackButton onClick={onHome} />,
    center: (
      <>
        <CenterSlot>
          {cleared ? (
            <>
              ひなこを
              <br />
              たおした！
            </>
          ) : (
            <>
              STAGE {stage} で
              <br />
              やられた…
            </>
          )}
        </CenterSlot>
        <div className="pointer-events-none absolute inset-x-0 top-[46%] flex flex-col items-center gap-2 px-4">
          <p className="rounded-full bg-bg-cream/95 px-5 py-2 text-center font-heading text-lg font-bold text-text-dark shadow-[0_4px_0_rgba(0,0,0,0.08)]">
            スコア {score.toLocaleString()}
          </p>
          <p className="font-heading text-sm font-bold text-white text-outline">
            {isNewRecord ? "ハイスコア更新！" : `ハイスコア ${highScore.toLocaleString()}`}
          </p>
        </div>
      </>
    ),
    bottom: <GameOverControls onRestart={onRestart} />,
  };
}
