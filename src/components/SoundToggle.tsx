import { SoundOffIcon, SoundOnIcon } from "./icons";

interface Props {
  muted: boolean;
  onToggle: () => void;
}

// 音のオン/オフ。どの画面でも同じ場所(左下)に出す。ホームのスタートや結果画面の「もう一度」とは重ならない位置
export function SoundToggle({ muted, onToggle }: Props) {
  return (
    <button
      type="button"
      className="pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/15 text-white transition-transform duration-100 hover:bg-white/25 active:scale-[0.92]"
      aria-label={muted ? "音を出す" : "音を消す"}
      aria-pressed={muted}
      onClick={onToggle}
    >
      {muted ? <SoundOffIcon size={20} /> : <SoundOnIcon size={20} />}
    </button>
  );
}
