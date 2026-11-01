import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'scan', label: 'Scan', path: (id) => `/project/${id}` },
  { key: 'design', label: 'Design', path: (id) => `/project/${id}/design` },
  { key: 'impact', label: 'Payoff', path: (id) => `/project/${id}/impact` },
  { key: 'plan', label: 'Build', path: (id) => `/project/${id}/plan` },
  { key: 'legacy', label: 'Legacy', path: (id) => `/project/${id}/legacy` },
];

export default function StepNav({ projectId, current, project }) {
  return (
    <nav className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-center gap-1 text-[12.5px]">
        {STEPS.map((step, i) => {
          const active = step.key === current;
          return (
            <li key={step.key} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1 h-px w-5 bg-border" aria-hidden />}
              <Link
                to={step.path(projectId)}
                state={project ? { project } : undefined}
                className={cn(
                  'rounded-full px-3 py-1.5 transition',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <span className="mr-1.5 font-mono text-[10px] opacity-60">0{i + 1}</span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}