/** One headline number on the dashboard. */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow">
      {/* A thin neon line along the top. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-red to-accent-2" />
      <p className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</p>
      <p className="font-display text-3xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
