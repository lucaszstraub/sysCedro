import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MENU_MACRO_GROUPS, SECTION_ACCENTS } from '../constants/auth';

const STORAGE_KEY = 'sysCedro_nav_expanded';

function normalizePath(pathname) {
  return pathname.replace(/\/$/, '') || '/';
}

function itemMatchesPath(item, pathname) {
  const current = normalizePath(pathname);
  const target = normalizePath(item.to);
  if (item.end) return current === target;
  return current === target || current.startsWith(`${target}/`);
}

function sectionHasActiveItem(section, pathname) {
  return section.groups.some((group) => (
    group.items.some((item) => itemMatchesPath(item, pathname))
  ));
}

function loadExpandedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExpandedState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function itemMatchesSearch(item, section, query) {
  const haystack = [
    item.label,
    item.keywords,
    section.title,
    section.hubDescription,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

export default function SidebarNav({ sections, onNavigate }) {
  const location = useLocation();
  const [busca, setBusca] = useState('');
  const [expanded, setExpanded] = useState(loadExpandedState);

  const query = busca.trim().toLowerCase();
  const isSearching = query.length > 0;

  const searchableItems = useMemo(() => (
    sections.flatMap((section) => (
      section.groups.flatMap((group) => (
        group.items.map((item) => ({ section, group, item }))
      ))
    ))
  ), [sections]);

  const filteredItems = useMemo(() => {
    if (!isSearching) return [];
    return searchableItems.filter(({ section, item }) => itemMatchesSearch(item, section, query));
  }, [isSearching, query, searchableItems]);

  useEffect(() => {
    if (isSearching) return;
    const activeSection = sections.find((section) => sectionHasActiveItem(section, location.pathname));
    if (!activeSection || activeSection.id === 'inicio') return;

    setExpanded((prev) => {
      if (prev[activeSection.id]) return prev;
      const next = { ...prev, [activeSection.id]: true };
      saveExpandedState(next);
      return next;
    });
  }, [location.pathname, sections, isSearching]);

  const toggleSection = (sectionId, currentlyOpen) => {
    setExpanded((prev) => {
      const next = { ...prev, [sectionId]: !currentlyOpen };
      saveExpandedState(next);
      return next;
    });
  };

  const isSectionOpen = (section) => {
    if (section.id === 'inicio') return true;
    if (isSearching) return false;
    if (expanded[section.id] != null) return expanded[section.id];
    if (sectionHasActiveItem(section, location.pathname)) return true;
    return section.defaultCollapsed !== true;
  };

  return (
    <>
      <div className="sidebar-search">
        <input
          type="search"
          className="sidebar-search-input"
          placeholder="Buscar no menu..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar no menu"
        />
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
        {isSearching ? (
          filteredItems.length === 0 ? (
            <p className="sidebar-search-empty">Nenhuma tela encontrada.</p>
          ) : (
            <div className="nav-search-results">
              {filteredItems.map(({ section, item }) => (
                <NavLink
                  key={`${section.id}-${item.to}`}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => {
                    setBusca('');
                    onNavigate?.();
                  }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-link-text">
                    <span>{item.label}</span>
                    <small>{section.title}</small>
                  </span>
                </NavLink>
              ))}
            </div>
          )
        ) : (
          sections.map((section, sectionIndex) => {
            const open = isSectionOpen(section);
            const collapsible = section.id !== 'inicio';
            const accent = SECTION_ACCENTS[section.id] || 'var(--accent)';
            const prevMacro = sectionIndex > 0 ? sections[sectionIndex - 1]?.macroGroup : null;
            const showMacroDivider = section.macroGroup
              && section.macroGroup !== prevMacro
              && section.id !== 'inicio';
            const macroMeta = showMacroDivider
              ? MENU_MACRO_GROUPS.find((m) => m.sectionIds.includes(section.id))
              : null;

            return (
              <div key={section.id}>
                {showMacroDivider && macroMeta && (
                  <div
                    className="nav-macro-divider"
                    style={{ '--macro-accent': macroMeta.accent }}
                    aria-hidden
                  >
                    <span className="nav-macro-divider-label">{macroMeta.title}</span>
                  </div>
                )}
                <div
                  className={`nav-section nav-section--${section.id}${open ? ' is-open' : ' is-collapsed'}${collapsible ? ' is-collapsible' : ''}${sectionHasActiveItem(section, location.pathname) ? ' is-active-section' : ''}`}
                  style={{ '--section-accent': accent }}
                >
                {collapsible ? (
                  <button
                    type="button"
                    className="nav-section-toggle"
                    onClick={() => toggleSection(section.id, open)}
                    aria-expanded={open}
                  >
                    <span className="nav-section-title">{section.title}</span>
                    <span className="nav-section-chevron" aria-hidden>▾</span>
                  </button>
                ) : (
                  <div className="nav-section-title nav-section-title-static">{section.title}</div>
                )}

                {section.groups.map((group, gi) => (
                  <div key={gi} className="nav-group">
                    {group.subtitle && (
                      <div className="nav-group-subtitle">{group.subtitle}</div>
                    )}
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                        onClick={() => onNavigate?.()}
                      >
                        <span className="nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ))}
              </div>
              </div>
            );
          })
        )}
      </nav>
    </>
  );
}
