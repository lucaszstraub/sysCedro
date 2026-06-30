import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { VENDAS_BASE } from '../constants/auth';
import { formatCurrency } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';

function calcularPreview(totalVendas, form) {
  const total = Number(totalVendas) || 0;
  const limite = Number(form.valor_limite) || 0;
  const pctAte = Number(form.percentual_ate_limite) || 0;
  const pctAcima = Number(form.percentual_acima_limite) || 0;
  if (total <= 0 || limite <= 0) return null;

  const baseAte = Math.min(total, limite);
  const baseAcima = Math.max(total - limite, 0);
  const valorAte = baseAte * pctAte / 100;
  const valorAcima = baseAcima * pctAcima / 100;
  return {
    baseAte,
    baseAcima,
    valorAte,
    valorAcima,
    total: valorAte + valorAcima,
  };
}

function emptyForm() {
  return {
    valor_limite: '100000',
    percentual_ate_limite: '5',
    percentual_acima_limite: '10',
    observacoes: '',
  };
}

function regraToForm(regra) {
  if (!regra) return emptyForm();
  return {
    valor_limite: String(regra.valor_limite),
    percentual_ate_limite: String(regra.percentual_ate_limite),
    percentual_acima_limite: String(regra.percentual_acima_limite),
    observacoes: regra.observacoes || '',
  };
}

export default function RegrasComissaoPlanejados() {
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { success: showSuccess } = useFeedback();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const regra = await api.getComissaoRegraPlanejados();
      setForm(regraToForm(regra));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.saveComissaoRegraPlanejados({
        valor_limite: Number(form.valor_limite),
        percentual_ate_limite: Number(form.percentual_ate_limite),
        percentual_acima_limite: Number(form.percentual_acima_limite),
        observacoes: form.observacoes,
      });
      showSuccess('Regra de comissão (planejados) salva.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ex170 = calcularPreview(170000, form);
  const ex80 = calcularPreview(80000, form);
  const limite = Number(form.valor_limite) || 0;

  return (
    <>
      <header className="page-header visao-vendas-header">
        <div>
          <h2>Cadastro de regra de comissão — planejados</h2>
          <p>
            Comissão do vendedor planejado por faixa de vendas no mês.
            Considera apenas vendas confirmadas de planejados.
          </p>
        </div>
        <div className="visao-vendas-header-actions">
          <Link to={`${VENDAS_BASE}/regras-comissao`} className="btn btn-secondary">
            Regras — móveis soltos
          </Link>
          <Link to={`${VENDAS_BASE}/controle-comissoes`} className="btn btn-secondary">
            Controle de comissões
          </Link>
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {loading ? (
        <div className="loading">Carregando regra...</div>
      ) : (
        <div className="card comissao-regra-card" style={{ maxWidth: 560 }}>
          <div className="card-header">Vendedor planejado</div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="pl-valor-limite">Valor limite no período (mês)</label>
                <input
                  id="pl-valor-limite"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={form.valor_limite}
                  onChange={(e) => setForm((f) => ({ ...f, valor_limite: e.target.value }))}
                />
                <p className="hint-text">
                  Até este valor de vendas no mês aplica o primeiro percentual.
                </p>
              </div>
              <div className="form-group">
                <label htmlFor="pl-pct-ate">% até o limite</label>
                <input
                  id="pl-pct-ate"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={form.percentual_ate_limite}
                  onChange={(e) => setForm((f) => ({ ...f, percentual_ate_limite: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="pl-pct-acima">% acima do limite</label>
                <input
                  id="pl-pct-acima"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={form.percentual_acima_limite}
                  onChange={(e) => setForm((f) => ({ ...f, percentual_acima_limite: e.target.value }))}
                />
              </div>
              <div className="form-group full-width">
                <label htmlFor="pl-obs">Observações</label>
                <textarea
                  id="pl-obs"
                  className="form-control"
                  rows={2}
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                />
              </div>
            </div>

            <div className="comissao-regra-preview">
              <strong>Exemplos com a regra atual</strong>
              {ex170 && (
                <p className="hint-text">
                  {formatCurrency(170000)} em vendas →{' '}
                  {form.percentual_ate_limite}% de {formatCurrency(ex170.baseAte)} = {formatCurrency(ex170.valorAte)}
                  {ex170.baseAcima > 0 && (
                    <>
                      {' + '}
                      {form.percentual_acima_limite}% de {formatCurrency(ex170.baseAcima)} = {formatCurrency(ex170.valorAcima)}
                    </>
                  )}
                  {' → '}
                  <strong>{formatCurrency(ex170.total)}</strong> de comissão
                </p>
              )}
              {ex80 && (
                <p className="hint-text">
                  {formatCurrency(80000)} em vendas →{' '}
                  {form.percentual_ate_limite}% de {formatCurrency(ex80.baseAte)} ={' '}
                  <strong>{formatCurrency(ex80.total)}</strong> de comissão
                </p>
              )}
              <p className="hint-text">
                Limite mensal: {formatCurrency(limite)}
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Salvando...' : 'Salvar regra'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
