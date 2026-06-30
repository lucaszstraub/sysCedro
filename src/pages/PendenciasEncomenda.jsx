import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatCurrency } from '../utils/format';
import PageAlert from '../components/PageAlert';
import NumeroPedidoCell from '../components/NumeroPedidoCell';

const base = '/gestao-estoque/encomendas';

export default function PendenciasEncomenda() {
  const [pendencias, setPendencias] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const [lista, res] = await Promise.all([
        api.listPendenciasEncomenda(null, term),
        api.getResumoPendenciasEncomenda(),
      ]);
      setPendencias(lista);
      setResumo(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const porFornecedor = pendencias.reduce((acc, p) => {
    const key = p.fornecedor_id || 'sem_fornecedor';
    if (!acc[key]) {
      acc[key] = {
        fornecedor_id: p.fornecedor_id,
        fornecedor_nome: p.fornecedor_nome || 'Sem fornecedor',
        itens: [],
        unidades: 0,
      };
    }
    acc[key].itens.push(p);
    acc[key].unidades += Number(p.quantidade_pendente) || 0;
    return acc;
  }, {});

  const grupos = Object.values(porFornecedor);

  return (
    <>
      <header className="page-header">
        <h2>Pendências de encomenda</h2>
        <p>Itens de vendas (exceto canceladas) que ainda precisam ser pedidos ao fornecedor</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {resumo && (
        <div className={`card ${resumo.todos_encomendados ? 'alert-success' : ''}`} style={{ marginBottom: '1rem' }}>
          <div className="card-body">
            {resumo.todos_encomendados ? (
              <strong>Todos os pedidos de encomenda já foram vinculados a fornecedores.</strong>
            ) : (
              <>
                <strong>Atenção:</strong> existem{' '}
                <strong>{resumo.total_linhas_pendentes}</strong> linha(s) pendente(s), totalizando{' '}
                <strong>{resumo.total_unidades_pendentes}</strong> unidade(s) em{' '}
                <strong>{resumo.fornecedores_com_pendencia}</strong> fornecedor(es).
              </>
            )}
          </div>
        </div>
      )}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar por pedido, venda, cliente, produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <Link to={base} className="btn btn-secondary">Voltar às encomendas</Link>
        <Link to={`${base}/nova`} className="btn btn-primary">+ Nova encomenda</Link>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando pendências...</div>
          ) : pendencias.length === 0 ? (
            <div className="empty-state">Nenhuma pendência de encomenda encontrada.</div>
          ) : (
            grupos.map((grupo) => (
              <div key={grupo.fornecedor_id || 'sem'} style={{ marginBottom: '1.5rem' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{grupo.fornecedor_nome} — {grupo.unidades} un. pendente(s)</span>
                  {grupo.fornecedor_id && (
                    <Link
                      to={`${base}/nova?fornecedor=${grupo.fornecedor_id}`}
                      className="btn btn-primary btn-sm"
                    >
                      Criar encomenda
                    </Link>
                  )}
                </div>
                <table>
                  <thead>
                    <tr>
                      <th className="pendencia-pedido-col">Nº pedido</th>
                      <th>Produto</th>
                      <th>Pendente</th>
                      <th>Vendido p/ enc.</th>
                      <th>Já encomendado</th>
                      <th>Custo ref.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.itens.map((p) => (
                      <tr key={p.venda_item_id}>
                        <td className="pendencia-pedido-col">
                          <NumeroPedidoCell
                            numeroPedido={p.numero_pedido}
                            clienteNome={p.cliente_nome}
                            vendaNumero={p.venda_numero}
                          />
                        </td>
                        <td>
                          <strong>{p.produto_sku || '—'}</strong>
                          <br />
                          {p.produto_nome || p.item_descricao}
                        </td>
                        <td><strong>{p.quantidade_pendente}</strong></td>
                        <td>{p.quantidade_encomenda}</td>
                        <td>{p.quantidade_ja_encomendada}</td>
                        <td>{formatCurrency(p.preco_custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
