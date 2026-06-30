import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDefaultRoute } from '../constants/auth';
import BrandLogo from '../components/BrandLogo';
import { InlineAlert } from '../components/PageAlert';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', senha: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const loggedUser = await login(form.login, form.senha);
      navigate(getDefaultRoute(loggedUser), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-header">
          <BrandLogo variant="white" />
          <p className="login-tagline">Acesse sua conta para continuar</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <InlineAlert showToast={false} onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-group">
            <label htmlFor="login">Login</label>
            <input
              id="login"
              name="login"
              value={form.login}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              name="senha"
              type="password"
              value={form.senha}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
