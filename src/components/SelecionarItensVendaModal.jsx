import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatCurrency } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import NumeroPedidoCell from './NumeroPedidoCell';

export default function SelecionarItensVendaModal({ fornecedorId, itensJaAdicionados = [], onClose, onConfirm }) {
  const [pendencias, setPendencias] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecionados, setSelecionados] = useState({});
  const { error: showError } = useFeedback();

  const idsJaUsados = useMemo(
    () => itensJaAdicionados.map((i) => i.venda_item_id).filter(Boolean),
    [itensJaAdicionados]
  );
  const idsKey = idsJaUsados.join(',');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listPendenciasEncomenda(fornecedorId ? Number(fornecedorId) : null, '');
        const usados = new Set(idsJaUsados);
        setPendencias(data.filter((p) => !usados.has(p.venda_item_id)));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [fornecedorId, idsKey]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pendencias;
    return pendencias.filter((p) => [
      p.numero_pedido,
      p.venda_numero,
      p.cliente_nome,
      p.item_descricao,
      p.produto_sku,
      p.produto_nome,
    ].filter(Boolean).join(' ').toLowerCase().includes(termo));
  }, [pendencias, busca]);

  const toggle = (vendaItemId, pendente) => {
    setSelecionados((prev) => {
      const next = { ...prev };
      if (next[vendaItemId]) {
        delete next[vendaItemId];
      } else {
        next[vendaItemId] = pendente;
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const escolhidos = filtrados.filter((p) => selecionados[p.venda_item_id]);
    if (escolhidos.length === 0) {
      showError('Selecione ao menos um item de venda.');
      return;
    }
    onConfirm(escolhidos);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Vincular itens de vendas</h3>
            <p className="picker-subtitle">
              Selecione pelos <strong>números de pedido</strong> os produtos vendidos que ainda precisam ser encomendados
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body picker-body">
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <div className="picker-filters">
            <input
              className="search-input picker-search"
              placeholder="Buscar por nº pedido, cliente, produto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />
          </div>

          {loading ? (
            <div className="loading">Carregando pendências...</div>
          ) : filtrados.length === 0 ? (
            <div className="empty-state">
              Nenhum item de venda pendente de encomenda para este fornecedor.
            </div>
          ) : (
            <div className="picker-table-wrap">
              <table className="picker-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="pendencia-pedido-col">Nº pedido</th>
                    <th>Produto</th>
                    <th>Pendente</th>
                    <th>Custo ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <tr key={p.venda_item_id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selecionados[p.venda_item_id])}
                          onChange={() => toggle(p.venda_item_id, p.quantidade_pendente)}
                        />
                      </td>
                      <td className="pendencia-pedido-col">
                        <NumeroPedidoCell
                          numeroPedido={p.numero_pedido}
                          clienteNome={p.cliente_nome}
                          vendaNumero={p.venda_numero}
                          compact
                        />
                      </td>
                      <td>
                        <strong>{p.produto_sku || '—'}</strong>
                        <br />
                        {p.produto_nome || p.item_descricao}
                      </td>
                      <td><strong>{p.quantidade_pendente}</strong></td>
                      <td>{formatCurrency(p.preco_custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer picker-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm}>
            Vincular selecionados
          </button>
        </div>
      </div>
    </div>
  );
}
