import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

function timeOf(d) {
  try {
    return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function PostCard({ post, me, onDelete }) {
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMine = me?.id && post.created_by_id === me.id;

  useEffect(() => {
    let cancelled = false;
    const uris = post.image_uris || [];
    if (!uris.length) {
      setImages([]);
      return;
    }
    Promise.all(
      uris.map((uri) =>
        base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 }).then((r) => r.signed_url).catch(() => null)
      )
    ).then((urls) => {
      if (!cancelled) setImages(urls.filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [post.image_uris]);

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      setLoadingComments(true);
      try {
        const { items } = await base44.entities.Comment.filter({ post_id: post.id }, { sort: 'created_date', limit: 100 });
        setComments(items);
      } catch {
        /* ignore */
      } finally {
        setLoadingComments(false);
      }
    }
  };

  const addComment = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const name = me?.full_name || me?.email || 'Member';
      const created = await base44.entities.Comment.create({ post_id: post.id, body: draft.trim(), author_name: name });
      setComments((prev) => [...prev, created]);
      setDraft('');
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await base44.entities.Post.delete(post.id);
      onDelete?.(post.id);
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  const messageAuthor = () => {
    navigate(`/messages?to=${post.created_by_id}&name=${encodeURIComponent(post.author_name || 'Member')}`);
  };

  return (
    <article className="surface overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[15px] font-medium leading-tight">{post.title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {(isMine || me?.role === 'admin') ? (post.author_name || 'Member') : 'Member'} · {timeOf(post.created_date)}
          </p>
        </div>
        {isMine && (
          <button type="button" onClick={remove} disabled={deleting} className="text-muted-foreground hover:text-destructive" aria-label="Delete post">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {post.body && <p className="px-5 pt-2 text-[13px] leading-relaxed text-foreground/90">{post.body}</p>}

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-1 px-5 sm:grid-cols-3">
          {images.map((src, i) => (
            <img key={i} src={src} alt={`Progress photo ${i + 1}`} className="h-36 w-full rounded-lg object-cover" />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border/70 px-5 py-2.5">
        <Button variant="ghost" size="sm" onClick={toggleComments} className="rounded-full text-muted-foreground">
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
          Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
        </Button>
        {!isMine && me?.id && (
          <Button variant="ghost" size="sm" onClick={messageAuthor} className="ml-auto rounded-full text-muted-foreground">
            <Send className="mr-1.5 h-3.5 w-3.5" /> Message
          </Button>
        )}
      </div>

      {showComments && (
        <div className="border-t border-border/70 bg-secondary/30 px-5 py-3">
          {loadingComments ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading comments…
            </div>
          ) : (
            <ul className="space-y-2.5">
              {comments.length === 0 && <li className="text-[11.5px] text-muted-foreground">No comments yet — start the conversation.</li>}
              {comments.map((c) => {
                const cMine = c.created_by_id === me?.id || me?.role === 'admin';
                return (
                  <li key={c.id} className="text-[12.5px]">
                    <span className="font-medium">{cMine ? (c.author_name || 'Member') : 'Member'}</span>{' '}
                    <span className="text-muted-foreground">· {timeOf(c.created_date)}</span>
                    <p className="mt-0.5 leading-relaxed text-foreground/90">{c.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addComment();
              }}
              placeholder="Add a comment…"
              className="field h-10 flex-1"
            />
            <Button onClick={addComment} disabled={!draft.trim() || sending} className="rounded-full" size="sm">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}