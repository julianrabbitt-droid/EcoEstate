import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import Community from '@/pages/Community';
import Messages from '@/pages/Messages';

const TABS = [
  { id: 'community', label: 'Community' },
  { id: 'messages', label: 'Messages' },
];

// Community feed + map and private messages, switched by the `tab` query param.
export default function Social() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'messages' ? 'messages' : 'community';

  const selectTab = (id) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10">
      <p className="label-xs">Social</p>
      <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-[2.4rem]">Progress, examples & neighbors</h1>

      <div className="mt-5 inline-flex gap-1 rounded-full border border-border/70 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={cn(
              'rounded-full px-4 py-1.5 text-[12.5px] font-medium transition',
              tab === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">{tab === 'messages' ? <Messages /> : <Community />}</div>
    </div>
  );
}
