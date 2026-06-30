import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  RECEBIMENTO_FILTRO_OPTIONS,
  SITUACAO_RECEBIMENTO_LABEL,
  resolverCustoEsperado,
} from '../constants/encomenda';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import ReceberEncomendaModal from '../components/ReceberEncomendaModal';
import NotaFiscalModal from '../components/NotaFiscalModal';
import NumeroPedidoCell from '../components/NumeroPedidoCell';

function SituacaoBadge({ situacao, dataRecebimento, quantidadeRecebida, quantidadePedida }) {
  const recebido = situacao === 'recebido';
  return (
    <div className="situacao-recebimento">
      <span className={`badge ${recebido ? 'badge-recebido' : 'badge-a-receber'}`}>
        {SITUACAO_RECEBIMENTO_LABEL[situacao] || situacao}
      </span>
      {recebido && dataRecebimento && (
        <span className="hint-text situacao-recebimento-data">
          {formatDate(dataRecebimento)}
        </span>
      )}
      {!recebido && Number(quantidadeRecebida) > 0 && (
        <span className="hint-text situacao-recebimento-data">
          {quantidadeRecebida}/{quantidadePedida} recebido(s)
        </span>
      )}
    </div>
  );
}

export default function Recebimentos() {
  const [itens, setItens] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('a_receber');
  const [loading, setLoading] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [error, setError] = useState('');
  const [itemReceber, setItemReceber] = useState(null);
  const [notasFiscais, setNotasFiscais] = useState([]);
  const [loadingNotas, setLoadingNotas] = useState(true);
  const [showNotaFiscalModal, setShowNotaFiscalModal] = useState(false);
  const [notaFiscalContexto, setNotaFiscalContexto] = useState(null);
  const [estornandoId, setEstornandoId] = useState(null);
  const { success: showSuccess, confirm } = useFeedback();

  const load = async (term = busca, filtroAtual = filtro) => {
    setLoading(true);
    setError('');
    try {
      const lista = await api.listItensControleRecebimento(filtroAtual, term);
      setItens(lista);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistorico = async (term = busca) => {
    setLoadingHistorico(true);
    try {
      const lista = await api.listHistoricoRecebimentos(term);
      setHistorico(lista);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingHistorico(false);
    }
  };

  const loadNotasFiscais = async (term = busca) => {
    setLoadingNotas(true);
    try {
      setNotasFiscais(await api.listNotasFiscais(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingNotas(false);
    }
  };

  const loadAll = async (term = busca, filtroAtual = filtro) => {
    await Promise.all([load(term, filtroAtual), loadHistorico(term), loadNotasFiscais(term)]);
  };

  useEffect(() => { loadAll(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadAll(busca, filtro);
  };

  const handleFiltroChange = (novoFiltro) => {
    setFiltro(novoFiltro);
    load(busca, novoFiltro);
  };

  const handleReceber = async (data) => {
    const result = await api.receberEncomendaItem(data);
    setItemReceber(null);
    await loadAll();
    const divergencia = result.divergencia_custo;
    const msg = divergencia === 0
      ? 'Recebimento registrado. Custo real de chegada confere com o esperado na encomenda.'
      : `Recebimento registrado. Divergência de custo real: ${formatCurrency(divergencia)} (${result.divergencia_percentual?.toFixed(1)}% em relação ao esperado na encomenda)`;
    showSuccess(msg, 7000);
  };

  const abrirCadastroNotaFiscal = (item = null) => {
    setNotaFiscalContexto(item);
    setShowNotaFiscalModal(true);
    if (itemReceber) setItemReceber(null);
  };

  const handleNotaFiscalSalva = async (nota) => {
    const contexto = notaFiscalContexto;
    setShowNotaFiscalModal(false);
    setNotaFiscalContexto(null);
    showSuccess(`Nota fiscal ${nota.numero} cadastrada${nota.total_boletos ? ` com ${nota.total_boletos} boleto(s)` : ''}.`);
    await loadNotasFiscais();
    if (contexto) {
      setItemReceber(contexto);
    }
  };

  const handleEstornar = async (recebimentoId, descricao) => {
    const ok = await confirm({
      title: 'Estornar recebimento',
      message: `Deseja estornar o recebimento de ${descricao}? O produto voltará para "A receber" e o estoque será ajustado se necessário.`,
      confirmLabel: 'Estornar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setEstornandoId(recebimentoId);
    setError('');
    try {
      await api.estornarRecebimento(recebimentoId);
      showSuccess('Recebimento estornado. O item voltou para "A receber".');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setEstornandoId(null);
    }
  };

  const emptyControle = filtro === 'recebido'
    ? 'Nenhum produto recebido encontrado.'
    : filtro === 'a_receber'
      ? 'Nenhum produto a receber. Tudo em dia!'
      : 'Nenhum item encontrado.';

  return (
    <>
      <header className="page-header">
        <h2>Recebimentos de encomendas</h2>
        <p>Controle de chegada de produtos — itens entram em &quot;Não alocados&quot; e são guardados depois em Movimentações</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={handleSearch} className="toolbar-filters">
          <input
            className="search-input"
            placeholder="Buscar produto, fornecedor, encomenda ou pedido..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select
            className="filter-select"
            value={filtro}
            onChange={(e) => handleFiltroChange(e.target.value)}
            aria-label="Filtrar por situação"
          >
            {RECEBIMENTO_FILTRO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </form>
        <button type="button" className="btn btn-primary" onClick={() => abrirCadastroNotaFiscal()}>
          + Nota fiscal
        </button>
        <Link to="/gestao-estoque/encomendas" className="btn btn-secondary">Encomendas</Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">Notas fiscais cadastradas</div>
        <div className="card-body" style={{ padding: 0 }}>
          {loadingNotas ? (
            <div className="loading">Carregando notas fiscais...</div>
          ) : notasFiscais.length === 0 ? (
            <div className="empty-state">
              Nenhuma nota fiscal cadastrada. Use &quot;+ Nota fiscal&quot; para registrar pagamentos ao fornecedor.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Número</th>
                  <th>Valor total</th>
                  <th>Boletos</th>
                  <th>Recebimentos vinculados</th>
                  <th>Cadastrada em</th>
                </tr>
              </thead>
              <tbody>
                {notasFiscais.map((nota) => (
                  <tr key={nota.id}>
                    <td>{nota.fornecedor_nome}</td>
                    <td><strong>{nota.numero}</strong></td>
                    <td>{formatCurrency(nota.valor_total)}</td>
                    <td>{nota.total_boletos || 0}</td>
                    <td>{nota.total_recebimentos || 0}</td>
                    <td>{formatDate(nota.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">Controle de recebimentos</div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando itens...</div>
          ) : itens.length === 0 ? (
            <div className="empty-state">
              {busca.trim() ? 'Nenhum item encontrado para esta busca.' : emptyControle}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Situação</th>
                  <th>Encomenda</th>
                  <th>Fornecedor</th>
                  <th className="pendencia-pedido-col">Pedido / Estoque</th>
                  <th>Produto</th>
                  <th>Observações</th>
                  <th>Qtd</th>
                  <th>Custo esperado (c/ frete e IPI)</th>
                  <th>Previsão</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <SituacaoBadge
                        situacao={i.situacao}
                        dataRecebimento={i.data_recebimento}
                        quantidadeRecebida={i.quantidade_recebida}
                        quantidadePedida={i.quantidade_pedida}
                      />
                    </td>
                    <td><strong>{i.encomenda_numero}</strong></td>
                    <td>{i.fornecedor_nome}</td>
                    <td className="pendencia-pedido-col">
                      <NumeroPedidoCell
                        numeroPedido={i.numero_pedido}
                        clienteNome={i.cliente_nome}
                        vendaNumero={i.venda_numero}
                        compact
                        semPedidoLabel="Estoque"
                        showVenda={false}
                      />
                    </td>
                    <td>
                      {i.produto_sku} — {i.produto_nome}
                    </td>
                    <td className="observacoes-cell">
                      {i.observacoes ? (
                        <span title={i.observacoes}>{i.observacoes}</span>
                      ) : (
                        <span className="hint-text">—</span>
                      )}
                    </td>
                    <td>
                      {i.situacao === 'recebido'
                        ? i.quantidade_pedida
                        : `${i.quantidade_pendente} pend.`}
                    </td>
                    <td>{formatCurrency(resolverCustoEsperado(i))}</td>
                    <td>{formatDate(i.previsao_entrega)}</td>
                    <td>
                      {i.situacao === 'a_receber' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setItemReceber(i)}
                        >
                          Receber
                        </button>
                      ) : i.ultimo_recebimento_id ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleEstornar(
                            i.ultimo_recebimento_id,
                            `${i.produto_sku} (${i.encomenda_numero})`
                          )}
                          disabled={estornandoId === i.ultimo_recebimento_id}
                        >
                          {estornandoId === i.ultimo_recebimento_id ? 'Estornando...' : 'Estornar'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">Histórico de recebimentos</div>
        <div className="card-body" style={{ padding: 0 }}>
          {loadingHistorico ? (
            <div className="loading">Carregando histórico...</div>
          ) : historico.length === 0 ? (
            <div className="empty-state">Nenhum recebimento registrado ainda.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Encomenda</th>
                  <th>Produto</th>
                  <th className="pendencia-pedido-col">Pedido / Estoque</th>
                  <th>Qtd</th>
                  <th>Valor na nota</th>
                  <th>Frete</th>
                  <th>IPI</th>
                  <th>Custo c/ frete e IPI</th>
                  <th>Nº nota fiscal</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className={h.estornado ? 'row-estornado' : ''}>
                    <td>{formatDateTime(h.criado_em)}</td>
                    <td><strong>{h.encomenda_numero}</strong></td>
                    <td>{h.produto_sku} — {h.produto_nome}</td>
                    <td className="pendencia-pedido-col">
                      <NumeroPedidoCell
                        numeroPedido={h.numero_pedido}
                        clienteNome={h.cliente_nome}
                        vendaNumero={h.venda_numero}
                        compact
                        semPedidoLabel="Estoque"
                        showVenda={false}
                      />
                    </td>
                    <td>{h.quantidade}</td>
                    <td>{formatCurrency(h.valor_nota_unitario ?? h.custo_negociado)}</td>
                    <td>{formatCurrency(h.frete_unitario)}</td>
                    <td>{formatCurrency(h.ipi_unitario)}</td>
                    <td>{formatCurrency(h.custo_real)}</td>
                    <td>
                      <strong>{h.nota_fiscal_numero_cadastrada || h.numero_nota_fiscal || '—'}</strong>
                      {h.nota_fiscal_numero_cadastrada && h.numero_nota_fiscal
                        && h.nota_fiscal_numero_cadastrada !== h.numero_nota_fiscal && (
                        <span className="hint-text" style={{ display: 'block' }}>
                          Informado: {h.numero_nota_fiscal}
                        </span>
                      )}
                    </td>
                    <td>
                      {h.estornado ? (
                        <span className="badge badge-estornado">
                          Estornado
                          {h.estornado_em && (
                            <span className="hint-text" style={{ display: 'block', marginTop: '0.15rem' }}>
                              {formatDate(h.estornado_em)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="badge badge-recebido">Recebido</span>
                      )}
                    </td>
                    <td>
                      {!h.estornado && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleEstornar(
                            h.id,
                            `${h.produto_sku} em ${formatDateTime(h.criado_em)}`
                          )}
                          disabled={estornandoId === h.id}
                        >
                          {estornandoId === h.id ? 'Estornando...' : 'Estornar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {itemReceber && (
        <ReceberEncomendaModal
          item={itemReceber}
          onClose={() => setItemReceber(null)}
          onConfirm={handleReceber}
          onCadastrarNotaFiscal={abrirCadastroNotaFiscal}
        />
      )}

      {showNotaFiscalModal && (
        <NotaFiscalModal
          fornecedorIdInicial={notaFiscalContexto?.fornecedor_id || ''}
          fornecedorNomeInicial={notaFiscalContexto?.fornecedor_nome || ''}
          onClose={() => {
            setShowNotaFiscalModal(false);
            setNotaFiscalContexto(null);
            if (notaFiscalContexto) setItemReceber(notaFiscalContexto);
          }}
          onSaved={handleNotaFiscalSalva}
        />
      )}
    </>
  );
}
