import { Component } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

// A page that crashes shows this instead of a blank screen: try again, start
// over, or send us what broke (the error and where, nothing else).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, sent: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed', error, info?.componentStack);
    this.stack = String(info?.componentStack || '').slice(0, 3000);
  }

  componentDidUpdate(prev) {
    // A new page (resetKey is the path) gets a fresh start.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, sent: false });
  }

  send = async () => {
    const { error } = this.state;
    try {
      await base44.functions.invoke('sendFeedback', {
        kind: 'scan',
        message: `Page crashed: ${String(error?.message || error).slice(0, 300)}`,
        page: window.location.pathname,
        context: { error: String(error?.stack || error).slice(0, 4000), components: this.stack, userAgent: navigator.userAgent },
      });
    } catch {
      /* the button just stays */
    }
    this.setState({ sent: true });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 text-center" role="alert">
        <p className="label-xs">Something broke</p>
        <h1 className="mt-3 font-display text-[2rem] leading-tight tracking-tight">This page hit a snag.</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">Your scans and designs are saved. Reload to pick up where you were, or start a fresh scan.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()} className="rounded-full"><RotateCcw className="mr-1.5 h-4 w-4" />Reload</Button>
          <Button variant="outline" onClick={() => { try { sessionStorage.removeItem('ecoestate.scan'); } catch { /* storage off */ } window.location.assign('/'); }} className="rounded-full">Start a new scan</Button>
        </div>
        <button type="button" onClick={this.send} disabled={this.state.sent} className="mt-4 text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:no-underline">
          {this.state.sent ? 'Sent. Thank you.' : 'Send us what went wrong'}
        </button>
      </div>
    );
  }
}
