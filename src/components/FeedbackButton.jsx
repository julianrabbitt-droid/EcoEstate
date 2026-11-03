import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Loader2, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

// A small Feedback button on every page while EcoEstate is being built: a note
// goes to the owner dashboard and support@ecoestate.org with the page it came from.
export default function FeedbackButton() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const send = async () => {
    setState('sending');
    setError('');
    try {
      await base44.functions.invoke('sendFeedback', { message, email, page: location.pathname });
      setState('sent');
      setMessage('');
    } catch (e) {
      setError(e?.message || 'Could not send. Try again.');
      setState('error');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setState('idle'); }}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] text-primary-foreground shadow-lg transition hover:scale-[1.03]"
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        Feedback
      </button>
    );
  }
  return (
    <div role="dialog" aria-label="Send feedback" className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-medium">What should we know?</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {state === 'sent' ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground"><Check className="h-4 w-4 text-primary" /> Thanks, it’s been sent.</p>
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Something confusing, wrong, slow or missing? A scan that missed your lawn?"
            className="field mt-2 w-full resize-none text-[13px]"
            autoFocus
          />
          {!isAuthenticated && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email, if you'd like a reply"
              className="field mt-2 w-full text-[13px]"
            />
          )}
          {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
          <Button onClick={send} disabled={state === 'sending' || message.trim().length < 2} size="sm" className="mt-3 w-full rounded-full">
            {state === 'sending' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Send feedback
          </Button>
        </>
      )}
    </div>
  );
}
