import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ProdutoThumb({ produtoId, alt }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let active = true;
    api.getProdutoFoto(produtoId)
      .then((dataUrl) => { if (active) setSrc(dataUrl); })
      .catch(() => { if (active) setSrc(null); });
    return () => { active = false; };
  }, [produtoId]);

  return (
    <div className="produto-thumb">
      {src ? <img src={src} alt={alt || 'Produto'} /> : <div className="produto-thumb-placeholder" />}
    </div>
  );
}
