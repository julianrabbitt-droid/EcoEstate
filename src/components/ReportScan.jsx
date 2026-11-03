import { useState } from 'react';
import { Check, Flag, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const PROBLEMS = ['Lawn outline', 'House shape', 'Roof', 'Driveway or paving', 'Trees', 'Ground or slope', 'Floating or misplaced', 'Real 3D view', 'Something else'];

// "This scan looks wrong": what's off, in which view, sent with the scan's own
// details (address, outlines, roof, view) so the scanner can be improved.
// placement: where the form opens from the button, 'above' (a toolbar at the
// bottom of the view) or 'below' (one at the top), over the view, never
// stretching the toolbar it sits in.
export default function ReportScan({ getContext, className = '', placement = 'above' }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  const send = async () => {
    setState('sending');
    setError('');
    try {
      const context = { ...(getContext?.() || {}), problems: picked };
      await base44.functions.invoke('sendFeedback', {
        kind: 'scan',
        message: `${picked.join(', ') || 'Scan problem'}${note.trim() ? `: ${note.trim()}` : ''}`,
        page: window.location.pathname,
        context,
      });
      setState('sent');
    } catch (e) {
      setError(e?.message || 'Could not send. Try again.');
      setState('error');
    }
  };

  const toggle = () => {
    if (!open) { setState('idle'); setPicked([]); setNote(''); }
    setOpen(!open);
  };
  return (
    <div className="relative">
      <Button variant={open ? 'default' : 'outline'} size="sm" className={`rounded-full ${className}`} onClick={toggle} aria-expanded={open}>
        <Flag className="mr-1.5 h-4 w-4" aria-hidden />
        Report this scan
      </Button>
      {open && (
    <div role="dialog" aria-label="Report a scan problem" className={`absolute left-0 z-30 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card/95 p-4 text-left shadow-2xl backdrop-blur-md ${placement === 'below' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]'}`}>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-medium">What looks wrong here?</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {state === 'sent' ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground"><Check className="h-4 w-4 text-primary" /> Thanks. We’ll use it to improve how this kind of property is scanned.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PROBLEMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPicked((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${picked.includes(p) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What's different in real life? e.g. there's a driveway on the left; the roof is flat"
            className="field mt-2 w-full resize-none text-[13px]"
          />
          {error && <p role="alert" className="mt-1 text-[12px] text-destructive">{error}</p>}
          <Button onClick={send} disabled={state === 'sending' || (!picked.length && note.trim().length < 3)} size="sm" className="mt-2 w-full rounded-full">
            {state === 'sending' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Send report
          </Button>
        </>
      )}
    </div>
      )}
    </div>
  );
}
