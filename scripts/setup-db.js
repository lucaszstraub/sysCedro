const { initDatabase } = require('../electron/database');

async function setup() {
  try {
    console.log('Configurando banco de dados SysCedro WMS...');
    await initDatabase();
    console.log('Banco de dados configurado com sucesso!');
  } catch (error) {
    console.error('Erro ao configurar banco:', error.message);
    process.exit(1);
  }
}

setup();
