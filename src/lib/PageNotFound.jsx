import { Link, useLocation } from 'react-router-dom';
import { Crosshair, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';

// A page that doesn't exist: the same aerial and sage as the rest of the site,
// and a way back to scanning.
export default function PageNotFound() {
  const { pathname } = useLocation();
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-5 text-center">
      <div className="pointer-events-none fixed inset-0 -z-20" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #dde4cf 0%, #e7eadd 55%, #f0f1e8 100%)' }} aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-45"
        style={{ backgroundImage: 'url(/aerial-neighbourhood.jpg)', maskImage: 'radial-gradient(60% 60% at 50% 45%, #000 0%, transparent 100%)', WebkitMaskImage: 'radial-gradient(60% 60% at 50% 45%, #000 0%, transparent 100%)' }}
        aria-hidden
      />
      <div>
        <Link to="/" className="mx-auto flex w-fit items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Sprout className="h-4 w-4" strokeWidth={1.8} /></span>
          <span className="font-display text-[20px] tracking-tight">EcoEstate</span>
        </Link>
        <p className="mt-10 font-mono text-[12px] tracking-[0.2em] text-muted-foreground">404 · NOTHING FOUND HERE</p>
        <h1 className="mt-3 font-display text-[2.4rem] leading-tight tracking-tight">This page isn’t on the map.</h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          There’s no page at <span className="font-mono text-foreground">{pathname}</span>. Try a lawn instead.
        </p>
        <Button asChild className="mt-7 rounded-full px-6">
          <Link to="/"><Crosshair className="mr-1.5 h-4 w-4" aria-hidden />Locate a property</Link>
        </Button>
      </div>
    </div>
  );
}
