import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';
import { CIVIC_SCANS, CIVIC_SCAN_NOTE } from '@/data/civicScans';

// For cities, water agencies and campuses: what a resident sees, what a
// partner gets, and real scans of public properties (never private homes).
const PARTNER_GETS = [
  ['Every feature free for every resident', 'Real 3D, design from a sentence, project tracking, exports and the community, under your program’s name.'],
  ['Your rebate on every scan', 'Residents in your service area see your lawn-replacement rebate, its rules and a link to apply, next to their own numbers.'],
  ['Area-wide estimates', 'Lawn area and potential water savings across neighborhoods you choose, for planning, council updates and grant applications.'],
  ['A monthly summary by email', 'How many residents scanned, designed and started a conversion. Counts only: no names, addresses or other personal data.'],
  ['Scans of your own properties', 'City halls, libraries, parks and schools, for your own outreach and demonstration gardens.'],
];

const STEPS = [
  ['Scan', 'A resident enters their address and confirms it on the map. EcoEstate outlines the lawn from USDA aerial photos and USGS lidar, including lawn under trees.'],
  ['Design', 'A native garden for their climate is laid out on their own lawn and shown in 3D, with a plant list and a step-by-step build plan.'],
  ['Act', 'They see the water, money and carbon saved over 10 and 30 years, the cost to install, and your rebate, with a link to apply.'],
];

const FAQ = [
  ['How accurate is the lawn measurement?', 'Lawn is found from the newest USDA NAIP aerial survey, with USGS lidar heights to remove trees and shrubs and to find grass under trees and lawn that was dry when the survey was flown. Residents confirm their property and can correct the outline before anything is calculated. Every example on this page was checked by eye against newer, sharper aerial photos.'],
  ['What data do you keep about residents?', 'Scanning needs a free account (an email address). We never sell data. Partners receive counts, not personal information. Community posts show a first name and a project summary only, never an address or property outline.'],
  ['What does a pilot look like?', 'A six-month pilot for your service area, sized to your program and budget, with a simple service agreement. Email us and we’ll set up a 20-minute call where we scan one of your own properties live.'],
  ['Whose data is this?', 'Public data: USDA NAIP imagery and USGS 3DEP lidar (public domain), county parcel maps, and OpenStreetMap and Overture Maps for roads and buildings. Google’s 3D map appears only as a backdrop around a resident’s own model, under Google’s terms.'],
];

export default function Cities() {
  usePageMeta({
    title: 'For cities and water agencies',
    description: 'EcoEstate helps residents replace lawns with native gardens: a lawn measurement, native design and rebate in about a minute. City partners make every feature free for residents.',
  });
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20">
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-accent">For cities, water agencies and campuses</p>
      <h1 className="mt-3 max-w-3xl font-display text-[2.6rem] leading-[1.05] tracking-tight sm:text-[3.4rem]">
        Help residents replace lawns, without a site visit.
      </h1>
      <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
        In about a minute, a resident sees their own lawn measured, a native garden designed for it in 3D, and what it
        saves in water and money, with your rebate and a link to apply. As a partner, you make every feature free for
        everyone you serve.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild className="rounded-full px-6">
          <a href="mailto:support@ecoestate.org?subject=City%20or%20agency%20partnership">Email us about a pilot</a>
        </Button>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link to="/">Try a scan</Link>
        </Button>
      </div>

      <section className="mt-16">
        <h2 className="font-display text-[2rem] tracking-tight">What a resident does</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="border-t border-border pt-4">
              <p className="font-display text-[1.6rem] text-accent">{i + 1}</p>
              <p className="mt-1 text-[16px] font-medium">{t}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-[2rem] tracking-tight">Scans of public properties</h2>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">{CIVIC_SCAN_NOTE}</p>
        <ul className="mt-8 grid gap-8 md:grid-cols-2">
          {CIVIC_SCANS.map((s) => (
            <li key={s.name} className="overflow-hidden rounded-2xl border border-border bg-card">
              <img
                src={s.image}
                alt={`${s.name}: aerial photo, and the same photo with the lawn EcoEstate found outlined in green and the property line in yellow`}
                className="aspect-[2/1] w-full bg-secondary object-cover"
                loading="lazy"
              />
              <div className="p-5">
                <p className="text-[12.5px] text-muted-foreground">{s.city}</p>
                <p className="mt-0.5 font-display text-[1.35rem] leading-tight tracking-tight">{s.name}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <dt className="text-muted-foreground">Lawn found</dt>
                    <dd className="font-display text-[1.4rem] leading-tight">{s.lawnSqft.toLocaleString()} sq ft</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Water saved if converted</dt>
                    <dd className="font-display text-[1.4rem] leading-tight">{s.gallons.toLocaleString()} gal/yr</dd>
                  </div>
                </dl>
                {s.note && <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{s.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-display text-[2rem] leading-tight tracking-tight">What a partner gets</h2>
          <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
            Your program sponsors EcoEstate for your residents. They get every feature free; you get more lawn
            conversions per staff hour, and the numbers to show it.{' '}
            <Link to="/plans" className="text-foreground underline underline-offset-4">Compare plans</Link>
          </p>
        </div>
        <ul className="space-y-4">
          {PARTNER_GETS.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              <div>
                <p className="text-[15px] font-medium">{t}</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-[2rem] tracking-tight">Questions</h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <div key={q} className="grid gap-2 py-5 sm:grid-cols-[1fr_2fr] sm:gap-8">
              <dt className="text-[15px] font-medium">{q}</dt>
              <dd className="text-[14.5px] leading-relaxed text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10">
        <h2 className="font-display text-[2rem] leading-tight tracking-tight">See your own city scanned</h2>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-primary-foreground/80">
          Tell us which properties you’d like to see, and we’ll send scans back, free. Julian Rabbitt-Tomita, founder.
        </p>
        <Button asChild variant="secondary" className="mt-6 rounded-full px-6">
          <a href="mailto:support@ecoestate.org?subject=Scans%20of%20our%20properties">support@ecoestate.org</a>
        </Button>
      </section>
    </div>
  );
}
