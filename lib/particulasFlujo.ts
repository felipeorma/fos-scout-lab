/**
 * El motor del flujo de posesión: partículas que siguen las corrientes de un
 * equipo, como un mapa de viento. Sin React: lo usan la cancha de la página,
 * las miniaturas de la cuadrícula y el video del reel, que dibuja treinta
 * canchas en un mismo lienzo.
 *
 * Cuatro decisiones hacen que se lean ríos y no una maraña:
 *  · las partículas nacen sobre todo en las rutas más usadas, no repartidas
 *    por igual;
 *  · cada una sigue su propia corriente: donde una celda tiene dos, toma la
 *    que más se parece a hacia donde ya iba, y no salta a la del vecino;
 *  · derivan hacia el centro del canal en el que van, que lo estrecha;
 *  · la estela se redibuja entera en cada cuadro. El truco habitual —pintar
 *    encima un velo semitransparente— deja un poso que nunca termina de irse;
 *    así, lo que se va desaparece del todo.
 *
 * Coordenadas de StatsBomb (120 × 80, ataque hacia la derecha), así que la
 * banda de arriba es la izquierda del equipo que ataca.
 */
import type { CampoFlujo } from "./flujoPosesion";

/** De lenta a rápida: un solo tono, de apagado a brillante sobre el campo oscuro. */
export const RAMPA_RAPIDEZ = ["#2c6b5a", "#26876b", "#16a57c", "#12c48b", "#4dd6a3", "#8be5c2", "#d2f6e6"];
/** Grosor de la estela según la fuerza de la ruta, en px para una cancha de 480 px. */
export const GROSORES = [0.5, 0.9, 1.5];
export const CAMPO = "#0e1512";
/** La cancha de StatsBomb (120 × 80) y el margen que se deja alrededor al dibujarla. */
export const LARGO = 120;
export const ANCHO = 80;
export const MARGEN = 3;
const ALFAS = 5;

export type Sistema = {
  n: number;
  /** Puntos de estela por partícula. */
  l: number;
  x: Float32Array; y: Float32Array;
  hx: Float32Array; hy: Float32Array;
  edad: Float32Array; vida: Float32Array;
  /** Estela: x, y, rapidez y fuerza de cada punto, en anillo. */
  rastro: Float32Array;
  cabeza: Int32Array; largo: Int32Array;
};

function crearSistema(n: number, l: number): Sistema {
  return {
    n, l,
    x: new Float32Array(n), y: new Float32Array(n),
    hx: new Float32Array(n), hy: new Float32Array(n),
    edad: new Float32Array(n), vida: new Float32Array(n),
    rastro: new Float32Array(n * l * 4),
    cabeza: new Int32Array(n), largo: new Int32Array(n),
  };
}

/** Lo acumulado de intensidad^1,3 por celda: dónde nace cada partícula. */
function acumulado(campo: CampoFlujo) {
  const salida = new Float32Array(campo.intensidad.length);
  let suma = 0;
  for (let i = 0; i < campo.intensidad.length; i += 1) {
    suma += campo.intensidad[i] ** 1.3;
    salida[i] = suma;
  }
  return salida;
}

function nacer(s: Sistema, p: number, campo: CampoFlujo, cdf: Float32Array) {
  const total = cdf[cdf.length - 1];
  s.largo[p] = 0;
  s.edad[p] = 0;
  s.vida[p] = 60 + Math.random() * 90;
  if (!(total > 0)) { s.vida[p] = 0; return; }
  const objetivo = Math.random() * total;
  let bajo = 0;
  let alto = cdf.length - 1;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (cdf[medio] < objetivo) bajo = medio + 1;
    else alto = medio;
  }
  const c = bajo % campo.cols;
  const f = Math.floor(bajo / campo.cols);
  s.x[p] = (c + Math.random()) * campo.celda;
  s.y[p] = (f + Math.random()) * campo.celda;
  // La corriente que sigue, si la celda tiene dos: al azar según su fuerza.
  const [a, b] = campo.corrientes;
  const fa = a.fuerza[bajo] ** 2;
  const fb = b.fuerza[bajo] ** 2;
  const k = Math.random() * (fa + fb) < fa ? a : b;
  s.hx[p] = k.ux[bajo];
  s.hy[p] = k.uy[bajo];
}

type Muestra = { vx: number; vy: number; fuerza: number; rapidez: number };

/**
 * La corriente en un punto, interpolando las cuatro celdas que lo rodean.
 * En cada celda se toma la corriente que más se parece a la dirección de la
 * partícula; las que van a contramano (más de 90°) no cuentan: si es lo único
 * que hay, la partícula se queda sin corriente y se apaga.
 */
function muestrear(campo: CampoFlujo, x: number, y: number, hx: number, hy: number, salida: Muestra) {
  const gx = x / campo.celda - 0.5;
  const gy = y / campo.celda - 0.5;
  const c0 = Math.floor(gx);
  const f0 = Math.floor(gy);
  const tx = gx - c0;
  const ty = gy - f0;
  let vx = 0;
  let vy = 0;
  let fuerza = 0;
  let rapidez = 0;
  for (let dc = 0; dc < 2; dc += 1) {
    for (let df = 0; df < 2; df += 1) {
      const c = Math.min(campo.cols - 1, Math.max(0, c0 + dc));
      const f = Math.min(campo.filas - 1, Math.max(0, f0 + df));
      const peso = (dc ? tx : 1 - tx) * (df ? ty : 1 - ty);
      const i = f * campo.cols + c;
      rapidez += peso * campo.rapidez[i];
      let mejor = -1;
      let parecido = 0;
      for (let k = 0; k < 2; k += 1) {
        const corriente = campo.corrientes[k];
        if (corriente.fuerza[i] <= 0) continue;
        const producto = corriente.ux[i] * hx + corriente.uy[i] * hy;
        if (producto > parecido) { parecido = producto; mejor = k; }
      }
      if (mejor < 0) continue;
      const corriente = campo.corrientes[mejor];
      vx += peso * corriente.fuerza[i] * corriente.ux[i];
      vy += peso * corriente.fuerza[i] * corriente.uy[i];
      fuerza += peso * corriente.fuerza[i];
    }
  }
  salida.vx = vx;
  salida.vy = vy;
  salida.fuerza = fuerza;
  salida.rapidez = rapidez;
}

function intensidadEn(campo: CampoFlujo, x: number, y: number) {
  const gx = Math.min(campo.cols - 1, Math.max(0, x / campo.celda - 0.5));
  const gy = Math.min(campo.filas - 1, Math.max(0, y / campo.celda - 0.5));
  const c0 = Math.floor(gx);
  const f0 = Math.floor(gy);
  const c1 = Math.min(campo.cols - 1, c0 + 1);
  const f1 = Math.min(campo.filas - 1, f0 + 1);
  const tx = gx - c0;
  const ty = gy - f0;
  const v = campo.intensidad;
  const arriba = v[f0 * campo.cols + c0] * (1 - tx) + v[f0 * campo.cols + c1] * tx;
  const abajo = v[f1 * campo.cols + c0] * (1 - tx) + v[f1 * campo.cols + c1] * tx;
  return arriba * (1 - ty) + abajo * ty;
}

/**
 * Un paso de la simulación. `ritmo` corrige por los cuadros por segundo
 * reales. La estela guarda un punto nuevo cada dos pasos (`nuevo`) y entre
 * medias solo mueve la punta: el doble de largo con los mismos puntos.
 */
function avanzar(s: Sistema, campo: CampoFlujo, cdf: Float32Array, cenido: number, ritmo: number, nuevo: boolean) {
  const muestra: Muestra = { vx: 0, vy: 0, fuerza: 0, rapidez: 0 };
  const e = campo.celda * 0.75;
  for (let p = 0; p < s.n; p += 1) {
    if (s.edad[p] >= s.vida[p]) nacer(s, p, campo, cdf);
    if (s.vida[p] <= 0) continue;
    muestrear(campo, s.x[p], s.y[p], s.hx[p], s.hy[p], muestra);
    let paso = 0;
    if (muestra.fuerza < 0.02) {
      // En calma: se apaga en unos cuadros, sin moverse más.
      s.vida[p] = Math.min(s.vida[p], s.edad[p] + 10);
    } else {
      const largo = Math.hypot(muestra.vx, muestra.vy) || 1;
      let hx = s.hx[p] + (muestra.vx / largo - s.hx[p]) * 0.5;
      let hy = s.hy[p] + (muestra.vy / largo - s.hy[p]) * 0.5;
      const h = Math.hypot(hx, hy) || 1;
      hx /= h;
      hy /= h;
      s.hx[p] = hx;
      s.hy[p] = hy;
      // Velocidad exagerada: la de la zona como posición en la liga, elevada
      // a 1,6, entre ×0,22 y ×2,1 de la base.
      paso = 0.45 * (0.22 + 1.9 * muestra.rapidez ** 1.6) * ritmo;
      let x = s.x[p] + hx * paso;
      let y = s.y[p] + hy * paso;
      // Hacia el centro del canal: la pendiente de la intensidad, solo en
      // lo que tiene de perpendicular a la marcha.
      const gx = (intensidadEn(campo, x + e, y) - intensidadEn(campo, x - e, y)) / (2 * e);
      const gy = (intensidadEn(campo, x, y + e) - intensidadEn(campo, x, y - e)) / (2 * e);
      const proyeccion = gx * hx + gy * hy;
      const px = gx - proyeccion * hx;
      const py = gy - proyeccion * hy;
      const empuje = Math.hypot(px, py);
      if (empuje > 0) {
        const deriva = Math.min(empuje * cenido, paso * 0.6) / empuje;
        x += px * deriva;
        y += py * deriva;
      }
      if (x < 0 || x > LARGO || y < 0 || y > ANCHO) {
        s.vida[p] = Math.min(s.vida[p], s.edad[p] + 6);
        x = Math.min(LARGO, Math.max(0, x));
        y = Math.min(ANCHO, Math.max(0, y));
      }
      s.x[p] = x;
      s.y[p] = y;
    }
    const avanza = nuevo || s.largo[p] === 0;
    const cabeza = avanza ? (s.cabeza[p] + 1) % s.l : s.cabeza[p];
    const base = (p * s.l + cabeza) * 4;
    s.rastro[base] = s.x[p];
    s.rastro[base + 1] = s.y[p];
    s.rastro[base + 2] = muestra.rapidez;
    s.rastro[base + 3] = muestra.fuerza;
    s.cabeza[p] = cabeza;
    if (avanza) s.largo[p] = Math.min(s.l, s.largo[p] + 1);
    s.edad[p] += ritmo;
  }
}

/**
 * La cancha: fondo oscuro y líneas blancas, con su media luna en cada área.
 * `x`, `y` es la esquina de la caja entera (margen incluido) y `escala`, los
 * píxeles por unidad de StatsBomb. La caja mide (120 + 2·margen) × (80 + 2·margen).
 */
export function dibujarCancha(ctx: CanvasRenderingContext2D, x0: number, y0: number, escala: number) {
  ctx.save();
  ctx.fillStyle = CAMPO;
  ctx.fillRect(x0, y0, (LARGO + MARGEN * 2) * escala, (ANCHO + MARGEN * 2) * escala);
  ctx.translate(x0 + MARGEN * escala, y0 + MARGEN * escala);
  ctx.scale(escala, escala);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = Math.max(1, escala * 0.28) / escala;
  ctx.strokeRect(0, 0, LARGO, ANCHO);
  ctx.beginPath();
  ctx.moveTo(LARGO / 2, 0);
  ctx.lineTo(LARGO / 2, ANCHO);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(LARGO / 2, ANCHO / 2, 10, 0, Math.PI * 2);
  ctx.stroke();
  const punto = (x: number, y: number) => { ctx.beginPath(); ctx.arc(x, y, 0.55, 0, Math.PI * 2); ctx.fill(); };
  punto(LARGO / 2, ANCHO / 2);
  // La media luna: el trozo del círculo de 10 alrededor del punto de penalti
  // que queda fuera del área. cos θ = (18 − 12) / 10.
  const apertura = Math.acos(0.6);
  for (const lado of [0, 1]) {
    const x = (valor: number) => (lado ? LARGO - valor : valor);
    ctx.strokeRect(Math.min(x(0), x(18)), 18, 18, 44);
    ctx.strokeRect(Math.min(x(0), x(6)), 30, 6, 20);
    ctx.strokeRect(Math.min(x(0), x(-1.6)), 36, 1.6, 8);
    punto(x(12), ANCHO / 2);
    ctx.beginPath();
    if (lado) ctx.arc(x(12), ANCHO / 2, 10, Math.PI - apertura, Math.PI + apertura);
    else ctx.arc(x(12), ANCHO / 2, 10, -apertura, apertura);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Partículas listas para usar ------------------------------------------------

/** Un campo de partículas sobre las corrientes de un equipo. */
export type Particulas = { s: Sistema; campo: CampoFlujo; cdf: Float32Array; cenido: number; paso: number };

/**
 * Crea las partículas de un equipo y las deja ya en marcha, con sus estelas
 * formadas: así el primer cuadro no sale vacío.
 *
 * `densidad` escala cuántas hay (1 es una cancha de ~440 px de ancho; una
 * miniatura de la cuadrícula lleva menos), `estela` y `ancho` van de 0 a 1.
 */
export function crearParticulas(campo: CampoFlujo | null, opciones: { densidad?: number; estela: number; ancho: number }): Particulas | null {
  if (!campo || !campo.particulas) return null;
  const cdf = acumulado(campo);
  const n = Math.max(1, Math.round(campo.particulas * (opciones.densidad ?? 1)));
  const s = crearSistema(n, Math.round(6 + opciones.estela * 30));
  for (let p = 0; p < n; p += 1) {
    nacer(s, p, campo, cdf);
    s.edad[p] = Math.random() * s.vida[p];
  }
  const particulas: Particulas = { s, campo, cdf, cenido: 0.6 + (1 - opciones.ancho) * 2.4, paso: 0 };
  for (let k = 0; k < s.l * 2 + 30; k += 1) avanzarParticulas(particulas, 1);
  return particulas;
}

/** Un paso. `ritmo` corrige por los cuadros por segundo reales (1 = 60 fps). */
export function avanzarParticulas(particulas: Particulas, ritmo = 1) {
  particulas.paso += 1;
  avanzar(particulas.s, particulas.campo, particulas.cdf, particulas.cenido, ritmo, particulas.paso % 2 === 0);
}

/**
 * Las estelas, sobre una cancha ya dibujada en (x0, y0) con `escala` px por
 * unidad. Se agrupan por color, opacidad y grosor para trazarlas con pocas
 * llamadas: con miles de partículas, trazar cada tramo por separado no cabe
 * en un cuadro. `opacidad` atenúa todo el conjunto (para fundidos).
 */
export function dibujarEstelas(ctx: CanvasRenderingContext2D, particulas: Particulas, x0: number, y0: number, escala: number, grosores: number[], opacidad = 1) {
  const { s } = particulas;
  const caminos: Array<Path2D | null> = new Array(RAMPA_RAPIDEZ.length * ALFAS * GROSORES.length).fill(null);
  const aX = (x: number) => x0 + (MARGEN + x) * escala;
  const aY = (y: number) => y0 + (MARGEN + y) * escala;
  for (let p = 0; p < s.n; p += 1) {
    const largo = s.largo[p];
    if (largo < 2) continue;
    const apagado = Math.min(1, s.edad[p] / 8) * Math.min(1, Math.max(0, s.vida[p] - s.edad[p]) / 12);
    if (apagado <= 0) continue;
    let anterior = -1;
    for (let j = 1; j < largo; j += 1) {
      const desde = (p * s.l + ((s.cabeza[p] - largo + j + s.l) % s.l)) * 4;
      const hasta = (p * s.l + ((s.cabeza[p] - largo + j + 1 + s.l) % s.l)) * 4;
      // La punta siempre a pleno; la cola se desvanece hasta cero.
      const alfa = ((s.l - largo + j) / (s.l - 1)) * apagado;
      if (alfa < 0.06) { anterior = -1; continue; }
      const color = Math.min(RAMPA_RAPIDEZ.length - 1, Math.floor(s.rastro[hasta + 2] * RAMPA_RAPIDEZ.length));
      const fuerza = s.rastro[hasta + 3];
      const grueso = fuerza < 0.34 ? 0 : fuerza < 0.67 ? 1 : 2;
      const cubo = (color * ALFAS + Math.min(ALFAS - 1, Math.floor(alfa * ALFAS))) * GROSORES.length + grueso;
      const camino = caminos[cubo] ?? (caminos[cubo] = new Path2D());
      if (cubo !== anterior) camino.moveTo(aX(s.rastro[desde]), aY(s.rastro[desde + 1]));
      camino.lineTo(aX(s.rastro[hasta]), aY(s.rastro[hasta + 1]));
      anterior = cubo;
    }
  }
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  caminos.forEach((camino, cubo) => {
    if (!camino) return;
    const grueso = cubo % GROSORES.length;
    const alfa = Math.floor(cubo / GROSORES.length) % ALFAS;
    const color = Math.floor(cubo / (GROSORES.length * ALFAS));
    ctx.strokeStyle = RAMPA_RAPIDEZ[color];
    ctx.globalAlpha = ((alfa + 0.6) / ALFAS) * 0.8 * opacidad;
    ctx.lineWidth = grosores[grueso];
    ctx.stroke(camino);
  });
  ctx.restore();
}
