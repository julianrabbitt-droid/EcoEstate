import { useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const today = () => new Date().toISOString().slice(0, 10);
// Blank → null (undefined would be dropped from the JSON body).
const toNum = (v) => (v === '' || v == null ? null : Number(v));

function NumberField({ id, label, value, onChange, step = 'any', hint }) {
  return (
    <div>
      <Label htmlFor={id} className="text-[12px]">
        {label}
      </Label>
      <Input id={id} type="number" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      {hint && <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// "Add progress update" form. Saves a ProgressEntry, then syncs the tracked
// project's convertedSqft (and cover photo, if it has none) via onSaved.
export default function ProgressForm({ tracked, lastConverted, onSaved }) {
  const [date, setDate] = useState(today());
  const [converted, setConverted] = useState('');
  const [plants, setPlants] = useState('');
  const [spent, setSpent] = useState('');
  const [rebate, setRebate] = useState('');
  const [gallons, setGallons] = useState('');
  const [days, setDays] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]); // { uri, url }
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The entry, once created: a retry after the follow-up sync failed must not
  // create it again.
  const [created, setCreated] = useState(null);

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
        setError('One or more photos could not be uploaded.');
      }
    }
    setPhotos((prev) => [...prev, ...added]);
    setUploading(false);
    e.target.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving || uploading) return;
    const convertedNum = toNum(converted);
    if (convertedNum == null) {
      setError('Enter the total lawn converted so far.');
      return;
    }
    if (tracked.lawnSqft > 0 && convertedNum > tracked.lawnSqft) {
      setError(`That is more than the ${tracked.lawnSqft.toLocaleString()} sq ft of lawn on this property.`);
      return;
    }
    setSaving(true);
    setError('');
    let entry = created;
    try {
      if (!entry) {
        entry = await base44.entities.ProgressEntry.create({
        trackedId: tracked.id,
        date,
        convertedSqft: convertedNum,
        plantsInstalled: toNum(plants),
        spentUsd: toNum(spent),
        rebateUsd: toNum(rebate),
        waterGallons: toNum(gallons),
        waterDays: toNum(days),
        notes: notes.trim(),
        photoUris: photos.map((p) => p.uri),
        });
        setCreated(entry);
      }
    } catch (err) {
      setError(err?.message || 'Could not save this update. Try again.');
      setSaving(false);
      return;
    }
    try {
      await onSaved(entry, photos[photos.length - 1]?.uri);
      setCreated(null);
      setConverted('');
      setPlants('');
      setSpent('');
      setRebate('');
      setGallons('');
      setDays('');
      setNotes('');
      setPhotos([]);
    } catch (err) {
      setError(`Your update was saved, but the project total didn’t refresh (${err?.message || 'network error'}). Try again to finish.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="surface p-5">
      <h2 className="text-[15px] font-medium tracking-tight">Add progress update</h2>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Log what you have done so far. Only date and lawn converted are required.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="pe-date" className="text-[12px]">
            Date
          </Label>
          <Input id="pe-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1" required />
        </div>
        <NumberField
          id="pe-converted"
          label="Total lawn converted (sq ft)"
          value={converted}
          onChange={setConverted}
          hint={lastConverted ? `Cumulative. Last update: ${lastConverted.toLocaleString()} sq ft.` : 'Cumulative, not just this update.'}
        />
        <NumberField id="pe-plants" label="Plants installed (this update)" value={plants} onChange={setPlants} step="1" />
        <NumberField id="pe-spent" label="Money spent ($)" value={spent} onChange={setSpent} />
        <NumberField id="pe-rebate" label="Rebate received ($)" value={rebate} onChange={setRebate} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="pe-gal" label="Water used (gal)" value={gallons} onChange={setGallons} />
          <NumberField id="pe-days" label="Billing days" value={days} onChange={setDays} step="1" />
        </div>
      </div>

      <Label htmlFor="pe-notes" className="mt-3 block text-[12px]">
        Notes
      </Label>
      <Textarea id="pe-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" placeholder="What did you do? What worked?" />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {photos.map((p, i) => (
          <div key={p.uri} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="inline-flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
        </label>
      </div>

      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}
      <Button type="submit" disabled={saving || uploading} className="mt-4 rounded-full px-6">
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
          </>
        ) : created ? (
          'Finish saving'
        ) : (
          'Save update'
        )}
      </Button>
    </form>
  );
}
