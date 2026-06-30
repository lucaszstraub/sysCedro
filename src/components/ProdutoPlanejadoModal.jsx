import { InlineAlert } from './PageAlert';
import { useState } from 'react';
import NumericInput from './NumericInput';
import {
  TIPO_CORREDICAS_OPTIONS,
  TIPO_FUNDO_OPTIONS,
  TIPO_PORTA_OPTIONS,
  TIPO_PUXADOR_OPTIONS,
  criarProdutoPlanejadoTemplate,
} from '../constants/orcamentoPlanejado';

export default function ProdutoPlanejadoModal({ produto, onClose, onSave }) {
  const [form, setForm] = useState(produto ? {
    nome: produto.nome,
    largura: produto.largura ?? '',
    profundidade: produto.profundidade ?? '',
    altura: produto.altura ?? '',
    espessura_mdf: produto.espessura_mdf ?? 18,
    padrao_mdf: produto.padrao_mdf || '',
    tipo_fundo: produto.tipo_fundo || 'fino',
    tipo_porta: produto.tipo_porta || 'sem_porta',
    tipo_puxador: produto.tipo_puxador || 'sem_puxador',
    tipo_puxador_outro: produto.tipo_puxador_outro || '',
    cor_puxador: produto.cor_puxador || '',
    tipo_corredicas: produto.tipo_corredicas || 'sem_corredicas',
    canaleta_led: Boolean(produto.canaleta_led),
    itens_extra: produto.itens_extra || '',
    preco_unitario_sugerido: Number(produto.preco_unitario_sugerido) || 0,
  } : criarProdutoPlanejadoTemplate());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{produto ? 'Editar produto planejado' : 'Novo produto planejado'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <p className="hint-text">
            Cadastre um tipo de móvel com medidas e acabamentos padrão. Ao selecionar no orçamento ou venda,
            os campos serão preenchidos automaticamente, mas poderão ser editados.
          </p>
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="nome">Tipo de móvel *</label>
              <input
                id="nome"
                value={form.nome}
                onChange={(e) => update('nome', e.target.value)}
                placeholder="Ex: Roupeiro, Cozinha linear, Painel TV..."
                required
              />
            </div>

            <div className="form-group">
              <label>Largura padrão (cm)</label>
              <NumericInput min="0" step="0.1" value={form.largura} onChange={(v) => update('largura', v)} />
            </div>
            <div className="form-group">
              <label>Profundidade padrão (cm)</label>
              <NumericInput min="0" step="0.1" value={form.profundidade} onChange={(v) => update('profundidade', v)} />
            </div>
            <div className="form-group">
              <label>Altura padrão (cm)</label>
              <NumericInput min="0" step="0.1" value={form.altura} onChange={(v) => update('altura', v)} />
            </div>

            <div className="form-group">
              <label>Espessura MDF (mm)</label>
              <NumericInput min="0" defaultOnEmpty={18} value={form.espessura_mdf} onChange={(v) => update('espessura_mdf', v)} />
            </div>
            <div className="form-group">
              <label>Padrão do MDF (cor)</label>
              <input value={form.padrao_mdf} onChange={(e) => update('padrao_mdf', e.target.value)} placeholder="Ex: Branco TX..." />
            </div>

            <div className="form-group">
              <label>Tipo de fundo</label>
              <select value={form.tipo_fundo} onChange={(e) => update('tipo_fundo', e.target.value)}>
                {TIPO_FUNDO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de porta</label>
              <select value={form.tipo_porta} onChange={(e) => update('tipo_porta', e.target.value)}>
                {TIPO_PORTA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Tipo de puxador</label>
              <select value={form.tipo_puxador} onChange={(e) => update('tipo_puxador', e.target.value)}>
                {TIPO_PUXADOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {form.tipo_puxador === 'outro' && (
              <div className="form-group">
                <label>Nome do puxador</label>
                <input value={form.tipo_puxador_outro} onChange={(e) => update('tipo_puxador_outro', e.target.value)} />
              </div>
            )}

            <div className="form-group">
              <label>Cor do puxador</label>
              <input value={form.cor_puxador} onChange={(e) => update('cor_puxador', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Tipo de corrediças</label>
              <select value={form.tipo_corredicas} onChange={(e) => update('tipo_corredicas', e.target.value)}>
                {TIPO_CORREDICAS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Canaleta LED</label>
              <select value={form.canaleta_led ? 'sim' : 'nao'} onChange={(e) => update('canaleta_led', e.target.value === 'sim')}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>

            <div className="form-group">
              <label>Valor unitário sugerido (R$)</label>
              <NumericInput step="0.01" min="0" value={form.preco_unitario_sugerido} onChange={(v) => update('preco_unitario_sugerido', v)} />
            </div>

            <div className="form-group full-width">
              <label>Itens extra padrão</label>
              <textarea rows={2} value={form.itens_extra} onChange={(e) => update('itens_extra', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
