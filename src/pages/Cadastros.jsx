import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { filterCadastroOptions } from '../constants/auth';
import PageHero from '../components/PageHero';

export default function Cadastros() {
  const { user } = useAuth();
  const opcoes = filterCadastroOptions(user);

  return (
    <>
      <PageHero
        eyebrow="Cadastros"
        title="O que deseja cadastrar?"
        subtitle="Escolha o tipo de registro. Os atalhos abaixo respeitam o seu perfil de acesso."
      />

      {opcoes.length === 0 ? (
        <div className="empty-state">Nenhuma opção de cadastro disponível para o seu perfil.</div>
      ) : (
        <div className="hub-grid cadastros-hub-grid">
          {opcoes.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="hub-card cadastro-option-card"
            >
              <span className="hub-link-icon" aria-hidden>{item.icon}</span>
              <strong>{item.label}</strong>
              {item.description && <p className="hint-text">{item.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
