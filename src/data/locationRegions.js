// Administrative geography, not climate similarity, determines native ranges.
const GROUPS = {
  pacific: 'CA', pacnw: 'WA OR', mountain: 'AZ CO ID NM NV UT WY',
  southcentral: 'TX OK AR LA', prairie: 'IL IN OH MI WI MN IA MO KS NE ND SD MT',
  southeast: 'AL FL GA MS TN KY NC SC VA WV', midatlantic: 'NY PA NJ DE MD DC',
  northeast: 'CT MA ME NH RI VT', alaska: 'AK', hawaii: 'HI',
};
const STATE_NAMES = 'AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming';
export function usStateCode(state) {
  const value = String(state || '').trim().replace(/^US-/i, '').toLowerCase();
  return STATE_NAMES.split('|').map((pair) => pair.split(':')).find(([code, name]) => value === code.toLowerCase() || value === name.toLowerCase())?.[0] || '';
}
export function usRegionForState(state) {
  const code = usStateCode(state);
  return Object.entries(GROUPS).find(([, states]) => states.split(' ').includes(code))?.[0] || 'unknown';
}
// Three-digit USPS ranges retain leading zeroes and separate islands/territories.
const ZIP_RANGES = [
  [6, 9, 'unknown'], [10, 27, 'northeast'], [28, 29, 'northeast'], [30, 49, 'northeast'],
  [50, 59, 'northeast'], [60, 69, 'northeast'], [70, 89, 'midatlantic'], [100, 199, 'midatlantic'],
  [200, 219, 'midatlantic'], [220, 299, 'southeast'], [300, 399, 'southeast'],
  [400, 427, 'southeast'], [430, 699, 'prairie'], [700, 799, 'southcentral'],
  [800, 816, 'mountain'], [820, 834, 'mountain'], [835, 838, 'mountain'],
  [840, 865, 'mountain'], [870, 898, 'mountain'], [900, 961, 'pacific'],
  [967, 968, 'hawaii'], [969, 969, 'unknown'], [970, 986, 'pacnw'],
  [988, 994, 'pacnw'], [995, 999, 'alaska'],
];
export function usRegionForZip(zip) {
  const value = String(zip || '').trim();
  if (!/^\d{5}(-\d{4})?$/.test(value)) return 'unknown';
  const prefix = Number(value.slice(0, 3));
  if (prefix === 569) return 'midatlantic';
  if (prefix === 885) return 'southcentral';
  return ZIP_RANGES.find(([start, end]) => prefix >= start && prefix <= end)?.[2] || 'unknown';
}
export function countryCodeFor(location = {}) {
  const raw = String(location.countryCode || '').trim().toUpperCase();
  if (raw) return raw === 'UK' ? 'GB' : raw;
  const country = String(location.country || '').trim().toLowerCase();
  if (['united states', 'united states of america', 'usa', 'us'].includes(country)) return 'US';
  if (['united kingdom', 'great britain', 'uk'].includes(country)) return 'GB';
  if (country && typeof Intl.DisplayNames === 'function') {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (names.of(code)?.toLowerCase() === country) return code;
    }
  }
  // A state name is stronger evidence than an ambiguous foreign numeric postcode.
  return !country && usStateCode(location.state) ? 'US' : '';
}