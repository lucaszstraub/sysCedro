import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import {
  calcularPrecosEtiqueta,
  dadosEtiquetaFromProduto,
  descricaoTamanhoEtiquetaTermica,
  DIMENSAO_EXPOSTA_ETIQUETA,
  THERMAL_LABEL_HEIGHT_MM,
  THERMAL_LABEL_WIDTH_MM,
} from '../utils/etiquetaProduto';
import { formatCurrency } from '../utils/format';

export function EtiquetaPreviewUnit({ form, compact = false }) {
  const precos = useMemo(
    () => calcularPrecosEtiqueta(form.valor_prazo ?? form.preco_venda, form.desconto_pct),
    [form.valor_prazo, form.preco_venda, form.desconto_pct]
  );

  return (
    <div
      className={[
        'etiqueta-preview-inner',
        'etiqueta-preview-inner--termica',
        compact ? 'etiqueta-preview-inner--compact' : '',
      ].filter(Boolean).join(' ')}
      style={{ aspectRatio: `${THERMAL_LABEL_WIDTH_MM} / ${THERMAL_LABEL_HEIGHT_MM}` }}
    >
      <div className="etiqueta-termica-body">
        <h4 className="etiqueta-termica-nome">{form.nome || 'Nome do produto'}</h4>
        {form.sku && <p className="etiqueta-termica-sku">{form.sku}</p>}
        <p className="etiqueta-termica-linha">{form.tamanho || DIMENSAO_EXPOSTA_ETIQUETA}</p>
        {form.acabamento && <p className="etiqueta-termica-linha etiqueta-termica-acabamento">{form.acabamento}</p>}
        <hr className="etiqueta-termica-rule" aria-hidden="true" />
        <div className="etiqueta-termica-precos">
          <strong className="etiqueta-termica-vista">{formatCurrency(precos.valor_vista)}</strong>
          <span className="etiqueta-termica-vista-label">à vista</span>
          <span className="etiqueta-termica-prazo">{formatCurrency(precos.valor_prazo)}</span>
          <span className="etiqueta-termica-parcela">
            1+9x de {formatCurrency(precos.parcela_1mais9)}
          </span>
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
  const [copias, setCopias] = useState(1);
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
    setCopias(1);
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
          loading: 'Gerando arquivo para impressora térmica...',
          success: 'Arquivo gerado. Envie para a impressora de etiquetas.',
          error: 'Não foi possível gerar o arquivo de impressão.',
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

  const tamanhoEtiqueta = descricaoTamanhoEtiquetaTermica();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg etiqueta-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{isAddMode ? 'Adicionar etiqueta' : 'Etiqueta do produto'}</h3>
            <p className="picker-subtitle">
              {isAddMode
                ? 'Dados do adesivo térmico que será colado na etiqueta física do móvel'
                : `Impressão térmica ${tamanhoEtiqueta} — somente nome, medidas e preços`}
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
                  Pré-visualização do adesivo ({tamanhoEtiqueta})
                </p>
                <div className="etiqueta-preview-frame etiqueta-preview-frame--termica">
                  <EtiquetaPreviewUnit form={form} />
                </div>
                <p className="hint-text etiqueta-termica-hint">
                  Sem logo nem layout decorativo — apenas as informações variáveis para colar na etiqueta já impressa do móvel.
                </p>
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
                    {isAddMode ? 'Quantidade na seleção' : 'Cópias idênticas no PDF'}
                  </label>
                  <input
                    id="etiqueta-quantidade"
                    type="number"
                    min="1"
                    max={isAddMode ? 99 : 999}
                    value={isAddMode ? quantidade : copias}
                    onChange={(e) => (
                      isAddMode ? setQuantidade(e.target.value) : setCopias(e.target.value)
                    )}
                  />
                  {!isAddMode && (
                    <span className="hint-text">Cada cópia vira uma página no arquivo (uma etiqueta na impressora).</span>
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
                ? 'Gerando arquivo...'
                : isAddMode
                  ? 'Adicionar à seleção'
                  : 'Gerar para impressora térmica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
