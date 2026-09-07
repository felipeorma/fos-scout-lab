import type { MetricSource } from "@/lib/scouting";

/**
 * Las marcas de las tres plataformas, para saber de un vistazo qué trae cada
 * liga antes de cargarla.
 *
 * Van incrustadas como data URI y no como archivos en /public por dos motivos.
 * Uno, son diminutas —las tres juntas no llegan a 3 kB— y una petición por
 * cada una costaría más que el propio byte. Y dos, el sitio se publica en
 * GitHub Pages bajo un subdirectorio, así que una ruta absoluta a /public se
 * rompería y una relativa dependería de desde dónde se pinte.
 *
 * La de Wyscout es un logotipo horizontal, no un cuadrado como las otras dos:
 * se guarda en blanco sobre transparente porque la interfaz es oscura y el
 * original es negro. Por eso cada marca lleva su propia proporción en vez de
 * asumir que todas son cuadradas: estirar un logotipo ajeno para que encaje en
 * una caja es exactamente lo que las guías de marca prohíben.
 */
export const LOGOS_PLATAFORMA: Record<MetricSource, {
  src: string;
  ancho: number;
  alto: number;
  nombre: string;
  /**
   * Un logotipo ya lleva el nombre escrito dentro; un símbolo no. Sirve para
   * no poner "wyscout Wyscout" uno al lado del otro, que es lo que salía al
   * tratar las tres marcas por igual.
   */
  esLogotipo?: boolean;
}> = {
  statsbomb: {
    nombre: "StatsBomb",
    ancho: 28,
    alto: 28,
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAbFBMVEX/////7OT/2sz/39P/9fH/7+j/49n/pIH/SwD/cir/xbD/sZT/tpv/dDL/UAD/yrf/+vj/hlL/VwD/f0b/TgD/WwD/YAD/YwD/lWr/XQD/VAD/war/p4b/aBH/0cH/rI7/nnj/eTn/jV//axvEhTdiAAAAyklEQVR4AcXRRXYEMQwE0GpmU8ZyM97/jnnNlKznb8wgCd9m2Y6Lv3nwgzCM4veZJM1YxCGkUj9pcjtvf7QmQ2EG5AVpzXycDJnZcqMyxlCGg8vmpXK5zCrn/genZUJjJpaNhFOiDbEUi0AZoyucvJKiY1wXpsSFVZbn7x1FhAuXNeegZcbFVSMhsOl6WLjqJAbnGPEUV6LBwOoqyyrAyxnuYiGp0ERqHMrQxlOnzIwKxvHiTTQvFpmP0z39NOH0LNzHwT+sJPHwZb9Edg2vUYPv/AAAAABJRU5ErkJggg==",
  },
  skillcorner: {
    nombre: "SkillCorner",
    ancho: 28,
    alto: 28,
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAY1BMVEUlJSUlGyMkDCEkAB8kACAkCCAobTots1Iw114w3mAv3F8v01wuvVUy/20y/2wx9mglGSMqeT4vzFskABwvx1glHyQlIiQnTjEmNSknRS4lFiInUjInQS0mOywnSjAlJyYlEyKuDx1MAAAAsklEQVR4AcXRRRKEMBRF0RBB836Cu+x/k+0SbMytYnSIsyvzuPgn16b8IIziT1GyUqEB+gUjHLMpyG2FSoMip9W0IiPKciG/qdV2ChBiXjJWlWxbWYMIYVWWTevttOvNUz0vNIM90xBkxgMdDCGOQWTqbq+TiarqTO3UlOX80vZgz9XjWx6KYn1Q+U3kCVEmHZNJ9CuOCNodKQy5IbUrhEPQgq2n/T10GPiKrZLiH7fswu6qvw3Ezb+4EwAAAABJRU5ErkJggg==",
  },
  wyscout: {
    nombre: "Wyscout",
    esLogotipo: true,
    ancho: 77,
    alto: 18,
    src: "data:image/png;base64,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",
  },
};

/**
 * La marca de una plataforma a la altura que se pida, respetando su
 * proporción. El texto alternativo va vacío a propósito cuando el nombre ya
 * está escrito al lado: repetirlo obliga a oírlo dos veces con lector de
 * pantalla.
 */
export function LogoPlataforma({ plataforma, alto = 14, conTexto = false }: {
  plataforma: MetricSource;
  alto?: number;
  /** Si el nombre ya se lee junto al logo, la imagen es decorativa. */
  conTexto?: boolean;
}) {
  const logo = LOGOS_PLATAFORMA[plataforma];
  if (!logo) return null;
  const ancho = Math.round((logo.ancho * alto) / logo.alto);
  // next/image no aporta nada aquí: la imagen ya viene incrustada y pesa
  // cientos de bytes, así que optimizarla costaría más de lo que ahorra.
  // eslint-disable-next-line @next/next/no-img-element
  return <img
    className="logo-plataforma"
    src={logo.src}
    width={ancho}
    height={alto}
    alt={conTexto ? "" : logo.nombre}
    title={logo.nombre}
    /* Sin lazy: los bytes ya viajan dentro del documento, así que diferir
       la carga solo retrasa el pintado. */
    decoding="async"
  />;
}
