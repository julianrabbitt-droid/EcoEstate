import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function threadId(a, b) {
  return [a, b].sort().join('|');
}
function timeOf(d) {
  try {
    return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function Messages() {
  const [params] = useSearchParams();
  const [me, setMe] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const m = await base44.auth.me();
        if (cancelled) return;
        setMe(m);
        const { items } = await base44.entities.Message.filter(
          { $or: [{ to_user_id: m.id }, { created_by_id: m.id }] },
          { sort: 'created_date', limit: 200 }
        );
        if (cancelled) return;
        setMessages(items);
        const to = params.get('to');
        if (to) setSelected(threadId(m.id, to));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const threads = useMemo(() => {
    const map = new Map();
    messages.forEach((msg) => {
      const tid = msg.thread_id || threadId(msg.created_by_id, msg.to_user_id);
      if (!map.has(tid)) map.set(tid, { id: tid, messages: [] });
      map.get(tid).messages.push(msg);
    });
    const arr = Array.from(map.values());
    arr.forEach((t) => t.messages.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
    return arr.sort(
      (a, b) =>
        new Date(b.messages[b.messages.length - 1].created_date) - new Date(a.messages[a.messages.length - 1].created_date)
    );
  }, [messages]);

  const peerOf = (t) => {
    const sample = t.messages[0];
    if (!sample) return { id: params.get('to'), name: params.get('name') || 'Member' };
    const imSender = sample.created_by_id === me?.id;
    return imSender ? { id: sample.to_user_id, name: sample.to_name } : { id: sample.created_by_id, name: sample.from_name };
  };

  const active = useMemo(() => {
    if (selected) {
      const found = threads.find((t) => t.id === selected);
      if (found) return found;
      return { id: selected, messages: [], _new: true };
    }
    return threads[0] || null;
  }, [threads, selected]);

  useEffect(() => {
    if (!me || !active || active._new) return;
    const hasUnread = active.messages.some((m) => m.to_user_id === me.id && !m.read);
    if (!hasUnread) return;
    base44.entities.Message
      .updateMany({ thread_id: active.id, to_user_id: me.id, read: false }, { $set: { read: true } })
      .then(() => {
        setMessages((prev) =>
          prev.map((m) => (m.thread_id === active.id && m.to_user_id === me.id ? { ...m, read: true } : m))
        );
      })
      .catch(() => {});
  }, [active, me]);

  const send = async () => {
    if (!draft.trim() || !active || sending || !me) return;
    const peer = active._new
      ? { id: params.get('to'), name: params.get('name') || 'Member' }
      : peerOf(active);
    if (!peer?.id) return;
    setSending(true);
    try {
      const name = me.full_name || me.email || 'Member';
      const created = await base44.entities.Message.create({
        thread_id: active.id,
        to_user_id: peer.id,
        to_name: peer.name,
        from_name: name,
        body: draft.trim(),
        read: false,
      });
      setMessages((prev) => [...prev, created]);
      setDraft('');
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[260px_1fr] lg:items-start">
        <aside className="surface max-h-[560px] overflow-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-[12.5px] text-muted-foreground">
              No conversations yet. Message someone from a community post.
            </p>
          ) : (
            <ul>
              {threads.map((t) => {
                const peer = peerOf(t);
                const last = t.messages[t.messages.length - 1];
                const unread = t.messages.some((m) => m.to_user_id === me.id && !m.read);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(t.id)}
                      className={cn(
                        'flex w-full flex-col gap-0.5 border-b border-border/60 px-4 py-3 text-left transition',
                        active?.id === t.id ? 'bg-secondary/60' : 'hover:bg-secondary/40'
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium">{peer.name}</span>
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">{last?.body || ''}</span>
                      <span className="text-[10px] text-muted-foreground">{timeOf(last?.created_date)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="surface flex h-[560px] flex-col">
          {!active ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[12.5px] text-muted-foreground">
              No conversation selected.
            </div>
          ) : (
            <>
              <div className="border-b border-border/70 px-4 py-3">
                <p className="text-[13px] font-medium">
                  {active._new ? params.get('name') || 'New conversation' : peerOf(active).name}
                </p>
              </div>
              <div className="flex-1 space-y-2 overflow-auto px-4 py-4">
                {(active.messages || []).map((m) => {
                  const mine = m.created_by_id === me.id;
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[78%] rounded-2xl px-3.5 py-2 text-[12.5px]',
                          mine ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                        )}
                      >
                        <p className="leading-relaxed">{m.body}</p>
                        <p className={cn('mt-0.5 text-[9.5px]', mine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          {timeOf(m.created_date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {active._new && <p className="text-center text-[11px] text-muted-foreground">Say hello to start the conversation.</p>}
              </div>
              <div className="flex items-center gap-2 border-t border-border/70 px-3 py-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send();
                  }}
                  placeholder="Write a message…"
                  className="field h-11 flex-1"
                />
                <Button onClick={send} disabled={!draft.trim() || sending} className="rounded-full" size="icon">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}