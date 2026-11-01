import { useEffect, useRef, useState } from 'react';
import { Upload, Wand2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { plantById } from '@/data/nativePlants';

// Deterministic before/after: instead of an AI image generation, we composite a
// mulch band and a lattice of plant dots (colored from the user's palette) over
// the uploaded photo on a canvas. No model call — the "after" view is built
// locally from the chosen species.
export default function PhotoCompare({ entries = [] }) {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [proposed, setProposed] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [slider, setSlider] = useState(50);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);
  const localUrls = useRef([]);
  const { isAuthenticated } = useAuth();

  // Release guests' local photo URLs when leaving the page.
  useEffect(() => () => localUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const palette = entries.map((e) => plantById(e.speciesId)).filter(Boolean);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError('');
    setUploadError('');
    const added = [];
    let failed = 0;
    for (const file of files) {
      // Guests can't upload; keep the photo in this tab only.
      if (!isAuthenticated) {
        const url = URL.createObjectURL(file);
        localUrls.current.push(url);
        added.push({ url, name: file.name });
        continue;
      }
      try {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
        added.push({ url: signed_url, name: file.name });
      } catch {
        failed++;
      }
    }
    if (failed) setUploadError(`${failed === files.length ? 'Upload failed' : `${failed} of ${files.length} photos didn’t upload`}. Please try again.`);
    if (added.length) {
      setPhotos((prev) => [...prev, ...added]);
      setSelected((prev) => prev || added[0].url);
      setProposed(null);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const renderProposed = async () => {
    if (!selected) return;
    setRendering(true);
    setError('');
    setProposed(null);
    try {
      const res = await fetch(selected);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const maxW = 900;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const bandTop = Math.round(h * 0.55);
        ctx.fillStyle = 'rgba(92, 70, 48, 0.55)';
        ctx.fillRect(0, bandTop, w, h - bandTop);
        ctx.fillStyle = 'rgba(150, 120, 86, 0.22)';
        ctx.fillRect(0, bandTop, w, Math.max(1, Math.round((h - bandTop) * 0.25)));

        const dotColors = palette.map((p) => p.color).filter(Boolean);
        const colors = dotColors.length ? dotColors : ['#b8452f', '#9a7a3a', '#d9a441'];
        const spacing = 26;
        let i = 0;
        for (let y = bandTop + 14; y < h - 8; y += spacing) {
          const offset = (Math.round(y / spacing) % 2) * (spacing / 2);
          for (let x = 8 + offset; x < w - 8; x += spacing) {
            ctx.beginPath();
            ctx.arc(x, y, 7 + (i % 3) * 2, 0, Math.PI * 2);
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = 0.92;
            ctx.fill();
            ctx.globalAlpha = 1;
            i++;
          }
        }

        URL.revokeObjectURL(url);
        setProposed(canvas.toDataURL('image/jpeg', 0.92));
        setSlider(50);
        setRendering(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setRendering(false);
        setError('Could not build the overlay from that photo.');
      };
      img.src = url;
    } catch {
      setRendering(false);
      setError('Could not build the overlay from that photo.');
    }
  };

  const current = photos.find((p) => p.url === selected);

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-full">
          <Upload className="mr-2 h-4 w-4" />
          Upload current photos
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {isAuthenticated ? 'Stored privately · used once to overlay the proposed planting.' : 'Kept on this device only · used to overlay the proposed planting.'}
        </span>
      </div>
      {uploadError && <p role="alert" className="mt-2 text-[11.5px] text-destructive">{uploadError}</p>}

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => {
                setSelected(p.url);
                setProposed(null);
              }}
              className={`relative h-16 w-16 overflow-hidden rounded-lg border ${
                selected === p.url ? 'border-primary' : 'border-border'
              }`}
            >
              <img src={p.url} className="h-full w-full object-cover" alt={p.name} />
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="mt-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-secondary">
            <img src={current.url} className="absolute inset-0 h-full w-full object-cover" alt="Current landscape" />
            {proposed && (
              <>
                <img
                  src={proposed}
                  className="absolute inset-0 h-full w-full object-cover"
                  alt="Proposed native design"
                  style={{ clipPath: `inset(0 ${100 - slider}% 0 0)` }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-white/90"
                  style={{ left: `${slider}%` }}
                  aria-hidden
                />
                <span className="absolute left-3 top-3 rounded-full bg-foreground/70 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.14em] text-background">
                  Proposed
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-foreground/70 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.14em] text-background">
                  Current
                </span>
              </>
            )}
            {!proposed && (
              <span className="absolute left-3 top-3 rounded-full bg-foreground/70 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.14em] text-background">
                Current
              </span>
            )}
          </div>

          {proposed ? (
            <input
              type="range"
              min={0}
              max={100}
              value={slider}
              onChange={(e) => setSlider(Number(e.target.value))}
              className="garden-slider mt-3 w-full"
              aria-label="Before / after"
            />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={renderProposed} disabled={rendering} className="rounded-full">
                <Wand2 className="mr-2 h-4 w-4" />
                {rendering ? 'Overlaying…' : 'Overlay the proposed planting'}
              </Button>
              {error && <p className="text-[11.5px] text-destructive">{error}</p>}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            The proposed view is sketched from your plant palette as a mulch bed with a planting lattice — no AI image generation.
          </p>
        </div>
      )}
    </div>
  );
}