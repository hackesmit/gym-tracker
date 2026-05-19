import { useEffect, useRef, useState } from 'react';
import { Trophy, Send, Hash, Plus } from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getChatMessages, getChatRooms, sendChatMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

const LAST_SEEN_KEY = 'gym-chat-last-seen-id';

export default function Chat() {
  const { user } = useAuth();
  const t = useT();

  const [rooms, setRooms] = useState([{ name: 'general', message_count: 0, last_message_at: null, last_message_preview: '' }]);
  const [activeRoom, setActiveRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // New room input
  const [newRoomInput, setNewRoomInput] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);

  const scrollRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;

  const markSeen = (msgs) => {
    if (!msgs.length) return;
    const lastId = msgs[msgs.length - 1].id;
    try { localStorage.setItem(LAST_SEEN_KEY, String(lastId)); } catch { /* ignore */ }
  };

  const loadRooms = async () => {
    try {
      const res = await getChatRooms();
      const fetched = res.rooms || [];
      // Always ensure general is present
      const hasGeneral = fetched.some((r) => r.name === 'general');
      if (!hasGeneral) {
        fetched.unshift({ name: 'general', message_count: 0, last_message_at: null, last_message_preview: '' });
      }
      setRooms(fetched);
    } catch { /* ignore transient */ }
  };

  const loadMessages = async (room) => {
    setLoading(true);
    setMessages([]);
    try {
      const res = await getChatMessages(undefined, room);
      const msgs = res.messages || [];
      setMessages(msgs);
      markSeen(msgs);
    } catch (ex) {
      setErr(ex.message || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  const poll = async () => {
    const current = messagesRef.current;
    const room = activeRoomRef.current;
    if (!current.length) return;
    const afterId = current[current.length - 1].id;
    try {
      const res = await getChatMessages(afterId, room);
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

  // Initial load
  useEffect(() => {
    loadRooms();
    loadMessages('general');
  }, []);

  // Poll messages every 5s
  useEffect(() => {
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll rooms every 30s
  useEffect(() => {
    const id = setInterval(loadRooms, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const switchRoom = (name) => {
    if (name === activeRoom) return;
    setActiveRoom(name);
    activeRoomRef.current = name;
    setErr('');
    loadMessages(name);
  };

  const send = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await sendChatMessage(content, activeRoom);
      setMessages((m) => {
        const next = [...m, msg];
        markSeen(next);
        return next;
      });
      setInput('');
      // Refresh rooms so last_message_preview updates
      loadRooms();
    } catch (ex) {
      setErr(ex.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const createRoom = (e) => {
    e.preventDefault();
    const name = newRoomInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    setShowNewRoom(false);
    setNewRoomInput('');
    // The room is auto-created on first message — just switch to it
    const alreadyExists = rooms.some((r) => r.name === name);
    if (!alreadyExists) {
      setRooms((prev) => [
        ...prev,
        { name, message_count: 0, last_message_at: null, last_message_preview: '' },
      ]);
    }
    switchRoom(name);
  };

  const formatRoomTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">
        {t('chat.title', 'Global Chat')}
      </h2>

      <div className="flex gap-3 h-[70vh]">
        {/* Rooms sidebar */}
        <div className="w-44 sm:w-52 shrink-0 flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
              {t('chat.rooms', 'Rooms')}
            </span>
            <button
              onClick={() => setShowNewRoom((v) => !v)}
              className="p-0.5 rounded hover:bg-surface-light text-text-muted hover:text-accent transition-colors"
              title={t('chat.newRoom', 'New room')}
            >
              <Plus size={14} />
            </button>
          </div>

          {showNewRoom && (
            <form onSubmit={createRoom} className="flex gap-1 mb-1">
              <input
                autoFocus
                value={newRoomInput}
                onChange={(e) => setNewRoomInput(e.target.value)}
                placeholder={t('chat.newRoom', 'New room')}
                maxLength={64}
                className="flex-1 min-w-0 bg-surface-light border border-surface-lighter rounded px-2 py-1 text-xs"
              />
              <button type="submit" className="px-2 py-1 rounded bg-accent text-surface text-xs font-medium">
                +
              </button>
            </form>
          )}

          <div className="flex-1 overflow-y-auto space-y-0.5">
            {rooms.map((room) => (
              <button
                key={room.name}
                onClick={() => switchRoom(room.name)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex flex-col gap-0.5 ${
                  room.name === activeRoom
                    ? 'bg-accent/20 border border-accent/40 text-accent'
                    : 'hover:bg-surface-light text-text-muted hover:text-text'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Hash size={11} className="shrink-0 opacity-60" />
                  <span className="font-medium truncate flex-1">{room.name}</span>
                  {room.last_message_at && (
                    <span className="text-[10px] opacity-60 shrink-0">
                      {formatRoomTime(room.last_message_at)}
                    </span>
                  )}
                </div>
                {room.last_message_preview && (
                  <p className="text-[10px] opacity-50 truncate pl-4 leading-tight">
                    {room.last_message_preview}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Messages panel */}
        <Card className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Room header */}
          <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-surface-lighter shrink-0">
            <Hash size={14} className="text-accent" />
            <span className="font-semibold text-sm">{activeRoom}</span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {messages.length === 0 && (
                <p className="text-sm text-text-muted text-center py-8">
                  {t('chat.noMessages', 'No messages in this room yet.')}
                </p>
              )}
              {messages.map((m) => (
                <Message key={m.id} msg={m} isMine={m.user_id === user?.id} />
              ))}
            </div>
          )}

          {err && <p className="text-sm text-danger mt-2 shrink-0">{err}</p>}

          <form onSubmit={send} className="flex gap-2 mt-3 shrink-0">
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
              className="px-4 py-2 rounded-lg bg-accent text-surface font-medium text-sm disabled:opacity-50 flex items-center gap-1 shrink-0"
            >
              <Send size={16} />
              {t('chat.send', 'Send')}
            </button>
          </form>
        </Card>
      </div>
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
