import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Loader2, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import AccountMenu from '@/components/AccountMenu';
import AuthModal from '@/components/AuthModal';
import CookieNotice from '@/components/CookieNotice';
import FeedbackButton, { openFeedback } from '@/components/FeedbackButton';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/lib/AuthContext';
import { claimBetaAccess } from '@/lib/beta';

// First-time visitors see five places to go; your own properties and
// projects live in the account menu.
const NAV = [
  { to: '/', label: 'Scan', end: true },
  { to: '/why-native', label: 'Native plants' },
  { to: '/examples', label: 'Examples' },
  { to: '/installs', label: 'Volunteer' },
  { to: '/social', label: 'Community' },
];

export default function AppShell() {
  // On the Scan page the header floats over the full-screen aerial view
  // (clear, white text) until the page scrolls at all: then it's frosted, so
  // the panels sliding under it never show through its white text.
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > window.innerHeight * 0.6);
      setAtTop(window.scrollY < 8);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  // The project steps keep it over their full-screen 3D view, frosted.
  const stage = /^\/project\/[^/]+(\/(design|impact|plan))?\/?$/.test(pathname);
  const overlay = pathname === '/' && atTop;
  // Its height, for pages that run full screen under it (ProjectStage).
  const headerRef = useRef(null);
  // The current page's link scrolled into view in the phone menu row.
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector('[aria-current="page"]');
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: Math.max(0, link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2), behavior: 'smooth' });
  }, [pathname]);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A tester link opened before signing in is claimed as soon as they are.
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    // The tester page claims it itself.
    if (isAuthenticated && window.location.pathname !== '/beta') claimBetaAccess().catch(() => {});
  }, [isAuthenticated]);

  return (
    <div className="relative isolate flex min-h-screen flex-col">
      {/* The whole site sits on bone paper with a faint grain, like the scan's backdrop. */}
      <div className="pointer-events-none fixed inset-0 -z-20" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #e9e6dc 0%, #f1efe9 55%, #f5f3ee 100%)' }} aria-hidden />
      {/* Every other page opens under the same neighbourhood from above, washed
          out and fading into the page (project pages show their own property). */}
      {pathname !== '/' && !pathname.startsWith('/project/') && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] bg-cover bg-center opacity-50"
          style={{
            backgroundImage: 'url(/aerial-neighbourhood.jpg)',
            maskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,.5) 45%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,.5) 45%, transparent 100%)',
          }}
          aria-hidden
        >
          <div className="absolute inset-0 bg-[#f3f1ec]/55" />
        </div>
      )}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header ref={headerRef} className={cn('sticky top-0 z-40 border-b transition-colors duration-500', overlay ? 'border-transparent bg-gradient-to-b from-black/45 to-transparent' : stage && !scrolled ? 'border-transparent bg-background/70 backdrop-blur-md' : 'border-border/70 bg-background/85 backdrop-blur-md')}>
        {/* Phones: logo and account on top, the menu on its own scrollable row
            beneath. Wider screens: one row. */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-y-1 px-5 py-2 md:h-16 md:flex-nowrap md:py-0">
          <Link to="/" className="group order-1 flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-105">
              <Sprout className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className={cn('font-display text-[19px] tracking-tight', overlay && 'text-white drop-shadow')}>EcoEstate</span>
          </Link>
          {/* On phones the row scrolls sideways; its right edge fades so the
              links past it read as more to scroll to. */}
          <nav ref={navRef} className="order-3 -mx-2 flex w-[calc(100%+1rem)] items-center gap-1 overflow-x-auto px-1 pb-1 pr-10 text-sm [mask-image:linear-gradient(to_right,#000_80%,transparent)] md:order-2 md:mx-0 md:w-auto md:overflow-visible md:p-0 md:[mask-image:none]" style={{ scrollbarWidth: 'none' }}>
            {NAV.map(({ to, label, end: exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 transition',
                    overlay
                      ? isActive ? 'bg-white/20 text-white backdrop-blur' : 'text-white/85 hover:text-white'
                      : isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="order-2 md:order-3">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <ErrorBoundary resetKey={pathname}>
            {/* Each page fades and rises in. A project's steps share one key, so
                its 3D view stays put and only their panels change. */}
            <div key={pathname.startsWith('/project/') ? pathname.split('/').slice(0, 3).join('/') : pathname} className="page-enter">
              <Outlet />
            </div>
          </ErrorBoundary>
        </Suspense>
      </main>

      <AuthModal />
      <FeedbackButton />

      <footer className="relative border-t border-border/70 bg-background py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p>EcoEstate · native landscape conversion</p>
            <p>
              Julian Rabbitt-Tomita, doing business as EcoEstate · Palo Alto, CA ·{' '}
              <a href="mailto:support@ecoestate.org" className="underline-offset-2 hover:underline">support@ecoestate.org</a>
            </p>
            <p>Estimates are modeled, not engineering, financial or legal advice.</p>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/plans" className="underline-offset-2 hover:underline">Plans</Link>
            <Link to="/cities" className="underline-offset-2 hover:underline">For cities</Link>
            <Link to="/privacy" className="underline-offset-2 hover:underline">Privacy</Link>
            <Link to="/terms" className="underline-offset-2 hover:underline">Terms</Link>
            <Link to="/refunds" className="underline-offset-2 hover:underline">Refunds</Link>
            <Link to="/cookies" className="underline-offset-2 hover:underline">Cookies</Link>
            <button type="button" onClick={openFeedback} className="underline-offset-2 hover:underline">Feedback</button>
          </nav>
        </div>
      </footer>
      <CookieNotice />
    </div>
  );
}