import { AlertCircle } from 'lucide-react';

export default function AutoScanNotice({ title, detail }) {
  return (
    <div className="flex items-start gap-3 bg-destructive/10 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="text-[12.5px] font-medium text-destructive">{title}</p>
        {detail && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}