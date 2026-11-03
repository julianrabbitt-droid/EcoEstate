import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Loader2, Lock, Share2, Table2 } from 'lucide-react';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { plantById } from '@/data/nativePlants';
import { financials, money, num } from '@/lib/landscapeMath';
import { savedReferral, startCheckout } from '@/lib/checkout';
import RenewalTerms from '@/components/RenewalTerms';
import { useRebates } from '@/hooks/useRebates';
import { cleanAddress } from '@/lib/geo';

// Pro project export: a printable PDF brief and a materials spreadsheet,
// plus a share action. Gated behind EcoEstate Pro ($10/month) — not the free
// student unlock. When locked, the user can subscribe inline or sign in.
export default function ProjectExports({ projectId, project, design }) {
  const { isAuthenticated, authChecked } = useAuth();
  const { premium: unlocked, loading, refresh } = usePremiumAccess();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');
  const [shared, setShared] = useState(false);

  const rebates = useRebates(project);
  const fin = financials(project, design || [], rebates);
  const turfSqft = fin.turfSqft || 0;
  const mulchYards = Math.max(1, Math.round((turfSqft * 0.25) / 27));
  const rows = [
    ...(design || []).map((entry) => {
      const plant = plantById(entry.speciesId);
      if (!plant) return null;
      return { label: plant.common, note: `${plant.spacing} ft spacing`, qty: `${entry.quantity} plants`, cost: entry.quantity * plant.cost };
    }).filter(Boolean),
    { label: 'Arborist mulch', note: '3 inches deep', qty: `${mulchYards} cu yd`, cost: fin.mulch },
    { label: 'Drip irrigation kit', note: 'Pressure-regulated, 12–18 in spacing', qty: `${num(turfSqft)} sq ft`, cost: fin.irrigation },
    { label: 'Installation labor', note: 'Planting, grading, mulch spread', qty: 'Crew', cost: fin.install },
  ];
  const materialsTotal = rows.reduce((s, r) => s + r.cost, 0);

  const brief = [
    'EcoEstate — Native Conversion Brief',
    '',
    `Property: ${cleanAddress(project.address)}`,
    `Convertible turf: ${num(turfSqft)} sq ft`,
    `Species: ${(design || []).map((e) => `${plantById(e.speciesId)?.common} × ${e.quantity}`).join(', ')}`,
    `Estimated water saved: ${num(fin.gallonsSaved)} gallons/year`,
    `Estimated project cost before rebates: ${money(materialsTotal)}`,
    `Rebates and incentives: ${money(fin.rebate)}`,
    `Out of pocket after rebates: ${money(fin.outOfPocket)}`,
    'Notes: native conversion, drip irrigation, no synthetic fertilizer.',
  ].join('\n');

  const saveBlob = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // The PDF library is only downloaded when someone asks for a PDF.
  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const left = 56;
    let y = 72;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Native Conversion Brief', left, y);
    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`EcoEstate · ${cleanAddress(project.address)}`, left, y);
    y += 26;
    doc.setTextColor(40);
    brief.split('\n').slice(2).forEach((line) => {
      doc.text(line, left, y);
      y += 15;
    });
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Bill of materials', left, y);
    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    rows.forEach((r) => {
      doc.text(r.label, left, y);
      doc.text(r.qty, left + 250, y);
      doc.text(money(r.cost), left + 380, y);
      y += 15;
    });
    doc.setFont('helvetica', 'bold');
    doc.text(`Total`, left, y);
    doc.text(money(materialsTotal), left + 380, y);
    doc.save('ecoestate-project-brief.pdf');
  };

  const downloadCsv = () => {
    const csv = [
      ['Item', 'Detail', 'Quantity', 'Cost (USD)'],
      ...rows.map((r) => [r.label, r.note, r.qty, r.cost.toFixed(2)]),
      ['Total', '', '', materialsTotal.toFixed(2)],
    ]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    saveBlob(csv, 'ecoestate-materials.csv', 'text/csv;charset=utf-8');
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'EcoEstate project brief', text: brief });
      } else {
        await navigator.clipboard.writeText(brief);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const handleSubscribe = async () => {
    setError('');
    setPurchasing(true);
    sessionStorage.setItem('ecoestate_premium_pending', '1');
    try {
      const res = await startCheckout();
      const url = res?.data?.redirectUrl;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (e) {
      setError(e?.message || 'Could not start checkout. Please try again.');
      setPurchasing(false);
    }
  };

  const busy = loading || !authChecked;

  if (!unlocked) {
    return (
      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-accent" />
          <span className="label-xs">Project exports</span>
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Download & share your project</h2>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Hand a printable PDF brief and a materials spreadsheet to a nursery, crew, or volunteer group, or share the
          whole plan in one tap. Included with EcoEstate Pro ($10/month), along with the community and project
          tracking. Scanning and the 3D Garden View are free for everyone.
        </p>
        {isAuthenticated ? (
          <>
            <Button onClick={handleSubscribe} disabled={purchasing} className="mt-4 rounded-full">
              {purchasing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to checkout…
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" /> Subscribe to Pro — $10/month
                </>
              )}
            </Button>
            <RenewalTerms className="mt-3" referral={!!savedReferral()} />
            {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
          </>
        ) : (
          <Button asChild className="mt-4 rounded-full">
            <Link to={`/login?redirect_url=${encodeURIComponent(`/project/${projectId}/plan`)}`}>
              <Lock className="mr-2 h-4 w-4" /> Sign in to unlock
            </Link>
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="surface p-5">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-accent" />
        <span className="label-xs">Project exports</span>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Download & share your project</h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        A printable brief and a materials list for your nursery, crew, or volunteer group, drawn from this project's
        current scan and design.
      </p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button onClick={downloadPdf} className="rounded-full">
          <FileText className="mr-2 h-4 w-4" /> PDF brief
        </Button>
        <Button onClick={downloadCsv} variant="outline" className="rounded-full">
          <Table2 className="mr-2 h-4 w-4" /> Materials CSV
        </Button>
        <Button onClick={share} variant="outline" className="rounded-full">
          <Share2 className="mr-2 h-4 w-4" /> {shared ? 'Copied' : 'Share'}
        </Button>
      </div>
      {busy && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking access…
        </p>
      )}
    </section>
  );
}