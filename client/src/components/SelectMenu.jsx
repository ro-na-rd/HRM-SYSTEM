import { useEffect, useRef, useState } from 'react';

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4 4 10-10" />
    </svg>
  );
}

// A styled single-select that opens a scrollable menu below the field.
// Falls back to a free-text box when the user picks "Other…" so values not
// in the list (or already on the roster) can still be entered.
export default function SelectMenu({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  disabledText = '',
  allowOther = true,
  otherLabel = 'Other…',
  otherPlaceholder = 'Type a value',
}) {
  const inList = (v) => options.some((o) => o.toLowerCase() === (v || '').toLowerCase());
  const [open, setOpen] = useState(false);
  const [otherMode, setOtherMode] = useState(!!value && !inList(value));
  const ref = useRef(null);

  useEffect(() => {
    if (value && !inList(value)) setOtherMode(true);
  }, [value, options]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(opt) {
    setOtherMode(false);
    onChange(opt);
    setOpen(false);
  }

  return (
    <div className="select-field">
      {label && <span className="select-field-label">{label}</span>}

      {disabled ? (
        <div className="select-trigger select-trigger-disabled">{disabledText || placeholder}</div>
      ) : (
        <div className="select-menu" ref={ref}>
          <button
            type="button"
            className={`select-trigger ${open ? 'select-trigger-open' : ''}`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={value ? '' : 'select-trigger-placeholder'}>
              {value || (otherMode ? otherLabel : placeholder)}
            </span>
            <ChevronDown />
          </button>

          {open && (
            <ul className="select-dropdown" role="listbox">
              {options.map((opt) => (
                <li
                  key={opt}
                  role="option"
                  aria-selected={value === opt}
                  className={`select-option ${value === opt ? 'select-option-selected' : ''}`}
                  onClick={() => pick(opt)}
                >
                  <span>{opt}</span>
                  {value === opt && <Check />}
                </li>
              ))}
              {allowOther && (
                <li
                  className={`select-option select-option-other ${otherMode ? 'select-option-selected' : ''}`}
                  onClick={() => {
                    setOtherMode(true);
                    onChange('');
                    setOpen(false);
                  }}
                >
                  <span>{otherLabel}</span>
                </li>
              )}
            </ul>
          )}

          {otherMode && allowOther && (
            <input
              className="select-other-input"
              placeholder={otherPlaceholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}
