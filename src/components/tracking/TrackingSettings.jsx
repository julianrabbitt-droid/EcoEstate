import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const toNum = (v) => (v === '' ? null : Number(v));

// Water price, pre-conversion baseline and community-map sharing.
export default function TrackingSettings({ tracked, onSave }) {
  const [price, setPrice] = useState(tracked.waterPricePer1000Gal ?? '');
  const [baseline, setBaseline] = useState(tracked.baselineGallonsPerMonth ?? '');
  const [share, setShare] = useState(!!tracked.shareOnMap);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await onSave({ waterPricePer1000Gal: toNum(price), baselineGallonsPerMonth: toNum(baseline), shareOnMap: share });
      setSaved(true);
    } catch (e) {
      setError(e?.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface p-5">
      <h2 className="text-[15px] font-medium tracking-tight">Settings</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ts-price" className="text-[12px]">Water price ($ per 1,000 gal)</Label>
          <Input id="ts-price" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
          <p className="mt-1 text-[10.5px] text-muted-foreground">On your water bill. Used to turn gallons into dollars.</p>
        </div>
        <div>
          <Label htmlFor="ts-base" className="text-[12px]">Typical monthly water use before converting (gal)</Label>
          <Input id="ts-base" type="number" min="0" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="mt-1" />
          <p className="mt-1 text-[10.5px] text-muted-foreground">Enables measured savings when you log water bills.</p>
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <Label htmlFor="ts-share" className="text-[13px] font-medium">Share on community map</Label>
          <p className="mt-0.5 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
            Only an approximate location (about 1 km) and your first name are shown. Your address and photos stay private.
          </p>
        </div>
        <Switch id="ts-share" checked={share} onCheckedChange={setShare} />
      </div>
      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="rounded-full px-6">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save settings
        </Button>
        {saved && <span className="text-[12px] text-muted-foreground">Saved</span>}
      </div>
    </section>
  );
}
