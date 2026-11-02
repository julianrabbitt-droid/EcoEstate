// Scans of public properties shown on the For cities page (never private
// homes). Each one was checked by eye against newer, sharper aerial photos
// before being listed. Images: USDA NAIP photo (public domain) on the left, the
// same with the lawn found in green and the property line in yellow on the right.
// Areas are rounded; water uses the scan's default model (45 in/yr reference
// evapotranspiration, turf 0.8 → established natives 0.3).
export const CIVIC_SCAN_NOTE =
  'Public properties scanned with the same tool residents use, from the newest USDA aerial survey (2022) and USGS lidar. We checked each one by eye against newer aerial photos before listing it. Water savings assume the lawn is replaced with established native plants.';

export const CIVIC_SCANS = [
  {
    name: 'Santa Barbara County Courthouse',
    city: 'Santa Barbara',
    image: '/cities/santa-barbara-county-courthouse.jpg',
    lawnSqft: 72000,
    gallons: 1009000,
    note: 'The Sunken Garden and the smaller lawns around the building.',
  },
  {
    name: 'Los Altos Civic Center and Library',
    city: 'Los Altos',
    image: '/cities/los-altos-civic-center.jpg',
    lawnSqft: 109500,
    gallons: 1535000,
    note: 'Two large lawns, found whole; the parking, buildings and paths around them are left out.',
  },
  {
    name: 'Menlo Park Civic Center and Burgess Park',
    city: 'Menlo Park',
    image: '/cities/menlo-park-civic-center.jpg',
    lawnSqft: 193000,
    gallons: 2705000,
    note: 'Ballfields and park lawns; the pools, courts and tree groves are left out.',
  },
  {
    name: 'Palo Alto High School',
    city: 'Palo Alto',
    image: '/cities/palo-alto-high-school.jpg',
    lawnSqft: 185100,
    gallons: 2595000,
    note: 'Natural-grass fields and the quad. The artificial-turf stadium and soccer fields are correctly left out.',
  },
  {
    name: 'Goleta Valley Community Center',
    city: 'Goleta',
    image: '/cities/goleta-valley-community-center.jpg',
    lawnSqft: 33900,
    gallons: 475000,
    note: 'The playing field, including the patches that were dry when the 2022 survey was flown.',
  },
];
