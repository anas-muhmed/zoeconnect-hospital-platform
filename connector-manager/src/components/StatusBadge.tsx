export default function StatusBadge({ ok, okLabel, failLabel }: { ok: boolean; okLabel: string; failLabel: string }) {
  return (
    <span className={`badge ${ok ? 'ok' : 'fail'}`}>
      <span className="dot" />
      {ok ? okLabel : failLabel}
    </span>
  );
}
