const LOGO = {
  /** Dourada — fundos escuros (sidebar, login, PDF) */
  gold: {
    src: '/brand/logo-padrao.png',
    className: 'brand-logo--gold',
  },
  /** Branca — fundos escuros alternativa */
  white: {
    src: '/brand/logo-branca.png',
    className: 'brand-logo--white',
  },
  /** Preta — fundos claros */
  dark: {
    src: '/brand/logo-preta.png',
    className: 'brand-logo--dark',
  },
};

/** Compatibilidade com variantes antigas */
const LEGACY_MAP = {
  light: 'gold',
  padrao: 'gold',
  branca: 'white',
  preta: 'dark',
};

export default function BrandLogo({
  variant = 'gold',
  className = '',
  systemLabel = false,
}) {
  const resolved = LEGACY_MAP[variant] || variant;
  const config = LOGO[resolved] || LOGO.gold;

  return (
    <div className={`brand-logo-wrap ${className}`.trim()}>
      <img
        src={config.src}
        alt="Cedro Móveis & Ambientes"
        className={`brand-logo ${config.className}`}
      />
      {systemLabel && (
        <span className="brand-logo-system">SysCedro</span>
      )}
    </div>
  );
}
