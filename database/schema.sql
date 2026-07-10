-- SysCedro WMS - Schema para loja de móveis

CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  localizacao VARCHAR(200),
  representante_nome VARCHAR(200),
  representante_contato VARCHAR(150),
  cnpj VARCHAR(18),
  telefone VARCHAR(20),
  email VARCHAR(150),
  endereco TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS localizacoes (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nome VARCHAR(150) NOT NULL,
  corredor VARCHAR(50),
  prateleira VARCHAR(50),
  capacidade INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  nome VARCHAR(200) NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  fornecedor_id INTEGER REFERENCES fornecedores(id),
  descricao TEXT,
  material VARCHAR(100),
  cor VARCHAR(80),
  largura_cm NUMERIC(8,2),
  altura_cm NUMERIC(8,2),
  profundidade_cm NUMERIC(8,2),
  peso_kg NUMERIC(8,2),
  preco_custo NUMERIC(12,2) DEFAULT 0,
  preco_venda NUMERIC(12,2) DEFAULT 0,
  estoque_minimo INTEGER DEFAULT 0,
  foto_path VARCHAR(255),
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS volumes_por_unidade INTEGER NOT NULL DEFAULT 1 CHECK (volumes_por_unidade > 0);

CREATE TABLE IF NOT EXISTS estoque (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  localizacao_id INTEGER NOT NULL REFERENCES localizacoes(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(produto_id, localizacao_id)
);

CREATE TABLE IF NOT EXISTS movimentacoes (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  localizacao_origem_id INTEGER REFERENCES localizacoes(id),
  localizacao_destino_id INTEGER REFERENCES localizacoes(id),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'saida', 'transferencia', 'ajuste')),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  motivo TEXT,
  usuario VARCHAR(100) DEFAULT 'sistema',
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produto ON estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes(criado_em DESC);

-- Dados iniciais (somente se tabelas estiverem vazias)
INSERT INTO categorias (nome, descricao)
SELECT v.nome, v.descricao FROM (VALUES
  ('Sofás', 'Sofás e poltronas'),
  ('Mesas', 'Mesas de jantar, centro e escritório'),
  ('Cadeiras', 'Cadeiras e banquetas'),
  ('Camas', 'Camas e bases'),
  ('Armários', 'Guarda-roupas e armários'),
  ('Estantes', 'Estantes e racks'),
  ('Decoração', 'Itens decorativos')
) AS v(nome, descricao)
WHERE NOT EXISTS (SELECT 1 FROM categorias LIMIT 1);

INSERT INTO fornecedores (nome, cnpj, telefone, email)
SELECT v.nome, v.cnpj, v.telefone, v.email FROM (VALUES
  ('Móveis Cedro Ltda', '12.345.678/0001-90', '(11) 3456-7890', 'contato@moveiscedro.com.br'),
  ('Estofados Premium', '98.765.432/0001-10', '(11) 9876-5432', 'vendas@estofadospremium.com.br')
) AS v(nome, cnpj, telefone, email)
WHERE NOT EXISTS (SELECT 1 FROM fornecedores LIMIT 1);

INSERT INTO localizacoes (codigo, nome, corredor, prateleira, capacidade)
SELECT v.codigo, v.nome, v.corredor, v.prateleira, v.capacidade FROM (VALUES
  ('A-01-01', 'Corredor A - Prateleira 1', 'A', '01', 50),
  ('A-01-02', 'Corredor A - Prateleira 2', 'A', '02', 50),
  ('B-01-01', 'Corredor B - Prateleira 1', 'B', '01', 40),
  ('B-02-01', 'Corredor B - Prateleira 2', 'B', '02', 40),
  ('C-01-01', 'Área de Exposição', 'C', '01', 20),
  ('REC-01', 'Recebimento', 'REC', '01', 100),
  ('NAO-ALOC', 'Não alocados', 'NAO', '00', 99999)
) AS v(codigo, nome, corredor, prateleira, capacidade)
WHERE NOT EXISTS (SELECT 1 FROM localizacoes LIMIT 1);

INSERT INTO produtos (sku, nome, categoria_id, fornecedor_id, material, cor, largura_cm, altura_cm, profundidade_cm, peso_kg, preco_custo, preco_venda, estoque_minimo)
SELECT v.sku, v.nome, c.id, f.id, v.material, v.cor, v.largura, v.altura, v.profundidade, v.peso, v.custo, v.venda, v.minimo
FROM (VALUES
  ('SOF-001', 'Sofá Retrátil 3 Lugares Cinza', 'Sofás', 'Móveis Cedro Ltda', 'Tecido', 'Cinza', 220, 90, 95, 45, 1800, 3200, 2),
  ('MES-001', 'Mesa de Jantar 6 Lugares Carvalho', 'Mesas', 'Móveis Cedro Ltda', 'Madeira', 'Carvalho', 180, 75, 90, 55, 1200, 2400, 3),
  ('CAD-001', 'Cadeira Estofada Bege', 'Cadeiras', 'Estofados Premium', 'Tecido', 'Bege', 45, 95, 50, 8, 350, 690, 10),
  ('CAM-001', 'Cama Box Queen Premium', 'Camas', 'Móveis Cedro Ltda', 'Madeira', 'Branco', 158, 45, 198, 60, 1500, 2890, 2),
  ('ARM-001', 'Guarda-Roupa 6 Portas Espelhado', 'Armários', 'Móveis Cedro Ltda', 'MDF', 'Branco', 240, 230, 55, 120, 2200, 4200, 1)
) AS v(sku, nome, cat, forn, material, cor, largura, altura, profundidade, peso, custo, venda, minimo)
JOIN categorias c ON c.nome = v.cat
JOIN fornecedores f ON f.nome = v.forn
WHERE NOT EXISTS (SELECT 1 FROM produtos LIMIT 1);

INSERT INTO estoque (produto_id, localizacao_id, quantidade)
SELECT p.id, l.id, v.qtd
FROM (VALUES
  ('SOF-001', 'A-01-01', 5),
  ('MES-001', 'A-01-02', 8),
  ('CAD-001', 'B-01-01', 24),
  ('CAM-001', 'B-02-01', 4),
  ('ARM-001', 'C-01-01', 2)
) AS v(sku, loc, qtd)
JOIN produtos p ON p.sku = v.sku
JOIN localizacoes l ON l.codigo = v.loc
WHERE NOT EXISTS (SELECT 1 FROM estoque LIMIT 1);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  cpf_cnpj VARCHAR(18),
  telefone VARCHAR(20),
  email VARCHAR(150),
  endereco TEXT,
  cidade VARCHAR(100),
  estado VARCHAR(2),
  cep VARCHAR(10),
  observacoes TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(20) NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado')),
  validade DATE,
  validade_dias INTEGER DEFAULT 30,
  observacoes TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  desconto NUMERIC(12,2) DEFAULT 0,
  formas_pagamento JSONB,
  total NUMERIC(12,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orcamento_ambientes (
  id SERIAL PRIMARY KEY,
  orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orcamento_itens (
  id SERIAL PRIMARY KEY,
  orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  ambiente_id INTEGER REFERENCES orcamento_ambientes(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id),
  descricao VARCHAR(300) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordem INTEGER DEFAULT 0
);

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS foto_path VARCHAR(255);
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS ambiente_id INTEGER REFERENCES orcamento_ambientes(id) ON DELETE CASCADE;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS validade_dias INTEGER DEFAULT 30;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS formas_pagamento JSONB;

UPDATE orcamentos SET validade_dias = 30 WHERE validade_dias IS NULL;

UPDATE orcamentos SET formas_pagamento = '[
  {"id":"avista","nome":"À vista","desconto_percentual":10},
  {"id":"cartao_1_6","nome":"Cartão 1+6x","desconto_percentual":5},
  {"id":"cartao_6_10","nome":"Cartão 6x a 10x","desconto_percentual":0}
]'::jsonb
WHERE formas_pagamento IS NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_ambientes_orcamento ON orcamento_ambientes(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_ambiente ON orcamento_itens(ambiente_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento ON orcamento_itens(orcamento_id);

INSERT INTO orcamento_ambientes (orcamento_id, nome, ordem)
SELECT DISTINCT oi.orcamento_id, 'Geral', 0
FROM orcamento_itens oi
WHERE oi.ambiente_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM orcamento_ambientes oa
    WHERE oa.orcamento_id = oi.orcamento_id AND oa.nome = 'Geral'
  );

UPDATE orcamento_itens oi
SET ambiente_id = oa.id
FROM orcamento_ambientes oa
WHERE oi.ambiente_id IS NULL
  AND oa.orcamento_id = oi.orcamento_id
  AND oa.nome = 'Geral';

INSERT INTO clientes (nome, cpf_cnpj, telefone, email, cidade, estado)
SELECT v.nome, v.cpf_cnpj, v.telefone, v.email, v.cidade, v.estado FROM (VALUES
  ('Maria Silva', '123.456.789-00', '(11) 98765-4321', 'maria@email.com', 'São Paulo', 'SP'),
  ('Comércio ABC Ltda', '12.345.678/0001-99', '(11) 3456-7890', 'compras@abc.com.br', 'Guarulhos', 'SP')
) AS v(nome, cpf_cnpj, telefone, email, cidade, estado)
WHERE NOT EXISTS (SELECT 1 FROM clientes LIMIT 1);

CREATE TABLE IF NOT EXISTS vendas (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(20) NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  orcamento_id INTEGER REFERENCES orcamentos(id),
  status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'confirmada', 'cancelada', 'entregue')),
  observacoes TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  desconto NUMERIC(12,2) DEFAULT 0,
  formas_pagamento JSONB,
  forma_pagamento_id VARCHAR(50),
  total NUMERIC(12,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venda_ambientes (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS venda_itens (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  ambiente_id INTEGER REFERENCES venda_ambientes(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id),
  descricao VARCHAR(300) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordem INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vendas_cliente ON vendas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vendas_orcamento ON vendas(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_venda_ambientes_venda ON venda_ambientes(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_ambiente ON venda_itens(ambiente_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_venda ON venda_itens(venda_id);

-- Encomendas a fornecedores e controle de atendimento por linha de venda

ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS quantidade_estoque INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS quantidade_encomenda INTEGER NOT NULL DEFAULT 0;

ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'efetivo'
  CHECK (status IN ('efetivo', 'consignado', 'cancelado'));
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS status_motivo TEXT;

ALTER TABLE vendas ADD COLUMN IF NOT EXISTS tem_alteracao_pos_venda BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS nota_alteracao TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS desativada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS desativada_em TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_vendas_desativada ON vendas(desativada) WHERE desativada = true;

CREATE TABLE IF NOT EXISTS venda_alteracoes (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  venda_item_id INTEGER REFERENCES venda_itens(id) ON DELETE SET NULL,
  tipo VARCHAR(40) NOT NULL,
  descricao TEXT NOT NULL,
  motivo TEXT NOT NULL,
  valor_anterior NUMERIC(12,2),
  valor_novo NUMERIC(12,2),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome VARCHAR(200),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_alteracoes_venda ON venda_alteracoes(venda_id);

UPDATE venda_itens
SET quantidade_estoque = quantidade, quantidade_encomenda = 0
WHERE quantidade_estoque = 0 AND quantidade_encomenda = 0;

CREATE TABLE IF NOT EXISTS estoque_reservas (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  venda_item_id INTEGER NOT NULL REFERENCES venda_itens(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'baixada', 'cancelada')),
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encomendas_fornecedor (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(20) NOT NULL UNIQUE,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
  status VARCHAR(20) NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviada', 'parcial', 'recebida', 'cancelada')),
  data_pedido DATE,
  previsao_entrega DATE,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encomenda_fornecedor_itens (
  id SERIAL PRIMARY KEY,
  encomenda_id INTEGER NOT NULL REFERENCES encomendas_fornecedor(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
  venda_item_id INTEGER REFERENCES venda_itens(id) ON DELETE SET NULL,
  quantidade_pedida INTEGER NOT NULL CHECK (quantidade_pedida > 0),
  quantidade_recebida INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0),
  custo_negociado NUMERIC(12,2) NOT NULL DEFAULT 0,
  destino_esperado VARCHAR(20) NOT NULL DEFAULT 'cliente'
    CHECK (destino_esperado IN ('cliente', 'estoque')),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'parcial', 'recebido', 'cancelado')),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recebimento_encomenda_itens (
  id SERIAL PRIMARY KEY,
  encomenda_item_id INTEGER NOT NULL REFERENCES encomenda_fornecedor_itens(id),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  custo_real NUMERIC(12,2) NOT NULL DEFAULT 0,
  destino VARCHAR(20) NOT NULL CHECK (destino IN ('estoque', 'cliente')),
  localizacao_id INTEGER REFERENCES localizacoes(id),
  venda_item_id INTEGER REFERENCES venda_itens(id) ON DELETE SET NULL,
  movimentacao_id INTEGER REFERENCES movimentacoes(id),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS referencia_tipo VARCHAR(30);
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS referencia_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_estoque_reservas_venda ON estoque_reservas(venda_id);
CREATE INDEX IF NOT EXISTS idx_estoque_reservas_produto ON estoque_reservas(produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_reservas_status ON estoque_reservas(status);
CREATE INDEX IF NOT EXISTS idx_encomendas_fornecedor_fornecedor ON encomendas_fornecedor(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_encomenda_fornecedor_itens_encomenda ON encomenda_fornecedor_itens(encomenda_id);
CREATE INDEX IF NOT EXISTS idx_encomenda_fornecedor_itens_venda ON encomenda_fornecedor_itens(venda_id);
CREATE INDEX IF NOT EXISTS idx_recebimento_encomenda_item ON recebimento_encomenda_itens(encomenda_item_id);

CREATE TABLE IF NOT EXISTS vendedores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  email VARCHAR(150),
  telefone VARCHAR(20),
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS classificacao VARCHAR(20) NOT NULL DEFAULT 'moveis_soltos'
  CHECK (classificacao IN ('moveis_soltos', 'planejados'));

UPDATE vendedores SET classificacao = 'moveis_soltos' WHERE classificacao IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendedores_classificacao ON vendedores(classificacao) WHERE ativo = true;

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES vendedores(id);
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES vendedores(id);
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS pagamentos JSONB;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS subtotal_bruto NUMERIC(12,2) DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS total_pago NUMERIC(12,2) DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS desconto_extra NUMERIC(12,2) DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS preco_unitario_lista NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_orcamentos_vendedor ON orcamentos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_vendas_vendedor ON vendas(vendedor_id);

ALTER TABLE vendas ADD COLUMN IF NOT EXISTS numero_pedido VARCHAR(5) UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_numero_pedido ON vendas(numero_pedido) WHERE numero_pedido IS NOT NULL;

ALTER TABLE recebimento_encomenda_itens ADD COLUMN IF NOT EXISTS estornado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE recebimento_encomenda_itens ADD COLUMN IF NOT EXISTS estornado_em TIMESTAMP;

ALTER TABLE encomenda_fornecedor_itens ADD COLUMN IF NOT EXISTS observacoes TEXT;

ALTER TABLE recebimento_encomenda_itens ADD COLUMN IF NOT EXISTS valor_nota_unitario NUMERIC(12,2);

ALTER TABLE recebimento_encomenda_itens ADD COLUMN IF NOT EXISTS frete_unitario NUMERIC(12,2);

ALTER TABLE recebimento_encomenda_itens ADD COLUMN IF NOT EXISTS ipi_unitario NUMERIC(12,2);

ALTER TABLE recebimento_encomenda_itens ADD COLUMN IF NOT EXISTS numero_nota_fiscal VARCHAR(20);

INSERT INTO localizacoes (codigo, nome, corredor, prateleira, capacidade)
SELECT 'NAO-ALOC', 'Não alocados', 'NAO', '00', 99999
WHERE NOT EXISTS (SELECT 1 FROM localizacoes WHERE codigo = 'NAO-ALOC');

CREATE INDEX IF NOT EXISTS idx_recebimento_encomenda_criado ON recebimento_encomenda_itens(criado_em DESC);

INSERT INTO vendedores (nome, email, telefone)
SELECT v.nome, v.email, v.telefone FROM (VALUES
  ('Ana Costa', 'ana@moveiscedro.com.br', '(11) 98765-1111'),
  ('Bruno Mendes', 'bruno@moveiscedro.com.br', '(11) 98765-2222')
) AS v(nome, email, telefone)
WHERE NOT EXISTS (SELECT 1 FROM vendedores LIMIT 1);

ALTER TABLE encomendas_fornecedor ADD COLUMN IF NOT EXISTS frete_percentual NUMERIC(5,2) DEFAULT 10;
ALTER TABLE encomendas_fornecedor ADD COLUMN IF NOT EXISTS ipi_percentual NUMERIC(5,2) DEFAULT 3.25;
ALTER TABLE encomendas_fornecedor ADD COLUMN IF NOT EXISTS previsao_entrega_dias INTEGER DEFAULT 30;

UPDATE encomendas_fornecedor SET frete_percentual = 10 WHERE frete_percentual IS NULL;
UPDATE encomendas_fornecedor SET ipi_percentual = 3.25 WHERE ipi_percentual IS NULL;
UPDATE encomendas_fornecedor SET previsao_entrega_dias = 30 WHERE previsao_entrega_dias IS NULL;

ALTER TABLE encomenda_fornecedor_itens ADD COLUMN IF NOT EXISTS previsao_entrega_dias INTEGER;
ALTER TABLE encomenda_fornecedor_itens ADD COLUMN IF NOT EXISTS previsao_entrega DATE;
ALTER TABLE encomenda_fornecedor_itens ADD COLUMN IF NOT EXISTS custo_com_impostos NUMERIC(12,2) DEFAULT 0;

UPDATE encomenda_fornecedor_itens ei
SET custo_com_impostos = ROUND(
  (ei.custo_negociado
    + ei.custo_negociado * COALESCE(ef.frete_percentual, 10) / 100
    + ei.custo_negociado * COALESCE(ef.ipi_percentual, 3.25) / 100
  )::numeric,
  2
)
FROM encomendas_fornecedor ef
WHERE ef.id = ei.encomenda_id
  AND COALESCE(ei.custo_com_impostos, 0) = 0
  AND COALESCE(ei.custo_negociado, 0) > 0;

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS motivo_encerramento VARCHAR(20)
  CHECK (motivo_encerramento IS NULL OR motivo_encerramento IN ('recusado', 'expirado'));

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orcamentos_motivo_encerramento
  ON orcamentos(motivo_encerramento) WHERE motivo_encerramento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos(status);

CREATE INDEX IF NOT EXISTS idx_orcamentos_validade ON orcamentos(validade)
  WHERE status IN ('rascunho', 'enviado');

UPDATE orcamentos
SET motivo_encerramento = status,
    encerrado_em = COALESCE(encerrado_em, atualizado_em, NOW())
WHERE status IN ('recusado', 'expirado')
  AND motivo_encerramento IS NULL;

ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS quantidade_entregue INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS entregas (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL DEFAULT 1,
  tipo_liberacao VARCHAR(20) NOT NULL DEFAULT 'parcial'
    CHECK (tipo_liberacao IN ('parcial', 'completa')),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'disponivel', 'parcial', 'agendada', 'entregue', 'cancelada')),
  quantidade_volumes INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  endereco_entrega TEXT,
  cidade_entrega VARCHAR(100),
  estado_entrega VARCHAR(2),
  cep_entrega VARCHAR(10),
  data_prevista DATE,
  data_realizada TIMESTAMP,
  tipo VARCHAR(20) NOT NULL DEFAULT 'entrega',
  flag_urgencia BOOLEAN NOT NULL DEFAULT FALSE,
  flag_assistencia_tecnica BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes_kanban TEXT,
  descricao_assistencia TEXT,
  indice_sequencia INTEGER,
  indice_total INTEGER,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE (venda_id, numero)
);

ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_status_check;
ALTER TABLE entregas ADD CONSTRAINT entregas_status_check
  CHECK (status IN ('pendente', 'disponivel', 'parcial', 'agendada', 'entregue', 'cancelada'));
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'entrega';
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS flag_urgencia BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS flag_assistencia_tecnica BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS observacoes_kanban TEXT;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS descricao_assistencia TEXT;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS indice_sequencia INTEGER;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS indice_total INTEGER;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS periodo_entrega VARCHAR(20) DEFAULT 'matutino';
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS confirmacao_cliente VARCHAR(20) NOT NULL DEFAULT 'confirmada';
ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_periodo_entrega_check;
ALTER TABLE entregas ADD CONSTRAINT entregas_periodo_entrega_check
  CHECK (periodo_entrega IS NULL OR periodo_entrega IN ('matutino', 'vespertino'));
ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_confirmacao_cliente_check;
ALTER TABLE entregas ADD CONSTRAINT entregas_confirmacao_cliente_check
  CHECK (confirmacao_cliente IN ('pendente', 'confirmada'));

CREATE TABLE IF NOT EXISTS entrega_itens (
  id SERIAL PRIMARY KEY,
  entrega_id INTEGER NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  venda_item_id INTEGER NOT NULL REFERENCES venda_itens(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  quantidade_entregue INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_entregue >= 0),
  UNIQUE (entrega_id, venda_item_id)
);

CREATE INDEX IF NOT EXISTS idx_entregas_venda ON entregas(venda_id);
CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas(status);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_entrega ON entrega_itens(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_venda_item ON entrega_itens(venda_item_id);

CREATE TABLE IF NOT EXISTS entrega_itens_consignados (
  id SERIAL PRIMARY KEY,
  entrega_id INTEGER NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
  descricao VARCHAR(300) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  volumes_por_unidade INTEGER NOT NULL DEFAULT 1 CHECK (volumes_por_unidade > 0),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entrega_itens_consignados_entrega
  ON entrega_itens_consignados(entrega_id);

ALTER TABLE entrega_itens_consignados
  ADD COLUMN IF NOT EXISTS venda_item_id INTEGER REFERENCES venda_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entrega_itens_consignados_venda_item
  ON entrega_itens_consignados(venda_item_id) WHERE venda_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS orcamentos_planejados (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(20) NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  vendedor_id INTEGER REFERENCES vendedores(id),
  status VARCHAR(20) DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado')),
  validade DATE,
  validade_dias INTEGER DEFAULT 30,
  prazo_entrega_dias INTEGER DEFAULT 60,
  prazo_entrega_outro VARCHAR(100),
  observacoes TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  desconto NUMERIC(12,2) DEFAULT 0,
  formas_pagamento JSONB,
  total NUMERIC(12,2) DEFAULT 0,
  motivo_encerramento VARCHAR(20)
    CHECK (motivo_encerramento IS NULL OR motivo_encerramento IN ('recusado', 'expirado')),
  encerrado_em TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orcamento_planejado_ambientes (
  id SERIAL PRIMARY KEY,
  orcamento_planejado_id INTEGER NOT NULL REFERENCES orcamentos_planejados(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orcamento_planejado_itens (
  id SERIAL PRIMARY KEY,
  orcamento_planejado_id INTEGER NOT NULL REFERENCES orcamentos_planejados(id) ON DELETE CASCADE,
  ambiente_id INTEGER REFERENCES orcamento_planejado_ambientes(id) ON DELETE CASCADE,
  descricao VARCHAR(300) NOT NULL,
  largura NUMERIC(10,2),
  profundidade NUMERIC(10,2),
  altura NUMERIC(10,2),
  espessura_mdf NUMERIC(6,2) DEFAULT 18,
  padrao_mdf VARCHAR(150),
  tipo_fundo VARCHAR(30) NOT NULL DEFAULT 'fino',
  tipo_porta VARCHAR(30) NOT NULL DEFAULT 'sem_porta',
  tipo_puxador VARCHAR(30) NOT NULL DEFAULT 'sem_puxador',
  tipo_puxador_outro VARCHAR(100),
  cor_puxador VARCHAR(100),
  tipo_corredicas VARCHAR(30) NOT NULL DEFAULT 'sem_corredicas',
  canaleta_led BOOLEAN NOT NULL DEFAULT FALSE,
  itens_extra TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordem INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_planejados_cliente ON orcamentos_planejados(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_planejados_vendedor ON orcamentos_planejados(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_planejados_status ON orcamentos_planejados(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_planejados_validade ON orcamentos_planejados(validade)
  WHERE status IN ('rascunho', 'enviado');
CREATE INDEX IF NOT EXISTS idx_orc_planejado_ambientes_orc ON orcamento_planejado_ambientes(orcamento_planejado_id);
CREATE INDEX IF NOT EXISTS idx_orc_planejado_itens_ambiente ON orcamento_planejado_itens(ambiente_id);
CREATE INDEX IF NOT EXISTS idx_orc_planejado_itens_orc ON orcamento_planejado_itens(orcamento_planejado_id);

ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS custo_estoque_unitario NUMERIC(12,2) DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS custo_encomenda_unitario NUMERIC(12,2) DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS custo_unitario_esperado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS markup_esperado NUMERIC(10,4);
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS custo_unitario_real NUMERIC(12,2);
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS markup_real NUMERIC(10,4);
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS custo_encomenda_real_acumulado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS quantidade_encomenda_recebida INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS custo_extra_acumulado NUMERIC(12,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS ajustes_comissao (
  id SERIAL PRIMARY KEY,
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  venda_item_id INTEGER NOT NULL REFERENCES venda_itens(id) ON DELETE CASCADE,
  recebimento_id INTEGER REFERENCES recebimento_encomenda_itens(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  custo_esperado_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo_real_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_ajuste NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'compensado')),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  compensado_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ajustes_comissao_vendedor ON ajustes_comissao(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ajustes_comissao_venda ON ajustes_comissao(venda_id);
CREATE INDEX IF NOT EXISTS idx_ajustes_comissao_status ON ajustes_comissao(status);

-- Backfill único: apenas itens sem custo/markup calculado (não re-sincroniza vendas antigas).
UPDATE venda_itens vi
SET
  custo_estoque_unitario = COALESCE(p.preco_custo, 0),
  custo_encomenda_unitario = CASE
    WHEN vi.quantidade_encomenda > 0 THEN COALESCE(p.preco_custo, 0)
    ELSE 0
  END,
  custo_unitario_esperado = CASE
    WHEN vi.quantidade > 0 THEN ROUND((
      (COALESCE(vi.quantidade_estoque, 0) * COALESCE(p.preco_custo, 0))
      + (COALESCE(vi.quantidade_encomenda, 0) * COALESCE(p.preco_custo, 0))
    ) / vi.quantidade, 2)
    ELSE 0
  END,
  markup_esperado = CASE
    WHEN COALESCE(p.preco_custo, 0) > 0 AND vi.preco_unitario > 0
      AND vi.quantidade > 0
      AND (
        (COALESCE(vi.quantidade_estoque, 0) + COALESCE(vi.quantidade_encomenda, 0)) * COALESCE(p.preco_custo, 0)
      ) > 0
    THEN ROUND((vi.preco_unitario / (
      ((COALESCE(vi.quantidade_estoque, 0) + COALESCE(vi.quantidade_encomenda, 0)) * COALESCE(p.preco_custo, 0))
      / vi.quantidade
    ))::numeric, 4)
    ELSE NULL
  END,
  custo_unitario_real = CASE
    WHEN vi.quantidade_encomenda = 0 THEN
      CASE WHEN vi.quantidade > 0 THEN ROUND((
        COALESCE(vi.quantidade_estoque, 0) * COALESCE(p.preco_custo, 0)
      ) / vi.quantidade, 2) ELSE 0 END
    ELSE custo_unitario_real
  END,
  markup_real = CASE
    WHEN vi.quantidade_encomenda = 0 AND COALESCE(p.preco_custo, 0) > 0 AND vi.preco_unitario > 0
    THEN ROUND((vi.preco_unitario / COALESCE(p.preco_custo, 0))::numeric, 4)
    ELSE markup_real
  END
FROM produtos p
WHERE p.id = vi.produto_id
  AND vi.markup_esperado IS NULL;

ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS localizacao VARCHAR(200);
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS representante_nome VARCHAR(200);
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS representante_contato VARCHAR(150);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  login VARCHAR(50) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(200) NOT NULL,
  atribuicao VARCHAR(30) NOT NULL,
  is_master BOOLEAN DEFAULT FALSE,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios(LOWER(login));

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES vendedores(id);
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendedores_usuario_id ON vendedores(usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_vendedor_id ON usuarios(vendedor_id);

CREATE TABLE IF NOT EXISTS formas_pagamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  taxa_percentual NUMERIC(5,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formas_pagamento_ativo ON formas_pagamento(ativo);

INSERT INTO formas_pagamento (nome, taxa_percentual)
SELECT v.nome, v.taxa FROM (VALUES
  ('À vista', 10),
  ('Cartão 1+6x', 5),
  ('Cartão 6x a 10x', 0),
  ('PIX', 0),
  ('Dinheiro', 0),
  ('Cartão crédito', 0),
  ('Cartão débito', 0),
  ('Boleto', 0),
  ('Transferência', 0),
  ('Cheque', 0)
) AS v(nome, taxa)
WHERE NOT EXISTS (SELECT 1 FROM formas_pagamento LIMIT 1);

INSERT INTO formas_pagamento (nome, taxa_percentual)
SELECT 'A receber', 0
WHERE NOT EXISTS (
  SELECT 1 FROM formas_pagamento WHERE lower(trim(nome)) = 'a receber'
);

CREATE TABLE IF NOT EXISTS vendas_planejados (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(20) NOT NULL UNIQUE,
  numero_pedido VARCHAR(10) NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  orcamento_planejado_id INTEGER REFERENCES orcamentos_planejados(id),
  vendedor_id INTEGER REFERENCES vendedores(id),
  status VARCHAR(20) DEFAULT 'confirmada'
    CHECK (status IN ('rascunho', 'confirmada', 'cancelada')),
  observacoes TEXT,
  prazo_entrega_dias INTEGER,
  prazo_entrega_outro VARCHAR(100),
  medidas_conferidas BOOLEAN NOT NULL DEFAULT FALSE,
  responsavel_medidas VARCHAR(200),
  subtotal NUMERIC(12,2) DEFAULT 0,
  desconto_extra NUMERIC(12,2) DEFAULT 0,
  pagamentos JSONB,
  total_pago NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venda_planejado_ambientes (
  id SERIAL PRIMARY KEY,
  venda_planejado_id INTEGER NOT NULL REFERENCES vendas_planejados(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS venda_planejado_itens (
  id SERIAL PRIMARY KEY,
  venda_planejado_id INTEGER NOT NULL REFERENCES vendas_planejados(id) ON DELETE CASCADE,
  ambiente_id INTEGER REFERENCES venda_planejado_ambientes(id) ON DELETE CASCADE,
  descricao VARCHAR(300) NOT NULL,
  largura NUMERIC(10,2),
  profundidade NUMERIC(10,2),
  altura NUMERIC(10,2),
  espessura_mdf NUMERIC(6,2) DEFAULT 18,
  padrao_mdf VARCHAR(150),
  tipo_fundo VARCHAR(30) NOT NULL DEFAULT 'fino',
  tipo_porta VARCHAR(30) NOT NULL DEFAULT 'sem_porta',
  tipo_puxador VARCHAR(30) NOT NULL DEFAULT 'sem_puxador',
  tipo_puxador_outro VARCHAR(100),
  cor_puxador VARCHAR(100),
  tipo_corredicas VARCHAR(30) NOT NULL DEFAULT 'sem_corredicas',
  canaleta_led BOOLEAN NOT NULL DEFAULT FALSE,
  itens_extra TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS venda_planejado_anexos (
  id SERIAL PRIMARY KEY,
  venda_planejado_id INTEGER NOT NULL REFERENCES vendas_planejados(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  caminho VARCHAR(500) NOT NULL,
  tamanho_bytes BIGINT,
  mime_type VARCHAR(100),
  ordem INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_planejados_cliente ON vendas_planejados(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vendas_planejados_vendedor ON vendas_planejados(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_vendas_planejados_orc ON vendas_planejados(orcamento_planejado_id);
CREATE INDEX IF NOT EXISTS idx_venda_planejado_ambientes_venda ON venda_planejado_ambientes(venda_planejado_id);
CREATE INDEX IF NOT EXISTS idx_venda_planejado_itens_ambiente ON venda_planejado_itens(ambiente_id);
CREATE INDEX IF NOT EXISTS idx_venda_planejado_itens_venda ON venda_planejado_itens(venda_planejado_id);
CREATE INDEX IF NOT EXISTS idx_venda_planejado_anexos_venda ON venda_planejado_anexos(venda_planejado_id);

CREATE TABLE IF NOT EXISTS produtos_planejados (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  largura NUMERIC(10,2),
  profundidade NUMERIC(10,2),
  altura NUMERIC(10,2),
  espessura_mdf NUMERIC(6,2) DEFAULT 18,
  padrao_mdf VARCHAR(150),
  tipo_fundo VARCHAR(30) NOT NULL DEFAULT 'fino',
  tipo_porta VARCHAR(30) NOT NULL DEFAULT 'sem_porta',
  tipo_puxador VARCHAR(30) NOT NULL DEFAULT 'sem_puxador',
  tipo_puxador_outro VARCHAR(100),
  cor_puxador VARCHAR(100),
  tipo_corredicas VARCHAR(30) NOT NULL DEFAULT 'sem_corredicas',
  canaleta_led BOOLEAN NOT NULL DEFAULT FALSE,
  itens_extra TEXT,
  preco_unitario_sugerido NUMERIC(12,2) DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_planejados_ativo ON produtos_planejados(ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_planejados_nome ON produtos_planejados(nome);

ALTER TABLE produtos_planejados ADD COLUMN IF NOT EXISTS tipo_fundo_outro VARCHAR(100);
ALTER TABLE produtos_planejados ADD COLUMN IF NOT EXISTS tipo_porta_outro VARCHAR(100);
ALTER TABLE produtos_planejados ADD COLUMN IF NOT EXISTS tipo_corredicas_outro VARCHAR(100);

ALTER TABLE orcamento_planejado_itens ADD COLUMN IF NOT EXISTS tipo_fundo_outro VARCHAR(100);
ALTER TABLE orcamento_planejado_itens ADD COLUMN IF NOT EXISTS tipo_porta_outro VARCHAR(100);
ALTER TABLE orcamento_planejado_itens ADD COLUMN IF NOT EXISTS tipo_corredicas_outro VARCHAR(100);

ALTER TABLE venda_planejado_itens ADD COLUMN IF NOT EXISTS tipo_fundo_outro VARCHAR(100);
ALTER TABLE venda_planejado_itens ADD COLUMN IF NOT EXISTS tipo_porta_outro VARCHAR(100);
ALTER TABLE venda_planejado_itens ADD COLUMN IF NOT EXISTS tipo_corredicas_outro VARCHAR(100);

ALTER TABLE orcamento_planejado_itens ADD COLUMN IF NOT EXISTS produto_planejado_id INTEGER REFERENCES produtos_planejados(id);
ALTER TABLE venda_planejado_itens ADD COLUMN IF NOT EXISTS produto_planejado_id INTEGER REFERENCES produtos_planejados(id);
ALTER TABLE orcamento_planejado_itens ALTER COLUMN tipo_fundo SET DEFAULT 'fino';
ALTER TABLE venda_planejado_itens ALTER COLUMN tipo_fundo SET DEFAULT 'fino';

CREATE INDEX IF NOT EXISTS idx_orc_planejado_itens_produto ON orcamento_planejado_itens(produto_planejado_id);
CREATE INDEX IF NOT EXISTS idx_venda_planejado_itens_produto ON venda_planejado_itens(produto_planejado_id);

-- Acompanhamento de pedidos planejados (kanban pós-venda)
CREATE TABLE IF NOT EXISTS acompanhamento_pedidos_planejados (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(30) NOT NULL UNIQUE,
  tipo VARCHAR(20) NOT NULL DEFAULT 'venda' CHECK (tipo IN ('venda', 'assistencia')),
  venda_planejado_id INTEGER NOT NULL REFERENCES vendas_planejados(id) ON DELETE CASCADE,
  etapa VARCHAR(30) NOT NULL DEFAULT 'concretizado'
    CHECK (etapa IN ('concretizado', 'fabrica', 'deposito', 'montagem', 'finalizado')),
  data_passagem_fabrica TIMESTAMP,
  descricao_assistencia TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acomp_pedido_venda_unica
  ON acompanhamento_pedidos_planejados(venda_planejado_id)
  WHERE tipo = 'venda';

CREATE INDEX IF NOT EXISTS idx_acomp_pedido_etapa ON acompanhamento_pedidos_planejados(etapa);
CREATE INDEX IF NOT EXISTS idx_acomp_pedido_venda ON acompanhamento_pedidos_planejados(venda_planejado_id);

CREATE TABLE IF NOT EXISTS acompanhamento_pedido_anotacoes (
  id SERIAL PRIMARY KEY,
  acompanhamento_id INTEGER NOT NULL REFERENCES acompanhamento_pedidos_planejados(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  autor_nome VARCHAR(200),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acomp_anotacoes_pedido ON acompanhamento_pedido_anotacoes(acompanhamento_id);

ALTER TABLE acompanhamento_pedido_anotacoes ADD COLUMN IF NOT EXISTS autor_usuario_id INTEGER REFERENCES usuarios(id);
ALTER TABLE acompanhamento_pedido_anotacoes ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP;

CREATE TABLE IF NOT EXISTS arquivo_registros (
  id SERIAL PRIMARY KEY,
  tipo_entidade VARCHAR(40) NOT NULL CHECK (tipo_entidade IN ('venda', 'encomenda_fornecedor')),
  entidade_id INTEGER,
  numero_referencia VARCHAR(40),
  titulo VARCHAR(300),
  motivo VARCHAR(20) NOT NULL CHECK (motivo IN ('exclusao', 'alteracao')),
  dados JSONB NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nome VARCHAR(200),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arquivo_tipo ON arquivo_registros(tipo_entidade);
CREATE INDEX IF NOT EXISTS idx_arquivo_entidade ON arquivo_registros(entidade_id);
CREATE INDEX IF NOT EXISTS idx_arquivo_motivo ON arquivo_registros(motivo);
CREATE INDEX IF NOT EXISTS idx_arquivo_criado ON arquivo_registros(criado_em DESC);

ALTER TABLE arquivo_registros ADD COLUMN IF NOT EXISTS resumo TEXT;
ALTER TABLE arquivo_registros ADD COLUMN IF NOT EXISTS alteracoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE arquivo_registros ADD COLUMN IF NOT EXISTS preview JSONB;

CREATE TABLE IF NOT EXISTS parceiros (
  id SERIAL PRIMARY KEY,
  nome_completo VARCHAR(200) NOT NULL,
  telefone VARCHAR(40),
  nome_escritorio VARCHAR(200),
  instagram VARCHAR(120),
  chave_pix VARCHAR(200),
  observacoes TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parceiros_nome ON parceiros(nome_completo);
CREATE INDEX IF NOT EXISTS idx_parceiros_escritorio ON parceiros(nome_escritorio);

CREATE TABLE IF NOT EXISTS venda_incentivos_parceiro (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL UNIQUE REFERENCES vendas(id) ON DELETE CASCADE,
  parceiro_id INTEGER NOT NULL REFERENCES parceiros(id),
  tipo_calculo VARCHAR(20) NOT NULL CHECK (tipo_calculo IN ('valor', 'percentual')),
  valor_informado NUMERIC(12,4) NOT NULL,
  valor_comissao NUMERIC(12,2) NOT NULL,
  base_calculo NUMERIC(12,2) NOT NULL,
  observacoes TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nome VARCHAR(200),
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE venda_incentivos_parceiro ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) DEFAULT 'a_pagar';
ALTER TABLE venda_incentivos_parceiro ADD COLUMN IF NOT EXISTS data_pagamento DATE;
UPDATE venda_incentivos_parceiro SET status_pagamento = 'a_pagar' WHERE status_pagamento IS NULL;

CREATE TABLE IF NOT EXISTS venda_incentivo_parceiro_itens (
  id SERIAL PRIMARY KEY,
  incentivo_id INTEGER NOT NULL REFERENCES venda_incentivos_parceiro(id) ON DELETE CASCADE,
  venda_item_id INTEGER NOT NULL REFERENCES venda_itens(id) ON DELETE CASCADE,
  valor_bruto NUMERIC(12,2) NOT NULL,
  valor_deducao NUMERIC(12,2) NOT NULL,
  valor_liquido NUMERIC(12,2) NOT NULL,
  UNIQUE(incentivo_id, venda_item_id)
);

CREATE INDEX IF NOT EXISTS idx_venda_incentivos_venda ON venda_incentivos_parceiro(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_incentivos_parceiro ON venda_incentivos_parceiro(parceiro_id);

CREATE TABLE IF NOT EXISTS comissao_regras (
  id SERIAL PRIMARY KEY,
  perfil VARCHAR(20) NOT NULL UNIQUE CHECK (perfil IN ('vendedor', 'gerente')),
  markup_minimo NUMERIC(8,4) NOT NULL DEFAULT 1.75,
  comissao_abaixo_tipo VARCHAR(30) NOT NULL CHECK (comissao_abaixo_tipo IN ('percentual_fixo', 'markup_como_percentual')),
  comissao_abaixo_valor NUMERIC(8,4),
  comissao_acima_tipo VARCHAR(30) NOT NULL CHECK (comissao_acima_tipo IN ('percentual_fixo', 'markup_como_percentual')),
  comissao_acima_valor NUMERIC(8,4),
  beneficiario_vendedor_id INTEGER REFERENCES vendedores(id),
  observacoes TEXT,
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venda_comissoes (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  venda_item_id INTEGER NOT NULL REFERENCES venda_itens(id) ON DELETE CASCADE,
  perfil_comissao VARCHAR(20) NOT NULL CHECK (perfil_comissao IN ('vendedor', 'gerente')),
  beneficiario_vendedor_id INTEGER REFERENCES vendedores(id),
  markup_real NUMERIC(8,4),
  percentual_comissao NUMERIC(8,4) NOT NULL,
  base_calculo NUMERIC(12,2) NOT NULL,
  valor_comissao NUMERIC(12,2) NOT NULL,
  status_pagamento VARCHAR(20) NOT NULL DEFAULT 'a_pagar' CHECK (status_pagamento IN ('a_pagar', 'pago')),
  data_pagamento DATE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE (venda_item_id, perfil_comissao)
);

CREATE INDEX IF NOT EXISTS idx_venda_comissoes_venda ON venda_comissoes(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_comissoes_beneficiario ON venda_comissoes(beneficiario_vendedor_id);
CREATE INDEX IF NOT EXISTS idx_venda_comissoes_status ON venda_comissoes(status_pagamento);

INSERT INTO comissao_regras (
  perfil, markup_minimo,
  comissao_abaixo_tipo, comissao_abaixo_valor,
  comissao_acima_tipo, comissao_acima_valor,
  observacoes
)
SELECT 'vendedor', 1.75, 'percentual_fixo', 1, 'markup_como_percentual', NULL,
  'Padrão: abaixo de 1,75 → 1%; acima ou igual → markup como % (ex.: 2 → 2%)'
WHERE NOT EXISTS (SELECT 1 FROM comissao_regras WHERE perfil = 'vendedor');

INSERT INTO comissao_regras (
  perfil, markup_minimo,
  comissao_abaixo_tipo, comissao_abaixo_valor,
  comissao_acima_tipo, comissao_acima_valor,
  observacoes
)
SELECT 'gerente', 1.75, 'percentual_fixo', 0.5, 'percentual_fixo', 0.8,
  'Padrão: abaixo de 1,75 → 0,5%; acima ou igual → 0,8%'
WHERE NOT EXISTS (SELECT 1 FROM comissao_regras WHERE perfil = 'gerente');

CREATE TABLE IF NOT EXISTS comissao_pagamentos (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  perfil_comissao VARCHAR(20) NOT NULL CHECK (perfil_comissao IN ('vendedor', 'gerente')),
  valor_pago NUMERIC(12,2) NOT NULL CHECK (valor_pago >= 0),
  valor_devido_na_ocasiao NUMERIC(12,2),
  data_pagamento DATE NOT NULL,
  forma_pagamento VARCHAR(150),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comissao_pagamentos_periodo
  ON comissao_pagamentos(ano, mes, perfil_comissao);

CREATE TABLE IF NOT EXISTS comissao_ajustes (
  id SERIAL PRIMARY KEY,
  mes_referencia DATE NOT NULL,
  perfil_comissao VARCHAR(20) NOT NULL CHECK (perfil_comissao IN ('vendedor', 'gerente')),
  beneficiario_vendedor_id INTEGER REFERENCES vendedores(id),
  venda_comissao_id INTEGER REFERENCES venda_comissoes(id) ON DELETE SET NULL,
  venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
  venda_item_id INTEGER REFERENCES venda_itens(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('inclusao', 'alteracao', 'exclusao')),
  motivo VARCHAR(50) NOT NULL,
  valor_anterior NUMERIC(12,2),
  valor_novo NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferenca NUMERIC(12,2) NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comissao_ajustes_mes ON comissao_ajustes(mes_referencia, perfil_comissao);
CREATE INDEX IF NOT EXISTS idx_comissao_ajustes_venda ON comissao_ajustes(venda_id);

CREATE TABLE IF NOT EXISTS comissao_regras_planejados (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  valor_limite NUMERIC(12,2) NOT NULL DEFAULT 100000,
  percentual_ate_limite NUMERIC(8,4) NOT NULL DEFAULT 5,
  percentual_acima_limite NUMERIC(8,4) NOT NULL DEFAULT 10,
  observacoes TEXT,
  atualizado_em TIMESTAMP DEFAULT NOW()
);

INSERT INTO comissao_regras_planejados (
  id, valor_limite, percentual_ate_limite, percentual_acima_limite, observacoes
)
SELECT 1, 100000, 5, 10,
  'Padrão: até R$ 100.000 no mês → 5%; acima do limite → 10% sobre o excedente'
WHERE NOT EXISTS (SELECT 1 FROM comissao_regras_planejados WHERE id = 1);

CREATE TABLE IF NOT EXISTS comissao_planejado_mensal (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
  total_vendas NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_limite NUMERIC(12,2) NOT NULL,
  percentual_ate_limite NUMERIC(8,4) NOT NULL,
  percentual_acima_limite NUMERIC(8,4) NOT NULL,
  base_ate_limite NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_acima_limite NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_faixa_ate NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_faixa_acima NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_comissao NUMERIC(12,2) NOT NULL DEFAULT 0,
  qtd_vendas INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE (ano, mes, vendedor_id)
);

CREATE INDEX IF NOT EXISTS idx_comissao_planejado_mensal_periodo
  ON comissao_planejado_mensal(ano, mes);

CREATE TABLE IF NOT EXISTS comissao_planejado_pagamentos (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
  valor_pago NUMERIC(12,2) NOT NULL CHECK (valor_pago >= 0),
  valor_devido_na_ocasiao NUMERIC(12,2),
  data_pagamento DATE NOT NULL,
  forma_pagamento VARCHAR(150),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comissao_planejado_pagamentos_periodo
  ON comissao_planejado_pagamentos(ano, mes, vendedor_id);

-- Quadro de colaboradores (RH)
CREATE TABLE IF NOT EXISTS colaboradores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  funcao VARCHAR(30) NOT NULL CHECK (funcao IN (
    'vendedor', 'vendedor_projetista', 'gerente', 'entrega', 'montador', 'administracao'
  )),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  salario_base NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (salario_base >= 0),
  ativo BOOLEAN DEFAULT TRUE,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_vendedor_unique
  ON colaboradores(vendedor_id) WHERE vendedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_usuario_unique
  ON colaboradores(usuario_id) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao ON colaboradores(funcao);
CREATE INDEX IF NOT EXISTS idx_colaboradores_ativo ON colaboradores(ativo);

CREATE TABLE IF NOT EXISTS colaborador_beneficios (
  id SERIAL PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  descricao VARCHAR(200),
  valor NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaborador_beneficios_colaborador
  ON colaborador_beneficios(colaborador_id);

-- Custos fixos (template + lançamentos mensais por exercício)
CREATE TABLE IF NOT EXISTS custos_fixos_template (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  valor_padrao NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_padrao >= 0),
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custos_fixos_mensal (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  template_id INTEGER REFERENCES custos_fixos_template(id) ON DELETE SET NULL,
  nome VARCHAR(200) NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  eh_extra BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custos_fixos_mensal_template_unico
  ON custos_fixos_mensal(ano, mes, template_id)
  WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custos_fixos_mensal_ano_mes
  ON custos_fixos_mensal(ano, mes);

INSERT INTO custos_fixos_template (nome, valor_padrao, ordem)
SELECT v.nome, 0, v.ordem
FROM (VALUES
  ('Aluguel', 1),
  ('Água', 2),
  ('Luz', 3),
  ('Internet', 4),
  ('Seguros', 5),
  ('Capitais contratados', 6),
  ('Parcela dos veículos', 7)
) AS v(nome, ordem)
WHERE NOT EXISTS (SELECT 1 FROM custos_fixos_template LIMIT 1);

-- Centros de custo e pagamentos (base para DRE)
CREATE TABLE IF NOT EXISTS centros_custo (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos_financeiros (
  id SERIAL PRIMARY KEY,
  centro_custo_id INTEGER NOT NULL REFERENCES centros_custo(id),
  descricao VARCHAR(200) NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  data_pagamento DATE NOT NULL,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_centros_custo_nome ON centros_custo(nome);
CREATE INDEX IF NOT EXISTS idx_pagamentos_financeiros_centro ON pagamentos_financeiros(centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_financeiros_data ON pagamentos_financeiros(data_pagamento DESC);

-- Notas fiscais de fornecedores (cadastro a partir de Recebimentos)
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id SERIAL PRIMARY KEY,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
  numero VARCHAR(20) NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(fornecedor_id, numero)
);

CREATE TABLE IF NOT EXISTS nota_fiscal_boletos (
  id SERIAL PRIMARY KEY,
  nota_fiscal_id INTEGER NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  parcela INTEGER NOT NULL CHECK (parcela > 0),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_vencimento DATE NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(nota_fiscal_id, parcela)
);

ALTER TABLE pagamentos_financeiros
  ADD COLUMN IF NOT EXISTS nota_fiscal_boleto_id INTEGER REFERENCES nota_fiscal_boletos(id) ON DELETE SET NULL;

ALTER TABLE recebimento_encomenda_itens
  ADD COLUMN IF NOT EXISTS nota_fiscal_id INTEGER REFERENCES notas_fiscais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_fornecedor ON notas_fiscais(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_numero ON notas_fiscais(numero);
CREATE INDEX IF NOT EXISTS idx_nota_fiscal_boletos_nota ON nota_fiscal_boletos(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_financeiros_nota_boleto ON pagamentos_financeiros(nota_fiscal_boleto_id);

INSERT INTO centros_custo (nome, descricao)
SELECT 'Fornecedores', 'Pagamentos a fornecedores vinculados a notas fiscais'
WHERE NOT EXISTS (SELECT 1 FROM centros_custo WHERE nome = 'Fornecedores' LIMIT 1);
