import { Link } from 'react-router-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStagePanels } from '@/components/ProjectStage';

const STEPS = [
  { key: 'scan', label: 'Scan', path: (id) => `/project/${id}` },
  { key: 'design', label: 'Design', path: (id) => `/project/${id}/design` },
  { key: 'impact', label: 'Payoff', path: (id) => `/project/${id}/impact` },
  { key: 'plan', label: 'Build', path: (id) => `/project/${id}/plan` },
];

// The project's steps, floating over the property's 3D view (ProjectStage).
export default function StepNav({ projectId, current, project }) {
  // Over the 3D view: one button folds every panel away, or opens them all.
  const panels = useStagePanels();
  return (
    <nav aria-label="Project steps" className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
      <ol className="inline-flex min-w-max items-center gap-1 rounded-full border border-border/60 bg-card/88 p-1 text-[12.5px] text-foreground shadow-[0_12px_40px_-16px_rgba(0,0,0,0.35)] backdrop-blur-md">
        {STEPS.map((step, i) => {
          const active = step.key === current;
          const done = STEPS.findIndex((x) => x.key === current) > i;
          return (
            <li key={step.key} className="flex items-center">
              {i > 0 && <span className={cn('mx-0.5 h-px w-4 sm:w-6', done || active ? 'bg-foreground' : 'bg-border')} aria-hidden />}
              <Link
                to={step.path(projectId)}
                state={project ? { project } : undefined}
                aria-current={active ? 'step' : undefined}
                aria-label={step.label}
                className={cn(
                  'flex items-center gap-2 rounded-full py-1.5 transition',
                  // Phones: the other steps are just their numbers, so all four fit.
                  active ? 'px-3.5' : 'px-1.5 sm:px-3.5',
                  active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px]', active ? 'bg-background text-foreground' : done ? 'bg-foreground/10 text-foreground' : 'bg-secondary')}>
                  {done ? '✓' : i + 1}
                </span>
                <span className={active ? '' : 'hidden sm:inline'}>{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {panels && (
        <button
          type="button"
          onClick={() => panels.setAll(!panels.allOpen)}
          aria-pressed={!panels.allOpen}
          title={panels.allOpen ? 'Fold all panels away' : 'Show all panels'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card/88 px-3 py-2 text-[12px] text-muted-foreground shadow-[0_12px_40px_-16px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:text-foreground"
        >
          {panels.allOpen ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          <span className="hidden sm:inline">{panels.allOpen ? 'Hide panels' : 'Show panels'}</span>
          <span className="sr-only sm:hidden">{panels.allOpen ? 'Hide panels' : 'Show panels'}</span>
        </button>
      )}
    </nav>
  );
}