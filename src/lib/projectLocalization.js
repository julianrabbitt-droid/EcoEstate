import { reverseGeocodeLocation } from '@/lib/geo';
import { designForProject } from '@/lib/landscapeMath';
import { updateProject } from '@/lib/projectStore';

const locations = new Map();
export default async function projectLocalization(project) {
  if (!project) return project;
  let resolved = project;
  const patch = {};
  // Older scans saved ZIP and coordinates but discarded country information.
  if (!project.countryCode && project.center?.length === 2) {
    const key = project.center.join(',');
    if (!locations.has(key)) locations.set(key, reverseGeocodeLocation(project.center).catch(() => null));
    const location = await locations.get(key);
    if (location?.countryCode) {
      for (const field of ['countryCode', 'country', 'state', 'city', 'zip']) {
        if (!project[field] && location[field]) patch[field] = location[field];
      }
      resolved = { ...project, ...patch };
    }
  }
  const saved = Object.keys(patch).length ? await updateProject(project.id, patch) : resolved;
  if (!saved?.design?.length) return saved;
  const design = designForProject(saved);
  const nativeListAdjusted = JSON.stringify(design) !== JSON.stringify(saved.design);
  // Update the displayed recommendation, not the saved planting choices.
  // The user's existing Save action commits the corrected list.
  return nativeListAdjusted ? { ...saved, design, nativeListAdjusted } : saved;
}