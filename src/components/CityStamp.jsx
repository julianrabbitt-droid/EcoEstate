import { useId } from 'react';

// A community install's city as a little postmark: the name running round the
// ring, its initials in the middle, slightly askew like a real stamp.
export default function CityStamp({ city, size = 56, className = '' }) {
  const id = useId().replace(/:/g, '');
  const name = String(city || 'Nearby').toUpperCase();
  // Repeat the name round the ring so it always closes up.
  let ring = '';
  while (ring.length < 34) ring += `${name} · `;
  const initials = name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${city || 'Nearby'}`} className={`shrink-0 -rotate-6 text-accent ${className}`}>
      <defs>
        <path id={`ring${id}`} d="M50,50 m-35,0 a35,35 0 1,1 70,0 a35,35 0 1,1 -70,0" />
      </defs>
      <circle cx="50" cy="50" r="47" fill="hsl(var(--card))" stroke="currentColor" strokeWidth="2" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
      <text fill="currentColor" fontSize="9.5" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2">
        <textPath href={`#ring${id}`} textLength="218" lengthAdjust="spacing">{ring}</textPath>
      </text>
      <text x="50" y="57" textAnchor="middle" fill="currentColor" fontSize="20" fontStyle="italic" fontFamily="Fraunces Variable, Fraunces, Georgia, serif">
        {initials}
      </text>
    </svg>
  );
}
