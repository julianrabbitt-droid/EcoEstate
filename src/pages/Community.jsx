import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PostComposer from '@/components/community/PostComposer';
import PostCard from '@/components/community/PostCard';
import TrackedPropertiesMap from '@/components/community/TrackedPropertiesMap';

export default function Community() {
  // A project summary handed over by the Payoff step's "Share in the community".
  const share = useLocation().state?.shareProject || null;
  const [me, setMe] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items } = await base44.entities.Post.filter({}, { sort: '-created_date', limit: 50 });
      setPosts(items);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    base44.auth.me().then(setMe).catch(() => {});
    load();
  }, [load]);

  return (
    <div>
      <p className="text-[13px] text-muted-foreground">
        Share your project, comment on others, and message members. Members appear as “Member”: no names, addresses or exact
        locations are shown. Photos have their location data removed and are only shown in the feed.
      </p>

      <div className="mt-6">
        <TrackedPropertiesMap posts={posts} />
      </div>

      <div className="mt-6">
        <PostComposer key={share ? 'share' : 'blank'} onPosted={load} share={share} />
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="surface flex flex-col items-center px-6 py-16 text-center">
            <Users className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-[13px] font-medium">No posts yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Be the first to share a before-and-after.</p>
          </div>
        ) : (
          posts.map((p) => (
            <PostCard key={p.id} post={p} me={me} onDelete={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
          ))
        )}
      </div>
    </div>
  );
}