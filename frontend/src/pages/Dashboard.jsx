import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dumbbell, Heart, Trophy, Target,
  ArrowRight, AlertTriangle, RefreshCw,
} from 'lucide-react';
import Card from '../components/Card';
import JourneyProgress from '../components/JourneyProgress';
import ProgramUpload from '../components/ProgramUpload';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { getSummary, getTracker, getDeloadCheck, getWorkoutToday } from '../api/client';
import { MapScroll, Sword, Ring, Torch, Shield, Chronicle as ChronicleIcon } from '../components/LotrIcons';

/* ─── Wisdom of Middle-earth ─── */
const QUOTES = [
  // Epic / motivational (~60%)
  { text: 'A day may come when the courage of men fails\u2026 but it is not this day.', author: 'Aragorn' },
  { text: 'Deeds will not be less valiant because they are unpraised.', author: 'Aragorn' },
  { text: 'Faithless is he that says farewell when the road darkens.', author: 'Gimli' },
  { text: 'There is some good in this world, and it is worth fighting for.', author: 'Samwise' },
  { text: 'Even the smallest person can change the course of the future.', author: 'Galadriel' },
  { text: 'I would rather share one lifetime with you than face all the ages of this world alone.', author: 'Arwen' },
  { text: 'The world is indeed full of peril, and in it there are many dark places; but still there is much that is fair.', author: 'Haldir' },
  { text: 'It is not despair, for despair is only for those who see the end beyond all doubt. We do not.', author: 'Gandalf' },
  { text: 'I will not say: do not weep; for not all tears are an evil.', author: 'Gandalf' },
  { text: 'Courage is found in unlikely places.', author: 'Gildor' },
  { text: 'The burned hand teaches best. After that advice about fire goes to the heart.', author: 'Gandalf' },
  { text: 'It is useless to meet revenge with revenge: it will heal nothing.', author: 'Frodo' },
  // Wisdom / reflective (~35%)
  { text: 'All we have to decide is what to do with the time that is given us.', author: 'Gandalf' },
  { text: 'Not all those who wander are lost.', author: 'Bilbo' },
  { text: 'The road goes ever on and on.', author: 'Bilbo' },
  { text: 'Many that live deserve death. And some that die deserve life. Can you give it to them?', author: 'Gandalf' },
  { text: 'The wise speak only of what they know.', author: 'Gandalf' },
  { text: 'It is not the strength of the body, but the strength of the spirit.', author: 'Tolkien' },
  { text: 'Memory is not what the heart desires. That is only a mirror.', author: 'Gimli' },
  // Rare funny (~5%)
  { text: "Looks like meat's back on the menu, boys!", author: 'Uruk-hai' },
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

/* ─── PR type icon ─── */
function prIcon(type) {
  if (type === 'e1rm_pr') return <Ring size={18} className="text-accent" />;
  if (type === 'weight_pr') return <Sword size={18} className="text-dwarven-light" />;
  return <Trophy size={18} className="text-accent" />;
}

/* ─── Journey rank from total sessions ─── */
const JOURNEY_RANKS = [
  { min: 500, label: 'Bearer of the Ring' },
  { min: 200, label: 'Minas Tirith' },
  { min: 100, label: "Helm's Deep" },
  { min: 50,  label: 'Lothlórien' },
  { min: 25,  label: 'Misty Mountains' },
  { min: 10,  label: 'Rivendell' },
  { min: 1,   label: 'Bree' },
  { min: 0,   label: 'The Shire' },
];

function getJourneyRank(sessionCount) {
  return JOURNEY_RANKS.find(r => sessionCount >= r.min) || JOURNEY_RANKS[JOURNEY_RANKS.length - 1];
}

export default function Dashboard() {
  const { activeProgram, programs, convert, unitLabel } = useApp();
  const [summary, setSummary] = useState(null);
  const [tracker, setTracker] = useState(null);
  const [deload, setDeload] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(getDailyQuote);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t, d, tw] = await Promise.all([
          getSummary().catch(() => null),
          activeProgram ? getTracker(activeProgram.id).catch(() => null) : null,
          getDeloadCheck().catch(() => null),
          getWorkoutToday().catch(() => null),
        ]);
        setSummary(s);
        setTracker(t);
        setDeload(d);
        setTodayWorkout(tw);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeProgram]);

  if (loading) return <LoadingSpinner />;

  if (!programs.length) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card title="Get Started">
          <p className="text-text-muted text-sm mb-4">
            Import your training program spreadsheet to begin tracking.
          </p>
          <ProgramUpload />
        </Card>
      </div>
    );
  }

  const completionPct = tracker?.completed != null
    ? Math.round((tracker.completed / (tracker.total_sessions || 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ─── Header bar ─── */}
      <div className="heraldic-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src="/lotr/logo.jpg"
              alt=""
              width={48}
              height={48}
              className="rounded-full object-cover shrink-0 hidden sm:block"
            />
            <div className="min-w-0">
              <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-wide truncate">
                {activeProgram?.name || 'Dashboard'}
              </h2>
              <p className="text-xs text-accent font-display tracking-wider mt-0.5">
                Journey Rank: {getJourneyRank(tracker?.completed ?? 0).label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <div className="text-center hidden sm:block">
              <div className="text-lg font-bold text-text">{tracker?.current_streak ?? 0}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">Streak</div>
            </div>
            <div className="text-center hidden sm:block">
              <div className="text-lg font-bold text-text">
                {summary?.total_volume_kg != null
                  ? `${Math.round(convert(summary.total_volume_kg)).toLocaleString()}`
                  : '--'}
              </div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">Volume ({unitLabel})</div>
            </div>
            <Link to="/log" className="flex items-center gap-2 px-4 py-2.5 btn-gold text-sm">
              <Dumbbell size={16} /> Log
            </Link>
          </div>
        </div>
      </div>

      {/* ─── 1. Wisdom of Middle-earth ─── */}
      <div className="text-center py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-display font-semibold mb-3">
          Wisdom of Middle-earth
        </p>
        <p className="text-sm sm:text-base italic text-text/90 max-w-lg mx-auto leading-relaxed">
          &ldquo;{quote.text}&rdquo;
        </p>
        <p className="text-xs text-text-muted mt-2">&mdash; {quote.author}</p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <div className="flex-1 max-w-16 h-px bg-gradient-to-r from-transparent to-accent/30" />
          <button
            onClick={() => setQuote(getRandomQuote(quote))}
            className="text-text-muted/40 hover:text-accent transition-colors"
            title="Another quote"
          >
            <RefreshCw size={12} />
          </button>
          <div className="flex-1 max-w-16 h-px bg-gradient-to-l from-transparent to-accent/30" />
        </div>
      </div>

      {/* ─── 2. Today's Quest ─── */}
      {todayWorkout && (
        <div className="heraldic-card gold-trim p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <MapScroll size={16} className="text-accent shrink-0" />
                <p className="text-[10px] uppercase tracking-widest text-accent font-semibold font-display">Today's Quest</p>
              </div>
              <h3 className="text-lg font-bold text-text truncate">{todayWorkout.session_name}</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Week {todayWorkout.week} · {todayWorkout.exercises?.length || 0} exercises
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {todayWorkout.exercises?.slice(0, 5).map((ex, i) => (
                  <span key={i} className="text-[10px] bg-surface-light px-2 py-0.5 rounded text-text-muted">
                    {ex.exercise_name || ex.exercise_name_canonical}
                  </span>
                ))}
                {todayWorkout.exercises?.length > 5 && (
                  <span className="text-[10px] text-text-muted">+{todayWorkout.exercises.length - 5} more</span>
                )}
              </div>
            </div>
            <Link to="/log" className="shrink-0 flex items-center gap-2 px-4 py-2.5 btn-gold text-sm">
              <Dumbbell size={16} /> Start
            </Link>
          </div>
        </div>
      )}

      {/* ─── 3. Hall of Records (trophy cards) ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sword size={16} className="text-dwarven-light" />
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Hall of Records</h3>
          </div>
          <Link to="/achievements" className="text-xs text-accent hover:text-accent-light flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {summary?.recent_prs?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {summary.recent_prs.slice(0, 8).map((pr, i) => (
              <div key={i} className="forged-panel p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  {prIcon(pr.type)}
                  <span className="text-xs font-semibold text-text truncate">{pr.exercise}</span>
                </div>
                <p className="text-base font-bold text-text">
                  {convert(pr.e1rm)} <span className="text-xs font-normal text-text-muted">{unitLabel}</span>
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">e1RM</p>
              </div>
            ))}
          </div>
        ) : (
          <Card variant="dwarven">
            <p className="text-text-muted text-sm">No recent records. Keep forging ahead.</p>
          </Card>
        )}
      </section>

      {/* ─── 4. This Week ─── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-secondary-light" />
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">This Week</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            icon={<Dumbbell size={16} />}
            label="Sessions"
            value={tracker?.completed ?? summary?.total_sets_logged ?? 0}
            color="text-accent-light"
          />
          <KpiCard
            icon={<Target size={16} />}
            label="Exercises"
            value={summary?.unique_exercises_logged ?? 0}
            color="text-secondary-light"
          />
          <KpiCard
            icon={<Torch size={16} className="text-dwarven-light" />}
            label="Streak"
            value={tracker?.current_streak ?? 0}
            color="text-dwarven-light"
          />
        </div>
      </section>

      {/* Deload warning */}
      {deload?.deload_recommended && (
        <div className="stone-panel accent-left-bronze p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-warning mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-warning uppercase tracking-wider mb-2">
                Deload Recommended
              </h3>
              <ul className="text-sm text-text-muted space-y-1 mb-3">
                {deload.reasons?.map((r, i) => (
                  <li key={i}>&middot; {r}</li>
                ))}
              </ul>
              {deload.stagnated_exercises?.length > 0 && (
                <p className="text-xs text-text-muted mb-2">
                  Stagnated: {deload.stagnated_exercises.join(', ')}
                </p>
              )}
              {deload.suggestion && (
                <p className="text-sm font-medium">{deload.suggestion}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. Journey + Recovery ─── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Program progress */}
        {activeProgram && tracker && (
          <Card title="The Journey" variant="parchment">
            <JourneyProgress sessionCount={tracker?.completed ?? 0} />
            <div className="mt-3 pt-3 border-t border-surface-lighter flex items-center justify-between text-xs text-text-muted">
              <span>Week {tracker.current_week} of {tracker.total_weeks || activeProgram.total_weeks}</span>
              <span className="text-accent-light font-medium">{completionPct}% program complete</span>
            </div>
          </Card>
        )}

        {/* Recovery */}
        <Card title="Recovery Status" variant="rivendell" action={
          <Link to="/recovery" className="text-xs text-rivendell hover:text-rivendell-light flex items-center gap-1">
            Details <ArrowRight size={12} />
          </Link>
        }>
          <div className="text-center py-4">
            <div className={`text-4xl font-bold ${
              summary?.recovery_score >= 70 ? 'text-success' :
              summary?.recovery_score >= 40 ? 'text-warning' : 'text-danger'
            }`}>
              {summary?.recovery_score != null ? Math.round(summary.recovery_score) : '--'}
            </div>
            <p className="text-xs text-text-muted mt-2">
              {summary?.recovery_recommendation || 'Log body metrics for recovery insights'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`${color} opacity-80`}>{icon}</div>
        <div>
          <div className="text-lg font-bold">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
        </div>
      </div>
    </Card>
  );
}
