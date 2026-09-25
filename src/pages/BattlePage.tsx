import { LivesLabel } from "../components/LivesLabel";
import { BossHpBar } from "../components/BossHpBar";
import { BossWarning } from "../components/BossWarning";
import { StageBanner } from "../components/StageBanner";
import type { PageSlots } from "../components/BasePage";
import type { BossHp } from "../lib/engine";

interface Props {
  stage: number;
  stageBanner: string | null;
  score: number;
  lives: number;
  bossHps: BossHp[] | null;
  bossWarning: boolean;
  hintVisible: boolean;
}

export function BattlePage({ stage, stageBanner, score, lives, bossHps, bossWarning, hintVisible }: Props): PageSlots {
  return {
    header: (
      // 横長のPC画面でもスコアやHPが戦場から離れすぎないよう、幅に上限をつける
      <div className="flex w-full max-w-[480px] flex-col gap-1.5 px-6">
        <div className="flex items-center justify-between">
          <div className="font-heading text-2xl font-bold text-white text-outline">{score.toLocaleString()}</div>
          <LivesLabel lives={lives} />
        </div>
        {bossHps !== null ? (
          // 2体の時は、画面の左右の位置に合わせてゲージを横に並べる
          <div className="flex gap-3">
            {bossHps.map((hp, i) => (
              <div key={i} className="min-w-0 flex-1">
                <BossHpBar name={hp.name} percent={hp.percent} />
              </div>
            ))}
          </div>
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
