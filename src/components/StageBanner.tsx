interface Props {
  text: string;
}

// ステージの始めの「STAGE 2」や、ボスを倒した時の「STAGE CLEAR!」を画面中央に大きく出す
export function StageBanner({ text }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
      <div className="text-outline font-heading text-[40px] leading-none font-extrabold text-white">{text}</div>
    </div>
  );
}
