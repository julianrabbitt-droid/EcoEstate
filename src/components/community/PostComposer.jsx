import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, MapPin, Send, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { stripImageMetadata, UnsupportedImageError } from '@/lib/stripImageMetadata';
import { Button } from '@/components/ui/button';

export default function PostComposer({ onPosted }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Optional city: puts the post on the community map at the city's centre.
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState([]);
  const [city, setCity] = useState(null); // { label, point }
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = cityQuery.trim();
    if (city || q.length < 3) {
      setCityResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await base44.functions.invoke('findCity', { query: q });
        if (!cancelled) setCityResults(data?.cities || []);
      } catch {
        if (!cancelled) setCityResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cityQuery, city]);

  const pickCity = (c) => {
    setCity(c);
    setCityQuery(c.label);
    setCityResults([]);
  };
  const clearCity = () => {
    setCity(null);
    setCityQuery('');
  };

  // A typed city that wasn't picked from the list: use the best match.
  const resolveCity = async () => {
    if (city || !cityQuery.trim()) return city;
    const { data } = await base44.functions.invoke('findCity', { query: cityQuery.trim() });
    const best = data?.cities?.[0];
    if (!best) throw new Error(`We couldn’t find “${cityQuery.trim()}”. Pick a city from the list or clear it.`);
    return best;
  };

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    const added = [];
    for (const original of files) {
      try {
        // Post photos are shown to other members: always drop metadata (GPS
        // included), refusing photos the browser can't re-encode.
        const file = await stripImageMetadata(original, { allowOriginal: false });
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
        added.push({ uri: file_uri, url: signed_url });
      } catch (err) {
        if (err instanceof UnsupportedImageError) setError(err.message);
        /* otherwise skip a failed upload */
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
      const place = await resolveCity();
      const me = await base44.auth.me();
      const name = me?.full_name || me?.email || 'Member';
      await base44.entities.Post.create({
        title: title.trim(),
        body: body.trim(),
        image_uris: photos.map((p) => p.uri),
        author_name: name,
        ...(place ? { city: place.label, mapPoint: place.point } : {}),
      });
      setTitle('');
      setBody('');
      setPhotos([]);
      clearCity();
      onPosted?.();
    } catch (e) {
      setError(e?.message?.startsWith('We couldn’t find') ? e.message : 'Could not post. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="surface p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Share your progress, e.g. Front yard, month 6"
        className="field h-11"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you do? How is it growing? Any surprises?"
        rows={3}
        className="field mt-3 resize-none"
      />
      <div className="relative mt-3">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={cityQuery}
          onChange={(e) => {
            setCity(null);
            setCityQuery(e.target.value);
          }}
          placeholder="City (optional), shows your post on the map"
          aria-label="City (optional)"
          className="field h-10 pl-9 pr-9"
          autoComplete="off"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {city && !searching && (
          <button type="button" onClick={clearCity} aria-label="Clear city" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {cityResults.length > 0 && (
          <ul role="listbox" aria-label="Matching cities" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {cityResults.map((c) => (
              <li key={c.label}>
                <button type="button" onClick={() => pickCity(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-secondary focus:bg-secondary focus:outline-none">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /> {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {city && <p className="mt-1 text-[11px] text-muted-foreground">Your post will appear on the community map at the centre of {city.label}, never at your address.</p>}
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