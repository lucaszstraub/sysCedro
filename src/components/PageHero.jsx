export default function PageHero({ eyebrow, title, subtitle, actions, children }) {
  return (
    <header className="page-hero">
      <div className="page-hero-text">
        {eyebrow && <p className="page-hero-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="page-hero-actions">{actions}</div>}
    </header>
  );
}
