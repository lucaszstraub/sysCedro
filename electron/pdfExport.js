const { dialog, shell } = require('electron');

const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }];

async function salvarEAbrirPdf(browserWindow, { title, defaultPath }, gerarFn) {
  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title,
    defaultPath,
    filters: PDF_FILTER,
  });
  if (canceled || !filePath) return { cancelled: true };

  await gerarFn(filePath);

  const openError = await shell.openPath(filePath);
  if (openError) {
    throw new Error(`PDF salvo, mas não foi possível abrir o arquivo: ${openError}`);
  }

  return { cancelled: false, filePath };
}

module.exports = {
  salvarEAbrirPdf,
};
