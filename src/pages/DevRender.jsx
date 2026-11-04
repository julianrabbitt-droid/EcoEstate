import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Garden3DView from '@/components/Garden3DView';
import { projectFromScan } from '@/lib/scanProject';
import { designOrDefault } from '@/lib/landscapeMath';

// Development only: a saved scan (scripts/city-test.mjs output, served
// locally) drawn in the 3D view exactly as the app would, for reviewing many
// scans' renders side by side with the real property.
//   /dev/render?src=http://127.0.0.1:8767/torrance&n=12&view=design
//   (&real=1: in Real 3D, as the app shows it; &qa=1: Google's own 3D, uncut and without the model;
//   &dollars=1200&gallons=30000&co2=12000&years=1: the Payoff step's stacks for those savings)
export default function DevRender() {
  const [params] = useSearchParams();
  const src = params.get('src');
  const n = params.get('n');
  const view = params.get('view') || 'design';
  // qa=1: Google's 3D world, uncut and without the model, from the same view (for comparing).
  const qa = params.get('qa') === '1';
  const real = qa || params.get('real') === '1';
  const dollars = Number(params.get('dollars')) || 0;
  const gallons = Number(params.get('gallons')) || 30000;
  const years = Number(params.get('years')) || 1;
  const co2 = Number(params.get('co2')) || 0;
  const payoff = useMemo(() => (dollars ? { dollars, gallons, co2, years } : null), [dollars, gallons, co2, years]);
  window.__ecoQaReal = qa;
  window.__ecoDevRender = true;
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!src || !n) return;
    window.__renderReady = false;
    fetch(`${src}/${n}.json`)
      .then((r) => r.json())
      .then((d) => setScan({ ...d, groundImage: d.groundImage ? { ...d.groundImage, url: `${src}/${n}.png` } : null }))
      .catch((e) => setError(e.message));
  }, [src, n]);
  const project = useMemo(() => (scan ? { ...projectFromScan(scan), id: `dev-${n}` } : null), [scan, n]);
  const entries = useMemo(() => (project && view === 'design' ? designOrDefault(project) : []), [project, view]);
  if (error) return <p className="p-6 text-destructive">{error}</p>;
  if (!project) return <p className="p-6 text-muted-foreground">Loading {n}…</p>;
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background">
      <Garden3DView
        fill
        project={project}
        entries={entries}
        mode={view === 'check' ? 'check' : 'design'}
        scene={view === 'check' ? 'scan' : payoff ? 'payoff' : 'design'}
        payoff={payoff}
        onReady={() => { window.__renderReady = true; }}
        initialReal={real}
      />
      <p className="pointer-events-none absolute left-3 top-3 z-50 rounded-full bg-card/90 px-3 py-1 text-[12px] shadow">{n} · {scan.address} · lawn {scan.lawnSqft} sq ft</p>
    </div>,
    document.body,
  );
}
