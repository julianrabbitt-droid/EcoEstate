import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import AccountMenu from '@/components/AccountMenu';
import AuthModal from '@/components/AuthModal';
import CookieNotice from '@/components/CookieNotice';

export default function AppShell() {
  const { pathname } = useLocation();
  const inProject = pathname.startsWith('/project');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        {/* Phones: logo and account on top, the menu on its own scrollable row
            beneath. Wider screens: one row. */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-y-1 px-5 py-2 md:h-16 md:flex-nowrap md:py-0">
          <Link to="/" className="group order-1 flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-105">
              <Sprout className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="font-display text-[19px] tracking-tight">EcoEstate</span>
          </Link>
          <nav className="order-3 -mx-2 flex w-[calc(100%+1rem)] items-center gap-1 overflow-x-auto px-1 pb-1 text-sm md:order-2 md:mx-0 md:w-auto md:overflow-visible md:p-0" style={{ scrollbarWidth: 'none' }}>
            <NavLink
              to="/"
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 transition',
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              New scan
            </NavLink>
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 transition',
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              My properties
            </NavLink>
            <NavLink
              to="/my-projects"
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 transition',
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              My projects
            </NavLink>
            <NavLink
              to="/social"
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 transition',
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              Social
            </NavLink>
            {inProject && (
              <span className="ml-1 hidden rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
                Project
              </span>
            )}
          </nav>
          <div className="order-2 md:order-3">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <AuthModal />

      <footer className="border-t border-border/70 py-8">
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
            <Link to="/privacy" className="underline-offset-2 hover:underline">Privacy</Link>
            <Link to="/terms" className="underline-offset-2 hover:underline">Terms</Link>
            <Link to="/refunds" className="underline-offset-2 hover:underline">Refunds</Link>
            <Link to="/cookies" className="underline-offset-2 hover:underline">Cookies</Link>
          </nav>
        </div>
      </footer>
      <CookieNotice />
    </div>
  );
}