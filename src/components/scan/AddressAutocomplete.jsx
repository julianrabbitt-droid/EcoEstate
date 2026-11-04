import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { autocompleteAddresses } from '@/lib/geo';

// Address input with live suggestions. Calls onChange on every keystroke and
// onSelect(hit) when the user picks a suggestion.
// onSuggestions(hits) with every new list, so the form can accept text typed
// exactly as one of them.
export default function AddressAutocomplete({value, onChange, onSelect, onSuggestions, placeholder, hint = null, hintClassName = '' }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  // An address already in the box when it appears (a scan restored on return)
  // was picked before: no suggestions for it until it's edited.
  const lastQuery = useRef((value || '').trim());
  // The query the person already submitted or dismissed: suggestions that
  // arrive for it afterwards stay closed instead of covering the page.
  const dismissed = useRef((value || '').trim());

  useEffect(() => {
    const q = (value || '').trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      lastQuery.current = q;
      return;
    }
    if (q === lastQuery.current) return;
    lastQuery.current = q;
    const handle = setTimeout(async () => {
      setFetching(true);
      const hits = await autocompleteAddresses(q);
      // A slower answer to earlier typing must not replace a newer one
      // (the newer search, if one is running, turns the spinner off itself).
      if (lastQuery.current !== q) {
        if (lastQuery.current === (valueRef.current || '').trim()) setFetching(false);
        return;
      }
      setSuggestions(hits);
      onSuggestions?.(hits);
      setFetching(false);
      setOpen(hits.length > 0 && dismissed.current !== q);
      setActive(-1);
    }, 300);
    return () => clearTimeout(handle);
  }, [value]);

  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        dismissed.current = (valueRef.current || '').trim(); // e.g. the Scan button: don't reopen for this text
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (hit) => {
    // Filling in the picked label must not trigger a new search.
    lastQuery.current = (hit.label || '').trim();
    onChange(hit.label);
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
    if (onSelect) onSelect(hit);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      // An address is always one picked from the list: Enter picks the
      // highlighted suggestion, or the first; with none yet, the form says so.
      if (suggestions.length) {
        e.preventDefault();
        pick(suggestions[active >= 0 ? active : 0]);
      }
      return;
    }
    if (e.key === 'Escape') {
      dismissed.current = (value || '').trim();
      setOpen(false);
      return;
    }
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div ref={boxRef} className="relative flex-1">
      <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="address-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `address-option-${active}` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length && dismissed.current !== (value || '').trim() && setOpen(true)}
        placeholder={placeholder}
        className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-10 text-[15px] shadow-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/40"
      />
      {fetching && (
        <Loader2 className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && suggestions.length > 0 && (
        <ul id="address-suggestions" role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-border bg-card py-1.5 shadow-[0_24px_50px_-24px_rgba(16,35,28,0.5)]">
          {suggestions.map((hit, i) => (
            <li key={`${hit.lat},${hit.lng}`} role="presentation">
              <button
                id={`address-option-${i}`}
                role="option"
                aria-selected={i === active}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(hit)}
                className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition ${
                  i === active ? 'bg-secondary/70' : 'hover:bg-secondary/40'
                }`}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[13px] leading-snug text-foreground">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Why Locate is still grey; only while the list is closed, so it's never under it. */}
      {hint && !(open && suggestions.length > 0) && <p role="status" className={`mt-2 text-[12.5px] ${hintClassName}`}>{hint}</p>}
    </div>
  );
}