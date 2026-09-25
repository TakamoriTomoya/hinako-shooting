import { CenterSlot } from "../components/CenterSlot";
import { VersionLabel } from "../components/VersionLabel";
import { DevStartPanel } from "../components/DevStartPanel";
import type { PageSlots } from "../components/BasePage";
import { DEV_TOOLS } from "../lib/constants";
import type { StartOptions } from "../lib/engine";

interface Props {
  highScore: number;
  onStart: () => void;
  devStart: Required<StartOptions>;
  onDevStartChange: (value: Required<StartOptions>) => void;
}

// pages/ はマウント/アンマウントされる画面コンポーネントではなく、
// 「このフェーズならBasePageの3スロットに何を入れるか」を決める関数。
// canvasはBasePage側に1つだけ存在し続けるので、画面切り替えで再生成されない。
export function HomePage({ highScore, onStart, devStart, onDevStartChange }: Props): PageSlots {
  return {
    header: (
      <div className="grid w-full grid-cols-[30%_60%_10%] items-center px-6">
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div className="flex justify-center">
          <VersionLabel />
        </div>
      </div>
    ),
    center: (
      <CenterSlot>
        ひなこ
        <br />
        シューティング
      </CenterSlot>
    ),
    bottom: (
      <div className="flex w-full -translate-y-12 flex-col items-center gap-3 px-6">
        {DEV_TOOLS && <DevStartPanel value={devStart} onChange={onDevStartChange} />}
        {highScore > 0 && (
          <div className="font-heading text-sm font-bold text-white text-outline">ハイスコア {highScore.toLocaleString()}</div>
        )}
        <button
          type="button"
          className="pointer-events-auto w-full max-w-[280px] cursor-pointer rounded-full border-0 bg-green py-4 font-heading text-lg font-bold text-white shadow-[0_4px_0_var(--color-green-shadow)] transition-transform duration-100 hover:bg-green-hover active:scale-[0.96]"
          onClick={onStart}
        >
          スタート
        </button>
      </div>
    ),
  };
}
