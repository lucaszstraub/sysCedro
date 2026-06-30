import { ATRIBUICOES } from '../constants/auth';

export function isVendedorRestrito(user) {
  if (!user || user.is_master) return false;
  return user.atribuicao === ATRIBUICOES.VENDEDOR
    || user.atribuicao === ATRIBUICOES.VENDEDOR_PROJETISTA;
}

export function getVendedorIdUsuario(user) {
  if (!isVendedorRestrito(user) || !user.vendedor_id) return null;
  return String(user.vendedor_id);
}
