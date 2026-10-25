/**
 * El reel de Football Blueprints: un video vertical (1080 × 1920, para un
 * reel de LinkedIn) con el flujo de posesión de toda una liga.
 *
 * Se cuenta como un mapa conceptual, de arriba abajo: la liga, sus
 * conferencias (en la MLS, Este y Oeste) y debajo de cada una sus equipos,
 * cada uno con su cancha animada. A mitad del video un equipo pasa al frente,
 * en grande, con sus números; al final vuelve la liga entera, para que el
 * video se pueda repetir en bucle sin salto.
 *
 * Sin React ni DOM más allá del lienzo: lo dibuja la vista previa de la
 * página y lo codifica, cuadro a cuadro, el exportador de video.
 */
import type { CampoFlujo, EscalaFlujo, ResumenFlujo } from "./flujoPosesion";
import {
  ANCHO, GROSORES, LARGO, MARGEN, RAMPA_RAPIDEZ,
  avanzarParticulas, crearParticulas, dibujarCancha, dibujarEstelas, type Particulas,
} from "./particulasFlujo.ts";

export const REEL = { ancho: 1080, alto: 1920, fps: 30, segundos: 24 } as const;

/** Proporción de una cancha con su margen. */
const PROPORCION = (LARGO + MARGEN * 2) / (ANCHO + MARGEN * 2);

export type EquipoDelReel = {
  id: number;
  nombre: string;
  campo: CampoFlujo | null;
  resumen: ResumenFlujo | undefined;
  /** El escudo ya cargado (con CORS, para no ensuciar el lienzo), o null. */
  escudo?: CanvasImageSource | null;
};

export type TextosDelReel = {
  rotulo: string;
  titulo: string;
  subtitulo: string;
  /** "MLS 2026" en la raíz del mapa. */
  raiz: string;
  /** "{n} equipos" ya traducido, con {n}. */
  equipos: string;
  velocidad: string;
  lenta: string;
  rapida: string;
  grosor: string;
  ataque: string;
  creditos: string;
  balonPorPartido: string;
  haciaDelante: string;
  ultimoTercio: string;
  vsLiga: string;
};

export type OpcionesReel = {
  grupos: Array<{ nombre: string; equipos: EquipoDelReel[] }>;
  destacado: EquipoDelReel | null;
  escala: EscalaFlujo;
  media: { metros: number; adelante: number; velocidad: [number, number, number] };
  textos: TextosDelReel;
  /** La familia tipográfica de la página, para que el video hable igual. */
  fuente: string;
  /** El color de acento de la plataforma. */
  acento: string;
  ancho: number;
  locale: string;
};

export type Caja = { x: number; y: number; w: number; h: number };
export type DisenoDelReel = {
  raiz: Caja;
  /** Por grupo: su rótulo y la caja de cada equipo (cancha y nombre debajo). */
  grupos: Array<{ rotulo: Caja; celdas: Caja[]; cancha: number }>;
  espinaX: number;
  leyendaY: number;
};

const MARGEN_LATERAL = 64;
const SANGRIA = 54;
const ALTO_ROTULO = 44;
const ALTO_NOMBRE = 30;
const HUECO_X = 14;
const HUECO_Y = 12;
const HUECO_GRUPOS = 26;
const ARRIBA = 470;
const ABAJO = 1560;

/**
 * Dónde va cada cosa. Se calcula una vez y es puro, para poder probar que
 * todo entra en el lienzo con cualquier número de equipos: los treinta de la
 * MLS en dos conferencias, los ocho de la CPL o los doce de una liga europea.
 */
export function disenoDelReel(tamanos: number[]): DisenoDelReel {
  const izquierda = MARGEN_LATERAL + SANGRIA;
  const disponible = REEL.ancho - izquierda - MARGEN_LATERAL;
  const columnas = tamanos.map((n) => (n > 12 ? 5 : n > 6 ? 4 : 3));
  const altoCon = (anchoCelda: number) => tamanos.reduce((total, n, k) => {
    const filas = Math.ceil(n / columnas[k]);
    const altoCelda = anchoCelda / PROPORCION + ALTO_NOMBRE;
    return total + ALTO_ROTULO + filas * altoCelda + (filas - 1) * HUECO_Y;
  }, 0) + HUECO_GRUPOS * Math.max(0, tamanos.length - 1);
  // El ancho de celda que llena el ancho disponible; si no cabe de alto, se encoge.
  let anchoCelda = Math.min(...columnas.map((c) => (disponible - (c - 1) * HUECO_X) / c));
  const sobra = altoCon(anchoCelda) - (ABAJO - ARRIBA);
  if (sobra > 0) anchoCelda *= (ABAJO - ARRIBA) / altoCon(anchoCelda);
  const altoCancha = anchoCelda / PROPORCION;

  let y = ARRIBA;
  const grupos = tamanos.map((n, k) => {
    const c = columnas[k];
    const rotulo = { x: izquierda, y, w: disponible, h: ALTO_ROTULO };
    y += ALTO_ROTULO;
    const celdas: Caja[] = [];
    for (let i = 0; i < n; i += 1) {
      const fila = Math.floor(i / c);
      const columna = i % c;
      celdas.push({ x: izquierda + columna * (anchoCelda + HUECO_X), y: y + fila * (altoCancha + ALTO_NOMBRE + HUECO_Y), w: anchoCelda, h: altoCancha });
    }
    const filas = Math.ceil(n / c);
    y += filas * (altoCancha + ALTO_NOMBRE) + (filas - 1) * HUECO_Y + HUECO_GRUPOS;
    return { rotulo, celdas, cancha: anchoCelda };
  });
  return {
    raiz: { x: MARGEN_LATERAL, y: 372, w: 0, h: 64 },
    grupos,
    espinaX: MARGEN_LATERAL + 22,
    leyendaY: Math.max(y + 10, 1590),
  };
}

/** Sube de 0 a 1 entre `desde` y `hasta` (segundos), suavizado. */
const tramo = (t: number, desde: number, hasta: number) => {
  const x = Math.min(1, Math.max(0, (t - desde) / (hasta - desde)));
  return x * x * (3 - 2 * x);
};

/** La escena del equipo destacado: entra en 13 s y se va en 22,5 s. */
export const ESCENAS = { destacadoEntra: 13, destacadoSale: 22.5 } as const;

export function crearReel(opciones: OpcionesReel) {
  const { textos, fuente, acento } = opciones;
  const diseno = disenoDelReel(opciones.grupos.map((grupo) => grupo.equipos.length));
  const fmt = (valor: number, decimales = 0) => (Number.isFinite(valor)
    ? valor.toLocaleString(opciones.locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    : "—");

  // Partículas de cada miniatura: pocas, con estela corta; las del destacado, todas.
  const miniaturas = opciones.grupos.map((grupo, k) => grupo.equipos.map((equipo) => (
    crearParticulas(equipo.campo, { densidad: 0.32 * Math.min(1, diseno.grupos[k].cancha / 200), estela: 0.32, ancho: opciones.ancho })
  )));
  const destacado: Particulas | null = opciones.destacado
    ? crearParticulas(opciones.destacado.campo, { densidad: 1, estela: 0.55, ancho: opciones.ancho })
    : null;

  // Lo que no se mueve —canchas, nombres, rótulos, la espina del mapa— se
  // dibuja una vez en una capa aparte y en cada cuadro se copia.
  const capa = document.createElement("canvas");
  capa.width = REEL.ancho;
  capa.height = REEL.alto;
  const fija = capa.getContext("2d");
  if (!fija) throw new Error("canvas 2d");
  diseno.grupos.forEach((grupo, k) => {
    fija.fillStyle = acento;
    fija.font = `700 21px ${fuente}`;
    fija.textBaseline = "middle";
    const nombre = opciones.grupos[k].nombre.toUpperCase();
    fija.fillText(nombre, grupo.rotulo.x, grupo.rotulo.y + 16);
    const anchoNombre = fija.measureText(nombre).width;
    fija.fillStyle = "rgba(234,242,240,.55)";
    fija.font = `500 19px ${fuente}`;
    fija.fillText(`· ${textos.equipos.replace("{n}", String(grupo.celdas.length))}`, grupo.rotulo.x + anchoNombre + 10, grupo.rotulo.y + 16);
    grupo.celdas.forEach((celda, i) => {
      const equipo = opciones.grupos[k].equipos[i];
      dibujarCancha(fija, celda.x, celda.y, celda.w / (LARGO + MARGEN * 2));
      const tam = 20;
      let x = celda.x;
      if (equipo.escudo) {
        try { fija.drawImage(equipo.escudo, x, celda.y + celda.h + 6, tam, tam); x += tam + 6; } catch { /* sin escudo */ }
      }
      fija.fillStyle = "#eaf2f0";
      fija.font = `600 17px ${fuente}`;
      fija.textBaseline = "top";
      let texto = equipo.nombre;
      while (fija.measureText(texto).width > celda.x + celda.w - x && texto.length > 4) texto = `${texto.slice(0, -2)}…`;
      fija.fillText(texto, x, celda.y + celda.h + 8);
    });
  });

  const grosoresMini = (cancha: number) => GROSORES.map((g) => g * Math.max(0.9, cancha / 210));
  const grosoresGrandes = GROSORES.map((g) => g * 1.9);

  function texto(ctx: CanvasRenderingContext2D, contenido: string, x: number, y: number, estilo: string, color: string, alfa: number) {
    ctx.globalAlpha = alfa;
    ctx.fillStyle = color;
    ctx.font = estilo;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(contenido, x, y);
    ctx.globalAlpha = 1;
  }

  /** Parte el título en líneas que quepan en el ancho. */
  function lineas(ctx: CanvasRenderingContext2D, contenido: string, estilo: string, anchoMax: number) {
    ctx.font = estilo;
    const salida: string[] = [];
    let actual = "";
    for (const palabra of contenido.split(/\s+/)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > anchoMax && actual) { salida.push(actual); actual = palabra; } else actual = prueba;
    }
    if (actual) salida.push(actual);
    return salida.slice(0, 3);
  }

  function leyenda(ctx: CanvasRenderingContext2D, y: number, alfa: number) {
    const x = MARGEN_LATERAL;
    texto(ctx, textos.velocidad, x, y, `700 21px ${fuente}`, "#eaf2f0", alfa);
    const inicio = x;
    RAMPA_RAPIDEZ.forEach((color, i) => {
      ctx.globalAlpha = alfa;
      ctx.fillStyle = color;
      ctx.fillRect(inicio + i * 58, y + 16, 54, 12);
    });
    ctx.globalAlpha = 1;
    texto(ctx, textos.lenta, inicio, y + 54, `500 18px ${fuente}`, "rgba(234,242,240,.6)", alfa);
    ctx.font = `500 18px ${fuente}`;
    const derecha = inicio + RAMPA_RAPIDEZ.length * 58 - 4;
    texto(ctx, textos.rapida, derecha - ctx.measureText(textos.rapida).width, y + 54, `500 18px ${fuente}`, "rgba(234,242,240,.6)", alfa);

    const x2 = 600;
    texto(ctx, textos.grosor, x2, y, `700 21px ${fuente}`, "#eaf2f0", alfa);
    GROSORES.forEach((g, i) => {
      ctx.globalAlpha = alfa;
      ctx.strokeStyle = RAMPA_RAPIDEZ[4];
      ctx.lineWidth = g * 3.2;
      ctx.beginPath();
      ctx.moveTo(x2 + i * 70, y + 22);
      ctx.lineTo(x2 + i * 70 + 54, y + 22);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    texto(ctx, textos.ataque, x2, y + 54, `500 18px ${fuente}`, "rgba(234,242,240,.6)", alfa);
  }

  function tarjetaDestacada(ctx: CanvasRenderingContext2D, alfa: number) {
    const equipo = opciones.destacado;
    if (!equipo || alfa <= 0) return;
    // Un velo sobre la cuadrícula, y el equipo en grande encima.
    ctx.globalAlpha = 0.86 * alfa;
    ctx.fillStyle = "#070b0d";
    ctx.fillRect(0, 440, REEL.ancho, 1150);
    ctx.globalAlpha = 1;
    const ancho = REEL.ancho - MARGEN_LATERAL * 2;
    const escala = ancho / (LARGO + MARGEN * 2);
    const alto = (ANCHO + MARGEN * 2) * escala;
    const y = 640;
    let xNombre = MARGEN_LATERAL;
    if (equipo.escudo) {
      ctx.globalAlpha = alfa;
      try { ctx.drawImage(equipo.escudo, MARGEN_LATERAL, 520, 64, 64); xNombre += 80; } catch { /* sin escudo */ }
      ctx.globalAlpha = 1;
    }
    texto(ctx, equipo.nombre, xNombre, 572, `700 52px ${fuente}`, "#ffffff", alfa);
    ctx.globalAlpha = alfa;
    dibujarCancha(ctx, MARGEN_LATERAL, y, escala);
    ctx.globalAlpha = 1;
    if (destacado) dibujarEstelas(ctx, destacado, MARGEN_LATERAL, y, escala, grosoresGrandes, alfa);
    const r = equipo.resumen;
    if (!r) return;
    const columnas = [
      { titulo: textos.balonPorPartido, valor: `${fmt(r.metros)} m`, dif: r.metros - opciones.media.metros, unidad: " m", decimales: 0 },
      { titulo: textos.haciaDelante, valor: `${fmt(r.adelante * 100)}%`, dif: (r.adelante - opciones.media.adelante) * 100, unidad: " pp", decimales: 0 },
      { titulo: textos.ultimoTercio, valor: `${fmt(r.velocidad[2], 1)} m/s`, dif: r.velocidad[2] - opciones.media.velocidad[2], unidad: "", decimales: 1 },
    ];
    const anchoColumna = ancho / 3;
    columnas.forEach((columna, i) => {
      const x = MARGEN_LATERAL + i * anchoColumna;
      const yc = y + alto + 70;
      texto(ctx, columna.titulo, x, yc, `500 22px ${fuente}`, "rgba(234,242,240,.65)", alfa);
      texto(ctx, columna.valor, x, yc + 58, `700 48px ${fuente}`, "#ffffff", alfa);
      if (Number.isFinite(columna.dif)) {
        const signo = columna.dif > 0 ? "+" : columna.dif < 0 ? "−" : "±";
        texto(ctx, textos.vsLiga.replace("{d}", `${signo}${fmt(Math.abs(columna.dif), columna.decimales)}${columna.unidad}`), x, yc + 94, `500 20px ${fuente}`, acento, alfa);
      }
    });
  }

  let ultimo = -1;
  /**
   * Un cuadro en el segundo `t`. Las partículas avanzan lo que haya pasado
   * desde el cuadro anterior (a 30 fps, dos pasos de los de 60), así que el
   * video va al mismo ritmo que la página.
   */
  function dibujar(ctx: CanvasRenderingContext2D, t: number) {
    const pasos = ultimo < 0 ? 1 : Math.max(0, Math.round((t - ultimo) * 60));
    ultimo = t;
    for (let k = 0; k < pasos; k += 1) {
      for (const grupo of miniaturas) for (const particulas of grupo) if (particulas) avanzarParticulas(particulas, 1);
      if (destacado && t >= ESCENAS.destacadoEntra - 1 && t <= ESCENAS.destacadoSale + 1) avanzarParticulas(destacado, 1);
    }

    const fondo = ctx.createLinearGradient(0, 0, 0, REEL.alto);
    fondo.addColorStop(0, "#0d1a1f");
    fondo.addColorStop(0.6, "#10242a");
    fondo.addColorStop(1, "#0b1519");
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, REEL.ancho, REEL.alto);

    // Título.
    const aTitulo = tramo(t, 0, 0.8);
    texto(ctx, textos.rotulo, MARGEN_LATERAL, 118, `800 24px ${fuente}`, acento, aTitulo);
    const estiloTitulo = `700 58px ${fuente}`;
    lineas(ctx, textos.titulo, estiloTitulo, REEL.ancho - MARGEN_LATERAL * 2).forEach((linea, i) => {
      texto(ctx, linea, MARGEN_LATERAL, 190 + i * 66, estiloTitulo, "#ffffff", aTitulo);
    });
    texto(ctx, textos.subtitulo, MARGEN_LATERAL, 334, `500 25px ${fuente}`, "rgba(234,242,240,.7)", tramo(t, 0.4, 1.2));

    // La raíz del mapa y la espina que baja hasta cada grupo.
    const aRaiz = tramo(t, 0.6, 1.4);
    ctx.font = `800 30px ${fuente}`;
    const anchoRaiz = ctx.measureText(textos.raiz).width + 44;
    ctx.globalAlpha = aRaiz;
    ctx.fillStyle = acento;
    ctx.beginPath();
    ctx.roundRect(diseno.raiz.x, diseno.raiz.y, anchoRaiz, diseno.raiz.h, 32);
    ctx.fill();
    ctx.globalAlpha = 1;
    texto(ctx, textos.raiz, diseno.raiz.x + 22, diseno.raiz.y + 43, `800 30px ${fuente}`, "#06110d", aRaiz);
    const aRamas = tramo(t, 1.2, 2.4);
    if (aRamas > 0 && diseno.grupos.length) {
      const ultimoRotulo = diseno.grupos[diseno.grupos.length - 1].rotulo;
      const yFin = diseno.raiz.y + diseno.raiz.h + (ultimoRotulo.y + 16 - diseno.raiz.y - diseno.raiz.h) * aRamas;
      ctx.strokeStyle = acento;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(diseno.espinaX, diseno.raiz.y + diseno.raiz.h);
      ctx.lineTo(diseno.espinaX, yFin);
      for (const grupo of diseno.grupos) {
        const yRama = grupo.rotulo.y + 16;
        if (yRama > yFin) continue;
        ctx.moveTo(diseno.espinaX, yRama);
        ctx.lineTo(grupo.rotulo.x - 12, yRama);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Los equipos: la capa fija y, encima, las partículas.
    const aCuadricula = tramo(t, 1.6, 3);
    ctx.globalAlpha = aCuadricula;
    ctx.drawImage(capa, 0, 0);
    ctx.globalAlpha = 1;
    diseno.grupos.forEach((grupo, k) => grupo.celdas.forEach((celda, i) => {
      const particulas = miniaturas[k][i];
      if (particulas) dibujarEstelas(ctx, particulas, celda.x, celda.y, celda.w / (LARGO + MARGEN * 2), grosoresMini(celda.w), aCuadricula);
      // El destacado, señalado en su celda antes de pasar al frente.
      if (opciones.destacado && opciones.grupos[k].equipos[i].id === opciones.destacado.id) {
        const aviso = tramo(t, 9, 10);
        if (aviso > 0) {
          ctx.globalAlpha = aviso * (0.65 + 0.35 * Math.sin(t * 5));
          ctx.strokeStyle = acento;
          ctx.lineWidth = 4;
          ctx.strokeRect(celda.x - 3, celda.y - 3, celda.w + 6, celda.h + 6);
          ctx.globalAlpha = 1;
        }
      }
    }));

    // El equipo destacado, en grande.
    const aDestacado = tramo(t, ESCENAS.destacadoEntra, ESCENAS.destacadoEntra + 1) * (1 - tramo(t, ESCENAS.destacadoSale, ESCENAS.destacadoSale + 1));
    tarjetaDestacada(ctx, aDestacado);

    leyenda(ctx, diseno.leyendaY + 24, tramo(t, 2, 3));
    texto(ctx, textos.creditos, MARGEN_LATERAL, REEL.alto - 64, `500 21px ${fuente}`, "rgba(234,242,240,.55)", tramo(t, 2, 3));
  }

  return { dibujar, cuadros: REEL.fps * REEL.segundos, diseno };
}
