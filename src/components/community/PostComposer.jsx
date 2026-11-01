import { useState } from 'react';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function PostComposer({ onPosted }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    const added = [];
    for (const file of files) {
      try {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
        added.push({ uri: file_uri, url: signed_url });
      } catch {
        /* skip a failed upload */
      }
    }
    setPhotos((prev) => [...prev, ...added]);
    setUploading(false);
    e.target.value = '';
  };

  const removePhoto = (i) => setPhotos((prev) => prev.filter((_, j) => j !== i));

  const submit = async () => {
    if (!title.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const me = await base44.auth.me();
      const name = me?.full_name || me?.email || 'Member';
      await base44.entities.Post.create({
        title: title.trim(),
        body: body.trim(),
        image_uris: photos.map((p) => p.uri),
        author_name: name,
      });
      setTitle('');
      setBody('');
      setPhotos([]);
      onPosted?.();
    } catch {
      setError('Could not post. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="surface p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Share your progress — e.g. Front yard, month 6"
        className="field h-11"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you do? How is it growing? Any surprises?"
        rows={3}
        className="field mt-3 resize-none"
      />
      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-0.5 top-0.5 rounded-full bg-foreground/70 p-0.5 text-background"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground hover:border-primary/30">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : 'Add photos'}
          <input type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
        </label>
        <Button onClick={submit} disabled={!title.trim() || sending || uploading} className="ml-auto rounded-full">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Post to community
        </Button>
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">Progress photos are stored privately and only shown in the community feed.</p>
      {error && <p className="mt-1 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}