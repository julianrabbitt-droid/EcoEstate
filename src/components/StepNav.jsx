import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'scan', label: 'Scan', path: (id) => `/project/${id}` },
  { key: 'design', label: 'Design', path: (id) => `/project/${id}/design` },
  { key: 'impact', label: 'Payoff', path: (id) => `/project/${id}/impact` },
  { key: 'plan', label: 'Build', path: (id) => `/project/${id}/plan` },
];

// The project's steps, floating over the property's 3D view (ProjectStage).
export default function StepNav({ projectId, current, project }) {
  return (
    <nav aria-label="Project steps" className="-mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
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
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 transition',
                  active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px]', active ? 'bg-background text-foreground' : done ? 'bg-foreground/10 text-foreground' : 'bg-secondary')}>
                  {done ? '✓' : i + 1}
                </span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}