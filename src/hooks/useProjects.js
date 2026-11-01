import { useEffect, useState } from 'react';
import { getProject, listProjects } from '@/lib/projectStore';
import projectLocalization from '@/lib/projectLocalization';

// Loads a single project for a route. location.state.project is a fallback for
// a just-created project that hasn't been read back yet.
export function useProject(id, locationState) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    let p = null;
    try {
      p = await getProject(id);
    } catch {
      p = null;
    }
    if (!p && locationState?.project?.id === id) p = locationState.project;
    p = await projectLocalization(p);
    setProject(p);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  return { project, loading, reload: load };
}

// Loads the signed-in user's saved projects for My Properties.
export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const list = await listProjects().catch(() => []);
    setProjects(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return { projects, loading, reload: load };
}