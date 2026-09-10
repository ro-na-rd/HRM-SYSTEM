import { useEffect, useState } from 'react';

// A row of clickable pills for picking one value, with an "Other…" pill that
// reveals a free-text box so HR can still enter something not in the list.
export default function OptionPicker({
  label,
  options,
  value,
  onChange,
  allowOther = true,
  otherLabel = 'Other…',
  placeholder = 'Type a value',
  disabled = false,
  hint,
}) {
  const matchesOption = options.some((o) => o.toLowerCase() === (value || '').toLowerCase());
  const isCustom = !!value && !matchesOption;
  const [showOther, setShowOther] = useState(isCustom);

  useEffect(() => {
    if (isCustom) setShowOther(true);
  }, [isCustom]);

  return (
    <div className="option-field">
      {label && <span className="option-field-label">{label}</span>}
      {disabled ? (
        <p className="option-hint">{hint}</p>
      ) : (
        <>
          <div className="option-pills">
            {options.map((opt) => (
              <button
                type="button"
                key={opt}
                className={`option-pill ${value === opt ? 'option-pill-selected' : ''}`}
                onClick={() => {
                  setShowOther(false);
                  onChange(opt);
                }}
              >
                {opt}
              </button>
            ))}
            {allowOther && (
              <button
                type="button"
                className={`option-pill option-pill-other ${showOther || isCustom ? 'option-pill-selected' : ''}`}
                onClick={() => {
                  setShowOther(true);
                  onChange('');
                }}
              >
                {otherLabel}
              </button>
            )}
          </div>
          {showOther && allowOther && (
            <input
              className="option-other-input"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoFocus
            />
          )}
        </>
      )}
    </div>
  );
}
