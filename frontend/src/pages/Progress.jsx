import { useEffect, useState } from 'react';
import { TrendingUp, Search, Trophy, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { useApp } from '../context/AppContext';
import { getProgress, getSchedule, getExerciseCatalog } from '../api/client';
import { exportToCSV } from '../utils/export';

export default function Progress() {
  const { activeProgram, convert, unitLabel } = useApp();
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [muscleMap, setMuscleMap] = useState({});

  // Load exercise list from schedule + catalog for muscle grouping
  useEffect(() => {
    if (!activeProgram) return;
    Promise.all([
      getSchedule(activeProgram.id),
      getExerciseCatalog().catch(() => []),
    ]).then(([res, catalog]) => {
      const names = new Set();
      const schedule = res.schedule || {};
      Object.values(schedule).forEach((weekSessions) => {
        Object.values(weekSessions).forEach((exercises) => {
          exercises.forEach((ex) => {
            const name = ex.exercise_name || ex.exercise_name_canonical;
            if (name) names.add(name);
          });
        });
      });

      // Build muscle group lookup from catalog
      const mMap = {};
      (catalog || []).forEach((c) => {
        mMap[c.name] = c.muscle_group;
      });
      setMuscleMap(mMap);

      const sorted = [...names].sort();
      setExercises(sorted);
      if (sorted.length) setSelected(sorted[0]);
    }).catch(() => {});
  }, [activeProgram]);

  // Fetch progress data
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    getProgress(selected)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selected]);

  const filtered = exercises.filter((e) =>
    e.toLowerCase().includes(search.toLowerCase())
  );

  const chartData = data?.data_points?.map((dp) => ({
    date: dp.date,
    e1rm: convert(dp.best_e1rm),
    load: convert(dp.best_load),
  })) || [];

  const projections = data?.projections;
  const prs = data?.prs;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Progress</h2>

      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        {/* Exercise list */}
        <Card className="md:max-h-[calc(100vh-160px)] overflow-y-auto">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-surface-light border border-surface-lighter rounded-lg pl-8 pr-3 py-2 text-xs text-text focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-2">
            {(() => {
              // Group filtered exercises by muscle group
              const groups = {};
              filtered.forEach((ex) => {
                const muscle = muscleMap[ex] || 'Other';
                if (!groups[muscle]) groups[muscle] = [];
                groups[muscle].push(ex);
              });
              const sortedGroups = Object.keys(groups).sort((a, b) =>
                a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)
              );
              return sortedGroups.map((group) => (
                <div key={group}>
                  <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2.5 py-1 sticky top-0 bg-surface-dark">
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {groups[group].map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setSelected(ex)}
                        className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                          selected === ex ? 'bg-primary/15 text-primary-light font-medium' : 'text-text-muted hover:text-text hover:bg-surface-light'
                        }`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </Card>

        {/* Progress chart + data */}
        <div className="space-y-4">
          {loading ? <LoadingSpinner /> : !data ? (
            <Card>
              <p className="text-text-muted text-sm text-center py-8">
                {selected ? `No logged data for "${selected}" yet.` : 'Select an exercise to view progress.'}
              </p>
            </Card>
          ) : (
            <>
              {/* PR badges */}
              {prs && prs.all_time_e1rm && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Card>
                    <div className="flex items-center gap-2">
                      <Trophy size={16} className="text-warning" />
                      <div>
                        <div className="text-lg font-bold">{convert(prs.all_time_e1rm)} {unitLabel}</div>
                        <div className="text-[10px] text-text-muted">All-time e1RM</div>
                      </div>
                    </div>
                  </Card>
                  {prs.recent_4wk_e1rm && (
                    <Card>
                      <div className="text-lg font-bold">{convert(prs.recent_4wk_e1rm)} {unitLabel}</div>
                      <div className="text-[10px] text-text-muted">Recent best (4 wk)</div>
                    </Card>
                  )}
                  {prs.is_recent_pr && (
                    <Card>
                      <div className="text-sm font-medium text-success flex items-center gap-1">
                        <ArrowUpRight size={14} /> New PR!
                      </div>
                      <div className="text-[10px] text-text-muted">In the last 4 weeks</div>
                    </Card>
                  )}
                </div>
              )}

              {/* Chart */}
              <Card title={`Estimated 1RM - ${selected}`}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#363650" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit={` ${unitLabel}`} />
                      <Tooltip
                        contentStyle={{ background: '#1e1e2e', border: '1px solid #363650', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Line type="monotone" dataKey="e1rm" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="e1RM" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-text-muted text-sm text-center py-8">Need at least 2 data points for a chart.</p>
                )}
              </Card>

              {/* Projections */}
              {projections?.["4_weeks"] && (
                <Card title="Projections">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: '4 Week', value: projections["4_weeks"] },
                      { label: '8 Week', value: projections["8_weeks"] },
                      { label: '12 Week', value: projections["12_weeks"] },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="text-xs text-text-muted mb-1">{label}</div>
                        <div className="text-lg font-bold text-primary-light">
                          {value ? `${convert(value)} ${unitLabel}` : '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Raw data table */}
              <Card title="Logged Sets" action={
                data.data_points?.length > 0 && (
                  <button
                    onClick={() => exportToCSV(
                      data.data_points,
                      `progress_${selected.replace(/\s+/g, '_').toUpperCase()}`,
                      ['date', 'best_load', 'best_reps', 'best_e1rm']
                    )}
                    className="text-xs text-primary hover:text-primary-light flex items-center gap-1"
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                )
              }>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-surface-lighter">
                        <th className="text-left py-2 pr-4">Date</th>
                        <th className="text-right py-2 pr-4">Load</th>
                        <th className="text-right py-2 pr-4">Reps</th>
                        <th className="text-right py-2">e1RM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data_points?.slice(0, 20).map((dp, i) => (
                        <tr key={i} className="border-b border-surface-lighter/50">
                          <td className="py-1.5 pr-4 text-text-muted">{dp.date}</td>
                          <td className="py-1.5 pr-4 text-right">{convert(dp.best_load)} {unitLabel}</td>
                          <td className="py-1.5 pr-4 text-right">{dp.best_reps}</td>
                          <td className="py-1.5 text-right font-medium">{convert(dp.best_e1rm)} {unitLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
