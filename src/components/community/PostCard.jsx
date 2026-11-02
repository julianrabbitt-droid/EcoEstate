import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Flag, Leaf, Loader2, MapPin, MessageCircle, Send, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ConfirmProvider';

function timeOf(d) {
  try {
    return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

const n = (v) => (v == null ? '—' : Number(v).toLocaleString());
const usd = (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`);

// A member's project, as shared: a summary only (the server keeps nothing
// else), with the details one tap away.
function SharedProject({ p }) {
  const [open, setOpen] = useState(false);
  const stats = [
    ['Lawn converted', p.lawnSqft ? `${n(p.lawnSqft)} sq ft` : null],
    ['Native plants', p.plantCount ? n(p.plantCount) : p.plants?.length ? `${p.plants.length} species` : null],
    ['Water saved', p.gallonsSaved ? `${n(p.gallonsSaved)} gal/yr` : null],
    ['Saved a year', p.annualSavings ? usd(p.annualSavings) : null],
  ].filter(([, v]) => v);
  return (
    <div className="mx-5 mt-3 rounded-xl border border-border bg-secondary/40 p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-accent"><Leaf className="h-3.5 w-3.5" aria-hidden /> Shared project{p.city ? ` · ${p.city}` : ''}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="font-display text-[1.1rem] leading-tight">{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium underline-offset-4 hover:underline">
        {open ? 'Show less' : 'See the project'} <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-[12.5px]">
          {p.arrangement && <p><span className="text-muted-foreground">Arrangement:</span> {p.arrangement}</p>}
          {p.plants?.length > 0 && (
            <div>
              <p className="text-muted-foreground">Plants</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {p.plants.map((x) => (
                  <li key={x.name} className="rounded-full border border-border bg-background px-2.5 py-0.5">{x.name}{x.count ? ` ×${x.count}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {[
              ['Install cost', usd(p.installCost)],
              ['Rebates', usd(p.rebate)],
              ['Payback', p.paybackYears ? `${p.paybackYears} yrs` : '—'],
              ['CO₂ drawn down', p.co2PerYear ? `${n(p.co2PerYear)} lb/yr` : '—'],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="text-[11px] text-muted-foreground">Estimates from the member’s EcoEstate scan. Addresses and exact locations are never shared.</p>
        </div>
      )}
    </div>
  );
}

export default function PostCard({ post, me, onDelete }) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
      // First name only: members never see each other's names, and an email is never stored.
      const name = (me?.full_name || '').trim().split(/\s+/)[0] || 'Member';
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
    if (!(await confirm({ title: 'Delete this post?', description: 'Its comments will no longer be shown.', confirmLabel: 'Delete post' }))) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await base44.entities.Post.delete(post.id);
      onDelete?.(post.id);
    } catch (e) {
      setDeleteError(e?.message || 'Couldn’t delete this post. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const messageAuthor = () => {
    navigate(`/messages?to=${post.created_by_id}&name=${encodeURIComponent(post.author_name || 'Member')}`);
  };

  return (
    <article id={`post-${post.id}`} className="surface scroll-mt-24 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[15px] font-medium leading-tight">{post.title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {(isMine || me?.role === 'admin') ? (post.author_name || 'Member') : 'Member'} · {timeOf(post.created_date)}
            {post.city && <> · <MapPin className="mb-0.5 inline h-3 w-3" aria-hidden /> {post.city}</>}
          </p>
        </div>
        {isMine && (
          <button type="button" onClick={remove} disabled={deleting} className="text-muted-foreground hover:text-destructive" aria-label="Delete post">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {deleteError && <p role="alert" className="px-5 pt-2 text-[11.5px] text-destructive">{deleteError}</p>}

      {post.body && <p className="px-5 pt-2 text-[13px] leading-relaxed text-foreground/90">{post.body}</p>}
      {post.project && <SharedProject p={post.project} />}

      {images.length > 0 && (
        // Whole photos, never cropped: one photo at its own shape, several in a
        // grid, each letterboxed inside its cell.
        <div className={`mt-3 grid gap-2 px-5 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Progress photo ${i + 1}`}
              className={`w-full rounded-lg bg-secondary object-contain ${images.length > 1 ? 'aspect-[4/3]' : 'max-h-[520px]'}`}
            />
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
        {!isMine && (
          // Reports go to the owner with the post's id; nothing about the reporter is added.
          <Button asChild variant="ghost" size="sm" className={`rounded-full text-muted-foreground ${me?.id ? '' : 'ml-auto'}`}>
            <a href={`mailto:support@ecoestate.org?subject=${encodeURIComponent(`Report post ${post.id}`)}&body=${encodeURIComponent('What breaks the community rules in this post?\n\n')}`}>
              <Flag className="mr-1.5 h-3.5 w-3.5" /> Report
            </a>
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
              {comments.length === 0 && <li className="text-[11.5px] text-muted-foreground">No comments yet. Start the conversation.</li>}
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