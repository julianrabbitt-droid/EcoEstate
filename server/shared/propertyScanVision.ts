const point = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] };
const ring = { type: 'array', items: point };
export const featureTypes = ['lawn', 'path', 'tree', 'other'];

async function saveScanImage(base44, dataBase64, type, name) {
  const bytes = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
  const file = new File([bytes], name, { type });
  const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
  const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
  return { url: signed_url, fileUri: file_uri };
}

export async function privateStreetView(base44, view) {
  const match = view?.available && view.image?.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return await saveScanImage(base44, match[2], match[1], 'property-street-view.jpg');
}

export async function fetchSatelliteFrame(base44, frame, maptype = 'satellite') {
  const response = await base44.asServiceRole.connectors.callApi('google_maps', {
    method: 'GET', host: 'maps', path: '/maps/api/staticmap',
    query: { center: `${frame.lat},${frame.lng}`, zoom: String(frame.zoom), size: '640x640', scale: '2', maptype, format: 'jpg' },
  });
  if (response?.success === false || !response?.dataBase64) throw new Error('Satellite imagery is unavailable for this location.');
  return await saveScanImage(base44, response.dataBase64, response.contentType || 'image/jpeg', 'property-satellite.jpg');
}

function anchorLine(frame) {
  const world = 256 * 2 ** frame.zoom;
  const mercatorY = (lat) => (0.5 - Math.log((1 + Math.sin((lat * Math.PI) / 180)) / (1 - Math.sin((lat * Math.PI) / 180))) / (4 * Math.PI)) * world;
  const anchorX = 0.5 + ((frame.targetLng - frame.lng) / 360) * world / 640;
  const anchorY = 0.5 + (mercatorY(frame.targetLat) - mercatorY(frame.lat)) / 640;
  return `The original address anchor is at normalized image coordinates x=${anchorX.toFixed(4)}, y=${anchorY.toFixed(4)}. Trace the property containing that anchor, not a different feature near the image center. The anchor may sit near an entrance rather than the lot center.`;
}

export async function tracePropertyFrame(base44, image, frame, address, recordSqft, buildingPolygon = []) {
  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    file_urls: [image.url],
    response_json_schema: {
      type: 'object', properties: {
        lotPolygon: ring, housePolygon: ring, clipped: { type: 'boolean' },
        confidence: { type: 'number' }, notes: { type: 'string' },
      }, required: ['lotPolygon', 'housePolygon', 'clipped', 'confidence', 'notes'],
    },
    prompt: [
      'Locate the land belonging to the target address in this exact north-up satellite image. Return only geometry as JSON, not an edited image.',
      anchorLine(frame),
      `Target address: ${address || 'the property containing the anchor'}.`,
      buildingPolygon.length ? `The address lookup supplied this BUILDING FOOTPRINT, not a parcel: ${JSON.stringify(buildingPolygon)}. Use it only to identify the house. Never use its roof perimeter as the property line.` : '',
      'First locate the house, then inspect the land on ALL sides of it, especially adjacent side lawns on spacious or rural properties. The address pin often lies on the roof, not at the center of the land. A side yard can be much larger than the house.',
      'Trace lotPolygon using the enclosing fence, wall, hedge, street frontage and other visible boundaries separating this property from neighboring parcels. Include contiguous yards and lawn within those boundaries, not just the building or driveway. Do not assume every unbuilt area belongs to the address simply because no other house is visible. Never cross a neighboring property line or public road to collect grass.',
      'Return housePolygon separately for the house roof. The house is inside the lot; the two are not interchangeable. The lawn pass will keep your lot boundary fixed, so do not cut off the adjacent grounds.',
      'Coordinates are ordered perimeter vertices in THIS image: x=0 left, x=1 right, y=0 top, y=1 bottom. Follow actual irregular edges without crossing edges or repeating the first vertex.',
      'Set clipped=true if the full property extends past the image. Return an empty lotPolygon if the property cannot be distinguished from its neighbors. Do not invent legal lines or close a partial parcel along the image edge.',
      recordSqft ? `An address-matched record reports ${recordSqft} sq ft. Use only as a plausibility check, never resize a boundary to fit it.` : 'These are visual boundary estimates, not surveyed legal parcel lines. Be conservative where ownership is unclear.',
      'Include a short factual note about uncertainty.',
    ].filter(Boolean).join(' '),
  });
}

// Building description moved to a deterministic footprint-based estimate in
// propertyEstimate.ts (describeBuildingFromFootprint). The previous LLM read
// of the street-view photo is removed to avoid per-scan AI usage; the 3D view
// already used the same footprint heuristic as its fallback.

// Fixed-outline mode: a public-data boundary (campus, park, parcel) is known.
// Trace only the lawns inside it — green grass in any shade — and ignore buildings, paths and roads.
export async function traceLawnsInOutline(base44, image, frame, address, lotPolygon, outlineAreaSqft, searchPatch = false) {
  const schema = {
    type: 'object', properties: {
      lawns: { type: 'array', items: { type: 'object', properties: { polygon: ring, holes: { type: 'array', items: ring } }, required: ['polygon', 'holes'] } },
      buildings: { type: 'array', items: { type: 'object', properties: { polygon: ring }, required: ['polygon'] } },
      trees: { type: 'array', items: { type: 'object', properties: { point: point, r: { type: 'number' } }, required: ['point', 'r'] } },
      paths: { type: 'array', items: { type: 'object', properties: { polygon: ring }, required: ['polygon'] } },
      confidence: { type: 'number' }, notes: { type: 'string' },
    }, required: ['lawns', 'buildings', 'trees', 'paths', 'confidence', 'notes'],
  };
  const prompt = [
    'Analyze this exact north-up Google satellite image. Return geometry, not a generated or edited image.',
    `Target: ${address || 'the property shown'}.`,
    'lotPolygon below is the fixed search boundary in THIS image: x=0 left, x=1 right, y=0 top, y=1 bottom. Do NOT replace it with the roof, expand it toward neighboring grass, or cross it. It may be a visual estimate, not a legal survey.',
    searchPatch ? 'This is an off-center detail view of ONE PART of the same property, not a new property. Inspect all visible land inside the supplied boundary, even if the target house is outside this view. The boundary is clipped at the image edge; trace the visible lawn portions up to it without claiming grass outside it.' : 'Inspect the ENTIRE supplied property, including the land next to the house, not only the area around the image center.',
    JSON.stringify({ lotPolygon }).length < 600 ? `lotPolygon: ${JSON.stringify({ lotPolygon })}` : `lotPolygon: ${JSON.stringify(lotPolygon)}`,
    outlineAreaSqft ? `The property's approximate area is ${outlineAreaSqft} sq ft; do not invent grass to match an area.` : '',
    'Inside that boundary, trace EVERY visible lawn, including side, front and back lawns, lighter yellow-green turf and recognizable seasonally dry grass. A large property may contain many separate lawns. A side lawn beside an isolated house is just as important as a front lawn. Do not confuse grass with tree canopy, bare ground or the building.',
    'IGNORE and DO NOT trace as lawn: buildings and roof outlines, roads, paths, walkways, driveways, parking lots, hardscape, pavement, water, bare soil, gravel, mulch beds and tree canopy. If any of these sit inside a lawn, cut them out as holes in that lawn polygon so the lawn follows the actual grass edge around them.',
    'Inspect this supplied image, not your memory of the place. Follow the actual grass edge with enough vertices for every curve, indentation and narrow strip (typically 16-80 points for curved or irregular lawns, fewer for truly straight edges). Keep straight edges straight. A four-point rectangle over a curved or irregular lawn is NOT acceptable. Lawn polygons must not overlap each other and must stay inside lotPolygon.',
    'Where no grass is visible inside the boundary, return an empty lawns array.',
    'Also trace every visible BUILDING footprint (houses, garages, sheds, roofed structures, large covered structures) inside the boundary as polygons in `buildings`. Trace the ground-level roof outline, not overhanging trees. If a building is only partially visible, set its outline to the visible portion and keep clipped vertices honest. Return an empty buildings array where no buildings are visible.',
    'In `trees`, mark every EXISTING tree (mature canopy visible from above) inside the boundary with its canopy center as `point` {x,y} in THIS image and `r` as the canopy radius in normalized image units (roughly 0.01 for a small tree up to 0.05 for a large one). Exclude shrubs and the designed plants. Return an empty trees array where no mature trees are visible.',
    'In `paths`, trace every visible paved or hardscape path — walkways, driveways, concrete pads, pavers — inside the boundary as a polygon. Do not include roads or the building roof. Where a path crosses a lawn, still trace it separately; the lawn pass will cut it out as a hole. Return an empty paths array where none are visible.',
    'Calibrate confidence down for shadows, low resolution or heavy tree cover.',
    'Return a short factual note and only the requested JSON.',
  ].filter(Boolean).join(' ');
  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt, file_urls: [image.url], response_json_schema: schema, model: 'gpt_6_sol',
  });
}