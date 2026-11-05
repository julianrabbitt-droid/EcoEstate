# Lawn-to-native API

Send an address, get back lawn square footage, lawn outlines (GeoJSON), and estimated savings from converting to native plants. Runs entirely on free public data; the only credential is a Geocodio API key.

## Setup

```bash
npm install
cp .env.example .env   # add GEOCODIO_API_KEY
npm run dev
```

Check what's configured: `GET http://localhost:3000/health`

## How it works

1. **Address → location:** [Geocodio](https://www.geocod.io/docs/) `GET /v2/geocode` (US only). The key is sent in the `Authorization` header and never logged. Matches coarser than an address point or interpolated house number are rejected.
2. **Property line:**
   - **County parcel maps** for every California county that publishes one publicly (ArcGIS services, plus DataSF for San Francisco), cached by parcel ID. The list is in `lib/counties.json`, built and verified by `npm run discover-counties`. `parcelSource: "county"`. A point that lands in no parcel (a geocoder that only knows the street puts the number on its centre line; pins get dropped on the sidewalk) takes the nearest parcel within 30 m, preferring one on the address's own street.
   - **Everywhere else:** the building footprint at the address from [Overture Maps](https://docs.overturemaps.org/) (Microsoft, Google and OpenStreetMap buildings), with a rectangle around it that's aligned to the house and stops halfway to neighbouring houses. `parcelSource: "estimated"`: ask the user to adjust it, then re-measure with `POST /v1/lawn`.
3. **Lawn:** the most recent [USDA NAIP](https://planetarycomputer.microsoft.com/dataset/naip) aerial survey (0.6 m, red/green/blue/near-infrared) from Microsoft Planetary Computer. Pixels with NDVI ≥ 0.2 count as green. Trees are removed two ways: anything taller than 1 m in [Meta's canopy height map](https://registry.opendata.aws/dataforgood-fb-forests/) (v2 by default, grown by one pixel because it sits slightly off the imagery in places), and green areas whose near-infrared texture is lumpy like a tree crown rather than smooth like turf. The result is cleaned up, vectorized, clipped to the property line, and fragments under 75 sq ft are dropped. `method: "naip"`.

   Lawn pieces split by narrow gaps (paths, edging) are joined, never across trees or roofs. Where OpenStreetMap has a hand-mapped grass area or sports field and the imagery shows at least half of it green, its whole outline is used (minus trees and roofs). Each lawn is then drawn as a simple shape, not the pixel trace: a rectangle, an oval, a smooth curve, a squared-up polygon (an L or U beside a house) or a simple polygon of at most 10 corners (16 on lawns over 5,000 sq ft). The simplest one is taken that covers at least 70% of the lawn found, is at least 78% lawn, and touches a roof, path, tree or the property line on no more than 5% of it; inward corners and spikes count against a shape. Holes under 120 sq ft are left out, bigger ones are simple shapes too. Each lawn's `shape` says which it got (`rectangle`, `oval`, `curve`, `polygon`, or `outline` when nothing fits), and its `areaSqft` is still the lawn measured, with `outlineSqft` the shape's own area. Touching lawns are merged into groups.
4. **Buildings, trees and the rest of the yard** (`buildings`, `trees`, `bushes`, `paved`, `pools` in the response):
   - Building footprints from Overture Maps, each with `heightFt` and `heightSource`: `overture_height`, `overture_floors` (3.2 m per floor plus roof), `canopy_height_model` (when it reads most of the roof as raised), or `footprint_estimate` (from footprint size).
   - Trees as canopy-height peaks: `{ lat, lon, heightFt, radiusFt }`, the crown's radius measured on the canopy map (the median reach from the peak in 16 directions, until the canopy falls below 40% of the tree's height or climbs out of the dip into the next crown; a radius of at most 0.35 × height and 50 ft; ≈ 0.28 × height where the map shows too little), limited so neighbours don't overlap. A tree on flat ground is left out (the canopy map is stale or wrong there): over 70% of its crown the lidar sees nothing tree- or shrub-high, or, without lidar, the photo shows smooth turf; its ground is judged as lawn like any other. Very large properties keep the 600 largest buildings and 800 tallest trees. Street trees between the property line and a bordering road (planting strip, overhanging neighbours) are included with `street: true`, for the 3D model; they never affect the lawn.
   - Roads and paths bordering the property (`nearbyRoads`, despite the name it includes paths), within 25 m of the property line, drawn outside it and ending along one even perimeter 30 m out, for orientation.
   - Bushes and hedges (`bushes`): `{ lat, lon, heightFt, radiusFt }`, from shrub-height growth (dense lidar returns 2 ft up to tree height, never a stray one on flat ground; without lidar the canopy map's growth over 3 ft where the photo isn't smooth turf) that reads at least faintly green, on the property but not under a tree's crown, beside a roof, in a pool or in the lawn. Each patch is filled with round bushes, the widest first and up to about 10 ft across, so a hedge comes back as a row of them.
   - Paving and walks (`paved`): bare, flat, bright ground as `kind: "paved"` patches (driveways, patios), and the narrow strips between as `kind: "walk"` (at least 10 ft long, 2–8 ft wide on average, leading to a house, other paving or the street).
   - The neighbours' buildings beside the lot (`neighbours`): outlines of other buildings within 4 m of the property line, so the 3D view can leave a row house or a garage on the line whole.
   - Swimming pools (`pools`): turquoise water in the open, compact and pool-sized (blue-grey shade and shaded alleys are left out).
   - The ground's heights (`terrain`) for the 3D model: USGS 3DEP bare earth over the property and 30 m around it, `{ west, south, east, north, cols, rows, base, h }` with `h` in decimetres above `base` metres, row-major from the north-west corner; `null` when the elevation service doesn't answer in time.
5. **Named places** (`osm=` parameter or a typed name Geocodio can't find): a campus, park or school is scanned using its whole OpenStreetMap outline (`parcelSource: "place"`). Large properties are measured at a coarser resolution (up to 2.4 m per pixel, about 23 km²).

Only small windows of the imagery and building files are downloaded per property. Each `GET /v1/lawn` response carries an `x-usage` header (e.g. `geocodio=1`) listing paid calls it made, which the app records per session.

**Lidar.** Where USGS 3DEP airborne lidar covers a home (most of the US; public domain, read from the usgs-lidar-public bucket), measured heights replace the canopy map's estimates: dense returns 2–6.5 ft above ground (shrubs, hedges, clutter) rule lawn out, canopy overhead doesn't, and grass under a canopy is found from the laser's near-infrared brightness on the ground, calibrated per scan against open lawn in view (skipped when the survey's brightness can't tell grass from bare ground). Surveys more than 3 years older than the aerial photo are ignored. The response's `lidar` field says which survey was used.

**Lawn under trees and dry lawn.** Grass-bright ground under a canopy counts only where it carries on from open lawn the photo confirms, or forms a patch of its own of at least ~160 sq ft; returns just above the ground mark groundcover and beds, which don't count. California's 2022 survey was flown in a drought, so lawn that was only faintly green then is found two ways: it was green, smooth lawn in the survey before (2020), or the laser shows open, flat ground as bright as grass (patches of at least ~270 sq ft). Where the photo is newer than the lidar and shows smooth turf, the photo decides (yards change: rebuilds, new lawns, trees taken down). The response's `dormant` field gives the dry lawn included.

**Address correction.** Geocoders often place a house number by estimating along the street. The address is moved onto the county's published address point (Overture's address theme) when one with the same number and street is within 400 m; otherwise, for an estimated position, onto OpenStreetMap's spot for that house number (which often maps the building or site, e.g. a library). `GET /v1/locate?address=…[&lat=&lon=]` returns the corrected point for the app to show before scanning.

**QA.** `node scripts/qa-homes.mjs [count] [seed]` scans a sample of Palo Alto homes and writes, per home, the Esri photo, the same with the detected lawn and property line, and the NAIP overlay, for checking by eye against newer imagery (Esri imagery is only looked at, never used in detection). `QA_ADDRESSES` and `QA_POINTS` check particular properties; `scripts/qa-sheet.mjs` and `scripts/qa-stack.mjs` combine panels for review; `scripts/showcase.mjs` renders clean before/after images from NAIP (public domain) for the website.

To check accuracy by eye, `npm run preview -- "123 Main St, City, ST"` writes `previews/<address>.png`: the NAIP photo next to the detected lawn (green), canopy-map trees (purple), texture trees (blue) and the property line (yellow, or orange when estimated). `npm run test-homes -- 100` does the same for a random sample of Palo Alto homes and writes contact sheets plus `results.csv` to `previews/homes/`. Set `CANOPY_VERSION=v1` to compare against the older Meta/WRI canopy map.

### Known limitations

- **Brown or dormant lawns are missed.** Detection relies on the grass being green in the NAIP survey (California is flown in spring/early summer). Unwatered lawns read like bare soil.
- **Low green groundcover, ivy, and shrubs under 1 m can count as lawn**, and **partly shaded lawn can be dropped** by the texture check (shadow edges look lumpy).
- **Imagery and canopy dates differ.** NAIP is from the date in `surveyDate` (2022 in California, a drought year with watering limits); the canopy maps come from other years, so new or removed trees may be wrong.
- **County parcels are assessor maps** (for tax purposes, not a legal survey). Counties with no public parcel service fall back to the estimate; see `lib/counties.json` for which.

## Calling it from your app

```js
const res = await fetch(
  `https://your-api-host/v1/lawn?address=${encodeURIComponent(address)}`,
  { headers: { 'x-api-key': 'YOUR_APP_API_KEY' } } // only if APP_API_KEY is set
);
const data = await res.json();
if (!res.ok) showError(data.error.message);
else showResult(data.lawnSqft, data.lawn, data.impact);
```

### GET /v1/lawn?address=...

Optional query params to override impact assumptions: `et0Inches`, `turfFactor`, `nativeFactor`, `waterPricePer1000Gal`, `rebatePerSqft`.

Response:

```json
{
  "address": "123 Main St, ...",
  "location": { "lat": 34.42, "lon": -119.70 },
  "parcel": { "id": "sb:051-330-002", "address": "…", "areaSqft": 7200, "geometry": { "type": "Polygon", "coordinates": [] } },
  "parcelSource": "county",
  "lawn": { "type": "FeatureCollection", "features": [ { "type": "Feature", "geometry": {}, "properties": { "areaSqft": 1850, "confidence": null } } ] },
  "lawnSqft": 1850,
  "surveyDate": "2022-05-13",
  "method": "naip",
  "impact": {
    "gallonsSavedPerYear": 25928,
    "dollarsSavedPerYear": 0,
    "estimatedRebate": 0,
    "assumptions": { "et0Inches": 45, "turfFactor": 0.8, "nativeFactor": 0.3, "waterPricePer1000Gal": 0, "rebatePerSqft": 0 }
  },
  "cached": false
}
```

`parcelSource` is `county`, `place` (a named place's OpenStreetMap outline, e.g. a campus or park), `estimated` or `user`. `confidence` is always `null` (NDVI thresholding has no per-polygon confidence).

Draw `lawn` on your map as a GeoJSON layer and `parcel.geometry` as the property outline.

### POST /v1/lawn

Re-run detection inside a property line the user adjusted (for example after an estimated boundary). Returns the same response with `parcelSource: "user"`.

```json
{ "parcel": { "type": "Polygon", "coordinates": [] }, "address": "123 Main St", "location": { "lat": 34.42, "lon": -119.70 } }
```

### POST /v1/area

Recalculate after a user edits or draws lawn outlines in your app.

```json
{ "geometry": { "type": "FeatureCollection", "features": [] }, "assumptions": { "et0Inches": 50 } }
```

Returns `{ "lawnSqft": 1720, "impact": { ... } }`.

### Errors

Every error returns `{ "error": { "code", "message" } }`. The message is safe to show users.

| Status | code | Meaning |
|---|---|---|
| 400 | missing_address / missing_geometry / invalid_geometry / parcel_too_spread | Bad request (parcel_too_spread: parts of the outline too far apart to scan together) |
| 401 | unauthorized | Wrong or missing x-api-key |
| 404 | address_not_found / address_not_precise / parcel_not_found / imagery_not_found | Nothing usable at that address |
| 422 | parcel_too_large | Property too big to measure automatically |
| 501 | not_configured | GEOCODIO_API_KEY is missing from .env |
| 502 | geocoder_error / imagery_error / buildings_error | Upstream service failed |
| 503 | busy | Too many scans waiting (see LAWN_MAX_CONCURRENT); try again shortly |

## Impact model

Yearly water saved = lawn sq ft × reference evapotranspiration (inches/yr) × (turf factor − native factor) × 0.623 gallons.
Defaults (ET0 45 in, turf 0.8, native 0.3) are placeholders: use your water district's ET0 figure or OpenET data, and set water price and rebate rates for your area.

## Before launch

- Move the in-memory caches (parcels, lawn detections, Overture file index) to Redis or a database; each lawn cache miss reads imagery and canopy windows (about 2–5 seconds).
- Add rate limiting (e.g. express-rate-limit) on /v1/lawn.
- Check the terms of each county parcel service before showing parcel lines publicly.
