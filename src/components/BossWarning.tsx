// ザコを倒しきってからボスが降りてくるまでの間、画面中央に出す予告
export function BossWarning() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center gap-1">
      <div className="text-outline animate-pulse font-heading text-[40px] leading-none font-extrabold text-primary">WARNING!!</div>
      <div className="text-outline font-heading text-lg font-bold text-white">でかひなこが やってくる</div>
    </div>
  );
}
