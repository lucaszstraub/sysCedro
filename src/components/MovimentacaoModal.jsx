import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS, isLocalizacaoNaoAlocados } from '../constants/estoque';

export const DESTINO_ENTREGUE = '__entregue__';

function hojeIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Movimentação produto-primeiro:
 * busca o produto → vê onde está → informa qtd por origem → escolhe destino (ou Entregue).
 */
export default function MovimentacaoModal({
  localizacoesDestino = [],
  onClose,
  onSave,
  initialProduto = null,
  /** Prefill qty from "Não alocados" (ex.: botão Alocar nas pendências). */
  sugerirDeNaoAlocados = false,
  /** Prefill qty from a specific location (ex.: Movimentar no painel por localização). */
  sugerirLocalizacaoId = null,
}) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [produto, setProduto] = useState(initialProduto || null);

  const [locais, setLocais] = useState([]);
  const [qtdsMover, setQtdsMover] = useState({});
  const [loadingLocais, setLoadingLocais] = useState(false);
  const [reservado, setReservado] = useState(0);

  const [destinoId, setDestinoId] = useState('');
  const [dataMovimento, setDataMovimento] = useState(hojeIsoDate());
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const destinos = useMemo(
    () => (localizacoesDestino || []).filter((l) => l.codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS),
    [localizacoesDestino]
  );

  useEffect(() => {
    if (produto || !busca.trim()) {
      setResultados([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setBuscando(true);
      api.listProdutos(busca.trim())
        .then((lista) => {
          if (!cancelled) setResultados(Array.isArray(lista) ? lista.slice(0, 20) : []);
        })
        .catch(() => {
          if (!cancelled) setResultados([]);
        })
        .finally(() => {
          if (!cancelled) setBuscando(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [busca, produto]);

  useEffect(() => {
    if (!produto?.id) {
      setLocais([]);
      setQtdsMover({});
      setReservado(0);
      return undefined;
    }

    let cancelled = false;
    setLoadingLocais(true);
    setError('');

    Promise.all([
      api.listEstoqueLocalizacoesProduto(Number(produto.id)),
      api.listReservasProduto(Number(produto.id)),
    ])
      .then(([locs, reservas]) => {
        if (cancelled) return;
        const lista = Array.isArray(locs) ? locs : [];
        setLocais(lista);
        const iniciais = {};
        const sugerirLocId = sugerirLocalizacaoId != null ? String(sugerirLocalizacaoId) : null;
        for (const loc of lista) {
          const id = String(loc.localizacao_id);
          if (sugerirLocId && id === sugerirLocId) {
            iniciais[id] = String(loc.quantidade || '');
          } else if (
            !sugerirLocId
            && sugerirDeNaoAlocados
            && loc.localizacao_codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS
          ) {
            iniciais[id] = String(loc.quantidade || '');
          } else {
            iniciais[id] = '';
          }
        }
        setQtdsMover(iniciais);
        const totalReservado = (Array.isArray(reservas) ? reservas : [])
          .reduce((sum, r) => sum + (Number(r.quantidade) || 0), 0);
        setReservado(totalReservado);
      })
      .catch((err) => {
        if (!cancelled) {
          setLocais([]);
          setError(err.message || 'Não foi possível carregar o estoque deste produto.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLocais(false);
      });

    return () => { cancelled = true; };
  }, [produto?.id, sugerirDeNaoAlocados, sugerirLocalizacaoId]);

  const estoqueTotal = useMemo(
    () => locais.reduce((sum, l) => sum + (Number(l.quantidade) || 0), 0),
    [locais]
  );

  const linhasMovimento = useMemo(() => {
    return locais
      .map((loc) => {
        const qtd = Number(qtdsMover[String(loc.localizacao_id)]) || 0;
        return { ...loc, qtdMover: qtd };
      })
      .filter((l) => l.qtdMover > 0);
  }, [locais, qtdsMover]);

  const totalMover = linhasMovimento.reduce((sum, l) => sum + l.qtdMover, 0);
  const isEntregue = destinoId === DESTINO_ENTREGUE;

  const destinosDisponiveis = useMemo(() => {
    const origensComMovimento = new Set(
      linhasMovimento.map((l) => String(l.localizacao_id))
    );
    return destinos.filter((d) => !origensComMovimento.has(String(d.id)));
  }, [destinos, linhasMovimento]);

  const selecionarProduto = (p) => {
    setProduto({ id: p.id, sku: p.sku, nome: p.nome });
    setBusca('');
    setResultados([]);
    setDestinoId('');
    setMotivo('');
  };

  const limparProduto = () => {
    setProduto(null);
    setLocais([]);
    setQtdsMover({});
    setReservado(0);
    setDestinoId('');
    setMotivo('');
    setError('');
  };

  const handleQtdChange = (localizacaoId, value, max) => {
    let next = value;
    if (next !== '' && Number(next) > max) next = String(max);
    if (next !== '' && Number(next) < 0) next = '0';
    setQtdsMover((prev) => ({ ...prev, [String(localizacaoId)]: next }));
  };

  const handleDestinoChange = (value) => {
    setDestinoId(value);
    if (value === DESTINO_ENTREGUE && !motivo.trim()) {
      setMotivo('Entregue ao cliente');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!produto?.id) throw new Error('Selecione um produto.');
      if (totalMover <= 0) throw new Error('Informe a quantidade a mover em pelo menos uma localização.');
      if (!destinoId) throw new Error('Selecione o destino.');

      for (const linha of linhasMovimento) {
        if (linha.qtdMover > Number(linha.quantidade)) {
          throw new Error(
            `Quantidade em ${linha.localizacao_codigo} excede o disponível (${linha.quantidade}).`
          );
        }
      }

      if (isEntregue && totalMover > reservado) {
        throw new Error(
          `Entregue exige compromisso. Comprometido: ${reservado} un.; informado: ${totalMover} un.`
        );
      }

      const tipo = isEntregue ? 'entregue' : 'transferencia';
      const localizacaoDestinoId = isEntregue ? null : Number(destinoId);

      await onSave({
        tipo,
        produto_id: Number(produto.id),
        localizacao_destino_id: localizacaoDestinoId,
        motivo: motivo.trim() || null,
        usuario: 'operador',
        data_movimento: dataMovimento || null,
        linhas: linhasMovimento.map((l) => ({
          localizacao_origem_id: Number(l.localizacao_id),
          quantidade: l.qtdMover,
        })),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Mover produto</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <p className="hint-text" style={{ marginBottom: '1rem' }}>
            Busque o produto, informe quanto sair de cada localização e escolha o destino.
            Destino <strong>Entregue</strong> baixa estoque e compromisso (disponibilidade sobe).
          </p>

          {!produto ? (
            <div className="form-group">
              <label htmlFor="busca_produto_mov">Produto *</label>
              <input
                id="busca_produto_mov"
                className="search-input"
                style={{ width: '100%', maxWidth: '100%' }}
                placeholder="Digite SKU ou nome do produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
              />
              {buscando && <span className="hint-text">Buscando...</span>}
              {!buscando && busca.trim() && resultados.length === 0 && (
                <span className="hint-text">Nenhum produto encontrado.</span>
              )}
              {resultados.length > 0 && (
                <div className="picker-table-wrap" style={{ marginTop: '0.75rem', maxHeight: 260, overflow: 'auto' }}>
                  <table className="picker-table picker-table--with-action">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Produto</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.sku}</strong></td>
                          <td>
                            {p.nome}
                            {p.quantidade_total != null && (
                              <span className="hint-text" style={{ display: 'block' }}>
                                Estoque: {p.quantidade_total} un.
                              </span>
                            )}
                          </td>
                          <td className="picker-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => selecionarProduto(p)}
                            >
                              Selecionar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="alocacao-produto-resumo" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0 }}><strong>{produto.sku}</strong> — {produto.nome}</p>
                    <p className="hint-text" style={{ margin: '0.35rem 0 0' }}>
                      Estoque físico: <strong>{estoqueTotal}</strong> un.
                      {' · '}
                      Comprometido: <strong>{reservado}</strong> un.
                      {' · '}
                      Disponibilidade: <strong className={estoqueTotal - reservado < 0 ? 'text-danger' : ''}>
                        {estoqueTotal - reservado}
                      </strong>
                    </p>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={limparProduto}>
                    Trocar produto
                  </button>
                </div>
              </div>

              {loadingLocais ? (
                <div className="loading">Carregando localizações...</div>
              ) : locais.length === 0 ? (
                <div className="empty-state">Este produto não possui quantidade em nenhuma localização.</div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Origem — quantidades a mover *</label>
                    <div className="picker-table-wrap" style={{ marginTop: '0.35rem' }}>
                      <table className="picker-table">
                        <thead>
                          <tr>
                            <th>Localização</th>
                            <th>Em estoque</th>
                            <th>Qtd a mover</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locais.map((loc) => {
                            const id = String(loc.localizacao_id);
                            const max = Number(loc.quantidade) || 0;
                            const naoAloc = isLocalizacaoNaoAlocados({ codigo: loc.localizacao_codigo });
                            return (
                              <tr key={id}>
                                <td>
                                  {naoAloc ? (
                                    <span className="badge badge-nao-alocados">Não alocado</span>
                                  ) : (
                                    <strong>{loc.localizacao_codigo}</strong>
                                  )}
                                  <span className="hint-text" style={{ display: 'block' }}>
                                    {loc.localizacao_nome}
                                  </span>
                                </td>
                                <td>{max}</td>
                                <td style={{ maxWidth: 120 }}>
                                  <input
                                    type="number"
                                    min="0"
                                    max={max}
                                    value={qtdsMover[id] ?? ''}
                                    onChange={(e) => handleQtdChange(loc.localizacao_id, e.target.value, max)}
                                    placeholder="0"
                                    aria-label={`Quantidade a mover de ${loc.localizacao_codigo}`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <span className="hint-text">
                      Total a mover: <strong>{totalMover}</strong> un.
                    </span>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="destino_mov">Destino *</label>
                      <select
                        id="destino_mov"
                        value={destinoId}
                        onChange={(e) => handleDestinoChange(e.target.value)}
                        required
                      >
                        <option value="">Selecione o destino...</option>
                        <option value={DESTINO_ENTREGUE}>
                          Entregue (baixa estoque + compromisso)
                          {reservado > 0 ? ` — ${reservado} comprometido(s)` : ''}
                        </option>
                        {destinosDisponiveis.map((l) => (
                          <option key={l.id} value={String(l.id)}>
                            {l.codigo} — {l.nome}
                          </option>
                        ))}
                      </select>
                      {isEntregue && (
                        <span className="hint-text">
                          Reduz estoque físico e libera o compromisso das vendas/encomendas.
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="data_movimento">Data da movimentação *</label>
                      <input
                        id="data_movimento"
                        type="date"
                        value={dataMovimento}
                        onChange={(e) => setDataMovimento(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group full-width">
                      <label htmlFor="motivo_mov">Motivo / Observação</label>
                      <textarea
                        id="motivo_mov"
                        rows={2}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder={isEntregue ? 'Ex: Entrega pedido 1234...' : 'Ex: Guardar no corredor A...'}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !produto || loadingLocais || totalMover <= 0 || !destinoId}
            >
              {saving
                ? 'Registrando...'
                : isEntregue
                  ? `Confirmar entregue (${totalMover})`
                  : `Mover ${totalMover || ''} un.`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
