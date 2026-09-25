interface Props {
  name: string;
  percent: number; // 0〜100
}

// ボス戦中、ヘッダーのスコアの下に出す残りHP
export function BossHpBar({ name, percent }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <div className="truncate p-0.5 font-heading text-sm font-bold text-white text-outline">{name}</div>
      <div className="h-3 w-full overflow-hidden rounded-full border-2 border-white bg-white/20">
        <div className="h-full rounded-full bg-primary transition-[width] duration-100" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
