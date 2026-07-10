import NumericInput from './NumericInput';
import SelectComOutro from './SelectComOutro';
import {
  TIPO_CORREDICAS_OPTIONS,
  TIPO_FUNDO_OPTIONS,
  TIPO_PORTA_OPTIONS,
  TIPO_PUXADOR_OPTIONS,
} from '../constants/orcamentoPlanejado';
import { formatCurrency } from '../utils/format';

export default function OrcamentoPlanejadoItemForm({
  item,
  itemIndex,
  onChange,
  onRemove,
  produtosPlanejados = [],
  onApplyTemplate,
}) {
  const subtotal = (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);

  const update = (field, value) => onChange(itemIndex, field, value);

  return (
    <div className="card planejado-item-card">
      <div className="card-header planejado-item-header">
        <strong>Móvel {itemIndex + 1}</strong>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(itemIndex)}>
          Remover
        </button>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <div className="form-group full-width">
            <label>Descrição do móvel *</label>
            <input
              value={item.descricao}
              onChange={(e) => update('descricao', e.target.value)}
              placeholder="Ex: Armário alto cozinha, balcão ilha..."
            />
          </div>

          <div className="form-group full-width">
            <label>Tipo de móvel</label>
            <select
              value={item.produto_planejado_id || ''}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  update('produto_planejado_id', '');
                  return;
                }
                const template = produtosPlanejados.find((p) => String(p.id) === String(id));
                if (onApplyTemplate && template) {
                  onApplyTemplate(itemIndex, template);
                } else {
                  update('produto_planejado_id', id);
                }
              }}
            >
              <option value="">Selecione um template...</option>
              {produtosPlanejados.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <p className="hint-text">Preenche medidas e acabamentos padrão. Todos os campos continuam editáveis.</p>
          </div>

          <div className="form-group">
            <label>Largura (cm)</label>
            <NumericInput
              min="0"
              step="0.1"
              value={item.largura}
              onChange={(value) => update('largura', value)}
            />
          </div>
          <div className="form-group">
            <label>Profundidade (cm)</label>
            <NumericInput
              min="0"
              step="0.1"
              value={item.profundidade}
              onChange={(value) => update('profundidade', value)}
            />
          </div>
          <div className="form-group">
            <label>Altura (cm)</label>
            <NumericInput
              min="0"
              step="0.1"
              value={item.altura}
              onChange={(value) => update('altura', value)}
            />
          </div>

          <div className="form-group">
            <label>Espessura MDF (mm)</label>
            <NumericInput
              min="0"
              defaultOnEmpty={18}
              value={item.espessura_mdf}
              onChange={(value) => update('espessura_mdf', value)}
            />
          </div>
          <div className="form-group">
            <label>Padrão do MDF (cor)</label>
            <input
              value={item.padrao_mdf}
              onChange={(e) => update('padrao_mdf', e.target.value)}
              placeholder="Ex: Branco TX, Carvalho..."
            />
          </div>

          <SelectComOutro
            id={`item-${itemIndex}-tipo-fundo`}
            label="Tipo de fundo"
            value={item.tipo_fundo}
            outroValue={item.tipo_fundo_outro}
            options={TIPO_FUNDO_OPTIONS}
            onChange={(v) => update('tipo_fundo', v)}
            onOutroChange={(v) => update('tipo_fundo_outro', v)}
            outroPlaceholder="Descreva o tipo de fundo"
          />
          <SelectComOutro
            id={`item-${itemIndex}-tipo-porta`}
            label="Tipo de porta"
            value={item.tipo_porta}
            outroValue={item.tipo_porta_outro}
            options={TIPO_PORTA_OPTIONS}
            onChange={(v) => update('tipo_porta', v)}
            onOutroChange={(v) => update('tipo_porta_outro', v)}
            outroPlaceholder="Descreva o tipo de porta"
          />
          <SelectComOutro
            id={`item-${itemIndex}-tipo-puxador`}
            label="Tipo de puxador"
            value={item.tipo_puxador}
            outroValue={item.tipo_puxador_outro}
            options={TIPO_PUXADOR_OPTIONS}
            onChange={(v) => update('tipo_puxador', v)}
            onOutroChange={(v) => update('tipo_puxador_outro', v)}
            outroPlaceholder="Nome do puxador"
          />

          <div className="form-group">
            <label>Cor do puxador</label>
            <input
              value={item.cor_puxador}
              onChange={(e) => update('cor_puxador', e.target.value)}
              placeholder="Ex: Preto, Inox..."
            />
          </div>
          <SelectComOutro
            id={`item-${itemIndex}-tipo-corredicas`}
            label="Tipo de corrediças"
            value={item.tipo_corredicas}
            outroValue={item.tipo_corredicas_outro}
            options={TIPO_CORREDICAS_OPTIONS}
            onChange={(v) => update('tipo_corredicas', v)}
            onOutroChange={(v) => update('tipo_corredicas_outro', v)}
            outroPlaceholder="Descreva o tipo de corrediças"
          />

          <div className="form-group">
            <label>Canaleta LED com difusor</label>
            <select
              value={item.canaleta_led ? 'sim' : 'nao'}
              onChange={(e) => update('canaleta_led', e.target.value === 'sim')}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>

          <div className="form-group full-width">
            <label>Itens extra</label>
            <textarea
              rows={2}
              value={item.itens_extra}
              onChange={(e) => update('itens_extra', e.target.value)}
              placeholder="Acessórios, complementos, observações do móvel..."
            />
          </div>

          <div className="form-group">
            <label>Quantidade</label>
            <NumericInput
              min="1"
              defaultOnEmpty={1}
              value={item.quantidade}
              onChange={(value) => update('quantidade', value)}
            />
          </div>
          <div className="form-group">
            <label>Valor unitário (R$)</label>
            <NumericInput
              step="0.01"
              min="0"
              value={item.preco_unitario}
              onChange={(value) => update('preco_unitario', value)}
            />
          </div>
          <div className="form-group">
            <label>Subtotal</label>
            <input value={formatCurrency(subtotal)} readOnly className="input-readonly" />
          </div>
        </div>
      </div>
    </div>
  );
}
