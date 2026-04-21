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
import { getProgress, getSchedule, getExerciseCatalog, getStrengthStandards } from '../api/client';
import { exportToCSV } from '../utils/export';
import { useT } from '../i18n';

export default function Progress() {
  const { activeProgram, convert, unitLabel } = useApp();
  const t = useT();
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [muscleMap, setMuscleMap] = useState({});
  const [strengthGrades, setStrengthGrades] = useState({});

  // Load exercise list from schedule + catalog for muscle grouping
  useEffect(() => {
    if (!activeProgram) return;
    Promise.all([
      getSchedule(activeProgram.id),
      getExerciseCatalog().catch(() => []),
      getStrengthStandards().catch(() => null),
    ]).then(([res, catalog, standards]) => {
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

      // Build reverse lookup: exercise name → strength grade
      const grades = {};
      if (standards?.lifts) {
        Object.entries(standards.lifts).forEach(([category, info]) => {
          if (info.source_exercise && info.classification) {
            grades[info.source_exercise.toUpperCase()] = {
              category,
              classification: info.classification,
              percentile: info.percentile_estimate,
              confidence: info.confidence?.label,
              ratio: info.ratio,
              isStale: info.is_stale,
            };
          }
        });
      }
      setStrengthGrades(grades);

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

  // Strength standard grade for selected exercise (case-insensitive match)
  const strengthGrade = selected ? strengthGrades[selected.toUpperCase()] : null;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{t('progress.title')}</h2>

      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        {/* Exercise list */}
        <Card className="md:max-h-[calc(100vh-160px)] overflow-y-auto">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('progress.search')}
              className="w-full bg-surface-light border border-surface-lighter rounded-lg pl-8 pr-3 py-2 text-xs text-text focus:ring-1 focus:ring-accent outline-none"
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
                          selected === ex ? 'bg-accent/15 text-accent-light font-medium' : 'text-text-muted hover:text-text hover:bg-surface-light'
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
                {selected ? t('progress.noDataForX').replace('{name}', selected) : t('progress.selectExercise')}
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
                        <div className="text-[10px] text-text-muted">{t('progress.allTimeE1RM')}</div>
                      </div>
                    </div>
                  </Card>
                  {prs.recent_4wk_e1rm && (
                    <Card>
                      <div className="text-lg font-bold">{convert(prs.recent_4wk_e1rm)} {unitLabel}</div>
                      <div className="text-[10px] text-text-muted">{t('progress.recentBest')}</div>
                    </Card>
                  )}
                  {prs.is_recent_pr && (
                    <Card>
                      <div className="text-sm font-medium text-success flex items-center gap-1">
                        <ArrowUpRight size={14} /> {t('progress.newPR')}
                      </div>
                      <div className="text-[10px] text-text-muted">{t('progress.newPRDesc')}</div>
                    </Card>
                  )}
                  {strengthGrade && (
                    <Card>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          strengthGrade.classification === 'elite' ? 'bg-accent' :
                          strengthGrade.classification === 'advanced' ? 'bg-success' :
                          strengthGrade.classification === 'intermediate' ? 'bg-info' :
                          strengthGrade.classification === 'novice' ? 'bg-secondary' :
                          'bg-text-muted'
                        }`} />
                        <div>
                          <div className="text-sm font-bold capitalize">{strengthGrade.classification}</div>
                          <div className="text-[10px] text-text-muted capitalize">{strengthGrade.category} · {strengthGrade.ratio?.toFixed(2)}{t('progress.xBW')}</div>
                        </div>
                      </div>
                      {strengthGrade.isStale && (
                        <div className="text-[9px] text-warning mt-1">{t('progress.staleNotice')}</div>
                      )}
                    </Card>
                  )}
                </div>
              )}

              {/* Strength standard (standalone if no PR data) */}
              {strengthGrade && !(prs && prs.all_time_e1rm) && (
                <Card>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      strengthGrade.classification === 'elite' ? 'bg-accent' :
                      strengthGrade.classification === 'advanced' ? 'bg-success' :
                      strengthGrade.classification === 'intermediate' ? 'bg-info' :
                      strengthGrade.classification === 'novice' ? 'bg-secondary' :
                      'bg-text-muted'
                    }`} />
                    <div>
                      <div className="text-sm font-bold capitalize">{strengthGrade.classification}</div>
                      <div className="text-[10px] text-text-muted capitalize">
                        {t('progress.strengthStandard')} · {strengthGrade.category} · {strengthGrade.ratio?.toFixed(2)}{t('progress.xBW')}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Chart */}
              <Card title={`${t('progress.estOneRM')} - ${selected}`}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-lighter)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} unit={` ${unitLabel}`} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-lighter)', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: 'var(--color-text-muted)' }}
                      />
                      <Line type="monotone" dataKey="e1rm" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} name="e1RM" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-text-muted text-sm text-center py-8">{t('progress.needMoreData')}</p>
                )}
              </Card>

              {/* Projections */}
              {projections?.["4_weeks"] && (
                <Card title={t('progress.projections')}>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: t('progress.4week'), value: projections["4_weeks"] },
                      { label: t('progress.8week'), value: projections["8_weeks"] },
                      { label: t('progress.12week'), value: projections["12_weeks"] },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="text-xs text-text-muted mb-1">{label}</div>
                        <div className="text-lg font-bold text-accent-light">
                          {value ? `${convert(value)} ${unitLabel}` : '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Raw data table */}
              <Card title={t('progress.loggedSets')} action={
                data.data_points?.length > 0 && (
                  <button
                    onClick={() => exportToCSV(
                      data.data_points,
                      `progress_${selected.replace(/\s+/g, '_').toUpperCase()}`,
                      ['date', 'best_load', 'best_reps', 'best_e1rm']
                    )}
                    className="text-xs text-accent hover:text-accent-light flex items-center gap-1"
                  >
                    <Download size={12} />
                    {t('progress.exportCsv')}
                  </button>
                )
              }>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-surface-lighter">
                        <th className="text-left py-2 pr-4">{t('progress.date')}</th>
                        <th className="text-right py-2 pr-4">{t('progress.load')}</th>
                        <th className="text-right py-2 pr-4">{t('progress.reps')}</th>
                        <th className="text-right py-2">{t('progress.e1rm')}</th>
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
