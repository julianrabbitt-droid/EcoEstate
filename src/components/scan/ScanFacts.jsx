import { useEffect, useState } from 'react';
import { Leaf } from 'lucide-react';

const FACTS = [
  'Native plants use up to 80% less water than turf lawns once established.',
  'A 1,000 sq ft native yard can save over 30,000 gallons of water each year.',
  'Native gardens support 50× more pollinators than a conventional lawn.',
  'Deep native roots hold soil, filter runoff, and need no synthetic fertilizer.',
  'Turf grass is the single most irrigated "crop" in the United States.',
  'Mature oaks host over 500 species of caterpillars — food for songbirds.',
  'Native milkweed is the only plant monarch butterflies can lay eggs on.',
  'Replacing your lawn can cut maintenance time and cost by up to 70%.',
  'Native plants sequester carbon in deep roots that turf never reaches.',
  'Many rebates pay $2–$5 per square foot of lawn you convert.',
];

export default function ScanFacts() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * FACTS.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % FACTS.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-5 mx-auto flex max-w-xs items-start gap-2 rounded-2xl bg-secondary/60 px-4 py-3">
      <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <p key={index} className="text-[12px] leading-relaxed text-muted-foreground transition-opacity">
        <span className="font-medium text-foreground">While we wait — </span>
        {FACTS[index]}
      </p>
    </div>
  );
}