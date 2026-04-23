import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dumbbell, Trophy, Target, ArrowRight, RefreshCw,
  Calendar, Flame, Award,
} from 'lucide-react';
import Card from '../components/Card';
import ProgramUpload from '../components/ProgramUpload';
import ImportSharedProgram from '../components/ImportSharedProgram';
import NippardPresetPicker from '../components/NippardPresetPicker';
import LoadingSpinner from '../components/LoadingSpinner';
import RankBadge from '../components/RankBadge';
import { useApp } from '../context/AppContext';
import { getDashboard } from '../api/client';
import { MapScroll, Sword, Ring, Torch } from '../components/LotrIcons';
import { useT } from '../i18n';

const QUOTES = [
  { text: 'A day may come when the courage of men fails… but it is not this day.', author: 'Aragorn' },
  { text: 'All we have to decide is what to do with the time that is given us.', author: 'Gandalf' },
  { text: 'Not all those who wander are lost.', author: 'Bilbo' },
  { text: 'Even the smallest person can change the course of the future.', author: 'Galadriel' },
  { text: 'There is some good in this world, and it is worth fighting for.', author: 'Samwise' },
  { text: 'It is not the strength of the body, but the strength of the spirit.', author: 'Tolkien' },
];

function getDailyQuote() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return QUOTES[dayIndex % QUOTES.length];
}
function getRandomQuote(exclude) {
  let q;
  do { q = QUOTES[Math.floor(Math.random() * QUOTES.length)]; } while (q === exclude && QUOTES.length > 1);
  return q;
}

function prIcon(type, lotr) {
  if (type === 'e1rm_pr') return lotr
    ? <Ring size={18} className="text-accent" />
    : <Award size={18} className="text-accent" />;
  if (type === 'weight_pr') return lotr
    ? <Sword size={18} className="text-accent" />
    : <Trophy size={18} className="text-accent" />;
  return <Trophy size={18} className="text-accent" />;
}

export default function Dashboard() {
  const { programs, convert, unitLabel, themeMode } = useApp();
  const lotr = themeMode === 'lotr';
  const t = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [quote, setQuote] = useState(getDailyQuote);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((ex) => setErr(ex.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (!programs.length && !data?.today_quest) {
    const reloadAfterPick = () => { window.location.reload(); };
    return (
      <div className="max-w-md mx-auto mt-12 space-y-4">
        <Card title={t('dashboard.getStarted')}>
          <p className="text-text-muted text-sm mb-4">
            {t('dashboard.getStartedDesc')}
          </p>
          <NippardPresetPicker onImported={reloadAfterPick} />
          <div className="pt-3 mt-3 border-t border-surface-lighter">
            <p className="text-xs text-text-muted mb-2">Upload your own program (.xlsx)</p>
            <ProgramUpload />
          </div>
          <div className="pt-3 mt-3 border-t border-surface-lighter">
            <p className="text-xs text-text-muted mb-2">Have a share code from a friend?</p>
            <ImportSharedProgram />
          </div>
        </Card>
      </div>
    );
  }

  const today = data?.today_quest;
  const week = data?.week_stats || {};
  const prs = data?.recent_prs || [];
  const medalSummary = data?.medal_summary || {};
  const medals = Array.isArray(medalSummary) ? medalSummary : (medalSummary.top_medals || []);
  const rawRanks = data?.muscle_ranks;
  // Backend returns array [{group, rank, score}] — normalize to {group: {rank, score}}
  const ranks = Array.isArray(rawRanks)
    ? Object.fromEntries(rawRanks.map((r) => [r.group || r.muscle_group, { rank: r.rank, score: r.score }]))
    : (rawRanks || {});
  const feed = data?.feed || [];

  // Top 3 muscle ranks
  const topRanks = Object.entries(ranks)
    .filter(([, v]) => v && v.rank)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {err && <p className="text-sm text-danger">{err}</p>}

      {/* Wisdom (LOTR mode only — quotes are all Tolkien-attributed) */}
      {lotr && (
        <div className="text-center py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold mb-3">{t('dashboard.wisdom')}</p>
          <p className="text-sm sm:text-base italic text-text/90 max-w-lg mx-auto leading-relaxed">
            &ldquo;{quote.text}&rdquo;
          </p>
          <p className="text-xs text-text-muted mt-2">— {quote.author}</p>
          <button
            onClick={() => setQuote(getRandomQuote(quote))}
            className="mt-2 text-text-muted/50 hover:text-accent"
            title="Another quote"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {/* Today's Quest / Today's Workout */}
      {today && (
        <div className="heraldic-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {lotr
                  ? <MapScroll size={16} className="text-accent shrink-0" />
                  : <Calendar size={16} className="text-accent shrink-0" />}
                <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
                  {lotr ? t('dashboard.todaysQuest') : t('dashboard.todaysWorkout')}
                </p>
              </div>
              <h3 className="text-lg font-bold text-text truncate">{today.session_name}</h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t('common.week')} {today.week} · {today.exercises?.length || 0} {t('common.exercises').toLowerCase()}
              </p>
            </div>
            <Link to="/log" className="shrink-0 flex items-center gap-2 px-4 py-2.5 btn-gold text-sm">
              <Dumbbell size={16} /> {t('dashboard.start')}
            </Link>
          </div>
        </div>
      )}

      {/* This Week */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-secondary-light" />
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">{t('dashboard.thisWeek')}</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={t('common.sessions')} value={week.sessions ?? 0} />
          <Kpi label={t('common.volume')} value={week.volume_kg != null ? Math.round(convert(week.volume_kg)).toLocaleString() : '0'} suffix={unitLabel} />
          <Kpi label={t('common.streak')} value={week.streak_days ?? week.streak ?? 0} icon={lotr ? <Torch size={14} className="text-accent" /> : <Flame size={14} className="text-accent" />} />
        </div>
      </section>

      {/* Medals + Muscle ranks */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t('dashboard.medalShowcase')} action={<Link to="/profile/medals" className="text-xs text-accent flex items-center gap-1">{t('common.all')} <ArrowRight size={12} /></Link>}>
          {medals.length ? (
            <ul className="space-y-2">
              {medals.slice(0, 3).map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Trophy size={14} className="text-accent" />
                  <span className="flex-1 truncate">{m.name || m.label}</span>
                  {m.value != null && <span className="text-xs text-text-muted">{m.value}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{t('dashboard.noMedals')}</p>
          )}
        </Card>

        <Card title={t('dashboard.muscleRanks')} action={<Link to="/profile" className="text-xs text-accent flex items-center gap-1">{t('nav.profile')} <ArrowRight size={12} /></Link>}>
          {topRanks.length ? (
            <ul className="space-y-2 text-sm">
              {topRanks.map(([muscle, v]) => {
                const rank = typeof v === 'string' ? v : v.rank;
                const subIdx = typeof v === 'object' ? (v.sub_index ?? 0) : 0;
                const subLabel = typeof v === 'object' ? (v.sub_label ?? 'V') : 'V';
                const fullRank = rank === 'Champion' ? 'Champion' : `${rank} ${subLabel}`;
                return (
                  <li key={muscle} className="flex items-center gap-2">
                    <RankBadge rank={rank || 'Copper'} subIndex={subIdx} size={28} />
                    <span className="capitalize text-text-muted flex-1">{muscle}</span>
                    <span className="font-medium text-xs">{fullRank}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{t('dashboard.noRanks')}</p>
          )}
        </Card>
      </div>

      {/* Recent PRs */}
      {prs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {lotr ? <Sword size={16} className="text-accent" /> : <Trophy size={16} className="text-accent" />}
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">{t('dashboard.recentPRs')}</h3>
            </div>
            <Link to="/profile/achievements" className="text-xs text-accent flex items-center gap-1">
              {t('common.viewAll')} <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {prs.slice(0, 8).map((pr, i) => (
              <div key={i} className="stone-panel p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  {prIcon(pr.type, lotr)}
                  <span className="text-xs font-semibold text-text truncate">{pr.exercise}</span>
                </div>
                <p className="text-base font-bold text-text">
                  {convert(pr.e1rm)} <span className="text-xs font-normal text-text-muted">{unitLabel}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feed */}
      {feed.length > 0 && (
        <Card title="Recent feed">
          <ul className="divide-y divide-surface-lighter">
            {feed.slice(0, 5).map((e, i) => {
              const p = e.payload || {};
              const label = p.message || p.medal_name || p.rank || e.event_type?.replace(/_/g, ' ');
              return (
                <li key={e.id || i} className="py-2 text-sm flex justify-between">
                  <span className="capitalize">{label}</span>
                  <span className="text-xs text-text-muted">{e.user_id}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, suffix, icon }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-lg font-bold">{value}{suffix ? <span className="text-xs font-normal text-text-muted ml-1">{suffix}</span> : null}</div>
          <div className="text-xs text-text-muted">{label}</div>
        </div>
      </div>
    </Card>
  );
}
