import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function SelecionarClienteModal({ onClose, onSelect, onNovoCliente, clienteAtualId }) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [cidade, setCidade] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listClientes('');
        setClientes(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cidades = useMemo(() => {
    const set = new Set(clientes.map((c) => c.cidade).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [clientes]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (cidade && c.cidade !== cidade) return false;
      if (!termo) return true;
      const haystack = [
        c.nome,
        c.cpf_cnpj,
        c.email,
        c.telefone,
        c.cidade,
        c.estado,
        c.endereco,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(termo);
    });
  }, [clientes, busca, cidade]);

  const limparFiltros = () => {
    setBusca('');
    setCidade('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Selecionar cliente</h3>
            <p className="picker-subtitle">Busque e filtre a lista de clientes cadastrados</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body picker-body">
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <div className="picker-filters">
            <div className="picker-search-wrap">
              <input
                className="search-input picker-search"
                placeholder="Pesquisar por nome, CPF/CNPJ, e-mail, telefone, endereço..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
              />
            </div>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)}>
              <option value="">Todas as cidades</option>
              {cidades.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>

          <div className="picker-meta">
            <span>{filtrados.length} cliente(s) encontrado(s)</span>
            {onNovoCliente && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onNovoCliente}>
                + Cadastrar novo cliente
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading">Carregando clientes...</div>
          ) : filtrados.length === 0 ? (
            <div className="empty-state">Nenhum cliente encontrado com os filtros aplicados.</div>
          ) : (
            <div className="picker-table-wrap">
              <table className="picker-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF / CNPJ</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th>Cidade</th>
                    <th>UF</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => (
                    <tr key={c.id} className={String(c.id) === String(clienteAtualId) ? 'picker-row-selected' : ''}>
                      <td><strong>{c.nome}</strong></td>
                      <td>{c.cpf_cnpj || '—'}</td>
                      <td>{c.telefone || '—'}</td>
                      <td>{c.email || '—'}</td>
                      <td>{c.cidade || '—'}</td>
                      <td>{c.estado || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => { onSelect(c); onClose(); }}
                        >
                          {String(c.id) === String(clienteAtualId) ? 'Selecionado' : 'Selecionar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer picker-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
