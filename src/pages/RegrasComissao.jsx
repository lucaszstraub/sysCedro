import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { VENDAS_BASE } from '../constants/auth';
import { formatMarkup } from '../constants/markup';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';

const PERFIL_LABEL = {
  vendedor: 'Vendedor',
  gerente: 'Gerente',
};

const TIPO_LABEL = {
  percentual_fixo: 'Percentual fixo',
  markup_como_percentual: 'Igual ao markup (ex.: 2 → 2%)',
};

function emptyForm(perfil) {
  if (perfil === 'gerente') {
    return {
      perfil,
      markup_minimo: '1.75',
      comissao_abaixo_tipo: 'percentual_fixo',
      comissao_abaixo_valor: '0.5',
      comissao_acima_tipo: 'percentual_fixo',
      comissao_acima_valor: '0.8',
      beneficiario_vendedor_id: '',
      observacoes: '',
    };
  }
  return {
    perfil,
    markup_minimo: '1.75',
    comissao_abaixo_tipo: 'percentual_fixo',
    comissao_abaixo_valor: '1',
    comissao_acima_tipo: 'markup_como_percentual',
    comissao_acima_valor: '',
    beneficiario_vendedor_id: '',
    observacoes: '',
  };
}

function regraToForm(regra) {
  if (!regra) return null;
  return {
    perfil: regra.perfil,
    markup_minimo: String(regra.markup_minimo),
    comissao_abaixo_tipo: regra.comissao_abaixo_tipo,
    comissao_abaixo_valor: regra.comissao_abaixo_valor != null ? String(regra.comissao_abaixo_valor) : '',
    comissao_acima_tipo: regra.comissao_acima_tipo,
    comissao_acima_valor: regra.comissao_acima_valor != null ? String(regra.comissao_acima_valor) : '',
    beneficiario_vendedor_id: regra.beneficiario_vendedor_id ? String(regra.beneficiario_vendedor_id) : '',
    observacoes: regra.observacoes || '',
  };
}

function previewComissao(form, markupExemplo) {
  const markup = Number(markupExemplo);
  const limite = Number(form.markup_minimo);
  if (!markup || !limite) return '—';
  const acima = markup >= limite;
  const tipo = acima ? form.comissao_acima_tipo : form.comissao_abaixo_tipo;
  if (tipo === 'markup_como_percentual') return `${markup}%`;
  const valor = acima ? form.comissao_acima_valor : form.comissao_abaixo_valor;
  return `${valor}%`;
}

function RegraForm({ perfil, form, vendedores, saving, onChange, onSave }) {
  return (
    <div className="card comissao-regra-card">
      <div className="card-header">{PERFIL_LABEL[perfil]}</div>
      <div className="card-body">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor={`${perfil}-markup-minimo`}>Markup mínimo de referência</label>
            <input
              id={`${perfil}-markup-minimo`}
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={form.markup_minimo}
              onChange={(e) => onChange({ markup_minimo: e.target.value })}
              required
            />
            <p className="hint-text">Ex.: 1,75 — divide regras abaixo e acima/igual.</p>
          </div>

          <div className="form-group full-width">
            <label>Se markup real do produto for menor que {form.markup_minimo || '—'}</label>
            <div className="comissao-regra-linha">
              <select
                className="form-control"
                value={form.comissao_abaixo_tipo}
                onChange={(e) => onChange({ comissao_abaixo_tipo: e.target.value })}
              >
                <option value="percentual_fixo">{TIPO_LABEL.percentual_fixo}</option>
                <option value="markup_como_percentual">{TIPO_LABEL.markup_como_percentual}</option>
              </select>
              {form.comissao_abaixo_tipo === 'percentual_fixo' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  placeholder="%"
                  value={form.comissao_abaixo_valor}
                  onChange={(e) => onChange({ comissao_abaixo_valor: e.target.value })}
                  required
                />
              )}
            </div>
          </div>

          <div className="form-group full-width">
            <label>Se markup real for maior ou igual a {form.markup_minimo || '—'}</label>
            <div className="comissao-regra-linha">
              <select
                className="form-control"
                value={form.comissao_acima_tipo}
                onChange={(e) => onChange({ comissao_acima_tipo: e.target.value })}
              >
                <option value="percentual_fixo">{TIPO_LABEL.percentual_fixo}</option>
                <option value="markup_como_percentual">{TIPO_LABEL.markup_como_percentual}</option>
              </select>
              {form.comissao_acima_tipo === 'percentual_fixo' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  placeholder="%"
                  value={form.comissao_acima_valor}
                  onChange={(e) => onChange({ comissao_acima_valor: e.target.value })}
                  required
                />
              )}
            </div>
          </div>

          {perfil === 'gerente' && (
            <div className="form-group full-width">
              <label htmlFor={`${perfil}-beneficiario`}>Beneficiário da comissão (gerência)</label>
              <select
                id={`${perfil}-beneficiario`}
                className="form-control"
                value={form.beneficiario_vendedor_id}
                onChange={(e) => onChange({ beneficiario_vendedor_id: e.target.value })}
              >
                <option value="">Detectar automaticamente (usuário gerente)</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
              <p className="hint-text">
                A gerência recebe comissão sobre todas as vendas de móveis soltos
                (tabela de vendas), independentemente do vendedor do pedido.
              </p>
            </div>
          )}

          <div className="form-group full-width">
            <label htmlFor={`${perfil}-obs`}>Observações internas</label>
            <textarea
              id={`${perfil}-obs`}
              className="form-control"
              rows={2}
              value={form.observacoes}
              onChange={(e) => onChange({ observacoes: e.target.value })}
            />
          </div>

          <div className="form-group full-width comissao-regra-preview">
            <strong>Exemplos com a regra atual</strong>
            <div className="hint-text">
              Markup 1,50 → comissão {previewComissao(form, 1.5)}
              {' · '}
              Markup 2,00 → comissão {previewComissao(form, 2)}
            </div>
            <div className="hint-text">
              Limite: {formatMarkup(form.markup_minimo)}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? 'Salvando...' : `Salvar regra — ${PERFIL_LABEL[perfil]}`}
        </button>
      </div>
    </div>
  );
}

export default function RegrasComissao() {
  const [forms, setForms] = useState({
    vendedor: emptyForm('vendedor'),
    gerente: emptyForm('gerente'),
  });
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingPerfil, setSavingPerfil] = useState(null);
  const [error, setError] = useState('');
  const { success: showSuccess } = useFeedback();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [regras, listaVendedores] = await Promise.all([
        api.listComissaoRegras(),
        api.listVendedores('', null),
      ]);
      setVendedores(listaVendedores);
      setForms((prev) => {
        const next = { ...prev };
        for (const perfil of ['vendedor', 'gerente']) {
          const regra = regras.find((r) => r.perfil === perfil);
          next[perfil] = regraToForm(regra) || emptyForm(perfil);
        }
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateForm = (perfil, patch) => {
    setForms((prev) => ({ ...prev, [perfil]: { ...prev[perfil], ...patch } }));
  };

  const handleSave = async (perfil) => {
    setSavingPerfil(perfil);
    setError('');
    try {
      const form = forms[perfil];
      await api.saveComissaoRegra({
        perfil,
        markup_minimo: Number(form.markup_minimo),
        comissao_abaixo_tipo: form.comissao_abaixo_tipo,
        comissao_abaixo_valor: form.comissao_abaixo_tipo === 'percentual_fixo'
          ? Number(form.comissao_abaixo_valor)
          : null,
        comissao_acima_tipo: form.comissao_acima_tipo,
        comissao_acima_valor: form.comissao_acima_tipo === 'percentual_fixo'
          ? Number(form.comissao_acima_valor)
          : null,
        beneficiario_vendedor_id: form.beneficiario_vendedor_id
          ? Number(form.beneficiario_vendedor_id)
          : null,
        observacoes: form.observacoes,
      });
      showSuccess(`Regra de comissão (${PERFIL_LABEL[perfil]}) salva.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPerfil(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Cadastro de regra de comissão</h2>
          <p>
            Móveis soltos — defina como calcular a comissão por markup real do produto
            para vendedores e gerência. Somente administração.
          </p>
        </div>
        <div className="visao-vendas-header-actions">
          <Link to={`${VENDAS_BASE}/regras-comissao-planejados`} className="btn btn-secondary">
            Regras — planejados
          </Link>
          <Link to={`${VENDAS_BASE}/controle-comissoes`} className="btn btn-secondary">
            Controle de comissões
          </Link>
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {loading ? (
        <div className="loading">Carregando regras...</div>
      ) : (
        <div className="comissao-regras-grid">
          <RegraForm
            perfil="vendedor"
            form={forms.vendedor}
            vendedores={vendedores}
            saving={savingPerfil === 'vendedor'}
            onChange={(patch) => updateForm('vendedor', patch)}
            onSave={() => handleSave('vendedor')}
          />
          <RegraForm
            perfil="gerente"
            form={forms.gerente}
            vendedores={vendedores}
            saving={savingPerfil === 'gerente'}
            onChange={(patch) => updateForm('gerente', patch)}
            onSave={() => handleSave('gerente')}
          />
        </div>
      )}
    </>
  );
}
