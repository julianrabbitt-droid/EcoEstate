import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import AccountMenu from '@/components/AccountMenu';
import AuthModal from '@/components/AuthModal';

export default function AppShell() {
  const { pathname } = useLocation();
  const inProject = pathname.startsWith('/project');

  return (
    <div className="flex min-h-screen flex-col bg-background">
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

      <main className="flex-1">
        <Outlet />
      </main>

      <AuthModal />

      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 text-xs text-muted-foreground sm:flex-row">
          <span>EcoEstate · native landscape conversion</span>
          <span>Estimates are modeled, not engineering or legal advice.</span>
        </div>
      </footer>
    </div>
  );
}