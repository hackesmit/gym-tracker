import HubLayout from '../../components/HubLayout';

const TABS = [
  { to: 'progress',  labelKey: 'stats.progress' },
  { to: 'analytics', labelKey: 'stats.analytics' },
  { to: 'history',   labelKey: 'stats.history' },
];

export default function StatsHub() {
  return <HubLayout tabs={TABS} />;
}
