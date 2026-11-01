import { Image } from '@/components/ui/image';
import ScanContours from '@/components/scan/ScanContours';

export default function ScanImagery({ data }) {
  return (
    <div className="p-4">
      <figure className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-secondary">
        {data?.satelliteImage ? <>
          <Image src={data.satelliteImage} alt="Full property in a wider satellite view, with estimated property and lawn boundaries" fittingType="fit" className="absolute inset-0 h-full w-full object-contain" />
          <ScanContours estimate={data.estimate} />
        </> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Satellite unavailable</div>}
        <figcaption className="absolute left-2 top-2 rounded-full bg-foreground/85 px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] text-background">Satellite · full property</figcaption>
      </figure>
      {data?.streetViewImage && <div className="mt-3 flex items-center gap-3">
        <Image src={data.streetViewImage} alt="Street-level view of the property" className="aspect-[640/420] w-24 shrink-0 rounded-lg border border-border object-cover" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">Street view<br /><span className="text-[10px]">Context only. Measurements use the satellite view.</span></p>
      </div>}
    </div>
  );
}