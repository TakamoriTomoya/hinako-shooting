import { PLAYER_START_LIVES } from "../lib/constants";
import { HeartIcon } from "./icons";

interface Props {
  lives: number;
}

// ヘッダー右側の残りライフ。失ったぶんは薄く残して、あといくつ残っているかをひと目でわかるようにする
export function LivesLabel({ lives }: Props) {
  return (
    <div className="flex gap-1" aria-label={`のこりライフ ${lives}`}>
      {Array.from({ length: PLAYER_START_LIVES }, (_, i) => (
        <HeartIcon key={i} size={22} className={i < lives ? "text-primary" : "text-white/50"} />
      ))}
    </div>
  );
}
