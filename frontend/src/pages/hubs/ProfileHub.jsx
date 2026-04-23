import HubLayout from '../../components/HubLayout';

const TABS = [
  { to: 'me',           labelKey: 'profile.me' },
  { to: 'achievements', labelKey: 'profile.achievements' },
  { to: 'medals',       labelKey: 'profile.medals' },
];

export default function ProfileHub() {
  return <HubLayout tabs={TABS} />;
}
