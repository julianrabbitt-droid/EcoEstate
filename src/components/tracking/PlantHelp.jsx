import { useMemo, useState } from 'react';
import { Check, Copy, Droplets, ExternalLink } from 'lucide-react';
import { plantById } from '@/data/nativePlants';
import { plantsForProject } from '@/data/regions';
import { EXPERT_LINKS, SYMPTOMS, symptomById } from '@/data/plantSymptoms';
import { countyFromAddress, isCaliforniaAddress, wateringAdvice } from '@/lib/wateringGuide';

const pill = (active) =>
  `rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
    active ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-secondary'
  }`;

const OTHER = 'other';

// Free symptom checker, watering guide and links to real experts. No AI.
export default function PlantHelp({ tracked, project, latestEntry }) {
  const address = tracked?.address || project?.address || '';
  const isCalifornia = isCaliforniaAddress(address);
  const county = countyFromAddress(address);

  const designPlants = useMemo(() => {
    const seen = new Set();
    return (project?.design || [])
      .map((d) => plantById(d.speciesId))
      .filter((p) => p && !seen.has(p.id) && seen.add(p.id));
  }, [project]);

  const choices = useMemo(() => {
    if (designPlants.length) return designPlants;
    try {
      return plantsForProject(project || tracked || {}).slice(0, 40);
    } catch {
      return [];
    }
  }, [designPlants, project, tracked]);

  const [plantId, setPlantId] = useState('');
  const [symptomId, setSymptomId] = useState('');
  const [copied, setCopied] = useState(false);

  const plant = plantId && plantId !== OTHER ? plantById(plantId) : null;
  const symptom = symptomById(symptomId);
  const lowWater = plant && (plant.water === 'Very low' || plant.water === 'Low');
  const plantChosen = !!plantId;

  const watering = plantChosen
    ? wateringAdvice({ plant, startDate: tracked?.startDate, today: new Date(), isCalifornia })
    : null;

  const copyDetails = async () => {
    const lines = [
      `Property: ${tracked?.name || address || 'n/a'}`,
      address && `Location: ${address}`,
      `Plant: ${plant ? `${plant.common} (${plant.scientific})` : 'Not sure / other'}`,
      `Problem: ${symptom?.label || 'Not selected'}`,
      tracked?.startDate && `Planting/start date: ${tracked.startDate}`,
      tracked?.convertedSqft != null && `Lawn converted so far: ${Math.round(tracked.convertedSqft)} sq ft`,
      latestEntry?.notes && `Latest note: ${latestEntry.notes}`,
      latestEntry?.date && `Latest update: ${latestEntry.date}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your details:', lines.join('\n'));
    }
  };

  const linkCls = 'inline-flex items-center gap-1 text-[12.5px] underline underline-offset-2 hover:text-foreground';

  return (
    <section className="surface p-5">
      <p className="label-xs">Plant help</p>
      <h2 className="mt-1.5 font-display text-2xl tracking-tight">Something looks off?</h2>
      <p className="mt-1.5 max-w-xl text-[12.5px] text-muted-foreground">
        Pick a plant and what you see for likely causes and simple, low-chemical fixes. It is free and works without photos or AI.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <p className="label-xs">1. Which plant?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.map((p) => (
              <button key={p.id} type="button" onClick={() => setPlantId(p.id)} aria-pressed={plantId === p.id} className={pill(plantId === p.id)}>
                {p.common}
              </button>
            ))}
            <button type="button" onClick={() => setPlantId(OTHER)} aria-pressed={plantId === OTHER} className={pill(plantId === OTHER)}>
              Other plant
            </button>
          </div>

          <p className="label-xs mt-5">2. What do you see?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSymptomId(s.id)} aria-pressed={symptomId === s.id} className={pill(symptomId === s.id)}>
                {s.label}
              </button>
            ))}
          </div>

          {watering && (
            <div className="mt-5 rounded-xl border border-border p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Droplets className="h-4 w-4 shrink-0" /> Watering{plant ? `: ${plant.common}` : ''}
              </p>
              <p className="mt-1.5 text-[13px]">{watering.headline}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-muted-foreground">
                {watering.detail.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {symptom && (
            <div className="mt-5">
              <p className="label-xs">Likely causes</p>
              <ul className="mt-2 space-y-3">
                {[...symptom.causes]
                  .sort((a, b) => Number(!!(lowWater && b.lowWater)) - Number(!!(lowWater && a.lowWater)))
                  .map((c) => (
                    <li key={c.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-medium tracking-tight">{c.name}</h3>
                        {lowWater && c.lowWater && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[12px] text-muted-foreground">
                            Most likely for this plant
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                        <span className="font-medium text-foreground">How to tell: </span>
                        {c.howToTell}
                      </p>
                      <p className="mt-2 text-[12.5px] font-medium">What to do</p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12.5px] text-muted-foreground">
                        {c.whatToDo.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <a href={c.link} target="_blank" rel="noreferrer" className={`${linkCls} mt-2`}>
                        {c.link.includes('ipm.ucanr.edu') ? 'Read the UC IPM guide' : 'Read more'} →
                      </a>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-[12px] text-muted-foreground">
                Not listed?{' '}
                <a href={EXPERT_LINKS.diagnostic} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Try UC IPM&apos;s plant problem diagnostic tool
                </a>
              </p>
            </div>
          )}
        </div>

        <aside className="min-w-0 self-start rounded-xl border border-border p-4">
          <p className="label-xs">Ask a real expert, free</p>
          <div className="mt-3 flex flex-col gap-2">
            {isCalifornia ? (
              <a
                href={EXPERT_LINKS.masterGardeners}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-center text-[12.5px] text-background"
              >
                Ask {county ? `${county}'s` : "your county's"} UC Master Gardeners <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <a
                href={EXPERT_LINKS.findExtension}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-center text-[12.5px] text-background"
              >
                Find your local extension office <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )}
            <a
              href={EXPERT_LINKS.askExtension}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-center text-[12.5px] hover:bg-secondary"
            >
              Ask Extension (answered by university experts, attach photos) <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            <button
              type="button"
              onClick={copyDetails}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] hover:bg-secondary"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy details for your question'}
            </button>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Paste the copied details into the expert form along with your photos. Experts usually reply within a few days.
          </p>
        </aside>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
        Guidance summarised from UC IPM, Calscape and CNPS. For pesticide use, large trees or irrigation repairs, ask a licensed professional.
      </p>
    </section>
  );
}
