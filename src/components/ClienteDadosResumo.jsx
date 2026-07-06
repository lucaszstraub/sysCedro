import {
  CAMPOS_ORCAMENTO,
  CAMPOS_VENDA_NF,
  clienteProntoParaOrcamento,
  clienteProntoParaVenda,
  labelsCamposFaltantes,
} from '../utils/clienteDados';

export default function ClienteDadosResumo({ cliente, variant = 'orcamento', onEditar }) {
  if (!cliente) return null;

  const prontoOrcamento = clienteProntoParaOrcamento(cliente);
  const prontoVenda = clienteProntoParaVenda(cliente);
  const faltandoOrcamento = labelsCamposFaltantes(cliente, CAMPOS_ORCAMENTO);
  const faltandoVenda = labelsCamposFaltantes(cliente, CAMPOS_VENDA_NF);

  if (variant === 'venda') {
    if (prontoVenda) {
      return (
        <div className="cliente-dados-resumo cliente-dados-resumo-ok">
          <span>Cadastro completo para emissão de nota fiscal.</span>
        </div>
      );
    }

    return (
      <div className="cliente-dados-resumo cliente-dados-resumo-erro">
        <div>
          <strong>Cadastro incompleto para confirmar a venda</strong>
          <p>
            Para confirmar o pedido e emitir nota fiscal posteriormente, complete:
            {' '}
            {faltandoVenda.join(', ')}.
          </p>
        </div>
        {onEditar && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEditar}>
            Completar cadastro
          </button>
        )}
      </div>
    );
  }

  if (prontoOrcamento) {
    return (
      <div className="cliente-dados-resumo cliente-dados-resumo-ok">
        <span>Dados essenciais para orçamento preenchidos (nome, telefone e endereço).</span>
        {!prontoVenda && (
          <p className="cliente-dados-resumo-nota">
            Para confirmar uma venda depois, será necessário completar CPF/CNPJ, e-mail e demais dados fiscais.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="cliente-dados-resumo cliente-dados-resumo-aviso">
      <div>
        <strong>Dados recomendados para orçamento</strong>
        <p>
          Informe nome, telefone e endereço para facilitar contato e entrega.
          {faltandoOrcamento.length > 0 && (
            <> Pendente: {faltandoOrcamento.join(', ')}.</>
          )}
        </p>
      </div>
      {onEditar && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEditar}>
          Completar cadastro
        </button>
      )}
    </div>
  );
}
