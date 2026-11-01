export function contourPath(points, rounded = false) {
  if (!Array.isArray(points) || points.length < 3) return '';
  const ring = points.map(p => ({ x: p.x * 1000, y: p.y * 1000 }));
  const pair = p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  if (!rounded) return `M${ring.map(pair).join(' L')} Z`;
  // Small, bounded corner rounding keeps the trace on the actual turf edge;
  // unrestricted splines would bulge into driveways and neighboring land.
  const corners = ring.map((p, i) => {
    const prev = ring[(i + ring.length - 1) % ring.length], next = ring[(i + 1) % ring.length];
    const a = Math.hypot(prev.x - p.x, prev.y - p.y), b = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(2, a * 0.12, b * 0.12);
    return { p, enter: { x: p.x + (prev.x - p.x) * r / (a || 1), y: p.y + (prev.y - p.y) * r / (a || 1) }, exit: { x: p.x + (next.x - p.x) * r / (b || 1), y: p.y + (next.y - p.y) * r / (b || 1) } };
  });
  return `M${pair(corners[0].enter)} ${corners.map(c => `L${pair(c.enter)} Q${pair(c.p)} ${pair(c.exit)}`).join(' ')} Z`;
}