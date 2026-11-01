export default function ScanStat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-[15px] leading-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
