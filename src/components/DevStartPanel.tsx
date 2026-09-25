import { MAX_SHOT_LEVEL, STAGES } from "../lib/constants";
import type { StartOptions } from "../lib/engine";

interface Props {
  value: Required<StartOptions>;
  onChange: (value: Required<StartOptions>) => void;
}

// 開発用: スタート画面で、始めるステージ(ザコ戦からかボス戦からか)と戦闘機の攻撃レベルを選ぶ(DEV_TOOLSの時だけ出す)。
// 途中から始めた回はハイスコアに残らない
export function DevStartPanel({ value, onChange }: Props) {
  const stages = STAGES.map((_, i) => i);
  const levels = Array.from({ length: MAX_SHOT_LEVEL }, (_, i) => i + 1);
  return (
    <div className="pointer-events-auto flex w-full max-w-[280px] flex-col gap-2 rounded-2xl border-2 border-dashed border-white/40 bg-black/30 p-3">
      <div className="font-heading text-xs font-bold text-white/70">開発用</div>
      <Row label="ステージ" options={stages} selected={value.stageIndex} format={(i) => `${i + 1}`} onSelect={(stageIndex) => onChange({ ...value, stageIndex })} />
      <Row
        label="始める所"
        options={[0, 1]}
        selected={value.startAtBoss ? 1 : 0}
        format={(o) => (o === 1 ? "ボス戦" : "ザコ戦")}
        onSelect={(o) => onChange({ ...value, startAtBoss: o === 1 })}
      />
      <Row label="攻撃レベル" options={levels} selected={value.shotLevel} format={(l) => `${l}`} onSelect={(shotLevel) => onChange({ ...value, shotLevel })} />
    </div>
  );
}

interface RowProps {
  label: string;
  options: number[];
  selected: number;
  format: (option: number) => string;
  onSelect: (option: number) => void;
}

function Row({ label, options, selected, format, onSelect }: RowProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 shrink-0 font-heading text-xs font-bold text-white">{label}</div>
      <div className="flex flex-1 gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === selected}
            className={`h-7 flex-1 cursor-pointer rounded-md border-0 font-heading text-sm font-bold transition-colors ${
              option === selected ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
            }`}
            onClick={() => onSelect(option)}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
