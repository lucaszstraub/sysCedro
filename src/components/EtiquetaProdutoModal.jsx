import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import BrandLogo from './BrandLogo';
import {
  calcularPrecosEtiqueta,
  dadosEtiquetaFromProduto,
  DIMENSAO_EXPOSTA_ETIQUETA,
  LABELS_PER_PAGE,
  partesPrazoEtiqueta,
} from '../utils/etiquetaProduto';
import { formatCurrency } from '../utils/format';

export function EtiquetaPreviewUnit({ form, compact = false }) {
  const precos = useMemo(
    () => calcularPrecosEtiqueta(form.valor_prazo ?? form.preco_venda, form.desconto_pct),
    [form.valor_prazo, form.preco_venda, form.desconto_pct]
  );
  const prazo = partesPrazoEtiqueta(precos.valor_prazo, precos.parcela_1mais9);

  return (
    <div className={`etiqueta-preview-inner${compact ? ' etiqueta-preview-inner--compact' : ''}`}>
      <div className="etiqueta-preview-logo">
        <BrandLogo variant="dark" />
      </div>
      <h4 className="etiqueta-preview-nome">{form.nome || 'Nome do produto'}</h4>
      <p className="etiqueta-preview-linha">{form.tamanho || DIMENSAO_EXPOSTA_ETIQUETA}</p>
      {form.acabamento && <p className="etiqueta-preview-linha">{form.acabamento}</p>}
      <div className="etiqueta-preview-precos">
        <div className="etiqueta-preview-vista">
          <span className="etiqueta-preview-vista-label">À vista</span>
          <strong className="etiqueta-preview-vista-valor">{formatCurrency(precos.valor_vista)}</strong>
        </div>
        <div className="etiqueta-preview-prazo">
          <span className="etiqueta-preview-prazo-label">{prazo.label}</span>
          <strong className="etiqueta-preview-prazo-valor">{prazo.valor}</strong>
          <span className="etiqueta-preview-prazo-descritivo">{prazo.descritivo}</span>
        </div>
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

  const precos = useMemo(
    () => calcularPrecosEtiqueta(form.valor_prazo, form.desconto_pct),
    [form.valor_prazo, form.desconto_pct]
  );

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

  const payloadEtiqueta = () => ({
    produto_id: produto.id,
    sku: form.sku,
    nome: form.nome.trim(),
    tamanho: form.tamanho?.trim() || DIMENSAO_EXPOSTA_ETIQUETA,
    acabamento: form.acabamento?.trim() || '',
    valor_prazo: precos.valor_prazo,
    desconto_pct: precos.desconto_pct,
    valor_vista: precos.valor_vista,
    parcela_1mais9: precos.parcela_1mais9,
  });

  const validarForm = () => {
    if (Number.isNaN(precos.valor_prazo) || precos.valor_prazo < 0) {
      throw new Error('Informe um valor à prazo válido.');
    }
    if (!form.nome?.trim()) {
      throw new Error('Informe o nome na etiqueta.');
    }
    const qty = Math.max(Number(isAddMode ? quantidade : copias) || 1, 1);
    if (isAddMode && qty < 1) {
      throw new Error('Informe a quantidade de etiquetas.');
    }
    return { qty };
  };

  const handleAdd = (e) => {
    e.preventDefault();
    setError('');
    try {
      const { qty } = validarForm();
      onAdd?.({ ...payloadEtiqueta(), quantidade: qty });
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
      const { qty } = validarForm();

      const result = await runWithFeedback(
        () => api.gerarPdfEtiquetaProduto({
          ...payloadEtiqueta(),
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
                : 'Folha A4 com até 6 etiquetas — logo, nome, medidas e valores à vista / parcelado'}
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
                    <EtiquetaPreviewUnit form={form} />
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
                                <EtiquetaPreviewUnit form={form} compact />
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
                  <label htmlFor="etiqueta-nome">Nome do produto *</label>
                  <input
                    id="etiqueta-nome"
                    name="nome"
                    value={form.nome}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-tamanho">Dimensão (L × P × A)</label>
                  <input
                    id="etiqueta-tamanho"
                    name="tamanho"
                    value={form.tamanho}
                    onChange={handleChange}
                    placeholder={DIMENSAO_EXPOSTA_ETIQUETA}
                  />
                  <span className="hint-text">
                    Importada do cadastro quando houver medidas; caso contrário, usa &quot;{DIMENSAO_EXPOSTA_ETIQUETA}&quot;.
                  </span>
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-acabamento">Cor / acabamento</label>
                  <input
                    id="etiqueta-acabamento"
                    name="acabamento"
                    value={form.acabamento}
                    onChange={handleChange}
                    placeholder="Ex: Madeira maciça · Verniz natural"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-valor-prazo">Valor à prazo (R$) *</label>
                  <input
                    id="etiqueta-valor-prazo"
                    name="valor_prazo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_prazo}
                    onChange={handleChange}
                    required
                  />
                  <span className="hint-text">Preço de referência para parcelamento (1+9x).</span>
                </div>
                <div className="form-group">
                  <label htmlFor="etiqueta-desconto">Desconto à vista (%)</label>
                  <input
                    id="etiqueta-desconto"
                    name="desconto_pct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.desconto_pct}
                    onChange={handleChange}
                  />
                  <span className="hint-text">Padrão 8% — editável para calcular o valor à vista.</span>
                </div>
                <div className="form-group">
                  <label>Valor à vista (calculado)</label>
                  <input value={formatCurrency(precos.valor_vista)} readOnly disabled />
                  <span className="hint-text">
                    Parcela: {formatCurrency(precos.parcela_1mais9)} em 1+9x
                  </span>
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
