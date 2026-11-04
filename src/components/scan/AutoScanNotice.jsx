import { AlertCircle, RefreshCw } from 'lucide-react';

// onRetry: when given, a Scan again button (a scan that failed or timed out
// often works a moment later).
export default function AutoScanNotice({ title, detail, onRetry = null }) {
  return (
    <div className="flex items-start gap-3 bg-destructive/10 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="text-[12.5px] font-medium text-destructive">{title}</p>
        {detail && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-background px-3 py-1 text-[12px] font-medium text-foreground transition hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />Scan again
          </button>
        )}
      </div>
    </div>
  );
}