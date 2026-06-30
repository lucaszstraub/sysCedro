import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHero from '../components/PageHero';
import {
  ATRIBUICAO_LABEL,
  MENU_MACRO_GROUPS,
  SECTION_ACCENTS,
  filterMenuSections,
} from '../constants/auth';

export default function Inicio() {
  const { user } = useAuth();
  const sections = filterMenuSections(user).filter((section) => section.id !== 'inicio');
  const sectionMap = Object.fromEntries(sections.map((section) => [section.id, section]));

  return (
    <>
      <PageHero
        eyebrow="Sys Cedro"
        title={`Bem-vindo, ${user?.nome?.split(' ')[0] || 'usuário'}`}
        subtitle={
          user?.is_master
            ? 'Acesso master a todas as áreas do sistema.'
            : `Perfil: ${ATRIBUICAO_LABEL[user?.atribuicao] || user?.atribuicao || 'usuário'} — escolha uma área abaixo para começar.`
        }
      />

      {MENU_MACRO_GROUPS.map((macro) => {
        const macroSections = macro.sectionIds
          .map((id) => sectionMap[id])
          .filter(Boolean);
        if (macroSections.length === 0) return null;

        return (
          <section
            key={macro.id}
            className="hub-macro-block"
            style={{ '--macro-accent': macro.accent }}
          >
            <header className="hub-macro-header">
              <h3 className="hub-macro-title">{macro.title}</h3>
              {macro.description && (
                <p className="hub-macro-description">{macro.description}</p>
              )}
            </header>

            <div className="hub-grid">
              {macroSections.map((section) => {
                const items = section.groups.flatMap((group) => group.items);
                if (items.length === 0) return null;
                const accent = SECTION_ACCENTS[section.id] || '#c9a86c';

                return (
                  <article
                    key={section.id}
                    className="hub-card"
                    style={{ '--hub-accent': accent }}
                  >
                    <header className="hub-card-header">
                      <span className="hub-card-badge">{section.title}</span>
                      {section.hubDescription && (
                        <p>{section.hubDescription}</p>
                      )}
                    </header>
                    <div className="hub-card-links">
                      {items.map((item) => (
                        <Link key={item.to} to={item.to} className="hub-link">
                          <span className="hub-link-icon" aria-hidden>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
