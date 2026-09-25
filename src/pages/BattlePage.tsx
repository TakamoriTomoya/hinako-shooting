import { LivesLabel } from "../components/LivesLabel";
import { BossHpBar } from "../components/BossHpBar";
import { BossWarning } from "../components/BossWarning";
import { StageBanner } from "../components/StageBanner";
import type { PageSlots } from "../components/BasePage";

interface Props {
  stage: number;
  stageBanner: string | null;
  score: number;
  lives: number;
  bossName: string;
  bossHpPercent: number | null;
  bossWarning: boolean;
  hintVisible: boolean;
}

export function BattlePage({ stage, stageBanner, score, lives, bossName, bossHpPercent, bossWarning, hintVisible }: Props): PageSlots {
  return {
    header: (
      // 横長のPC画面でもスコアやHPが戦場から離れすぎないよう、幅に上限をつける
      <div className="flex w-full max-w-[480px] flex-col gap-1.5 px-6">
        <div className="flex items-center justify-between">
          <div className="font-heading text-2xl font-bold text-white text-outline">{score.toLocaleString()}</div>
          <LivesLabel lives={lives} />
        </div>
        {bossHpPercent !== null ? (
          <BossHpBar name={bossName} percent={bossHpPercent} />
        ) : (
          <div className="font-heading text-sm font-bold text-white text-outline">
            STAGE {stage}
          </div>
        )}
      </div>
    ),
    center: bossWarning ? <BossWarning /> : stageBanner && <StageBanner text={stageBanner} />,
    bottom: hintVisible && (
      <div className="animate-pulse font-heading text-lg font-bold text-white text-outline">ドラッグ / 矢印キーで いどう</div>
    ),
  };
}
