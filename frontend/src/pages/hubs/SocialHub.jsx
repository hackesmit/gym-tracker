import HubLayout from '../../components/HubLayout';

const TABS = [
  { to: 'friends', labelKey: 'social.friends' },
  { to: 'chat',    labelKey: 'social.chat' },
];

export default function SocialHub() {
  return <HubLayout tabs={TABS} />;
}
