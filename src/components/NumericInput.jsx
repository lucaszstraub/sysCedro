import { useEffect, useState } from 'react';

function toDisplay(value, defaultOnEmpty) {
  if (value === '' || value === null || value === undefined) {
    return defaultOnEmpty === 0 ? '' : String(defaultOnEmpty);
  }
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  if (num === 0 && defaultOnEmpty === 0) return '';
  return String(value);
}

function normalizeTyping(raw) {
  if (raw === '' || raw === '-' || raw.endsWith('.')) return raw;
  if (/^0\d+$/.test(raw)) return raw.replace(/^0+/, '') || '0';
  if (/^\d*\.\d*$/.test(raw) && raw.startsWith('0') && !raw.startsWith('0.')) {
    return raw.replace(/^0+(?=\d)/, '');
  }
  return raw;
}

export default function NumericInput({
  value,
  onChange,
  defaultOnEmpty = 0,
  className,
  style,
  onBlur,
  ...rest
}) {
  const [local, setLocal] = useState(() => toDisplay(value, defaultOnEmpty));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setLocal(toDisplay(value, defaultOnEmpty));
    }
  }, [value, focused, defaultOnEmpty]);

  const commit = (raw) => {
    if (raw === '' || raw === '-') {
      onChange(defaultOnEmpty);
      return defaultOnEmpty;
    }
    const parsed = Number(raw);
    const finalValue = Number.isNaN(parsed) ? defaultOnEmpty : parsed;
    onChange(finalValue);
    return finalValue;
  };

  return (
    <input
      type="number"
      className={className}
      style={style}
      value={focused ? local : toDisplay(value, defaultOnEmpty)}
      onFocus={(e) => {
        setFocused(true);
        setLocal(toDisplay(value, defaultOnEmpty));
        e.target.select();
      }}
      onChange={(e) => {
        const next = normalizeTyping(e.target.value);
        setLocal(next);
        if (next === '' || next === '-' || next.endsWith('.')) {
          onChange(next);
        } else {
          const parsed = Number(next);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }
      }}
      onBlur={(e) => {
        const finalValue = commit(local);
        setFocused(false);
        setLocal(toDisplay(finalValue, defaultOnEmpty));
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}
