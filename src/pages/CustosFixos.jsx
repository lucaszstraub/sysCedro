import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatCurrency } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { InlineAlert } from '../components/PageAlert';

const MESES_CURTOS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function TemplateModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item ? {
    nome: item.nome,
    valor_padrao: String(item.valor_padrao ?? ''),
    ordem: String(item.ordem ?? 0),
    ativo: item.ativo !== false,
  } : {
    nome: '',
    valor_padrao: '',
    ordem: '0',
    ativo: true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        nome: form.nome.trim(),
        valor_padrao: Number(form.valor_padrao) || 0,
        ordem: Number(form.ordem) || 0,
        ativo: form.ativo,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{item ? 'Editar item do template' : 'Novo item do template'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="tpl-nome">Nome *</label>
              <input
                id="tpl-nome"
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="tpl-valor">Valor padrão (R$) *</label>
              <input
                id="tpl-valor"
                type="number"
                min="0"
                step="0.01"
                value={form.valor_padrao}
                onChange={(e) => setForm((p) => ({ ...p, valor_padrao: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="tpl-ordem">Ordem</label>
              <input
                id="tpl-ordem"
                type="number"
                min="0"
                value={form.ordem}
                onChange={(e) => setForm((p) => ({ ...p, ordem: e.target.value }))}
              />
            </div>
            {item && (
              <div className="form-group full-width">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                  />
                  Item ativo no template
                </label>
              </div>
            )}
          </div>
          <p className="hint-text">
            O valor padrão é replicado para todos os meses do exercício. Você pode ajustar mês a mês depois.
          </p>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExtraModal({ ano, mes, mesLabel, onClose, onSave }) {
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        ano,
        mes,
        nome: nome.trim(),
        valor: Number(valor) || 0,
        observacoes: observacoes.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Custo extra — {mesLabel}/{ano}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="extra-nome">Nome *</label>
              <input id="extra-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="extra-valor">Valor (R$) *</label>
              <input
                id="extra-valor"
                type="number"
                min="0"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="extra-obs">Observações</label>
              <input id="extra-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustosFixos() {
  const anoAtual = new Date().getFullYear();
  const [aba, setAba] = useState('exercicio');
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [template, setTemplate] = useState([]);
  const [exercicio, setExercicio] = useState({ meses: [], total_ano: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [templateModal, setTemplateModal] = useState(null);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const { confirm, success: showSuccess } = useFeedback();

  const loadTemplate = async () => {
    setTemplate(await api.listCustosFixosTemplate());
  };

  const loadExercicio = async (anoRef = ano) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getExercicioCustosFixos(anoRef);
      setExercicio(data);
      setEditValores({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplate().catch(() => {});
  }, []);

  useEffect(() => {
    if (aba === 'exercicio') loadExercicio(ano);
  }, [aba, ano]);

  const mesAtual = useMemo(
    () => exercicio.meses?.find((m) => m.mes === mes) || { itens: [], total: 0, mes_label: MESES_CURTOS[mes] },
    [exercicio.meses, mes]
  );

  const templateAtivos = useMemo(
    () => template.filter((t) => t.ativo !== false),
    [template]
  );

  const handleSaveTemplate = async (data) => {
    if (templateModal?.id) {
      await api.updateCustoFixoTemplate(templateModal.id, data);
      showSuccess(`Item ${data.nome} atualizado.`);
    } else {
      await api.createCustoFixoTemplate(data);
      showSuccess(`Item ${data.nome} cadastrado no template.`);
    }
    setTemplateModal(null);
    await loadTemplate();
    if (aba === 'exercicio') await loadExercicio(ano);
  };

  const handleDeleteTemplate = async (item) => {
    const ok = await confirm({
      title: 'Desativar item do template',
      message: `Desativar "${item.nome}"? Lançamentos já gerados permanecem, mas o item não será incluído em novos exercícios.`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    setError('');
    try {
      await api.deleteCustoFixoTemplate(item.id);
      showSuccess(`Item ${item.nome} desativado.`);
      await loadTemplate();
    } catch (err) {
      setError(err.message);
    }
  };

  const getValorEditavel = (item) => (
    editValores[item.id] !== undefined ? editValores[item.id] : String(item.valor)
  );

  const salvarValorMensal = async (item) => {
    const raw = editValores[item.id] !== undefined ? editValores[item.id] : String(item.valor);
    const valor = Number(raw);
    if (!Number.isFinite(valor) || valor < 0) {
      setError('Informe um valor válido.');
      return;
    }
    if (Math.abs(valor - item.valor) < 0.005 && !item.eh_extra) {
      setEditValores((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    setSavingId(item.id);
    setError('');
    try {
      await api.updateCustoFixoMensal(item.id, {
        valor,
        nome: item.eh_extra ? item.nome : undefined,
        observacoes: item.observacoes,
      });
      await loadExercicio(ano);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteExtra = async (item) => {
    const ok = await confirm({
      title: 'Remover custo extra',
      message: `Remover "${item.nome}" de ${mesAtual.mes_label}/${ano}?`,
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    setError('');
    try {
      await api.deleteCustoFixoMensal(item.id);
      showSuccess('Custo extra removido.');
      await loadExercicio(ano);
    } catch (err) {
      setError(err.message);
    }
  };

  const aplicarPadroesMes = async () => {
    const ok = await confirm({
      title: 'Aplicar padrões do template',
      message: `Substituir os valores do template em ${mesAtual.mes_label}/${ano} pelos valores padrão? Custos extras não serão alterados.`,
      confirmLabel: 'Aplicar',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    setError('');
    try {
      await api.aplicarPadroesCustosFixosMes(ano, mes);
      showSuccess('Valores padrão aplicados ao mês.');
      await loadExercicio(ano);
    } catch (err) {
      setError(err.message);
    }
  };

  const aplicarPadroesExercicio = async () => {
    const ok = await confirm({
      title: 'Aplicar padrões em todo o exercício',
      message: `Substituir todos os valores do template em ${ano} pelos valores padrão? Custos extras e valores editados manualmente serão sobrescritos nos itens do template.`,
      confirmLabel: 'Aplicar em todo o ano',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    setError('');
    try {
      await api.aplicarPadroesCustosFixosExercicio(ano);
      showSuccess('Valores padrão aplicados ao exercício.');
      await loadExercicio(ano);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <header className="page-header">
        <h2>Custos fixos</h2>
        <p>
          Template de despesas recorrentes e lançamentos mensais por exercício —
          base para o resultado financeiro da empresa.
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="comissao-tabs custos-fixos-tabs">
        <button
          type="button"
          className={`comissao-tab ${aba === 'exercicio' ? 'active' : ''}`}
          onClick={() => setAba('exercicio')}
        >
          Exercício mensal
        </button>
        <button
          type="button"
          className={`comissao-tab ${aba === 'template' ? 'active' : ''}`}
          onClick={() => setAba('template')}
        >
          Template
        </button>
      </div>

      {aba === 'template' ? (
        <>
          <div className="toolbar">
            <p className="hint-text" style={{ flex: 1, margin: 0 }}>
              Itens e valores padrão replicados automaticamente para cada mês do exercício.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setTemplateModal({})}>
              + Novo item
            </button>
          </div>

          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Valor padrão</th>
                    <th>Ordem</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {template.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-state">Nenhum item no template.</td>
                    </tr>
                  ) : (
                    template.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.nome}</strong></td>
                        <td>{formatCurrency(item.valor_padrao)}</td>
                        <td>{item.ordem}</td>
                        <td>{item.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            onClick={() => setTemplateModal(item)}
                          >
                            Editar
                          </button>
                          {item.ativo !== false && (
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-danger"
                              onClick={() => handleDeleteTemplate(item)}
                            >
                              Desativar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar custos-fixos-toolbar">
            <form
              onSubmit={(e) => { e.preventDefault(); loadExercicio(ano); }}
              className="toolbar-filters"
            >
              <label>
                Exercício
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                  className="form-control custos-fixos-ano-input"
                />
              </label>
              <button type="submit" className="btn btn-secondary" disabled={loading}>
                {loading ? 'Carregando...' : 'Atualizar'}
              </button>
            </form>
            <div className="custos-fixos-toolbar-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={aplicarPadroesMes}>
                Aplicar padrões no mês
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={aplicarPadroesExercicio}>
                Aplicar padrões no ano
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowExtraModal(true)}>
                + Custo extra
              </button>
            </div>
          </div>

          <div className="stats-grid visao-vendas-stats custos-fixos-stats">
            <div className="stat-card stat-card-priority">
              <div className="label">Total do exercício {ano}</div>
              <div className="value">{formatCurrency(exercicio.total_ano || 0)}</div>
              <div className="hint-text">{templateAtivos.length} item(ns) no template</div>
            </div>
            <div className="stat-card">
              <div className="label">Total — {mesAtual.mes_label || MESES_CURTOS[mes]}</div>
              <div className="value">{formatCurrency(mesAtual.total || 0)}</div>
              <div className="hint-text">{mesAtual.itens?.length || 0} lançamento(s)</div>
            </div>
          </div>

          <div className="custos-fixos-meses-nav">
            {(exercicio.meses || []).map((m) => (
              <button
                key={m.mes}
                type="button"
                className={`custos-fixos-mes-btn ${mes === m.mes ? 'active' : ''}`}
                onClick={() => setMes(m.mes)}
              >
                <span>{MESES_CURTOS[m.mes]}</span>
                <strong>{formatCurrency(m.total)}</strong>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              Lançamentos — {mesAtual.mes_label || MESES_CURTOS[mes]}/{ano}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="loading">Carregando...</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Origem</th>
                      <th>Valor (R$)</th>
                      <th>Observações</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(mesAtual.itens || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-state">
                          Nenhum lançamento para este mês.
                        </td>
                      </tr>
                    ) : (
                      mesAtual.itens.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.nome}</strong></td>
                          <td>{item.eh_extra ? 'Extra' : 'Template'}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="form-control custos-fixos-valor-input"
                              value={getValorEditavel(item)}
                              onChange={(e) => setEditValores((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))}
                              onBlur={() => salvarValorMensal(item)}
                              disabled={savingId === item.id}
                            />
                          </td>
                          <td>
                            <span className="hint-text">{item.observacoes || '—'}</span>
                          </td>
                          <td>
                            {item.eh_extra && (
                              <button
                                type="button"
                                className="btn btn-link btn-sm text-danger"
                                onClick={() => handleDeleteExtra(item)}
                              >
                                Remover
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {(mesAtual.itens || []).length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={2}><strong>Total do mês</strong></td>
                        <td colSpan={3}><strong>{formatCurrency(mesAtual.total)}</strong></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>

          <div className="card custos-fixos-resumo-anual">
            <div className="card-header">Visão anual — totais por mês</div>
            <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {(exercicio.meses || []).map((m) => (
                      <th key={m.mes}>{MESES_CURTOS[m.mes]}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {(exercicio.meses || []).map((m) => (
                      <td key={m.mes}>{formatCurrency(m.total)}</td>
                    ))}
                    <td><strong>{formatCurrency(exercicio.total_ano)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {templateModal && (
        <TemplateModal
          item={templateModal.id ? templateModal : null}
          onClose={() => setTemplateModal(null)}
          onSave={handleSaveTemplate}
        />
      )}

      {showExtraModal && (
        <ExtraModal
          ano={ano}
          mes={mes}
          mesLabel={mesAtual.mes_label || MESES_CURTOS[mes]}
          onClose={() => setShowExtraModal(false)}
          onSave={async (data) => {
            await api.createCustoFixoExtra(data);
            showSuccess(`Custo extra ${data.nome} adicionado.`);
            setShowExtraModal(false);
            await loadExercicio(ano);
          }}
        />
      )}
    </>
  );
}
