import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLabStore } from '../store/useLabStore';
import { Profile } from '../types';
import { groupProfiles, profileLabel } from '../lib/format';

const VARIANT_LIMIT = 40;

interface Props {
  value: string;
  onChange: (name: string) => void;
  id?: string;
  ariaLabel?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Accept a typed name that isn't in the list (the backend validates it). */
  allowFreeText?: boolean;
  /** Restrict which profiles are offered. */
  filter?: (p: Profile) => boolean;
  placeholder?: string;
}

/**
 * Searchable profile combobox used everywhere a profile is chosen.
 * Base profiles come first, then custom ones, then generated variants.
 */
export const ProfilePicker: React.FC<Props> = ({
  value,
  onChange,
  id,
  ariaLabel,
  describedBy,
  invalid,
  disabled,
  allowFreeText,
  filter,
  placeholder,
}) => {
  const profiles = useLabStore((s) => s.profiles);
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = filter ? profiles.filter(filter) : profiles;
    const match = (p: Profile) => !q || p.name.toLowerCase().includes(q) || profileLabel(p.name).toLowerCase().includes(q);
    const g = groupProfiles(pool.filter(match));
    return [
      { label: 'Base profiles', items: g.base, more: 0 },
      { label: 'Custom profiles', items: g.custom, more: 0 },
      { label: 'Variants', items: g.variants.slice(0, VARIANT_LIMIT), more: Math.max(0, g.variants.length - VARIANT_LIMIT) },
    ].filter((grp) => grp.items.length > 0);
  }, [profiles, query, filter]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  });

  useEffect(() => {
    listRef.current?.querySelector('.highlighted')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (name: string) => {
    onChange(name);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (flat[active]) choose(flat[active].name);
      else if (allowFreeText && query.trim()) choose(query.trim());
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        close();
      }
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const display = open ? query : profileLabel(value);
  let idx = -1;

  return (
    <div className="combobox" ref={rootRef}>
      <input
        id={inputId}
        className={`control ${invalid ? 'invalid' : ''}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={display}
        placeholder={open ? `Search ${profiles.length} profiles…` : placeholder}
        title={value}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="combobox-toggle"
        tabIndex={-1}
        aria-label="Show profiles"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <ChevronDown />
      </button>
      {open && (
        <ul className="combobox-list" id={listId} role="listbox" ref={listRef} aria-label="Profiles">
          {groups.map((g) => (
            <React.Fragment key={g.label}>
              <li className="combobox-group" role="presentation">
                {g.label}
              </li>
              {g.items.map((p) => {
                idx += 1;
                const i = idx;
                return (
                  <li
                    key={p.name}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={p.name === value}
                    className={`combobox-option ${i === active ? 'highlighted' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(p.name)}
                  >
                    <span>{profileLabel(p.name)}</span>
                    <small>{p.scheduler}</small>
                  </li>
                );
              })}
              {g.more > 0 && (
                <li className="combobox-more" role="presentation">
                  +{g.more} more variants: keep typing to narrow down
                </li>
              )}
            </React.Fragment>
          ))}
          {flat.length === 0 && (
            <li className="combobox-more" role="presentation">
              {allowFreeText && query.trim()
                ? `No match. Press Enter to use "${query.trim()}".`
                : 'No profiles match.'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
