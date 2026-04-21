import { useEffect, useRef, useState } from 'react';
import { Trophy, Send } from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getChatMessages, sendChatMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

const LAST_SEEN_KEY = 'gym-chat-last-seen-id';

export default function Chat() {
  const { user } = useAuth();
  const t = useT();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const markSeen = (msgs) => {
    if (!msgs.length) return;
    const lastId = msgs[msgs.length - 1].id;
    try { localStorage.setItem(LAST_SEEN_KEY, String(lastId)); } catch { /* ignore */ }
  };

  const loadInitial = async () => {
    try {
      const res = await getChatMessages();
      setMessages(res.messages || []);
      markSeen(res.messages || []);
    } catch (ex) {
      setErr(ex.message || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  const poll = async () => {
    if (!messages.length) return;
    const afterId = messages[messages.length - 1].id;
    try {
      const res = await getChatMessages(afterId);
      const fresh = res.messages || [];
      if (fresh.length) {
        setMessages((m) => {
          const next = [...m, ...fresh];
          markSeen(next);
          return next;
        });
      }
    } catch { /* ignore transient */ }
  };

  useEffect(() => { loadInitial(); }, []);

  useEffect(() => {
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await sendChatMessage(content);
      setMessages((m) => {
        const next = [...m, msg];
        markSeen(next);
        return next;
      });
      setInput('');
    } catch (ex) {
      setErr(ex.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">
        {t('chat.title', 'Global Chat')}
      </h2>
      <Card>
        <div
          ref={scrollRef}
          className="h-[60vh] overflow-y-auto space-y-2 pr-1"
        >
          {messages.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">
              {t('chat.empty', 'No messages yet. Start the conversation.')}
            </p>
          )}
          {messages.map((m) => (
            <Message key={m.id} msg={m} isMine={m.user_id === user?.id} />
          ))}
        </div>

        {err && <p className="text-sm text-danger mt-2">{err}</p>}

        <form onSubmit={send} className="flex gap-2 mt-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder', 'Type a message…')}
            maxLength={1000}
            className="flex-1 bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-surface font-medium text-sm disabled:opacity-50 flex items-center gap-1"
          >
            <Send size={16} />
            {t('chat.send', 'Send')}
          </button>
        </form>
      </Card>
    </div>
  );
}

function Message({ msg, isMine }) {
  const when = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (msg.kind === 'system') {
    return (
      <div className="flex items-start gap-2 text-xs text-accent bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
        <Trophy size={14} className="mt-0.5 shrink-0" />
        <span className="flex-1">{msg.content}</span>
        <span className="text-text-muted text-[10px] shrink-0">{when}</span>
      </div>
    );
  }
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 ${isMine ? 'bg-accent/20 border border-accent/40' : 'bg-surface-light border border-surface-lighter'}`}>
        <div className="flex items-baseline gap-2 text-[11px] text-text-muted mb-0.5">
          <span className="font-medium text-text">{msg.username || msg.name || 'user'}</span>
          <span>{when}</span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
      </div>
    </div>
  );
}
