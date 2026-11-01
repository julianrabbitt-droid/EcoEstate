import { Check, Pencil, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScanImagery from '@/components/scan/ScanImagery';
import ScanSummary from '@/components/scan/ScanSummary';

export default function AutoScanResult({ data, onConfirm, onNotAccurate, onRescan, showFreeLabel }) {
  const canConfirm = data?.estimate?.lawnAreaSqft > 0 && !data?.estimate?.boundaryClipped;
  return (
    <div>
      <ScanImagery data={data} />
      <ScanSummary estimate={data?.estimate} />
      <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row">
        {canConfirm ? (
          <Button onClick={onConfirm} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
            <Check className="mr-1.5 h-4 w-4 shrink-0" />Looks right — analyze
          </Button>
        ) : (
          <Button onClick={onNotAccurate} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
            <Plus className="mr-1.5 h-4 w-4 shrink-0" />Draw lawn
          </Button>
        )}
        <Button variant="outline" onClick={onRescan} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
          <RefreshCw className="mr-1.5 h-4 w-4 shrink-0" />Re-scan
          {showFreeLabel && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(free)</span>}
        </Button>
        <Button variant="outline" onClick={onNotAccurate} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
          <Pencil className="mr-1.5 h-4 w-4 shrink-0" />Draw lawn manually
        </Button>
      </div>
    </div>
  );
}