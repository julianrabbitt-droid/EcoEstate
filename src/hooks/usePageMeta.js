import { useEffect } from 'react';

const SITE = 'EcoEstate';
const DEFAULT_DESCRIPTION =
  'See your lawn outlined from satellite imagery, design a native garden for it, and find out what it could save in water and money, with your local rebates.';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Page title and description for search engines and link previews.
export function usePageMeta({ title, description = DEFAULT_DESCRIPTION } = {}) {
  useEffect(() => {
    const full = title ? `${title} | ${SITE}` : `${SITE}: turn your lawn into a native garden`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
  }, [title, description]);
}
