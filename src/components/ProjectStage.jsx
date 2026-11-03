import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router-dom';
import { ChevronDown, Loader2, Minus, PanelRightOpen } from 'lucide-react';
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
// onApplyArrangement, arrangementsEl, payoff, highlight, planView }, { missing: true } when
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

// Whether the step's side panel and title card are open. Kept by the stage, so
// a panel folded away on one step stays folded on the next.
export function useStagePanels() {
  const ctx = useContext(StageContext);
  return ctx?.panels || { asideOpen: true, titleOpen: true, setAsideOpen: () => {}, setTitleOpen: () => {}, walking: false };
}

// The step's side panel (wide screens): a header that folds it away to a pill
// at the top right, its contents, and a footer for the step's main buttons.
export function StageAside({ label, summary, children, footer, width = 'w-[25rem]' }) {
  const { asideOpen, setAsideOpen } = useStagePanels();
  if (!asideOpen) {
    return (
      <button
        type="button"
        onClick={() => setAsideOpen(true)}
        aria-expanded={false}
        className="pointer-events-auto absolute right-3 top-3 z-20 hidden items-center gap-2 rounded-full border border-border/60 bg-card/90 px-4 py-2 text-[12.5px] shadow-lg backdrop-blur-md transition hover:bg-card lg:inline-flex"
      >
        <PanelRightOpen className="h-4 w-4" aria-hidden />
        {label}
        {summary && <span className="text-muted-foreground">· {summary}</span>}
      </button>
    );
  }
  return (
    <aside aria-label={label} className={`pointer-events-auto absolute bottom-16 right-3 top-3 z-20 hidden ${width} flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-2xl backdrop-blur-md lg:flex`}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2 pl-5 pr-2">
        <p className="label-xs">{label}</p>
        <button type="button" onClick={() => setAsideOpen(false)} aria-expanded aria-label={`Fold away ${label.toLowerCase()}`} title="Fold away" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground">
          <Minus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
      {footer && <div className="space-y-2 border-t border-border/60 p-4">{footer}</div>}
    </aside>
  );
}

// Top left: the steps, and the step's title card, which folds down to its
// title alone. Its "In depth" button scrolls to the step's details below the
// view (the element with id="step-details").
export function StageTitle({ title, children }) {
  const { titleOpen, setTitleOpen } = useStagePanels();
  const toDetails = () => document.getElementById('step-details')?.scrollIntoView({ behavior: 'smooth' });
  return (
    <div className="pointer-events-auto mt-3 w-fit max-w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl border border-border/60 bg-card/88 shadow-lg backdrop-blur-md lg:max-w-[calc(100vw-29rem)]">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">{title}</div>
        <button type="button" onClick={() => setTitleOpen(!titleOpen)} aria-expanded={titleOpen} aria-label={titleOpen ? 'Fold away the details' : 'Show the details'} title={titleOpen ? 'Fold away' : 'Show more'} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground">
          {titleOpen ? <Minus className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {titleOpen && children && <div className="px-4 pt-1">{children}</div>}
      <div className="px-4 pb-3 pt-2">
        <button type="button" onClick={toDetails} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-[11.5px] text-muted-foreground transition hover:border-foreground/40 hover:text-foreground">
          In depth <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
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
  const [asideOpen, setAsideOpen] = useState(true);
  const [titleOpen, setTitleOpen] = useState(true);
  const [walking, setWalking] = useState(false);
  const panels = useMemo(() => ({ asideOpen, setAsideOpen, titleOpen, setTitleOpen, walking }), [asideOpen, titleOpen, walking]);
  const next = props?.project || null;
  const key = modelKey(next);
  if (next && key !== model.current.key) model.current = { key, project: next };
  const project = model.current.project;
  const ctx = useMemo(() => ({ setProps, overlay, panels }), [overlay, panels]);

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
              arrangementsEl={props.arrangementsEl || null}
              onWalkChange={setWalking}
            />
          ) : (
            <div className="flex h-full items-center justify-center" role="status" aria-label="Opening your property">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {/* The step's panels. Out of the way during a walk-through, when they can't be used. */}
          <div ref={setOverlay} className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-opacity duration-300 ${walking ? 'invisible opacity-0' : ''}`} style={{ top: 'var(--header-h, 4rem)' }} />
        </section>
      )}
      <Outlet />
    </StageContext.Provider>
  );
}
