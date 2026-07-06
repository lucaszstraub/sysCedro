import { formatDate } from './format';

export function normalizarTelefoneWhatsApp(telefone) {
  if (!telefone) return null;
  let digits = String(telefone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return digits.length >= 12 ? digits : null;
}

export function formatDataTurnoEntrega(dataIso, periodo) {
  const dataLabel = formatDate(dataIso);
  const periodoLabel = periodo === 'vespertino'
    ? 'período vespertino (tarde)'
    : 'período matutino (manhã)';
  return `${dataLabel}, ${periodoLabel}`;
}

export function buildMensagemWhatsAppAgendamento(clienteNome, dataIso, periodo) {
  const dataTurno = formatDataTurnoEntrega(dataIso, periodo);
  return `Olá ${clienteNome}, falo em nome da Cedro Móveis, gostaria de estar agendando para ${dataTurno} a entrega dos seus produtos.`;
}

export function buildWhatsAppAgendamentoUrl(telefone, clienteNome, dataIso, periodo) {
  const phone = normalizarTelefoneWhatsApp(telefone);
  if (!phone || !clienteNome || !dataIso || !periodo) return null;
  const text = buildMensagemWhatsAppAgendamento(clienteNome, dataIso, periodo);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export async function openExternalUrl(url) {
  if (!url) return;
  if (window.api?.openExternalUrl) {
    await window.api.openExternalUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function abrirWhatsAppAgendamento(telefone, clienteNome, dataIso, periodo) {
  const url = buildWhatsAppAgendamentoUrl(telefone, clienteNome, dataIso, periodo);
  if (!url) {
    throw new Error('Telefone do cliente inválido ou incompleto para abrir o WhatsApp.');
  }
  await openExternalUrl(url);
}
