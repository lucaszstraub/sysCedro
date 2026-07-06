import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Produtos from './pages/Produtos';
import Estoque from './pages/Estoque';
import Movimentacoes from './pages/Movimentacoes';
import Localizacoes from './pages/Localizacoes';
import Orcamentos from './pages/Orcamentos';
import OrcamentoForm from './pages/OrcamentoForm';
import OrcamentosPlanejados from './pages/OrcamentosPlanejados';
import OrcamentoPlanejadoForm from './pages/OrcamentoPlanejadoForm';
import Vendas from './pages/Vendas';
import VendaForm from './pages/VendaForm';
import EditarVenda from './pages/EditarVenda';
import VendasPlanejados from './pages/VendasPlanejados';
import VendaPlanejadoForm from './pages/VendaPlanejadoForm';
import AcompanhamentoPedidosPlanejados from './pages/AcompanhamentoPedidosPlanejados';
import PendenciasEncomenda from './pages/PendenciasEncomenda';
import EncomendasFornecedor from './pages/EncomendasFornecedor';
import EncomendaFornecedorForm from './pages/EncomendaFornecedorForm';
import Arquivo from './pages/Arquivo';
import Recebimentos from './pages/Recebimentos';
import Etiquetas from './pages/Etiquetas';
import Entregas from './pages/Entregas';
import Fornecedores from './pages/Fornecedores';
import Clientes from './pages/Clientes';
import FormasPagamento from './pages/FormasPagamento';
import ProdutosPlanejados from './pages/ProdutosPlanejados';
import VisaoVendas from './pages/VisaoVendas';
import Parceiros from './pages/Parceiros';
import IncentivosParceiros from './pages/IncentivosParceiros';
import ControleComissoes from './pages/ControleComissoes';
import RegrasComissao from './pages/RegrasComissao';
import RegrasComissaoPlanejados from './pages/RegrasComissaoPlanejados';
import Usuarios from './pages/Usuarios';
import QuadroColaboradores from './pages/QuadroColaboradores';
import CustosFixos from './pages/CustosFixos';
import Pagamentos from './pages/Pagamentos';
import CentrosCusto from './pages/CentrosCusto';
import Inicio from './pages/Inicio';
import Login from './pages/Login';
import BrandLogo from './components/BrandLogo';
import SidebarNav from './components/SidebarNav';
import ProtectedRoute from './components/ProtectedRoute';
import { useRouteFeedback } from './hooks/useRouteFeedback';
import { useAuth } from './context/AuthContext';
import {
  ATRIBUICAO_LABEL,
  ESTOQUE_BASE,
  PERMISSIONS,
  VENDAS_BASE,
  filterMenuSections,
  getDefaultRoute,
} from './constants/auth';

function RedirectOrcamentoId() {
  const { id } = useParams();
  return <Navigate to={`${VENDAS_BASE}/orcamentos/${id}`} replace />;
}

function RedirectVendaEdicao() {
  const { id } = useParams();
  return <Navigate to={`${VENDAS_BASE}/vendas/${id}/editar`} replace />;
}

function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const menuSections = filterMenuSections(user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useRouteFeedback();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={`app-layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandLogo variant="white" />
        </div>
        <nav className="sidebar-nav-wrap">
          <SidebarNav sections={menuSections} onNavigate={() => setSidebarOpen(false)} />
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <strong>{user.nome}</strong>
            <span>
              {ATRIBUICAO_LABEL[user.atribuicao] || user.atribuicao}
              {user.is_master ? ' · master' : ''}
            </span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm sidebar-logout" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main-content">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label="Abrir menu"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          <span aria-hidden>☰</span>
          <span className="mobile-menu-btn-label">Menu</span>
        </button>
        <Routes>
          <Route path="/" element={<Navigate to={getDefaultRoute(user)} replace />} />
          <Route path="/inicio" element={<Inicio />} />

          <Route path={`${ESTOQUE_BASE}/painel`} element={<ProtectedRoute permission={PERMISSIONS.WMS}><Dashboard /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/produtos`} element={<ProtectedRoute permissions={[PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS]}><Produtos /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/fornecedores`} element={<ProtectedRoute permission={PERMISSIONS.CADASTROS}><Fornecedores /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/clientes`} element={<ProtectedRoute permission={PERMISSIONS.CADASTROS}><Clientes /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/formas-pagamento`} element={<ProtectedRoute permission={PERMISSIONS.CADASTROS}><FormasPagamento /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/centros-custo`} element={<ProtectedRoute administrador><CentrosCusto /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/produtos-planejados`} element={<ProtectedRoute permissions={[PERMISSIONS.CADASTROS, PERMISSIONS.PLANEJADOS]}><ProdutosPlanejados /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/estoque`} element={<ProtectedRoute permission={PERMISSIONS.WMS}><Estoque /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/movimentacoes`} element={<ProtectedRoute permission={PERMISSIONS.WMS}><Movimentacoes /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/localizacoes`} element={<ProtectedRoute permission={PERMISSIONS.CADASTROS}><Localizacoes /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/encomendas`} element={<ProtectedRoute permission={PERMISSIONS.GERENCIAL}><EncomendasFornecedor /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/encomendas/pendencias`} element={<ProtectedRoute permission={PERMISSIONS.GERENCIAL}><PendenciasEncomenda /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/encomendas/nova`} element={<ProtectedRoute permission={PERMISSIONS.GERENCIAL}><EncomendaFornecedorForm /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/encomendas/:id`} element={<ProtectedRoute permission={PERMISSIONS.GERENCIAL}><EncomendaFornecedorForm /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/arquivo`} element={<ProtectedRoute administrador><Arquivo /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/recebimentos`} element={<ProtectedRoute permission={PERMISSIONS.WMS}><Recebimentos /></ProtectedRoute>} />
          <Route path={`${ESTOQUE_BASE}/etiquetas`} element={<ProtectedRoute permissions={[PERMISSIONS.WMS, PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS]}><Etiquetas /></ProtectedRoute>} />

          <Route path={`${VENDAS_BASE}/orcamentos`} element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><Orcamentos /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/orcamentos/novo`} element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><OrcamentoForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/orcamentos/:id`} element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><OrcamentoForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/orcamentos-planejados`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><OrcamentosPlanejados /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/orcamentos-planejados/novo`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><OrcamentoPlanejadoForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/orcamentos-planejados/:id`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><OrcamentoPlanejadoForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendas-planejados`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><VendasPlanejados /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendas-planejados/novo`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><VendaPlanejadoForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendas-planejados/:id`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><VendaPlanejadoForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/acompanhamento-pedidos`} element={<ProtectedRoute permission={PERMISSIONS.PLANEJADOS}><AcompanhamentoPedidosPlanejados /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendas`} element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><Vendas /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendas/novo`} element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><VendaForm /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendas/:id/editar`} element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><EditarVenda /></ProtectedRoute>} />
          <Route
            path={`${VENDAS_BASE}/vendas/:id`}
            element={<ProtectedRoute permission={PERMISSIONS.VENDAS}><RedirectVendaEdicao /></ProtectedRoute>}
          />
          <Route path={`${VENDAS_BASE}/visao-vendas`} element={<ProtectedRoute permission={PERMISSIONS.GERENCIAL}><VisaoVendas /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/controle-comissoes`} element={<ProtectedRoute administrador><ControleComissoes /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/regras-comissao`} element={<ProtectedRoute administrador><RegrasComissao /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/regras-comissao-planejados`} element={<ProtectedRoute administrador><RegrasComissaoPlanejados /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/parceiros`} element={<ProtectedRoute permission={PERMISSIONS.PARCEIROS}><Parceiros /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/incentivos-parceiros`} element={<ProtectedRoute permission={PERMISSIONS.PARCEIROS}><IncentivosParceiros /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/entregas`} element={<ProtectedRoute permission={PERMISSIONS.WMS}><Entregas /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/vendedores`} element={<Navigate to={`${VENDAS_BASE}/quadro-colaboradores`} replace />} />
          <Route path={`${VENDAS_BASE}/usuarios`} element={<ProtectedRoute administrador><Usuarios /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/quadro-colaboradores`} element={<ProtectedRoute administrador><QuadroColaboradores /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/custos-fixos`} element={<ProtectedRoute administrador><CustosFixos /></ProtectedRoute>} />
          <Route path={`${VENDAS_BASE}/pagamentos`} element={<ProtectedRoute administrador><Pagamentos /></ProtectedRoute>} />

          <Route path={`${ESTOQUE_BASE}/orcamentos/novo`} element={<Navigate to={`${VENDAS_BASE}/orcamentos/novo`} replace />} />
          <Route path={`${ESTOQUE_BASE}/orcamentos/:id`} element={<RedirectOrcamentoId />} />
          <Route path={`${ESTOQUE_BASE}/orcamentos`} element={<Navigate to={`${VENDAS_BASE}/orcamentos`} replace />} />
          <Route path="*" element={<Navigate to={getDefaultRoute(user)} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-brand">
          <BrandLogo variant="gold" />
        </div>
        <p className="app-loading-text">Carregando...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={getDefaultRoute(user)} replace /> : <Login />}
      />
      <Route
        path="/*"
        element={user ? <AppLayout /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
