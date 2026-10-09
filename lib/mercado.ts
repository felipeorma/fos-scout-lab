/**
 * Valor de mercado y fin de contrato, de Transfermarkt, para toda una lista.
 *
 * La ficha ya los traía de uno en uno. Para filtrar un ranking hacen falta
 * los de todos: el puente baja la liga entera (ver /api/transfermarkt/liga)
 * y aquí se empareja cada jugador de la base con el suyo.
 *
 * Se empareja por fecha de nacimiento más alguna palabra del nombre en
 * común. El nombre solo no sirve: StatsBomb da el de registro ("Roberto
 * Carlos Lopes") y Transfermarkt el de uso ("Roberto Lopes"). La fecha sola
 * tampoco: en una liga hay varios nacidos el mismo día. Las dos juntas casi
 * no fallan, y si una base no trae fecha se cae al nombre exacto, que solo
 * vale si es único.
 */

export type JugadorDeMercado = {
  id: string;
  nombre: string;
  /** ISO (AAAA-MM-DD), o null si Transfermarkt no la sabe. */
  nacimiento: string | null;
  club: string;
  /** En euros; null es "sin valor publicado", no cero. */
  valor: number | null;
  /** ISO; null si no consta. */
  contrato: string | null;
};

export type FiltroDeMercado = {
  /** Tope de valor en euros; 0 no filtra. */
  valorMax: number;
  /** Contrato que acaba ese día o antes (ISO); vacío no filtra. */
  contratoHasta: string;
};

export const SIN_FILTRO_DE_MERCADO: FiltroDeMercado = { valorMax: 0, contratoHasta: "" };

const palabras = (nombre: string) => nombre
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter((palabra) => palabra.length >= 2);

const soloFecha = (valor: unknown) => String(valor ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";

/** Cuántas palabras comparten dos nombres; el apellido final cuenta doble. */
function parecido(a: string[], b: string[]) {
  const enB = new Set(b);
  const comunes = a.filter((palabra) => palabra.length >= 3 && enB.has(palabra)).length;
  return comunes + (comunes && a[a.length - 1] === b[b.length - 1] ? 1 : 0);
}

/** Prepara la búsqueda sobre los jugadores bajados de Transfermarkt. */
export function indiceDeMercado(jugadores: JugadorDeMercado[]) {
  const porFecha = new Map<string, JugadorDeMercado[]>();
  const porNombre = new Map<string, JugadorDeMercado[]>();
  const vistos = new Set<string>();
  for (const jugador of jugadores) {
    // Un cedido sale en dos plantillas: con una vez basta.
    if (vistos.has(jugador.id)) continue;
    vistos.add(jugador.id);
    if (jugador.nacimiento) porFecha.set(jugador.nacimiento, [...(porFecha.get(jugador.nacimiento) ?? []), jugador]);
    const clave = palabras(jugador.nombre).join(" ");
    if (clave) porNombre.set(clave, [...(porNombre.get(clave) ?? []), jugador]);
  }

  return {
    cuantos: vistos.size,
    /** El jugador de Transfermarkt que corresponde a uno de la base, o null. */
    buscar(nombre: string, nacimiento: unknown): JugadorDeMercado | null {
      const suyas = palabras(nombre);
      if (!suyas.length) return null;
      const fecha = soloFecha(nacimiento);
      if (fecha) {
        let mejor: JugadorDeMercado | null = null;
        let puntos = 0;
        for (const candidato of porFecha.get(fecha) ?? []) {
          const p = parecido(suyas, palabras(candidato.nombre));
          if (p > puntos) { mejor = candidato; puntos = p; }
        }
        return mejor;
      }
      const iguales = porNombre.get(suyas.join(" ")) ?? [];
      return iguales.length === 1 ? iguales[0] : null;
    },
  };
}

export type IndiceDeMercado = ReturnType<typeof indiceDeMercado>;

/**
 * ¿Pasa los filtros? Sin dato no pasa: con un tope de valor puesto, dejar
 * entrar a quien no se sabe cuánto vale sería contestar otra pregunta.
 */
export function pasaMercado(dato: JugadorDeMercado | null, filtro: FiltroDeMercado): boolean {
  if (filtro.valorMax > 0 && !(dato?.valor != null && dato.valor <= filtro.valorMax)) return false;
  if (filtro.contratoHasta && !(dato?.contrato && dato.contrato <= filtro.contratoHasta)) return false;
  return true;
}

/** 150000 → "€150K"; 1250000 → "€1,25M" (o "€1.25M" según el idioma). */
export function valorCorto(valor: number | null | undefined, locale = "es"): string {
  if (valor == null || !Number.isFinite(valor)) return "";
  const numero = (n: number, decimales: number) => n.toLocaleString(locale, { maximumFractionDigits: decimales });
  if (valor >= 1_000_000) return `€${numero(valor / 1_000_000, 2)}M`;
  if (valor >= 1_000) return `€${numero(valor / 1_000, 0)}K`;
  return `€${numero(valor, 0)}`;
}

/** "2026-12-31" → "12/2026". */
export function contratoCorto(contrato: string | null | undefined): string {
  const partes = soloFecha(contrato).split("-");
  return partes.length === 3 ? `${partes[1]}/${partes[0]}` : "";
}

/**
 * Los cortes de contrato que se ofrecen: los próximos cinco finales de
 * ventana (30 de junio y 31 de diciembre), que es cuando acaban los contratos.
 */
export function cortesDeContrato(hoy: Date, cuantos = 5): string[] {
  const cortes: string[] = [];
  let anio = hoy.getFullYear();
  let mitad = hoy.getMonth() < 6 ? 0 : 1;
  while (cortes.length < cuantos) {
    cortes.push(mitad === 0 ? `${anio}-06-30` : `${anio}-12-31`);
    if (mitad === 1) anio += 1;
    mitad = 1 - mitad;
  }
  return cortes;
}
