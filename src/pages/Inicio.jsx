import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFaseImplantacao } from '../context/FaseImplantacaoContext';
import { useFeedback } from '../context/FeedbackContext';
import PageHero from '../components/PageHero';
import {
  ATRIBUICAO_LABEL,
  MENU_MACRO_GROUPS,
  SECTION_ACCENTS,
  filterMenuSections,
} from '../constants/auth';

export default function Inicio() {
  const { user } = useAuth();
  const { ativa, setAtiva, backfillPedidos } = useFaseImplantacao();
  const { success: showSuccess, error: showError } = useFeedback();
  const [salvandoFase, setSalvandoFase] = useState(false);
  const [backfillEmAndamento, setBackfillEmAndamento] = useState(false);
  const sections = filterMenuSections(user).filter((section) => section.id !== 'inicio');
  const sectionMap = Object.fromEntries(sections.map((section) => [section.id, section]));

  const handleToggleFase = async (event) => {
    const valor = event.target.checked;
    if (!valor && !window.confirm(
      'Desativar a fase de implantação?\n\nAs opções "Peça Loja" e "Entrega já realizada" deixarão de aparecer, mas todas as vendas, entregas, estoque e movimentações já registrados serão mantidos.'
    )) {
      event.target.checked = ativa;
      return;
    }

    setSalvandoFase(true);
    try {
      await setAtiva(valor);
      if (valor) {
        showSuccess('Fase de implantação ativada. Use o botão abaixo para incluir pedidos antigos no kanban, se necessário.');
      } else {
        showSuccess('Fase de implantação desativada. Nenhum dado foi removido.');
      }
    } catch (err) {
      showError(err.message);
      event.target.checked = ativa;
    } finally {
      setSalvandoFase(false);
    }
  };

  const handleBackfill = async () => {
    if (!window.confirm(
      'Incluir no kanban os pedidos que ainda não têm expedição?\n\nNenhuma venda ou entrega existente será apagada — apenas serão criadas novas expedições onde faltarem.'
    )) {
      return;
    }
    setBackfillEmAndamento(true);
    try {
      const resultado = await backfillPedidos();
      const qtd = resultado?.processadas || 0;
      if (qtd > 0) {
        showSuccess(`${qtd} pedido(s) incluído(s) no kanban de entregas.`);
      } else {
        showSuccess('Nenhum pedido pendente de inclusão no kanban.');
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setBackfillEmAndamento(false);
    }
  };

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

      {user?.is_master && (
        <section className="fase-implantacao-panel" aria-labelledby="fase-implantacao-titulo">
          <div>
            <strong id="fase-implantacao-titulo">Fase de implantação</strong>
            <p className="hint-text">
              Ative enquanto cadastra vendas e entregas já realizadas antes do go-live.
              Inclui atendimento &quot;Peça Loja&quot; (entrada + saída automática de estoque)
              e conclusão de entregas históricas sem data.
              Desativar a fase só oculta essas opções — os dados permanecem no sistema.
            </p>
          </div>
          <div className="fase-implantacao-actions">
            <label className="fase-implantacao-toggle">
              <input
                type="checkbox"
                checked={ativa}
                disabled={salvandoFase}
                onChange={handleToggleFase}
              />
              <span>{ativa ? 'Sim — ativa' : 'Não — inativa'}</span>
            </label>
            {ativa && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={backfillEmAndamento}
                onClick={handleBackfill}
              >
                {backfillEmAndamento ? 'Processando...' : 'Incluir pedidos existentes no kanban'}
              </button>
            )}
          </div>
        </section>
      )}

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
