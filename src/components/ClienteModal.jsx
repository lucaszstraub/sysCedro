import { InlineAlert } from './PageAlert';
import { useMemo, useState } from 'react';
import {
  CAMPOS_ORCAMENTO,
  CAMPOS_VENDA_NF,
  CAMPOS_CLIENTE_LABELS,
  validarClienteCadastro,
} from '../utils/clienteDados';

const emptyForm = {
  nome: '',
  cpf_cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  cidade: '',
  estado: '',
  cep: '',
  observacoes: '',
};

function classeCampo(campo, context) {
  const classes = [];
  if (campo === 'nome' || campo === 'telefone') classes.push('campo-obrigatorio');
  if (CAMPOS_ORCAMENTO.includes(campo)) classes.push('campo-orcamento');
  if (context === 'venda' && CAMPOS_VENDA_NF.includes(campo)) classes.push('campo-venda-nf');
  return classes.join(' ');
}

function labelCampo(campo, obrigatorio = false) {
  const texto = CAMPOS_CLIENTE_LABELS[campo] || campo;
  return obrigatorio ? `${texto} *` : texto;
}

export default function ClienteModal({ cliente, onClose, onSave, context = 'cadastro' }) {
  const [form, setForm] = useState(cliente ? {
    nome: cliente.nome,
    cpf_cnpj: cliente.cpf_cnpj || '',
    telefone: cliente.telefone || '',
    email: cliente.email || '',
    endereco: cliente.endereco || '',
    cidade: cliente.cidade || '',
    estado: cliente.estado || '',
    cep: cliente.cep || '',
    observacoes: cliente.observacoes || '',
  } : emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const destaqueOrcamento = useMemo(
    () => context === 'orcamento' || context === 'cadastro',
    [context]
  );
  const destaqueVenda = useMemo(
    () => context === 'venda' || context === 'cadastro',
    [context]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      validarClienteCadastro(form);
      await onSave(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{cliente ? 'Editar cliente' : 'Novo cliente'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          {destaqueOrcamento && (
            <div className="cliente-modal-info cliente-modal-info-orcamento">
              <strong>Para orçamento</strong>
              <p>
                Os dados mais importantes são <em>nome</em>, <em>telefone</em> e <em>endereço</em>,
                usados no contato com o cliente e na proposta.
              </p>
            </div>
          )}

          {destaqueVenda && (
            <div className="cliente-modal-info cliente-modal-info-venda">
              <strong>Para confirmar venda</strong>
              <p>
                Ao confirmar um pedido, o cadastro deve estar completo — CPF/CNPJ, e-mail e endereço
                integral — pois a nota fiscal será emitida posteriormente com esses dados.
              </p>
            </div>
          )}

          <div className="cliente-modal-legenda">
            <span className="legenda-item legenda-obrigatorio">Obrigatório no cadastro</span>
            {destaqueOrcamento && (
              <span className="legenda-item legenda-orcamento">Essencial para orçamento</span>
            )}
            {destaqueVenda && (
              <span className="legenda-item legenda-venda">Necessário para venda / NF</span>
            )}
          </div>

          <div className="form-grid">
            <div className={`form-group full-width ${classeCampo('nome', context)}`}>
              <label htmlFor="nome">{labelCampo('nome', true)}</label>
              <input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
            <div className={`form-group ${classeCampo('cpf_cnpj', context)}`}>
              <label htmlFor="cpf_cnpj">{labelCampo('cpf_cnpj')}</label>
              <input id="cpf_cnpj" name="cpf_cnpj" value={form.cpf_cnpj} onChange={handleChange} />
            </div>
            <div className={`form-group ${classeCampo('telefone', context)}`}>
              <label htmlFor="telefone">{labelCampo('telefone', true)}</label>
              <input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} required />
            </div>
            <div className={`form-group ${classeCampo('email', context)}`}>
              <label htmlFor="email">{labelCampo('email')}</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
            <div className={`form-group full-width ${classeCampo('endereco', context)}`}>
              <label htmlFor="endereco">{labelCampo('endereco')}</label>
              <input id="endereco" name="endereco" value={form.endereco} onChange={handleChange} />
            </div>
            <div className={`form-group ${classeCampo('cidade', context)}`}>
              <label htmlFor="cidade">{labelCampo('cidade')}</label>
              <input id="cidade" name="cidade" value={form.cidade} onChange={handleChange} />
            </div>
            <div className={`form-group ${classeCampo('estado', context)}`}>
              <label htmlFor="estado">{labelCampo('estado')}</label>
              <input id="estado" name="estado" maxLength={2} value={form.estado} onChange={handleChange} placeholder="SP" />
            </div>
            <div className={`form-group ${classeCampo('cep', context)}`}>
              <label htmlFor="cep">{labelCampo('cep')}</label>
              <input id="cep" name="cep" value={form.cep} onChange={handleChange} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="observacoes">Observações</label>
              <textarea id="observacoes" name="observacoes" rows={2} value={form.observacoes} onChange={handleChange} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
