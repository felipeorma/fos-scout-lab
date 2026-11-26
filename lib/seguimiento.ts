/**
 * Listas de seguimiento: los jugadores que se están siguiendo, con su nota.
 *
 * Funciones puras sobre un estado que la app guarda en el navegador (y se
 * puede exportar e importar para llevarlo a otro ordenador). Un jugador se
 * identifica por nombre y nacimiento, como en el resto de la plataforma; puede
 * estar en varias listas a la vez ("Laterales", "Para enero").
 */

export type EntradaDeSeguimiento = {
  /** "Nombre|nacimiento". */
  clave: string;
  nombre: string;
  equipo: string;
  posicion: string;
  edad: string;
  ligas: string[];
  /** Con qué se le midió al añadirle: "Temporada 2026", "Media de 2025 + 2026". */
  periodo: string;
  /** Su índice entonces, para ver si se mueve. */
  indice: number | null;
  nota: string;
  lista: string;
  /** Cuándo se añadió (ms). */
  anadido: number;
};

export type EstadoDeSeguimiento = { version: 1; listas: string[]; entradas: EntradaDeSeguimiento[] };

export const LISTA_POR_DEFECTO = "Seguimiento";
export const ESTADO_VACIO: EstadoDeSeguimiento = { version: 1, listas: [LISTA_POR_DEFECTO], entradas: [] };

const limpio = (texto: string) => texto.trim().replace(/\s+/g, " ");

/** Añade (o actualiza, si ya está en esa lista) a un jugador. Conserva su nota y cuándo se añadió. */
export function seguir(estado: EstadoDeSeguimiento, entrada: Omit<EntradaDeSeguimiento, "nota" | "anadido" | "lista"> & { lista?: string; nota?: string }, ahora = Date.now()): EstadoDeSeguimiento {
  const lista = limpio(entrada.lista ?? LISTA_POR_DEFECTO) || LISTA_POR_DEFECTO;
  const previa = estado.entradas.find((e) => e.clave === entrada.clave && e.lista === lista);
  const nueva: EntradaDeSeguimiento = { ...entrada, lista, nota: entrada.nota ?? previa?.nota ?? "", anadido: previa?.anadido ?? ahora };
  return {
    ...estado,
    listas: estado.listas.includes(lista) ? estado.listas : [...estado.listas, lista],
    entradas: previa ? estado.entradas.map((e) => (e === previa ? nueva : e)) : [...estado.entradas, nueva],
  };
}

/** Lo quita de una lista, o de todas si no se dice cuál. */
export function dejarDeSeguir(estado: EstadoDeSeguimiento, clave: string, lista?: string): EstadoDeSeguimiento {
  return { ...estado, entradas: estado.entradas.filter((e) => !(e.clave === clave && (lista === undefined || e.lista === lista))) };
}

export const sigue = (estado: EstadoDeSeguimiento, clave: string) => estado.entradas.some((e) => e.clave === clave);

export function anotar(estado: EstadoDeSeguimiento, clave: string, lista: string, nota: string): EstadoDeSeguimiento {
  return { ...estado, entradas: estado.entradas.map((e) => (e.clave === clave && e.lista === lista ? { ...e, nota } : e)) };
}

/** Lo pasa a otra lista; si ya estaba allí, se queda la entrada de allí con la nota más larga. */
export function mover(estado: EstadoDeSeguimiento, clave: string, de: string, a: string): EstadoDeSeguimiento {
  const destino = limpio(a);
  if (!destino || destino === de) return estado;
  const origen = estado.entradas.find((e) => e.clave === clave && e.lista === de);
  if (!origen) return estado;
  const yaEsta = estado.entradas.find((e) => e.clave === clave && e.lista === destino);
  const sinOrigen = estado.entradas.filter((e) => e !== origen);
  const entradas = yaEsta
    ? sinOrigen.map((e) => (e === yaEsta && origen.nota.length > yaEsta.nota.length ? { ...yaEsta, nota: origen.nota } : e))
    : [...sinOrigen, { ...origen, lista: destino }];
  return { ...estado, listas: estado.listas.includes(destino) ? estado.listas : [...estado.listas, destino], entradas };
}

export function crearLista(estado: EstadoDeSeguimiento, nombre: string): EstadoDeSeguimiento {
  const lista = limpio(nombre);
  return !lista || estado.listas.includes(lista) ? estado : { ...estado, listas: [...estado.listas, lista] };
}

export function renombrarLista(estado: EstadoDeSeguimiento, de: string, a: string): EstadoDeSeguimiento {
  const nombre = limpio(a);
  if (!nombre || nombre === de || !estado.listas.includes(de)) return estado;
  // Si el nombre nuevo ya existe, se juntan.
  let siguiente: EstadoDeSeguimiento = estado.listas.includes(nombre) ? estado : { ...estado, listas: estado.listas.map((l) => (l === de ? nombre : l)) };
  for (const entrada of estado.entradas.filter((e) => e.lista === de)) siguiente = mover(siguiente, entrada.clave, de, nombre);
  return { ...siguiente, listas: siguiente.listas.filter((l) => l !== de || l === nombre) };
}

/** Borra una lista y lo que tenga dentro. La por defecto no se borra: se vacía. */
export function borrarLista(estado: EstadoDeSeguimiento, lista: string): EstadoDeSeguimiento {
  const entradas = estado.entradas.filter((e) => e.lista !== lista);
  const listas = lista === LISTA_POR_DEFECTO ? estado.listas : estado.listas.filter((l) => l !== lista);
  return { ...estado, listas, entradas };
}

/**
 * Lee un estado guardado o importado sin fiarse de él: lo que no tenga forma
 * de entrada se descarta. Devuelve null si no es una copia de seguimiento.
 */
export function leerEstado(valor: unknown): EstadoDeSeguimiento | null {
  if (!valor || typeof valor !== "object") return null;
  const bruto = valor as { listas?: unknown; entradas?: unknown };
  if (!Array.isArray(bruto.entradas)) return null;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const entradas: EntradaDeSeguimiento[] = bruto.entradas.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const x = e as Record<string, unknown>;
    if (!texto(x.clave) || !texto(x.nombre)) return [];
    return [{
      clave: texto(x.clave), nombre: texto(x.nombre), equipo: texto(x.equipo), posicion: texto(x.posicion), edad: texto(x.edad),
      ligas: Array.isArray(x.ligas) ? x.ligas.filter((l): l is string => typeof l === "string") : [],
      periodo: texto(x.periodo), indice: typeof x.indice === "number" && Number.isFinite(x.indice) ? x.indice : null,
      nota: texto(x.nota), lista: limpio(texto(x.lista)) || LISTA_POR_DEFECTO,
      anadido: typeof x.anadido === "number" && Number.isFinite(x.anadido) ? x.anadido : 0,
    }];
  });
  const listas = [...new Set([
    LISTA_POR_DEFECTO,
    ...(Array.isArray(bruto.listas) ? bruto.listas.filter((l): l is string => typeof l === "string").map(limpio).filter(Boolean) : []),
    ...entradas.map((e) => e.lista),
  ])];
  return { version: 1, listas, entradas };
}

/** Junta una copia importada con lo que ya hay: lo de la copia manda en notas vacías, nunca borra. */
export function juntar(actual: EstadoDeSeguimiento, importado: EstadoDeSeguimiento): EstadoDeSeguimiento {
  let siguiente: EstadoDeSeguimiento = { ...actual, listas: [...new Set([...actual.listas, ...importado.listas])] };
  for (const entrada of importado.entradas) {
    const previa = siguiente.entradas.find((e) => e.clave === entrada.clave && e.lista === entrada.lista);
    if (!previa) siguiente = { ...siguiente, entradas: [...siguiente.entradas, entrada] };
    else if (!previa.nota && entrada.nota) siguiente = anotar(siguiente, entrada.clave, entrada.lista, entrada.nota);
  }
  return siguiente;
}
