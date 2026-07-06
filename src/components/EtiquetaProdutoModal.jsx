import { InlineAlert } from './PageAlert';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import BrandLogo from './BrandLogo';
import { dadosEtiquetaFromProduto, LABELS_PER_PAGE } from '../utils/etiquetaProduto';
import { formatCurrency } from '../utils/format';

export function EtiquetaPreviewUnit({ form, precoExibicao, compact = false }) {
  return (
    <div className={`etiqueta-preview-inner${compact ? ' etiqueta-preview-inner--compact' : ''}`}>
      <div className="etiqueta-preview-logo">
        <BrandLogo variant="dark" />
      </div>
      <span className="etiqueta-preview-sku">{form.sku || 'SKU'}</span>
      <hr className="etiqueta-preview-rule" />
      <h4 className="etiqueta-preview-nome">{form.nome || 'Nome do produto'}</h4>
      {form.tamanho && (
        <div className="etiqueta-preview-spec">
          <span className="etiqueta-preview-spec-label">Tamanho</span>
          <span>{form.tamanho}</span>
        </div>
      )}
      {form.acabamento && (
        <div className="etiqueta-preview-spec">
          <span className="etiqueta-preview-spec-label">Acabamento</span>
          <span>{form.acabamento}</span>
        </div>
      )}
      <div className="etiqueta-preview-preco">
        <span className="etiqueta-preview-preco-label">Investimento</span>
        <strong>{precoExibicao}</strong>
      </div>
    </div>
  );
}

export default function EtiquetaProdutoModal({
  produto,
  onClose,
  mode = 'print',
  defaultQuantidade = 1,
  onAdd,
}) {
  const [form, setForm] = useState(() => dadosEtiquetaFromProduto(produto));
  const [quantidade, setQuantidade] = useState(defaultQuantidade);
  const [copias, setCopias] = useState(LABELS_PER_PAGE);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const { runWithFeedback } = useFeedback();
  const isAddMode = mode === 'add';

  useEffect(() => {
    setForm(dadosEtiquetaFromProduto(produto));
    setQuantidade(defaultQuantidade);
    setCopias(LABELS_PER_PAGE);
    setError('');
  }, [produto, defaultQuantidade]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validarForm = () => {
    const preco = Number(form.preco_venda);
    if (Number.isNaN(preco) || preco < 0) {
      throw new Error('Informe um preço de venda válido.');
    }
    if (!form.nome?.trim()) {
      throw new Error('Informe o nome na etiqueta.');
    }
    const qty = Math.max(Number(isAddMode ? quantidade : copias) || 1, 1);
    if (isAddMode && qty < 1) {
      throw new Error('Informe a quantidade de etiquetas.');
    }
    return { preco, qty };
  };

  const handleAdd = (e) => {
    e.preventDefault();
    setError('');
    try {
      const { preco, qty } = validarForm();
      onAdd?.({
        produto_id: produto.id,
        sku: form.sku,
        nome: form.nome.trim(),
        tamanho: form.tamanho?.trim() || '',
        acabamento: form.acabamento?.trim() || '',
        preco_venda: preco,
        quantidade: qty,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePrint = async (e) => {
    e.preventDefault();
    setPrinting(true);
    setError('');
    try {
      const { preco, qty } = validarForm();

      const result = await runWithFeedback(
        () => api.gerarPdfEtiquetaProduto({
          produto_id: produto.id,
          sku: form.sku,
          nome: form.nome.trim(),
          tamanho: form.tamanho?.trim() || null,
          acabamento: form.acabamento?.trim() || null,
          preco_venda: preco,
          copias: qty,
        }),
        {
          loading: 'Gerando folha de etiquetas...',
          success: 'Folha A4 gerada com sucesso.',
          error: 'Não foi possível gerar a etiqueta.',
        }
      );
      setPrinting(false);
      if (result?.cancelled) return;
      onClose();
    } catch (err) {
      if (err.message) setError(err.message);
      setPrinting(false);
    }
  };

  const precoExibicao = formatCurrency(Number(form.preco_venda) || 0);
  const copiasNum = Math.min(Math.max(Number(copias) || LABELS_PER_PAGE, 1), LABELS_PER_PAGE);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg etiqueta-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{isAddMode ? 'Adicionar etiqueta' : 'Etiqueta do produto'}</h3>
            <p className="picker-subtitle">
              {isAddMode
                ? 'Ajuste os dados e escolha quantas cópias entram na seleção de impressão'
                : 'Folha A4 com até 6 etiquetas — aprox. 9,3 × 9 cm cada, com logo Cedro'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={isAddMode ? handleAdd : handlePrint}>
          <div className="modal-body etiqueta-modal-body">
            {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

            <div className="etiqueta-modal-grid">
              <div className="etiqueta-preview-wrap">
                <p className="hint-text etiqueta-preview-label">
                  {isAddMode ? 'Pré-visualização' : 'Pré-visualização da folha A4'}
                </p>
                {isAddMode ? (
                  <div className="etiqueta-preview-frame etiqueta-preview-frame--single">
                    <EtiquetaPreviewUnit form={form} precoExibicao={precoExibicao} />
                  </div>
                ) : (
                  <>
                    <article className="etiqueta-sheet-preview" aria-hidden="true">
                      <div className="etiqueta-sheet-grid">
                        {Array.from({ length: LABELS_PER_PAGE }, (_, i) => (
                          <div
                            key={i}
                            className={`etiqueta-sheet-cell${i < copiasNum ? '' : ' etiqueta-sheet-cell--vazia'}`}
                          >
                            {i < copiasNum && (
                              <div className="etiqueta-preview-frame">
                                <EtiquetaPreviewUnit form={form} precoExibicao={precoExibicao} compact />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                    <p className="hint-text etiqueta-sheet-hint">
                      Linhas tracejadas no PDF indicam o corte entre etiquetas.
                    </p>
                  </>
                )}
              </div>

              <div className="etiqueta-form">
                <div className="form-group">
                  <label htmlFor="etiqueta-sku">SKU</label>
                  <input id="etiqueta-sku" name="sku" value={form.sku} readOnly disabled />
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-nome">Nome *</label>
                  <input
                    id="etiqueta-nome"
                    name="nome"
                    value={form.nome}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-tamanho">Tamanho</label>
                  <input
                    id="etiqueta-tamanho"
                    name="tamanho"
                    value={form.tamanho}
                    onChange={handleChange}
                    placeholder="Ex: 120 × 80 × 45 cm"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-acabamento">Acabamento</label>
                  <input
                    id="etiqueta-acabamento"
                    name="acabamento"
                    value={form.acabamento}
                    onChange={handleChange}
                    placeholder="Ex: Madeira maciça · Verniz natural"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-preco">Preço de venda (R$) *</label>
                  <input
                    id="etiqueta-preco"
                    name="preco_venda"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.preco_venda}
                    onChange={handleChange}
                    required
                  />
                  <span className="hint-text">Importado do cadastro — pode ser ajustado só para esta impressão.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-quantidade">
                    {isAddMode ? 'Quantidade na seleção' : 'Etiquetas nesta folha'}
                  </label>
                  {isAddMode ? (
                    <input
                      id="etiqueta-quantidade"
                      type="number"
                      min="1"
                      max="99"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                    />
                  ) : (
                    <select
                      id="etiqueta-quantidade"
                      value={copias}
                      onChange={(e) => setCopias(e.target.value)}
                    >
                      {Array.from({ length: LABELS_PER_PAGE }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} etiqueta{n > 1 ? 's' : ''} (de {LABELS_PER_PAGE} na folha)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={printing}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={printing}>
              {printing
                ? 'Gerando PDF...'
                : isAddMode
                  ? 'Adicionar à seleção'
                  : 'Gerar folha A4'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
