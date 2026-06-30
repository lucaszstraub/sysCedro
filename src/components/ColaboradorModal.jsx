import { useEffect, useMemo, useState } from 'react';
import { InlineAlert } from './PageAlert';
import { api } from '../api';
import {
  BENEFICIO_TIPO_OPTIONS,
  FUNCAO_COLABORADOR_OPTIONS,
} from '../constants/auth';
import { formatCurrency } from '../utils/format';

const emptyBeneficio = () => ({
  tipo: 'VT',
  descricao: '',
  valor: '',
  ativo: true,
});

const emptyForm = {
  nome: '',
  funcao: FUNCAO_COLABORADOR_OPTIONS[0].value,
  usuario_id: '',
  email: '',
  telefone: '',
  salario_base: '',
  observacoes: '',
  ativo: true,
  beneficios: [],
};

const FUNCOES_COMERCIAIS = ['vendedor', 'vendedor_projetista'];

function parseValorMonetario(value) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function ColaboradorModal({ colaborador, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm);
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ativo = true;

    const load = async () => {
      setLoadingUsuarios(true);
      try {
        const lista = await api.listUsuariosParaColaborador(colaborador?.id || null);
        if (ativo) setUsuarios(lista);
      } catch (err) {
        if (ativo) setError(err.message);
      } finally {
        if (ativo) setLoadingUsuarios(false);
      }
    };

    load();
    return () => { ativo = false; };
  }, [colaborador?.id]);

  useEffect(() => {
    if (!colaborador) {
      setForm(emptyForm);
      return;
    }

    setForm({
      nome: colaborador.nome || '',
      funcao: colaborador.funcao || FUNCAO_COLABORADOR_OPTIONS[0].value,
      usuario_id: colaborador.usuario_id ? String(colaborador.usuario_id) : '',
      email: colaborador.email || '',
      telefone: colaborador.telefone || '',
      salario_base: colaborador.salario_base != null ? String(colaborador.salario_base) : '',
      observacoes: colaborador.observacoes || '',
      ativo: colaborador.ativo !== false,
      beneficios: (colaborador.beneficios || []).map((b) => ({
        id: b.id,
        tipo: b.tipo,
        descricao: b.descricao || '',
        valor: b.valor != null ? String(b.valor) : '',
        ativo: b.ativo !== false,
      })),
    });
  }, [colaborador]);

  const totalBeneficios = useMemo(
    () => form.beneficios.reduce((sum, b) => sum + parseValorMonetario(b.valor), 0),
    [form.beneficios]
  );

  const remuneracaoTotal = useMemo(
    () => parseValorMonetario(form.salario_base) + totalBeneficios,
    [form.salario_base, totalBeneficios]
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleBeneficioChange = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      beneficios: prev.beneficios.map((item, i) => (
        i === index ? { ...item, [field]: value } : item
      )),
    }));
  };

  const adicionarBeneficio = () => {
    setForm((prev) => ({
      ...prev,
      beneficios: [...prev.beneficios, emptyBeneficio()],
    }));
  };

  const removerBeneficio = (index) => {
    setForm((prev) => ({
      ...prev,
      beneficios: prev.beneficios.filter((_, i) => i !== index),
    }));
  };

  const isFuncaoComercial = FUNCOES_COMERCIAIS.includes(form.funcao);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await onSave({
        nome: form.nome.trim(),
        funcao: form.funcao,
        usuario_id: form.usuario_id ? Number(form.usuario_id) : null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        salario_base: parseValorMonetario(form.salario_base),
        observacoes: form.observacoes.trim() || null,
        ativo: form.ativo,
        beneficios: form.beneficios.map((b) => ({
          id: b.id,
          tipo: b.tipo,
          descricao: b.descricao.trim() || null,
          valor: parseValorMonetario(b.valor),
          ativo: b.ativo !== false,
        })),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{colaborador ? 'Editar colaborador' : 'Novo colaborador'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="nome">Nome *</label>
              <input
                id="nome"
                name="nome"
                value={form.nome}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="funcao">Função na empresa *</label>
              <select
                id="funcao"
                name="funcao"
                value={form.funcao}
                onChange={handleChange}
                required
              >
                {FUNCAO_COLABORADOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {isFuncaoComercial && (
                <span className="hint-text">
                  Vendedores são cadastrados aqui e ficam disponíveis automaticamente em orçamentos e vendas.
                </span>
              )}
            </div>
            {isFuncaoComercial && (
              <>
                <div className="form-group">
                  <label htmlFor="email">E-mail comercial</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="telefone">Telefone comercial</label>
                  <input
                    id="telefone"
                    name="telefone"
                    value={form.telefone}
                    onChange={handleChange}
                  />
                </div>
              </>
            )}
            <div className="form-group">
              <label htmlFor="usuario_id">Usuário do sistema</label>
              <select
                id="usuario_id"
                name="usuario_id"
                value={form.usuario_id}
                onChange={handleChange}
                disabled={loadingUsuarios}
              >
                <option value="">Sem vínculo</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.login})
                  </option>
                ))}
              </select>
              <span className="hint-text">Opcional — vincula o colaborador ao login de acesso.</span>
            </div>
            <div className="form-group">
              <label htmlFor="salario_base">Salário base (R$) *</label>
              <input
                id="salario_base"
                name="salario_base"
                type="number"
                min="0"
                step="0.01"
                value={form.salario_base}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="observacoes">Observações</label>
              <textarea
                id="observacoes"
                name="observacoes"
                rows={2}
                value={form.observacoes}
                onChange={handleChange}
              />
            </div>
            {colaborador && (
              <div className="form-group full-width">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="ativo"
                    checked={form.ativo}
                    onChange={handleChange}
                  />
                  Colaborador ativo
                </label>
              </div>
            )}
          </div>

          <div className="colaborador-beneficios-section">
            <div className="colaborador-beneficios-header">
              <h4>Benefícios e valores extras</h4>
              <button type="button" className="btn btn-secondary btn-sm" onClick={adicionarBeneficio}>
                + Adicionar benefício
              </button>
            </div>

            {form.beneficios.length === 0 ? (
              <p className="hint-text">Nenhum benefício cadastrado (VT, VA, VR, etc.).</p>
            ) : (
              <div className="colaborador-beneficios-lista">
                {form.beneficios.map((beneficio, index) => (
                  <div key={beneficio.id || `novo-${index}`} className="colaborador-beneficio-row">
                    <div className="form-group">
                      <label>Tipo</label>
                      <select
                        value={beneficio.tipo}
                        onChange={(e) => handleBeneficioChange(index, 'tipo', e.target.value)}
                      >
                        {BENEFICIO_TIPO_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Descrição</label>
                      <input
                        value={beneficio.descricao}
                        onChange={(e) => handleBeneficioChange(index, 'descricao', e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                    <div className="form-group">
                      <label>Valor (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={beneficio.valor}
                        onChange={(e) => handleBeneficioChange(index, 'valor', e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-danger"
                      onClick={() => removerBeneficio(index)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="colaborador-remuneracao-resumo">
              <span>Salário: <strong>{formatCurrency(parseValorMonetario(form.salario_base))}</strong></span>
              <span>Benefícios: <strong>{formatCurrency(totalBeneficios)}</strong></span>
              <span>Total: <strong>{formatCurrency(remuneracaoTotal)}</strong></span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
