import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Garden3DView from '@/components/Garden3DView';

// The project's four steps share one full-screen 3D view of the property, so
// moving from Scan to Design to Payoff to Build never reloads it: the camera
// glides to each step's view and the step's panels float over it. A step page
// says what the view should show with useStage, puts its panels over the view
// with <StageOverlay>, and lays the rest of its content out below as usual.

const StageContext = createContext(null);
const NO_ENTRIES = [];

// Edits that don't change the model itself (the design, which comes in as
// entries, the turf type, the save time) keep the same project object, so the
// view isn't rebuilt when a step saves or reloads it.
const NOT_MODEL = new Set(['design', 'updated_date', 'created_date', 'turf', 'sun', 'soil', 'zip', 'nativeListAdjusted', 'wallColorChecked', 'arrangementName']);
const modelKey = (p) => (p ? JSON.stringify(p, (k, v) => (NOT_MODEL.has(k) ? undefined : v)) : '');

// props: { project, entries, scene, lawnLabel, viewShift, activeArrangement,
// onApplyArrangement, payoff, highlight, planView }, { missing: true } when
// the property isn't there, or null while it loads. Set again whenever one of
// `deps` changes.
export function useStage(props, deps) {
  const ctx = useContext(StageContext);
  useEffect(() => {
    if (props) ctx?.setProps(props); // null (still loading): keep showing what's there
  }, deps);
}

// Panels over the 3D view. The layer lets clicks through to the view; give
// each panel pointer-events-auto.
export function StageOverlay({ children }) {
  const ctx = useContext(StageContext);
  return ctx?.overlay ? createPortal(children, ctx.overlay) : null;
}

// Wide screens keep a panel beside the property, so the view shifts over.
export function useWide(min = 1024) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= min);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= min);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [min]);
  return wide;
}

export default function ProjectStage() {
  const [props, setProps] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const model = useRef({ key: '', project: null });
  const next = props?.project || null;
  const key = modelKey(next);
  if (next && key !== model.current.key) model.current = { key, project: next };
  const project = model.current.project;
  const ctx = useMemo(() => ({ setProps, overlay }), [overlay]);

  return (
    <StageContext.Provider value={ctx}>
      {!props?.missing && (
        // Full screen, under the header, which floats over it.
        <section className="relative overflow-hidden bg-background" style={{ height: '100svh', minHeight: 560, marginTop: 'calc(-1 * var(--header-h, 4rem))' }}>
          {project ? (
            <Garden3DView
              key={project.id}
              fill
              project={project}
              entries={props.entries || NO_ENTRIES}
              scene={props.scene || 'design'}
              mode={props.scene === 'scan' ? 'check' : 'design'}
              lawnLabel={props.lawnLabel || null}
              viewShift={props.viewShift || null}
              activeArrangement={props.activeArrangement ?? null}
              onApplyArrangement={props.onApplyArrangement}
              payoff={props.payoff || null}
              highlight={props.highlight || null}
              planView={Boolean(props.planView)}
            />
          ) : (
            <div className="flex h-full items-center justify-center" role="status" aria-label="Opening your property">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <div ref={setOverlay} className="pointer-events-none absolute inset-x-0 bottom-0 z-10" style={{ top: 'var(--header-h, 4rem)' }} />
        </section>
      )}
      <Outlet />
    </StageContext.Provider>
  );
}
