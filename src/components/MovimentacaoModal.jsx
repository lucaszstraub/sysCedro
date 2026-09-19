import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS } from '../constants/estoque';

function hojeIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MovimentacaoModal({
  produtos,
  localizacoes,
  localizacoesDestino,
  onClose,
  onSave,
  initialProdutoId = '',
  initialOrigemId = '',
  initialQuantidade = '',
  initialTipo = 'transferencia',
}) {
  const destinos = localizacoesDestino || localizacoes.filter(
    (l) => l.codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS
  );

  const [form, setForm] = useState({
    tipo: initialTipo || 'transferencia',
    produto_id: initialProdutoId ? String(initialProdutoId) : '',
    quantidade: initialQuantidade ? String(initialQuantidade) : '',
    localizacao_origem_id: initialOrigemId ? String(initialOrigemId) : '',
    localizacao_destino_id: '',
    motivo: '',
    usuario: 'operador',
    data_movimento: hojeIsoDate(),
  });
  const [localizacoesOrigem, setLocalizacoesOrigem] = useState([]);
  const [loadingOrigem, setLoadingOrigem] = useState(false);
  const [reservadoProduto, setReservadoProduto] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const needsOrigem = form.tipo === 'saida' || form.tipo === 'transferencia' || form.tipo === 'entregue';
  const needsDestino = form.tipo === 'entrada' || form.tipo === 'transferencia' || form.tipo === 'ajuste';
  const isEntregue = form.tipo === 'entregue';

  const origemSelecionada = useMemo(
    () => localizacoesOrigem.find(
      (l) => String(l.localizacao_id) === String(form.localizacao_origem_id)
    ),
    [localizacoesOrigem, form.localizacao_origem_id]
  );

  useEffect(() => {
    if (!form.produto_id || !needsOrigem) {
      setLocalizacoesOrigem([]);
      return undefined;
    }

    let cancelled = false;
    setLoadingOrigem(true);

    api.listEstoqueLocalizacoesProduto(Number(form.produto_id))
      .then((rows) => {
        if (cancelled) return;
        const lista = Array.isArray(rows) ? rows : [];
        setLocalizacoesOrigem(lista);

        setForm((prev) => {
          const origemValida = lista.some(
            (l) => String(l.localizacao_id) === String(prev.localizacao_origem_id)
          );
          if (origemValida) return prev;

          const melhor = lista[0];
          return {
            ...prev,
            localizacao_origem_id: melhor ? String(melhor.localizacao_id) : '',
          };
        });
      })
      .catch(() => {
        if (!cancelled) setLocalizacoesOrigem([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrigem(false);
      });

    return () => { cancelled = true; };
  }, [form.produto_id, needsOrigem]);

  useEffect(() => {
    if (!isEntregue || !form.produto_id) {
      setReservadoProduto(null);
      return undefined;
    }

    let cancelled = false;
    api.listReservasProduto(Number(form.produto_id))
      .then((rows) => {
        if (cancelled) return;
        const lista = Array.isArray(rows) ? rows : [];
        const total = lista.reduce((sum, r) => sum + (Number(r.quantidade) || 0), 0);
        setReservadoProduto(total);
      })
      .catch(() => {
        if (!cancelled) setReservadoProduto(null);
      });

    return () => { cancelled = true; };
  }, [isEntregue, form.produto_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'produto_id') {
        next.localizacao_origem_id = '';
        next.quantidade = '';
      }
      if (name === 'tipo') {
        if (value !== 'saida' && value !== 'transferencia' && value !== 'entregue') {
          next.localizacao_origem_id = '';
        }
        if (value !== 'entrada' && value !== 'transferencia' && value !== 'ajuste') {
          next.localizacao_destino_id = '';
        }
        if (value === 'entregue' && !prev.motivo) {
          next.motivo = 'Entregue ao cliente';
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        tipo: form.tipo,
        produto_id: Number(form.produto_id),
        quantidade: Number(form.quantidade),
        localizacao_origem_id: form.localizacao_origem_id ? Number(form.localizacao_origem_id) : null,
        localizacao_destino_id: form.localizacao_destino_id ? Number(form.localizacao_destino_id) : null,
        motivo: form.motivo || null,
        usuario: form.usuario || 'operador',
        data_movimento: form.data_movimento || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const opcoesOrigem = form.produto_id && localizacoesOrigem.length > 0
    ? localizacoesOrigem
    : localizacoes.map((l) => ({
      localizacao_id: l.id,
      localizacao_codigo: l.codigo,
      localizacao_nome: l.nome,
      quantidade: null,
    }));

  const titulo = isEntregue ? 'Registrar entrega (Entregue)' : 'Nova movimentação';

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          {isEntregue ? (
            <p className="hint-text" style={{ marginBottom: '1rem' }}>
              <strong>Entregue</strong> baixa a quantidade do estoque físico e libera o compromisso
              (disponibilidade sobe na mesma medida). Use quando o produto sair para o cliente.
            </p>
          ) : (
            <p className="hint-text" style={{ marginBottom: '1rem' }}>
              Para produtos recém-chegados, use <strong>Alocar</strong> na seção de pendências.
              Para saída ao cliente com baixa de compromisso, use o tipo <strong>Entregue</strong>.
            </p>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="tipo">Tipo *</label>
              <select id="tipo" name="tipo" value={form.tipo} onChange={handleChange} required>
                <option value="entregue">Entregue (baixa estoque + compromisso)</option>
                <option value="transferencia">Transferência entre localizações</option>
                <option value="saida">Saída (sem baixa de compromisso)</option>
                <option value="entrada">Entrada manual</option>
                <option value="ajuste">Ajuste de inventário</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="data_movimento">Data da movimentação *</label>
              <input
                id="data_movimento"
                name="data_movimento"
                type="date"
                value={form.data_movimento}
                onChange={handleChange}
                required
              />
              <span className="hint-text">Fica registrada para conferência posterior.</span>
            </div>
            <div className="form-group">
              <label htmlFor="produto_id">Produto *</label>
              <select id="produto_id" name="produto_id" value={form.produto_id} onChange={handleChange} required>
                <option value="">Selecione...</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {p.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="quantidade">Quantidade *</label>
              <input
                id="quantidade"
                name="quantidade"
                type="number"
                min="1"
                max={origemSelecionada?.quantidade || undefined}
                value={form.quantidade}
                onChange={handleChange}
                required
              />
              {origemSelecionada && (
                <span className="hint-text">
                  Em estoque na origem: {origemSelecionada.quantidade} un.
                </span>
              )}
              {isEntregue && reservadoProduto != null && (
                <span className="hint-text" style={{ display: 'block' }}>
                  Comprometido (reservas ativas): {reservadoProduto} un.
                  {reservadoProduto === 0 && (
                    <span className="text-danger"> — é necessário ter compromisso para Entregue.</span>
                  )}
                </span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="usuario">Usuário</label>
              <input id="usuario" name="usuario" value={form.usuario} onChange={handleChange} />
            </div>
            {needsOrigem && (
              <div className="form-group">
                <label htmlFor="localizacao_origem_id">Localização de origem *</label>
                <select
                  id="localizacao_origem_id"
                  name="localizacao_origem_id"
                  value={form.localizacao_origem_id}
                  onChange={handleChange}
                  required={needsOrigem}
                  disabled={loadingOrigem}
                >
                  <option value="">
                    {loadingOrigem ? 'Carregando localizações...' : 'Selecione...'}
                  </option>
                  {opcoesOrigem.map((l) => (
                    <option key={l.localizacao_id} value={l.localizacao_id}>
                      {l.localizacao_codigo} — {l.localizacao_nome}
                      {l.quantidade != null ? ` (${l.quantidade} un.)` : ''}
                    </option>
                  ))}
                </select>
                {form.produto_id && !loadingOrigem && localizacoesOrigem.length === 0 && (
                  <span className="hint-text text-danger">
                    Este produto não possui estoque em nenhuma localização.
                  </span>
                )}
              </div>
            )}
            {needsDestino && (
              <div className="form-group">
                <label htmlFor="localizacao_destino_id">
                  {form.tipo === 'ajuste' ? 'Localização *' : 'Localização de destino *'}
                </label>
                <select
                  id="localizacao_destino_id"
                  name="localizacao_destino_id"
                  value={form.localizacao_destino_id}
                  onChange={handleChange}
                  required={needsDestino}
                >
                  <option value="">Selecione...</option>
                  {destinos
                    .filter((l) => String(l.id) !== String(form.localizacao_origem_id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>{l.codigo} — {l.nome}</option>
                    ))}
                </select>
              </div>
            )}
            <div className="form-group full-width">
              <label htmlFor="motivo">Motivo / Observação</label>
              <textarea
                id="motivo"
                name="motivo"
                rows={2}
                value={form.motivo}
                onChange={handleChange}
                placeholder={isEntregue ? 'Ex: Entrega pedido 1234, cliente retirou...' : 'Ex: Reposição, inventário...'}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || loadingOrigem}>
              {saving ? 'Registrando...' : isEntregue ? 'Confirmar entregue' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
