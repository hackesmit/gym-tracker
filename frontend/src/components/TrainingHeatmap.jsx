import { useMemo } from 'react';

export default function TrainingHeatmap({ calendarData }) {
  const { weeks, months } = useMemo(() => {
    const raw = Array.isArray(calendarData) ? calendarData : calendarData?.calendar || [];
    const counts = {};
    raw.forEach(s => {
      if (s.status === 'completed' || s.status === 'partial') {
        counts[s.date] = (counts[s.date] || 0) + 1;
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, dow: d.getDay(), count: counts[iso] || 0, month: d.getMonth() });
    }

    // Pad start so first day lands on correct row (0=Sun..6=Sat -> remap to Mon=0)
    const remapDow = d => (d === 0 ? 6 : d - 1); // Mon=0, Sun=6
    const padCount = remapDow(days[0].dow);
    const padded = Array(padCount).fill(null).concat(days);

    const cols = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }

    // Month labels: find first week where a month appears
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabels = [];
    let lastMonth = -1;
    cols.forEach((week, wi) => {
      const first = week.find(d => d != null);
      if (first && first.month !== lastMonth) {
        mLabels.push({ index: wi, label: monthNames[first.month] });
        lastMonth = first.month;
      }
    });

    return { weeks: cols, months: mLabels };
  }, [calendarData]);

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];

  const cellColor = count =>
    count === 0 ? 'bg-surface-light' : count === 1 ? 'bg-success/40' : 'bg-success/80';

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-0.5 min-w-max">
        {/* Month labels */}
        <div className="flex ml-7 gap-0.5">
          {weeks.map((_, wi) => {
            const m = months.find(m => m.index === wi);
            return (
              <div key={wi} className="w-[11px] text-[10px] text-text-muted leading-none">
                {m ? m.label : ''}
              </div>
            );
          })}
        </div>
        {/* Grid rows */}
        {dayLabels.map((label, row) => (
          <div key={row} className="flex items-center gap-0.5">
            <span className="w-6 text-[10px] text-text-muted text-right pr-1">{label}</span>
            {weeks.map((week, wi) => {
              const day = week[row];
              if (!day) return <div key={wi} className="w-[11px] h-[11px]" />;
              return (
                <div
                  key={wi}
                  title={`${day.date}: ${day.count} session${day.count !== 1 ? 's' : ''}`}
                  className={`w-[11px] h-[11px] rounded-[2px] ${cellColor(day.count)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
