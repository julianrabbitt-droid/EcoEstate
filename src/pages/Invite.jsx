import { useEffect, useState } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Check, Copy, Gift, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

// Referral program: share a link; each friend who subscribes gets $5 off their
// first month and gives you one free month of Pro.
export default function Invite() {
  usePageMeta({ title: 'Invite friends' });
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    base44.functions
      .invoke('referral-info', {})
      .then((res) => setInfo(res.data))
      .catch((e) => setError(e?.message || 'Could not load your referral link.'));
  }, []);

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('Copy this:', text);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <p className="label-xs">Invite friends</p>
      <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
        Give $5, get a <em className="italic text-accent">free month</em>
      </h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Share your link. Friends get $5 off their first month of EcoEstate Pro, and you get one free month ($10 credit)
        for every friend who subscribes. Credits apply automatically to your next Pro bill, or your first one if you
        subscribe later.
      </p>

      {error && <p className="mt-6 text-[13px] text-destructive">{error}</p>}
      {!info && !error && <Loader2 className="mt-8 h-5 w-5 animate-spin text-muted-foreground" />}

      {info && (
        <>
          <div className="mt-8 surface p-5">
            <p className="text-[12px] text-muted-foreground">Your link</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-background px-3 py-2 text-[13px]">{info.link}</code>
              <Button onClick={() => copy(info.link, 'link')} className="rounded-full">
                {copied === 'link' ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Or share your code{' '}
              <button type="button" onClick={() => copy(info.code, 'code')} className="font-mono font-medium text-foreground underline underline-offset-2">
                {info.code}
              </button>
              {copied === 'code' && ' (copied)'}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="surface p-5">
              <p className="label-xs">Free months earned</p>
              <p className="mt-2 font-display text-3xl">{info.freeMonthsEarned}</p>
            </div>
            <div className="surface p-5">
              <p className="label-xs">Credit earned</p>
              <p className="mt-2 font-display text-3xl">${info.creditUsd}</p>
            </div>
          </div>

          <div className="mt-5 surface p-5">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-accent" />
              <h2 className="text-[15px] font-medium tracking-tight">Friends who joined</h2>
            </div>
            {info.friends.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-foreground">No one yet. Share your link to start earning free months.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/70">
                {info.friends.map((f, i) => (
                  <li key={i} className="flex items-center justify-between py-2.5 text-[13px]">
                    <span>{f.name}</span>
                    <span className="text-muted-foreground">
                      {f.status === 'rewarded' ? '1 free month' : 'Pending'} · {f.date ? new Date(f.date).toLocaleDateString() : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
