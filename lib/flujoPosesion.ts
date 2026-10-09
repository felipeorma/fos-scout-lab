/**
 * Flujo de posesión: las rutas habituales de cada equipo, como un mapa de viento.
 *
 * La idea es el blueprint "possession flow" de opengoalapp/football-blueprints.
 * Cada pase y cada conducción de la temporada ya llegan repartidos por el
 * puente en una rejilla de 60 × 40 celdas y 16 direcciones (cuánto balón pasó
 * por cada celda hacia cada lado), más la distancia y el tiempo del balón en
 * cada celda. Aquí eso se convierte en corrientes: por dónde va el balón, con
 * cuánta fuerza y a qué velocidad.
 *
 * Lo que evita la maraña de líneas, que es el fracaso típico de este gráfico:
 *  · No se promedian direcciones. Si desde una zona el equipo sale la mitad
 *    de las veces a la izquierda y la otra mitad a la derecha, la media se
 *    anula y esconde las dos. Se busca la dirección dominante, y solo si hay
 *    un reparto de verdad parejo se dibuja una segunda.
 *  · La escala es de la liga: qué cuenta como ruta se decide contra todos los
 *    equipos, así que una línea gruesa significa lo mismo en las dos canchas,
 *    y las zonas de poco tráfico quedan en calma, no con ruido tenue.
 *  · La velocidad se pasa a posición en la liga: medida en bruto, el balón
 *    va casi igual de rápido en todas partes y todo se movería igual.
 */

export type EquipoFlujo = {
  equipo: number;
  nombre: string;
  partidos: number;
  tramos: number;
  /** Por celda y dirección (celda × direcciones + dirección): distancia del balón en la temporada. */
  flujo: number[];
  /** Por celda: distancia del balón, de los tramos con duración. */
  recorrido: number[];
  /** Por celda: segundos del balón. */
  tiempo: number[];
};

export type LigaFlujo = {
  liga: string;
  temporada: string;
  partidos: number;
  fallidos: number;
  /** Lado de la celda, en unidades de StatsBomb (la cancha mide 120 × 80). */
  celda: number;
  cols: number;
  filas: number;
  direcciones: number;
  equipos: EquipoFlujo[];
};

export type AjustesFlujo = {
  /** 0–1: cuánto flujo secundario se ve —rutas menos usadas y bifurcaciones—. */
  detalle: number;
  /** 0–1: ancho de los canales. */
  ancho: number;
};

export const AJUSTES_INICIALES: AjustesFlujo = { detalle: 0.5, ancho: 0.3 };

/** Una corriente por celda: dirección unitaria y fuerza 0–1 (0 es calma). */
export type Corriente = { ux: Float32Array; uy: Float32Array; fuerza: Float32Array };

export type CampoFlujo = {
  equipo: number;
  nombre: string;
  cols: number;
  filas: number;
  celda: number;
  /** La corriente principal de cada celda y, donde el reparto es parejo, la segunda. */
  corrientes: [Corriente, Corriente];
  /** La mayor de las dos fuerzas: dónde nacen las partículas y hacia dónde se ciñen. */
  intensidad: Float32Array;
  /** 0–1: la velocidad del balón en la zona, como posición en la liga. */
  rapidez: Float32Array;
  /** Velocidad del balón en la zona, en m/s; NaN donde no hay datos. */
  velocidad: Float32Array;
  /** Metros de balón por partido que pasan por la celda en su dirección principal. */
  metros: Float32Array;
  /** Cuántas partículas le tocan: proporcional a su tráfico, en la escala de la liga. */
  particulas: number;
};

export type EscalaFlujo = {
  /** Velocidad del balón en m/s en los percentiles 10, 50 y 90 de las zonas con ruta. */
  velocidades: [number, number, number];
  /** Metros por partido de una celda en el umbral de ruta, a media fuerza y a fuerza plena. */
  metros: [number, number, number];
};

/** Las coordenadas de StatsBomb son yardas. */
const METROS_POR_UNIDAD = 0.9144;
/** Las partículas del equipo con más tráfico de la liga; el resto, en proporción. */
const PARTICULAS_MAXIMAS = 2600;

const acotar = (valor: number, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, valor));

/** El valor en la fracción `q` (0–1) de una lista ordenada de menor a mayor. */
export function cuantil(ordenados: ArrayLike<number>, q: number) {
  if (!ordenados.length) return Number.NaN;
  const posicion = acotar(q) * (ordenados.length - 1);
  const abajo = Math.floor(posicion);
  const arriba = Math.min(ordenados.length - 1, abajo + 1);
  return ordenados[abajo] + (ordenados[arriba] - ordenados[abajo]) * (posicion - abajo);
}

/** Qué fracción de la lista ordenada queda por debajo de `valor`: su posición 0–1. */
function posicionEn(ordenados: Float32Array, valor: number) {
  if (ordenados.length < 2) return 0.5;
  let bajo = 0;
  let alto = ordenados.length;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (ordenados[medio] < valor) bajo = medio + 1;
    else alto = medio;
  }
  return acotar(bajo / (ordenados.length - 1));
}

/**
 * Desenfoque gaussiano separable de una rejilla.
 *
 * En los bordes los pesos se renormalizan con lo que queda dentro: si no, las
 * celdas pegadas a la banda perderían fuerza solo por estar en la orilla.
 */
export function desenfocar(origen: Float32Array, cols: number, filas: number, sigma: number): Float32Array {
  if (sigma <= 0) return origen.slice();
  const radio = Math.max(1, Math.ceil(sigma * 2.5));
  const nucleo = new Float32Array(radio * 2 + 1);
  for (let j = -radio; j <= radio; j += 1) nucleo[j + radio] = Math.exp(-(j * j) / (2 * sigma * sigma));
  const intermedio = new Float32Array(cols * filas);
  const salida = new Float32Array(cols * filas);
  for (let f = 0; f < filas; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      let suma = 0;
      let pesos = 0;
      for (let j = -radio; j <= radio; j += 1) {
        const cc = c + j;
        if (cc < 0 || cc >= cols) continue;
        suma += origen[f * cols + cc] * nucleo[j + radio];
        pesos += nucleo[j + radio];
      }
      intermedio[f * cols + c] = suma / pesos;
    }
  }
  for (let f = 0; f < filas; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      let suma = 0;
      let pesos = 0;
      for (let j = -radio; j <= radio; j += 1) {
        const ff = f + j;
        if (ff < 0 || ff >= filas) continue;
        suma += intermedio[ff * cols + c] * nucleo[j + radio];
        pesos += nucleo[j + radio];
      }
      salida[f * cols + c] = suma / pesos;
    }
  }
  return salida;
}

/** Distancia entre dos direcciones en una rosa de `total` sectores. */
const distanciaCircular = (a: number, b: number, total: number) => {
  const d = Math.abs(a - b) % total;
  return Math.min(d, total - d);
};

type Bruto = {
  /** Fuerza de la corriente principal y de la segunda candidata, por celda. */
  f1: Float32Array;
  f2: Float32Array;
  /** Cuánto pesa la segunda frente a la primera: 1 es un reparto exacto. */
  relacion: Float32Array;
  ux1: Float32Array; uy1: Float32Array;
  ux2: Float32Array; uy2: Float32Array;
};

/**
 * Las dos corrientes candidatas de cada celda de un equipo, sin escala todavía.
 *
 * Por celda: se suaviza la rosa de direcciones un poco —una ruta que se curva
 * no debe partirse entre dos sectores vecinos— y se toma el sector con más
 * balón. La corriente principal es ese sector y sus dos vecinos: su dirección,
 * la media de esos tres; su fuerza, lo que suman. La segunda es el pico más
 * alto a 67,5° o más de la principal, sin contar lo que ya se llevó ella.
 */
function corrientesEnBruto(equipo: EquipoFlujo, liga: LigaFlujo, sigma: number): Bruto {
  const { cols, filas, direcciones } = liga;
  const celdas = cols * filas;
  const porPartido = 1 / Math.max(1, equipo.partidos);
  const planos: Float32Array[] = [];
  for (let d = 0; d < direcciones; d += 1) {
    const plano = new Float32Array(celdas);
    for (let i = 0; i < celdas; i += 1) plano[i] = (equipo.flujo[i * direcciones + d] ?? 0) * porPartido;
    planos.push(desenfocar(plano, cols, filas, sigma));
  }
  const coseno = Array.from({ length: direcciones }, (_, d) => Math.cos((d * 2 * Math.PI) / direcciones));
  const seno = Array.from({ length: direcciones }, (_, d) => Math.sin((d * 2 * Math.PI) / direcciones));
  const salida: Bruto = {
    f1: new Float32Array(celdas), f2: new Float32Array(celdas), relacion: new Float32Array(celdas),
    ux1: new Float32Array(celdas), uy1: new Float32Array(celdas),
    ux2: new Float32Array(celdas), uy2: new Float32Array(celdas),
  };
  const v = new Float32Array(direcciones);
  const s = new Float32Array(direcciones);
  const ventana = (centro: number) => [centro - 1, centro, centro + 1].map((d) => (d + direcciones) % direcciones);
  for (let i = 0; i < celdas; i += 1) {
    for (let d = 0; d < direcciones; d += 1) v[d] = planos[d][i];
    for (let d = 0; d < direcciones; d += 1) {
      s[d] = 0.25 * v[(d + direcciones - 1) % direcciones] + 0.5 * v[d] + 0.25 * v[(d + 1) % direcciones];
    }
    let p1 = 0;
    for (let d = 1; d < direcciones; d += 1) if (s[d] > s[p1]) p1 = d;
    if (s[p1] <= 0) continue;
    const propia = ventana(p1);
    let x = 0;
    let y = 0;
    let fuerza = 0;
    for (const d of propia) { x += v[d] * coseno[d]; y += v[d] * seno[d]; fuerza += v[d]; }
    const largo = Math.hypot(x, y) || 1;
    salida.f1[i] = fuerza;
    salida.ux1[i] = x / largo;
    salida.uy1[i] = y / largo;

    let p2 = -1;
    for (let d = 0; d < direcciones; d += 1) {
      if (distanciaCircular(d, p1, direcciones) < 3) continue;
      const esPico = s[d] >= s[(d + direcciones - 1) % direcciones] && s[d] >= s[(d + 1) % direcciones];
      if (esPico && s[d] > 0 && (p2 < 0 || s[d] > s[p2])) p2 = d;
    }
    if (p2 < 0) continue;
    x = 0;
    y = 0;
    fuerza = 0;
    for (const d of ventana(p2)) {
      if (propia.includes(d)) continue;
      x += v[d] * coseno[d];
      y += v[d] * seno[d];
      fuerza += v[d];
    }
    const largo2 = Math.hypot(x, y) || 1;
    salida.f2[i] = fuerza;
    salida.relacion[i] = s[p2] / s[p1];
    salida.ux2[i] = x / largo2;
    salida.uy2[i] = y / largo2;
  }
  return salida;
}

/** Velocidad del balón por celda, en m/s: distancia entre tiempo, ambos suavizados. */
function velocidadPorCelda(equipo: EquipoFlujo, liga: LigaFlujo): Float32Array {
  const { cols, filas } = liga;
  const celdas = cols * filas;
  const porPartido = 1 / Math.max(1, equipo.partidos);
  const recorrido = desenfocar(Float32Array.from({ length: celdas }, (_, i) => (equipo.recorrido[i] ?? 0) * porPartido), cols, filas, 1.5);
  const tiempo = desenfocar(Float32Array.from({ length: celdas }, (_, i) => (equipo.tiempo[i] ?? 0) * porPartido), cols, filas, 1.5);
  const salida = new Float32Array(celdas);
  for (let i = 0; i < celdas; i += 1) {
    // Menos de un metro por partido en la zona no da para medir nada.
    salida[i] = recorrido[i] >= 1 && tiempo[i] > 0 ? (recorrido[i] / tiempo[i]) * METROS_POR_UNIDAD : Number.NaN;
  }
  return salida;
}

/**
 * Las corrientes de todos los equipos de la liga, en una sola escala.
 *
 * `detalle` baja el umbral de lo que cuenta como ruta (del percentil 80 de
 * las celdas de la liga al 40) y deja pasar segundas corrientes menos
 * parejas (de exigir que la segunda pese el 85 % de la primera a un 35 %).
 * `ancho` abre el suavizado: canales estrechos por defecto, que es lo que
 * deja ver ríos y no manchas.
 */
export function camposDeLiga(liga: LigaFlujo, ajustes: AjustesFlujo = AJUSTES_INICIALES): { campos: Map<number, CampoFlujo>; escala: EscalaFlujo } {
  const { cols, filas } = liga;
  const celdas = cols * filas;
  const detalle = acotar(ajustes.detalle);
  const sigma = 0.55 + acotar(ajustes.ancho) * 1.6;
  const brutos = liga.equipos.map((equipo) => corrientesEnBruto(equipo, liga, sigma));

  // La escala: qué fuerza es "ruta" y cuál es "ruta principal", contra todas
  // las celdas con balón de todos los equipos.
  const todas: number[] = [];
  for (const bruto of brutos) for (const f of bruto.f1) if (f > 0) todas.push(f);
  const ordenadas = Float32Array.from(todas).sort();
  const umbral = cuantil(ordenadas, 0.8 - 0.4 * detalle);
  const tope = Math.max(umbral * 1.0001, cuantil(ordenadas, 0.985));
  const relacionMinima = 0.85 - 0.5 * detalle;
  // Con una curva suave arriba: lineal, casi toda la cancha quedaba en el
  // primer cuarto de la escala y solo se veían las dos o tres rutas mayores.
  const escalar = (f: number) => acotar((f - umbral) / (tope - umbral)) ** 0.8;

  const intensidades = brutos.map((bruto) => {
    const intensidad = new Float32Array(celdas);
    for (let i = 0; i < celdas; i += 1) {
      const segunda = bruto.relacion[i] >= relacionMinima ? escalar(bruto.f2[i]) : 0;
      intensidad[i] = Math.max(escalar(bruto.f1[i]), segunda);
    }
    return intensidad;
  });

  // La velocidad, como posición entre las zonas con ruta de toda la liga.
  const velocidades = liga.equipos.map((equipo) => velocidadPorCelda(equipo, liga));
  const conRuta: number[] = [];
  velocidades.forEach((velocidad, k) => {
    for (let i = 0; i < celdas; i += 1) if (intensidades[k][i] > 0 && Number.isFinite(velocidad[i])) conRuta.push(velocidad[i]);
  });
  const velocidadesOrdenadas = Float32Array.from(conRuta).sort();

  const pesos = intensidades.map((intensidad) => {
    let peso = 0;
    for (const valor of intensidad) peso += valor * valor;
    return peso;
  });
  const pesoMaximo = Math.max(...pesos, 1e-9);

  const campos = new Map<number, CampoFlujo>();
  liga.equipos.forEach((equipo, k) => {
    const bruto = brutos[k];
    const principal: Corriente = { ux: bruto.ux1, uy: bruto.uy1, fuerza: new Float32Array(celdas) };
    const segunda: Corriente = { ux: bruto.ux2, uy: bruto.uy2, fuerza: new Float32Array(celdas) };
    const rapidez = new Float32Array(celdas);
    const metros = new Float32Array(celdas);
    for (let i = 0; i < celdas; i += 1) {
      principal.fuerza[i] = escalar(bruto.f1[i]);
      segunda.fuerza[i] = bruto.relacion[i] >= relacionMinima ? escalar(bruto.f2[i]) : 0;
      rapidez[i] = Number.isFinite(velocidades[k][i]) ? posicionEn(velocidadesOrdenadas, velocidades[k][i]) : 0.5;
      metros[i] = bruto.f1[i] * METROS_POR_UNIDAD;
    }
    campos.set(equipo.equipo, {
      equipo: equipo.equipo,
      nombre: equipo.nombre,
      cols,
      filas,
      celda: liga.celda,
      corrientes: [principal, segunda],
      intensidad: intensidades[k],
      rapidez,
      velocidad: velocidades[k],
      metros,
      particulas: Math.round((PARTICULAS_MAXIMAS * pesos[k]) / pesoMaximo),
    });
  });

  return {
    campos,
    escala: {
      velocidades: [cuantil(velocidadesOrdenadas, 0.1), cuantil(velocidadesOrdenadas, 0.5), cuantil(velocidadesOrdenadas, 0.9)],
      metros: [umbral, (umbral + tope) / 2, tope].map((valor) => valor * METROS_POR_UNIDAD) as [number, number, number],
    },
  };
}

// ---- El promedio de cada equipo ------------------------------------------------

export type ResumenFlujo = {
  equipo: number;
  nombre: string;
  partidos: number;
  /** Metros que recorre el balón por partido en sus pases y conducciones. */
  metros: number;
  /** Reparto de ese recorrido por carril: izquierdo, central y derecho, según ataca el equipo. */
  carriles: [number, number, number];
  /** Parte del recorrido hacia delante (±56° de la portería rival) y hacia atrás. */
  adelante: number;
  atras: number;
  /** Velocidad del balón en m/s por tercio: salida, medio campo y último tercio. */
  velocidad: [number, number, number];
  /** Velocidad del balón en toda la cancha, en m/s. */
  velocidadMedia: number;
};

/**
 * El promedio de cada equipo en su temporada, sin suavizar y sin escala:
 * cuánto balón mueve por partido, por qué carril, hacia dónde y a qué ritmo
 * en cada tercio. Es la versión en números de lo que dibuja el mapa.
 */
export function resumenesDeLiga(liga: LigaFlujo): ResumenFlujo[] {
  const { cols, filas, direcciones, celda } = liga;
  const ancho = filas * celda;
  const largo = cols * celda;
  const sentido = Array.from({ length: direcciones }, (_, d) => Math.cos((d * 2 * Math.PI) / direcciones));
  // Con 16 sectores, los cinco centrados en la portería rival (0°, ±22,5°, ±45°).
  const limite = Math.cos(Math.PI / 4) - 1e-6;
  return liga.equipos.map((equipo) => {
    const partidos = Math.max(1, equipo.partidos);
    let total = 0;
    let adelante = 0;
    let atras = 0;
    const carriles: [number, number, number] = [0, 0, 0];
    const recorrido = [0, 0, 0];
    const tiempo = [0, 0, 0];
    for (let f = 0; f < filas; f += 1) {
      const carril = Math.min(2, Math.floor((((f + 0.5) * celda) / ancho) * 3));
      for (let c = 0; c < cols; c += 1) {
        const i = f * cols + c;
        const tercio = Math.min(2, Math.floor((((c + 0.5) * celda) / largo) * 3));
        recorrido[tercio] += equipo.recorrido[i] ?? 0;
        tiempo[tercio] += equipo.tiempo[i] ?? 0;
        for (let d = 0; d < direcciones; d += 1) {
          const valor = equipo.flujo[i * direcciones + d] ?? 0;
          if (!valor) continue;
          total += valor;
          carriles[carril] += valor;
          if (sentido[d] >= limite) adelante += valor;
          else if (sentido[d] <= -limite) atras += valor;
        }
      }
    }
    const parte = (valor: number) => (total ? valor / total : 0);
    const velocidad = (r: number, t: number) => (t > 0 ? (r / t) * METROS_POR_UNIDAD : Number.NaN);
    return {
      equipo: equipo.equipo,
      nombre: equipo.nombre,
      partidos: equipo.partidos,
      metros: (total / partidos) * METROS_POR_UNIDAD,
      carriles: carriles.map(parte) as [number, number, number],
      adelante: parte(adelante),
      atras: parte(atras),
      velocidad: [0, 1, 2].map((k) => velocidad(recorrido[k], tiempo[k])) as [number, number, number],
      velocidadMedia: velocidad(recorrido[0] + recorrido[1] + recorrido[2], tiempo[0] + tiempo[1] + tiempo[2]),
    };
  });
}

/** La media de la liga de cada cifra del resumen: la referencia contra la que se lee cada equipo. */
export function mediaDeLiga(resumenes: ResumenFlujo[]) {
  const media = (valores: number[]) => {
    const validos = valores.filter(Number.isFinite);
    return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : Number.NaN;
  };
  return {
    metros: media(resumenes.map((r) => r.metros)),
    carriles: [0, 1, 2].map((k) => media(resumenes.map((r) => r.carriles[k]))) as [number, number, number],
    adelante: media(resumenes.map((r) => r.adelante)),
    atras: media(resumenes.map((r) => r.atras)),
    velocidad: [0, 1, 2].map((k) => media(resumenes.map((r) => r.velocidad[k]))) as [number, number, number],
    velocidadMedia: media(resumenes.map((r) => r.velocidadMedia)),
  };
}
