import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { byDistance, installWhen, spotsLeft, upcomingInstalls } from '@/lib/installs';

// The next planting days near a place, as small cards: an easy way to go and
// help at someone else's.
export default function NearbyInstalls({ near = null, exclude = null, limit = 3, className = '' }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    upcomingInstalls()
      .then((all) => { if (live) setList(byDistance(all.filter((i) => i.id !== exclude && spotsLeft(i) > 0), near).slice(0, limit)); })
      .catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [near?.[0], near?.[1], exclude, limit]);
  if (!list?.length) return null;
  return (
    <div className={`grid gap-2 ${limit >= 3 ? 'sm:grid-cols-3' : limit === 2 ? 'sm:grid-cols-2' : ''} ${className}`}>
      {list.map((i) => (
        <Link key={i.id} to={`/installs/${i.id}`} className="surface block bg-card/85 p-3.5 transition hover:-translate-y-0.5 hover:border-primary/40">
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{installWhen(i)}</p>
          <p className="mt-1 truncate text-[13.5px] font-medium">{i.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden />{i.city}{i.miles != null ? ` · ${i.miles < 1 ? 'under a mile' : `${Math.round(i.miles)} mi`}` : ''} · {spotsLeft(i)} spot{spotsLeft(i) === 1 ? '' : 's'} left
          </p>
        </Link>
      ))}
    </div>
  );
}
