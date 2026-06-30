import { InlineAlert } from './PageAlert';
import { useEffect, useState } from 'react';
import { api } from '../api';
import FornecedorModal from './FornecedorModal';

const emptyForm = {
  nome: '',
  categoria_id: '',
  fornecedor_id: '',
  descricao: '',
  material: '',
  cor: '',
  largura_cm: '',
  altura_cm: '',
  profundidade_cm: '',
  peso_kg: '',
  preco_custo: '',
  preco_venda: '',
  estoque_minimo: '',
  volumes_por_unidade: '1',
};

export default function ProdutoModal({ produto, categorias, fornecedores, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm);
  const [fornecedoresLista, setFornecedoresLista] = useState(fornecedores || []);
  const [showFornecedorModal, setShowFornecedorModal] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoBase64, setFotoBase64] = useState(null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (produto) {
      setForm({
        nome: produto.nome || '',
        categoria_id: produto.categoria_id ? String(produto.categoria_id) : '',
        fornecedor_id: produto.fornecedor_id ? String(produto.fornecedor_id) : '',
        descricao: produto.descricao || '',
        material: produto.material || '',
        cor: produto.cor || '',
        largura_cm: produto.largura_cm ?? '',
        altura_cm: produto.altura_cm ?? '',
        profundidade_cm: produto.profundidade_cm ?? '',
        peso_kg: produto.peso_kg ?? '',
        preco_custo: produto.preco_custo ?? '',
        preco_venda: produto.preco_venda ?? '',
        estoque_minimo: produto.estoque_minimo ?? '',
        volumes_por_unidade: produto.volumes_por_unidade != null ? String(produto.volumes_por_unidade) : '1',
      });
    } else {
      setForm(emptyForm);
    }
    setFotoBase64(null);
    setRemoverFoto(false);
    setError('');
  }, [produto]);

  useEffect(() => {
    setFornecedoresLista(fornecedores || []);
  }, [fornecedores]);

  useEffect(() => {
    if (!produto?.id) return;
    api.getProdutoFoto(produto.id)
      .then(setFotoPreview)
      .catch(() => setFotoPreview(null));
  }, [produto]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFotoPreview(reader.result);
      setFotoBase64(reader.result);
      setRemoverFoto(false);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverFoto = () => {
    setFotoPreview(null);
    setFotoBase64(null);
    setRemoverFoto(true);
  };

  const handleSaveFornecedor = async (data) => {
    const fornecedor = await api.createFornecedor(data);
    setFornecedoresLista((prev) => [...prev, fornecedor].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    setForm((prev) => ({ ...prev, fornecedor_id: String(fornecedor.id) }));
    setShowFornecedorModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
        largura_cm: form.largura_cm ? Number(form.largura_cm) : null,
        altura_cm: form.altura_cm ? Number(form.altura_cm) : null,
        profundidade_cm: form.profundidade_cm ? Number(form.profundidade_cm) : null,
        peso_kg: form.peso_kg ? Number(form.peso_kg) : null,
        preco_custo: form.preco_custo ? Number(form.preco_custo) : 0,
        preco_venda: form.preco_venda ? Number(form.preco_venda) : 0,
        estoque_minimo: form.estoque_minimo ? Number(form.estoque_minimo) : 0,
        volumes_por_unidade: form.volumes_por_unidade ? Number(form.volumes_por_unidade) : 1,
        fotoBase64: fotoBase64 || null,
        removerFoto,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{produto ? 'Editar produto' : 'Novo produto'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          {produto && (
            <div className="form-group full-width" style={{ marginBottom: '0.5rem' }}>
              <label>SKU</label>
              <input value={produto.sku} readOnly disabled style={{ background: 'var(--bg)', cursor: 'not-allowed' }} />
            </div>
          )}
          {!produto && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              O SKU será gerado automaticamente com base na categoria selecionada.
            </p>
          )}

          <div className="form-group full-width foto-upload-group">
            <label>Foto do produto</label>
            <div className="foto-upload-row">
              <div className="foto-preview-box">
                {fotoPreview ? (
                  <img src={fotoPreview} alt="Pré-visualização" />
                ) : (
                  <div className="foto-preview-placeholder">Sem foto</div>
                )}
              </div>
              <div className="foto-upload-actions">
                <input id="foto" type="file" accept="image/*" onChange={handleFotoChange} />
                {fotoPreview && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleRemoverFoto}>
                    Remover foto
                  </button>
                )}
                <p className="hint-text">A imagem será otimizada em até 800×800 px mantendo boa qualidade visual.</p>
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="nome">Nome *</label>
              <input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="categoria_id">Categoria</label>
              <select id="categoria_id" name="categoria_id" value={form.categoria_id} onChange={handleChange}>
                <option value="">Selecione...</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="fornecedor_id">Fornecedor</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select
                  id="fornecedor_id"
                  name="fornecedor_id"
                  value={form.fornecedor_id}
                  onChange={handleChange}
                  style={{ flex: 1 }}
                >
                  <option value="">Selecione...</option>
                  {fornecedoresLista.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowFornecedorModal(true)}
                >
                  + Novo
                </button>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="material">Material</label>
              <input id="material" name="material" value={form.material} onChange={handleChange} placeholder="Ex: Madeira, MDF, Tecido" />
            </div>
            <div className="form-group">
              <label htmlFor="cor">Cor</label>
              <input id="cor" name="cor" value={form.cor} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="largura_cm">Largura (cm)</label>
              <input id="largura_cm" name="largura_cm" type="number" step="0.01" value={form.largura_cm} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="altura_cm">Altura (cm)</label>
              <input id="altura_cm" name="altura_cm" type="number" step="0.01" value={form.altura_cm} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="profundidade_cm">Profundidade (cm)</label>
              <input id="profundidade_cm" name="profundidade_cm" type="number" step="0.01" value={form.profundidade_cm} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="peso_kg">Peso (kg)</label>
              <input id="peso_kg" name="peso_kg" type="number" step="0.01" value={form.peso_kg} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="preco_custo">Preço de custo (R$)</label>
              <input id="preco_custo" name="preco_custo" type="number" step="0.01" value={form.preco_custo} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="preco_venda">Preço de venda (R$)</label>
              <input id="preco_venda" name="preco_venda" type="number" step="0.01" value={form.preco_venda} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="estoque_minimo">Estoque mínimo</label>
              <input id="estoque_minimo" name="estoque_minimo" type="number" value={form.estoque_minimo} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="volumes_por_unidade">Volumes por unidade</label>
              <input
                id="volumes_por_unidade"
                name="volumes_por_unidade"
                type="number"
                min="1"
                value={form.volumes_por_unidade}
                onChange={handleChange}
              />
              <span className="hint-text">Usado no cálculo automático de volumes na entrega.</span>
            </div>
            <div className="form-group full-width">
              <label htmlFor="descricao">Descrição</label>
              <textarea id="descricao" name="descricao" rows={3} value={form.descricao} onChange={handleChange} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>

    {showFornecedorModal && (
      <FornecedorModal
        onClose={() => setShowFornecedorModal(false)}
        onSave={handleSaveFornecedor}
      />
    )}
    </>
  );
}
