import { Link } from 'react-router-dom';
import { ArrowRight, Bird, Bug, CloudRain, Droplets, ExternalLink, Leaf, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REGIONS } from '@/data/regions';

// Why native plants matter. Figures are only those we can source; each card
// links to where it comes from. Keep it that way when editing.
const REASONS = [
  {
    icon: Bug,
    title: 'They feed the insects everything else depends on',
    body: 'Plants and local insects evolved together, so most plant-eating insects, especially caterpillars, can only feed on the native plants they grew up with. Lawns and many imported ornamentals feed almost none of them. Native oaks alone support 557 species of caterpillars.',
    source: { label: 'University of Delaware, quoting entomologist Doug Tallamy', url: 'https://www.udel.edu/udaily/2018/october/non-native-plants-birds-insects-washington-chickadee-desiree-narango-doug-tallamy/' },
  },
  {
    icon: Bird,
    title: 'Birds need them to raise their young',
    body: 'Most songbirds feed their chicks insects, mostly caterpillars, even species that eat seeds as adults. A study of Carolina chickadees around Washington, D.C. found yards needed at least 70 percent native plants for the birds to keep their population going; below that, there weren’t enough caterpillars.',
    source: { label: 'Narango, Tallamy & Marra, PNAS (2018), via the University of Delaware', url: 'https://www.udel.edu/udaily/2018/october/non-native-plants-birds-insects-washington-chickadee-desiree-narango-doug-tallamy/' },
  },
  {
    icon: Droplets,
    title: 'They’re made for your rainfall',
    body: 'Native plants are adapted to the rain, heat and soil where you live, so once established most need little or no extra watering, unlike a lawn. Watering outside the home uses nearly 8 billion gallons of water a day across the US, mainly for landscapes.',
    source: { label: 'US EPA WaterSense', url: 'https://www.epa.gov/watersense/outdoors' },
  },
  {
    icon: CloudRain,
    title: 'Deeper roots, healthier soil',
    body: 'Lawn grass has shallow roots. Many native grasses, wildflowers and shrubs root far deeper, which helps rain soak into the ground instead of running off into storm drains, and builds soil over time.',
  },
  {
    icon: Leaf,
    title: 'Less mowing, fertilizer and spraying',
    body: 'A planting that belongs where it grows doesn’t need weekly mowing, regular fertilizer or pesticides to look good. That saves time and money and keeps those chemicals out of local streams.',
  },
  {
    icon: Sprout,
    title: 'Your yard connects to a bigger habitat',
    body: 'Every native yard is a stepping stone between parks and wild places, giving bees, butterflies and birds food and shelter across a neighborhood. Small yards add up.',
  },
];

const regionSources = Object.values(REGIONS)
  .filter((r) => r.source?.url)
  .map((r) => ({ name: r.name, ...r.source }));

export default function WhyNative() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12">
      <p className="label-xs">Why native plants</p>
      <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight sm:text-[2.6rem]">
        Plants that <em className="italic text-accent">belong</em> where they grow
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Native plants are the species that grew in your area before modern landscaping: the wildflowers, grasses,
        shrubs and trees your local insects, birds and soil evolved with. Replacing even part of a lawn with them turns
        a yard that mostly needs water and mowing into one that feeds wildlife and takes care of itself.
      </p>

      <section className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-6">
        <p className="label-xs">Our mission</p>
        <blockquote className="mt-3 font-display text-xl leading-snug tracking-tight sm:text-2xl">
          “I converted my own lawn in Palo Alto to native plants. I saved thousands of dollars, and I loved how my yard
          looked afterward. That’s when I saw how the same change could work for everyone else. EcoEstate exists to make
          that switch simple for any home: measure the lawn, design a garden that belongs there, and show what it’s
          worth.”
        </blockquote>
        <p className="mt-3 text-[13px] text-muted-foreground">Julian Rabbitt-Tomita, founder</p>
      </section>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {REASONS.map(({ icon: Icon, title, body, source }) => (
          <section key={title} className="surface p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="h-4 w-4 text-accent" aria-hidden />
              </span>
              <h2 className="text-[15px] font-medium leading-tight tracking-tight">{title}</h2>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
            {source && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12px] text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Source: {source.label} <ExternalLink className="h-3 w-3" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </section>
        ))}
      </div>

      <section className="mt-10 surface p-6">
        <h2 className="font-display text-2xl tracking-tight">What counts as native?</h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          “Native” is always local: a plant native to California deserts isn’t native to a Maryland backyard. EcoEstate
          picks species for the region your property is in, and your plant list and arrangements only include plants
          that belong there. A few tips:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-muted-foreground">
          <li>Mix plants that flower at different times, so there is food from spring through fall.</li>
          <li>Include some shrubs or a tree if you have room. They host the most insects and give birds cover.</li>
          <li>Leave fallen leaves and seed heads over winter; many insects spend the winter there.</li>
          <li>Buy from local native plant nurseries, and avoid plants treated with systemic insecticides.</li>
          <li>Native doesn’t mean no care: water new plantings for their first season or two while roots establish.</li>
        </ul>
      </section>

      <section className="mt-6 surface p-6">
        <h2 className="font-display text-2xl tracking-tight">Find natives for your area</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">Trusted regional guides we use for EcoEstate’s plant lists:</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {regionSources.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer" className="group block rounded-xl border border-border p-3 hover:border-primary/30">
                <span className="block text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{r.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[13px] text-foreground">
                  {r.label} <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                </span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary p-6 text-primary-foreground">
        <div>
          <p className="font-display text-2xl tracking-tight">See what your lawn could become</p>
          <p className="mt-1 text-[13px] text-primary-foreground/80">Scan your property to get a native design, rebates and the payoff.</p>
        </div>
        <Button asChild variant="secondary" className="rounded-full">
          <Link to="/">
            Scan your property <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
