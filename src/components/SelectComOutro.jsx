import { OPCAO_OUTRO, optionsComOutro } from '../constants/orcamentoPlanejado';

const OUTRO_VALUE = OPCAO_OUTRO.value;

export function isOpcaoOutro(value) {
  return String(value ?? '') === OUTRO_VALUE;
}

/**
 * Select com opção "Outro" que revela campo de texto livre.
 * Usa um wrapper único para funcionar corretamente dentro de CSS Grid.
 */
export default function SelectComOutro({
  id,
  label,
  value,
  outroValue = '',
  options,
  onChange,
  onOutroChange,
  outroLabel,
  outroPlaceholder,
  className = 'form-group',
  wrapperClassName = '',
}) {
  const resolvedOptions = optionsComOutro(options);
  const isOutro = isOpcaoOutro(value);

  const handleSelectChange = (next) => {
    onChange(next);
    if (!isOpcaoOutro(next)) {
      onOutroChange?.('');
    }
  };

  return (
    <div
      className={[
        'select-com-outro',
        isOutro ? 'select-com-outro--expanded' : '',
        wrapperClassName,
      ].filter(Boolean).join(' ')}
    >
      <div className={className}>
        <label htmlFor={id}>{label}</label>
        <select id={id} value={value ?? ''} onChange={(e) => handleSelectChange(e.target.value)}>
          {resolvedOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {isOutro ? (
        <div className={className}>
          <label htmlFor={`${id}-outro`}>
            {outroLabel || `Especificar — ${label}`}
          </label>
          <input
            id={`${id}-outro`}
            type="text"
            value={outroValue ?? ''}
            onChange={(e) => onOutroChange?.(e.target.value)}
            placeholder={outroPlaceholder || 'Descreva a opção'}
            autoFocus
          />
        </div>
      ) : null}
    </div>
  );
}
