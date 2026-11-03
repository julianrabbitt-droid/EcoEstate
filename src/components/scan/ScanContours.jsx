import { useId } from 'react';
import { contourPath } from '@/components/scan/contourPaths';

const styles = {
  lawn: 'fill-chart-1/40 stroke-chart-1',
  path: 'fill-foreground/20 stroke-card/80',
  tree: 'fill-primary/30 stroke-primary/80',
  other: 'fill-accent/15 stroke-accent/60',
  building: 'fill-foreground/55 stroke-foreground/80',
};

export default function ScanContours({ estimate }) {
  const clipId = useId().replace(/:/g, '');
  const lot = contourPath(estimate?.lotPolygon);
  const features = [...(estimate?.features || [])].sort((a, b) => Number(a.type === 'lawn') - Number(b.type === 'lawn'));
  const buildings = estimate?.buildings || [];
  return (
    <svg viewBox="0 0 1000 1000" className="pointer-events-none absolute inset-0 h-full w-full" aria-label="Estimated property boundary and separate lawn areas">
      <defs><clipPath id={clipId}><path d={lot} /></clipPath></defs>
      {lot && <path d={lot} className="fill-accent/30 stroke-none" />}
      <g clipPath={`url(#${clipId})`}>
        {features.map((feature, index) => {
          const d = [contourPath(feature.polygon, feature.type === 'lawn'), ...(feature.holes || []).map(hole => contourPath(hole, feature.type === 'lawn'))].join(' ');
          return d ? <path key={index} d={d} fillRule="evenodd" className={styles[feature.type] || styles.other} strokeWidth={feature.type === 'lawn' ? 1.8 : 1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /> : null;
        })}
        {buildings.map((b, index) => {
          const ring = b?.polygon || b;
          const d = contourPath(ring);
          return d ? <path key={`b${index}`} d={d} className={styles.building} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /> : null;
        })}
      </g>
      {lot && <>
        <path d={lot} fill="none" className="stroke-white/90" strokeWidth="6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <path d={lot} fill="none" className="stroke-accent" strokeWidth="3.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </>}
    </svg>
  );
}