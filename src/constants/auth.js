export const PERMISSIONS = {
  WMS: 'wms',
  VENDAS: 'vendas',
  GERENCIAL: 'gerencial',
  PLANEJADOS: 'planejados',
  CADASTROS: 'cadastros',
  USUARIOS: 'usuarios',
  PARCEIROS: 'parceiros',
};

export const ATRIBUICOES = {
  LOGISTICA: 'logistica',
  VENDEDOR: 'vendedor',
  VENDEDOR_PROJETISTA: 'vendedor_projetista',
  GERENTE: 'gerente',
  ADMINISTRACAO: 'administracao',
};

export const ATRIBUICAO_OPTIONS = [
  { value: ATRIBUICOES.LOGISTICA, label: 'Logística' },
  { value: ATRIBUICOES.VENDEDOR, label: 'Vendedor' },
  { value: ATRIBUICOES.VENDEDOR_PROJETISTA, label: 'Vendedor Projetista' },
  { value: ATRIBUICOES.GERENTE, label: 'Gerente' },
  { value: ATRIBUICOES.ADMINISTRACAO, label: 'Administração' },
];

export const ATRIBUICAO_LABEL = Object.fromEntries(
  ATRIBUICAO_OPTIONS.map((o) => [o.value, o.label])
);

export const FUNCAO_COLABORADOR_OPTIONS = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'vendedor_projetista', label: 'Vendedor projetista' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'montador', label: 'Montador' },
  { value: 'administracao', label: 'Administrador' },
];

export const FUNCAO_COLABORADOR_LABEL = Object.fromEntries(
  FUNCAO_COLABORADOR_OPTIONS.map((o) => [o.value, o.label])
);

export const BENEFICIO_TIPO_OPTIONS = [
  { value: 'VT', label: 'VT — Vale transporte' },
  { value: 'VA', label: 'VA — Vale alimentação' },
  { value: 'VR', label: 'VR — Vale refeição' },
  { value: 'Outro', label: 'Outro' },
];

export const ROLE_PERMISSIONS = {
  [ATRIBUICOES.LOGISTICA]: [PERMISSIONS.WMS],
  [ATRIBUICOES.VENDEDOR]: [PERMISSIONS.VENDAS],
  [ATRIBUICOES.VENDEDOR_PROJETISTA]: [PERMISSIONS.PLANEJADOS],
  [ATRIBUICOES.GERENTE]: [
    PERMISSIONS.WMS,
    PERMISSIONS.VENDAS,
    PERMISSIONS.GERENCIAL,
    PERMISSIONS.PLANEJADOS,
    PERMISSIONS.CADASTROS,
    PERMISSIONS.PARCEIROS,
  ],
  [ATRIBUICOES.ADMINISTRACAO]: [
    PERMISSIONS.WMS,
    PERMISSIONS.VENDAS,
    PERMISSIONS.GERENCIAL,
    PERMISSIONS.PLANEJADOS,
    PERMISSIONS.CADASTROS,
    PERMISSIONS.USUARIOS,
    PERMISSIONS.PARCEIROS,
  ],
};

export const SESSION_STORAGE_KEY = 'sysCedro_user';

export const INICIO_PATH = '/inicio';
export const ESTOQUE_BASE = '/gestao-estoque';
export const VENDAS_BASE = '/ferramentas-venda';

/** Agrupamento visual no hub e separadores na sidebar */
export const MENU_MACRO_GROUPS = [
  {
    id: 'operacao',
    title: 'Operação',
    description: 'Estoque, recebimentos e entregas',
    accent: '#5c7a52',
    sectionIds: ['logistica'],
  },
  {
    id: 'vendas',
    title: 'Vendas',
    description: 'Comercial, pedidos e análise',
    accent: '#9a6b3c',
    sectionIds: ['vendas-soltos', 'planejados', 'vendas-gestao'],
  },
  {
    id: 'gestao',
    title: 'Gestão',
    description: 'Compras, financeiro e cadastros',
    accent: '#553c9a',
    sectionIds: ['compras', 'financeiro', 'administracao', 'cadastros'],
  },
];

export const SECTION_ACCENTS = {
  inicio: '#c9a86c',
  logistica: '#5c7a52',
  'vendas-soltos': '#9a6b3c',
  planejados: '#7d5a3c',
  'vendas-gestao': '#2b6cb0',
  compras: '#8b6914',
  financeiro: '#2f855a',
  administracao: '#553c9a',
  cadastros: '#4a5568',
};

export function userHasPermission(user, permission) {
  if (!user) return false;
  if (user.is_master) return true;
  const perms = ROLE_PERMISSIONS[user.atribuicao] || [];
  return perms.includes(permission);
}

export function userHasAnyPermission(user, permissions = []) {
  return permissions.some((permission) => userHasPermission(user, permission));
}

export function userIsAdministrador(user) {
  if (!user) return false;
  return user.is_master || user.atribuicao === ATRIBUICOES.ADMINISTRACAO;
}

export function userIsGerenteOuAdministrador(user) {
  if (!user) return false;
  if (user.is_master) return true;
  return user.atribuicao === ATRIBUICOES.GERENTE
    || user.atribuicao === ATRIBUICOES.ADMINISTRACAO;
}

export function countAccessibleMenuItems(user) {
  return filterMenuSections(user).reduce(
    (sum, section) => sum + section.groups.reduce((groupSum, group) => groupSum + group.items.length, 0),
    0,
  );
}

export function shouldUseHubHome(user) {
  if (!user) return false;
  if (user.is_master) return true;
  const areas = filterMenuSections(user).filter((section) => section.id !== 'inicio');
  return areas.length >= 3;
}

export function getDefaultRoute(user) {
  if (!user) return '/login';
  if (shouldUseHubHome(user)) return INICIO_PATH;
  if (userHasPermission(user, PERMISSIONS.WMS)) return `${ESTOQUE_BASE}/painel`;
  if (userHasPermission(user, PERMISSIONS.VENDAS)) return `${VENDAS_BASE}/orcamentos`;
  if (userHasPermission(user, PERMISSIONS.PLANEJADOS)) return `${VENDAS_BASE}/orcamentos-planejados`;
  if (userHasPermission(user, PERMISSIONS.GERENCIAL)) return `${ESTOQUE_BASE}/encomendas`;
  if (userHasPermission(user, PERMISSIONS.CADASTROS)) return `${ESTOQUE_BASE}/produtos`;
  if (userIsAdministrador(user)) return `${VENDAS_BASE}/controle-comissoes`;
  return INICIO_PATH;
}

export const MENU_SECTIONS = [
  {
    id: 'inicio',
    title: 'Início',
    hubDescription: 'Visão geral e atalhos do sistema',
    groups: [
      {
        items: [
          {
            to: INICIO_PATH,
            label: 'Página inicial',
            icon: '🏠',
            end: true,
            keywords: 'home inicio menu',
          },
        ],
      },
    ],
  },
  {
    id: 'logistica',
    title: 'Estoque & logística',
    hubDescription: 'Armazém, recebimentos e entregas',
    macroGroup: 'operacao',
    permission: PERMISSIONS.WMS,
    groups: [
      {
        items: [
          {
            to: `${ESTOQUE_BASE}/painel`,
            label: 'Painel do estoque',
            icon: '📊',
            end: true,
            keywords: 'dashboard wms indicadores',
          },
          { to: `${ESTOQUE_BASE}/estoque`, label: 'Estoque', icon: '📦', keywords: 'saldo produtos' },
          {
            to: `${ESTOQUE_BASE}/movimentacoes`,
            label: 'Alocação',
            icon: '📥',
            keywords: 'movimentacao guardar endereco',
          },
          {
            to: `${ESTOQUE_BASE}/recebimentos`,
            label: 'Recebimentos',
            icon: '✅',
            keywords: 'nota fiscal fornecedor chegada',
          },
          { to: `${VENDAS_BASE}/entregas`, label: 'Entregas', icon: '🚚', keywords: 'cliente transporte' },
        ],
      },
    ],
  },
  {
    id: 'vendas-soltos',
    title: 'Vendas — soltos',
    hubDescription: 'Orçamentos e pedidos de móveis avulsos',
    macroGroup: 'vendas',
    permission: PERMISSIONS.VENDAS,
    groups: [
      {
        items: [
          { to: `${VENDAS_BASE}/orcamentos`, label: 'Orçamentos', icon: '📋', keywords: 'proposta kanban' },
          { to: `${VENDAS_BASE}/vendas`, label: 'Vendas', icon: '🛒', keywords: 'pedidos confirmados' },
          {
            to: `${ESTOQUE_BASE}/produtos`,
            label: 'Consulta de produtos',
            icon: '🛋️',
            permissions: [PERMISSIONS.VENDAS],
            hideIfPermission: PERMISSIONS.CADASTROS,
            keywords: 'catalogo',
          },
        ],
      },
    ],
  },
  {
    id: 'planejados',
    title: 'Vendas — planejados',
    hubDescription: 'Móveis planejados sob medida',
    macroGroup: 'vendas',
    permission: PERMISSIONS.PLANEJADOS,
    groups: [
      {
        items: [
          {
            to: `${VENDAS_BASE}/orcamentos-planejados`,
            label: 'Orçamentos',
            icon: '🪚',
            keywords: 'proposta planejado',
          },
          { to: `${VENDAS_BASE}/vendas-planejados`, label: 'Vendas', icon: '🛠️', keywords: 'pedidos planejado' },
          {
            to: `${VENDAS_BASE}/acompanhamento-pedidos`,
            label: 'Acompanhamento',
            icon: '📋',
            keywords: 'kanban montagem fabrica pedido',
          },
        ],
      },
    ],
  },
  {
    id: 'vendas-gestao',
    title: 'Vendas — gestão',
    hubDescription: 'Análise comercial, markup e parceiros',
    macroGroup: 'vendas',
    groups: [
      {
        items: [
          {
            to: `${VENDAS_BASE}/visao-vendas`,
            label: 'Análise de vendas',
            icon: '📈',
            permission: PERMISSIONS.GERENCIAL,
            keywords: 'gerencial markup painel dashboard',
          },
          {
            to: `${VENDAS_BASE}/incentivos-parceiros`,
            label: 'Incentivos a parceiros',
            icon: '💼',
            permission: PERMISSIONS.PARCEIROS,
          },
        ],
      },
    ],
  },
  {
    id: 'compras',
    title: 'Compras',
    hubDescription: 'Encomendas e pendências com fornecedores',
    macroGroup: 'gestao',
    permission: PERMISSIONS.GERENCIAL,
    defaultCollapsed: true,
    groups: [
      {
        items: [
          { to: `${ESTOQUE_BASE}/encomendas`, label: 'Encomendas', icon: '📦', keywords: 'fornecedor pedido' },
          { to: `${ESTOQUE_BASE}/encomendas/pendencias`, label: 'Pendências', icon: '⏳', keywords: 'falta comprar' },
        ],
      },
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    hubDescription: 'Comissões, custos fixos e pagamentos',
    macroGroup: 'gestao',
    administradorOnly: true,
    defaultCollapsed: true,
    groups: [
      {
        items: [
          {
            to: `${VENDAS_BASE}/controle-comissoes`,
            label: 'Comissões',
            icon: '💰',
            keywords: 'pagamento vendedor',
          },
          { to: `${VENDAS_BASE}/custos-fixos`, label: 'Custos fixos', icon: '🏢', keywords: 'despesa mensal' },
          {
            to: `${VENDAS_BASE}/pagamentos`,
            label: 'Pagamentos',
            icon: '💸',
            keywords: 'boleto nota fiscal dre',
          },
        ],
      },
    ],
  },
  {
    id: 'administracao',
    title: 'Administração',
    hubDescription: 'Usuários, regras e manutenção do sistema',
    macroGroup: 'gestao',
    administradorOnly: true,
    defaultCollapsed: true,
    groups: [
      {
        subtitle: 'Comissões',
        items: [
          {
            to: `${VENDAS_BASE}/regras-comissao`,
            label: 'Regras — soltos',
            icon: '⚙️',
            keywords: 'percentual comissao',
          },
          {
            to: `${VENDAS_BASE}/regras-comissao-planejados`,
            label: 'Regras — planejados',
            icon: '🪚',
            keywords: 'percentual comissao',
          },
        ],
      },
      {
        subtitle: 'Equipe',
        items: [
          { to: `${VENDAS_BASE}/usuarios`, label: 'Usuários', icon: '🔐', keywords: 'login acesso' },
          {
            to: `${VENDAS_BASE}/quadro-colaboradores`,
            label: 'Colaboradores',
            icon: '👥',
            keywords: 'vendedor beneficio',
          },
        ],
      },
      {
        subtitle: 'Sistema',
        items: [
          { to: `${ESTOQUE_BASE}/arquivo`, label: 'Arquivo / Lixeira', icon: '🗄️', keywords: 'restaurar excluido' },
        ],
      },
    ],
  },
  {
    id: 'cadastros',
    title: 'Cadastros',
    hubDescription: 'Produtos, fornecedores e dados de referência',
    macroGroup: 'gestao',
    permission: PERMISSIONS.CADASTROS,
    defaultCollapsed: true,
    groups: [
      {
        subtitle: 'Catálogo',
        items: [
          { to: `${ESTOQUE_BASE}/produtos`, label: 'Produtos', icon: '🛋️', keywords: 'sku movel' },
          {
            to: `${ESTOQUE_BASE}/produtos-planejados`,
            label: 'Produtos planejados',
            icon: '📐',
            permissions: [PERMISSIONS.CADASTROS, PERMISSIONS.PLANEJADOS],
          },
        ],
      },
      {
        subtitle: 'Referências',
        items: [
          { to: `${ESTOQUE_BASE}/fornecedores`, label: 'Fornecedores', icon: '🏭' },
          { to: `${ESTOQUE_BASE}/formas-pagamento`, label: 'Formas de pagamento', icon: '💳' },
          {
            to: `${ESTOQUE_BASE}/centros-custo`,
            label: 'Centros de custo',
            icon: '🏷️',
            administradorOnly: true,
            keywords: 'dre pagamento despesa classificacao',
          },
          { to: `${ESTOQUE_BASE}/localizacoes`, label: 'Localizações', icon: '📍', keywords: 'endereco estoque' },
          {
            to: `${VENDAS_BASE}/parceiros`,
            label: 'Parceiros',
            icon: '🤝',
            permission: PERMISSIONS.PARCEIROS,
          },
        ],
      },
    ],
  },
];

export function filterMenuSections(user) {
  return MENU_SECTIONS
    .filter((section) => {
      if (section.id === 'inicio') return true;
      if (section.administradorOnly && !userIsAdministrador(user)) return false;
      return true;
    })
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (item.administradorOnly && !userIsAdministrador(user)) {
              return false;
            }
            if (item.hideIfPermission && userHasPermission(user, item.hideIfPermission)) {
              return false;
            }
            const required = item.permissions
              || [item.permission || section.permission].filter(Boolean);
            if (required.length === 0) return true;
            return userHasAnyPermission(user, required);
          }),
        }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}

export const ROUTE_PERMISSIONS = [
  { prefix: `${ESTOQUE_BASE}/painel`, permission: PERMISSIONS.WMS },
  { prefix: `${ESTOQUE_BASE}/estoque`, permission: PERMISSIONS.WMS },
  { prefix: `${ESTOQUE_BASE}/movimentacoes`, permission: PERMISSIONS.WMS },
  { prefix: `${ESTOQUE_BASE}/recebimentos`, permission: PERMISSIONS.WMS },
  { prefix: `${VENDAS_BASE}/entregas`, permission: PERMISSIONS.WMS },
  { prefix: `${VENDAS_BASE}/orcamentos-planejados`, permission: PERMISSIONS.PLANEJADOS },
  { prefix: `${VENDAS_BASE}/vendas-planejados`, permission: PERMISSIONS.PLANEJADOS },
  { prefix: `${VENDAS_BASE}/acompanhamento-pedidos`, permission: PERMISSIONS.PLANEJADOS },
  { prefix: `${VENDAS_BASE}/orcamentos`, permission: PERMISSIONS.VENDAS },
  { prefix: `${VENDAS_BASE}/vendas`, permission: PERMISSIONS.VENDAS },
  { prefix: `${ESTOQUE_BASE}/encomendas`, permission: PERMISSIONS.GERENCIAL },
  { prefix: `${VENDAS_BASE}/visao-vendas`, permission: PERMISSIONS.GERENCIAL },
  { prefix: `${VENDAS_BASE}/controle-comissoes`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/regras-comissao`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/regras-comissao-planejados`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/parceiros`, permission: PERMISSIONS.PARCEIROS },
  { prefix: `${VENDAS_BASE}/incentivos-parceiros`, permission: PERMISSIONS.PARCEIROS },
  { prefix: `${ESTOQUE_BASE}/arquivo`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/usuarios`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/quadro-colaboradores`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/custos-fixos`, administradorOnly: true },
  { prefix: `${VENDAS_BASE}/pagamentos`, administradorOnly: true },
  { prefix: `${ESTOQUE_BASE}/produtos`, permissions: [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS] },
  { prefix: `${ESTOQUE_BASE}/fornecedores`, permission: PERMISSIONS.CADASTROS },
  { prefix: `${ESTOQUE_BASE}/formas-pagamento`, permission: PERMISSIONS.CADASTROS },
  { prefix: `${ESTOQUE_BASE}/centros-custo`, administradorOnly: true },
  { prefix: `${ESTOQUE_BASE}/produtos-planejados`, permissions: [PERMISSIONS.CADASTROS, PERMISSIONS.PLANEJADOS] },
  { prefix: `${ESTOQUE_BASE}/localizacoes`, permission: PERMISSIONS.CADASTROS },
];

export function getRoutePermission(pathname) {
  const match = ROUTE_PERMISSIONS.find((route) => pathname.startsWith(route.prefix));
  if (!match) return null;
  if (match.permissions) return match.permissions;
  return match.permission;
}

export function canAccessRoute(user, pathname) {
  const match = ROUTE_PERMISSIONS.find((route) => pathname.startsWith(route.prefix));
  if (!match) return true;
  if (match.administradorOnly) return userIsAdministrador(user);
  const required = match.permissions || match.permission;
  if (!required) return true;
  if (Array.isArray(required)) {
    return userHasAnyPermission(user, required);
  }
  return userHasPermission(user, required);
}
