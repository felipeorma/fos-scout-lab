import type { TemporadaDeJugador } from "./scouting.ts";
import { anioDeInicio } from "./temporadas.ts";
import { aTemporadaDeJugador, type TemporadaAMano } from "./temporadasAMano.ts";

export type TemporadaEnFicha = TemporadaDeJugador & { aMano?: TemporadaAMano };

export type OpcionDeTemporada = { clave: string; temporada: TemporadaEnFicha };

/**
 * Las etapas visibles y los años que realmente aportan métricas al informe.
 * La selección es acumulativa: cada base o fila manual tiene su propia clave.
 * Las filas manuales del año actual siguen visibles aunque no se elija ningún
 * año anterior, y nunca añaden años al cruce de métricas.
 */
export function temporadasDeFicha(
  referencia: TemporadaDeJugador | null,
  bases: TemporadaDeJugador[],
  manuales: TemporadaAMano[],
  seleccion?: string[],
): {
  opciones: OpcionDeTemporada[];
  seleccion: string[];
  anteriores: TemporadaEnFicha[];
  otrasLigasActuales: TemporadaEnFicha[];
  adicionales: TemporadaEnFicha[];
  anios: number[];
} {
  if (!referencia) return { opciones: [], seleccion: [], anteriores: [], otrasLigasActuales: [], adicionales: [], anios: [] };

  const inicio = anioDeInicio(referencia.etiqueta);
  const esAnterior = (etiqueta: string) => {
    const anio = anioDeInicio(etiqueta);
    return inicio > 0 && anio > 0 && anio < inicio;
  };
  const porClave = new Map<string, OpcionDeTemporada>();
  const otrasBasesActuales = new Map<number, TemporadaDeJugador>();
  for (const temporada of bases) {
    const clave = `base:${temporada.anio}`;
    if (esAnterior(temporada.etiqueta) && !porClave.has(clave)) porClave.set(clave, { clave, temporada });
    // Una liga 2024 y otra 2024/2025 comparten el año inicial, pero el cruce
    // identifica sus bases como 2024 y 2025. Ambas tienen que entrar.
    if (inicio > 0 && anioDeInicio(temporada.etiqueta) === inicio && temporada.anio !== referencia.anio
      && !otrasBasesActuales.has(temporada.anio)) otrasBasesActuales.set(temporada.anio, temporada);
  }
  const manualesUnicas = [...new Map(manuales.map((temporada) => [temporada.id, temporada])).values()];
  for (const manual of manualesUnicas) {
    if (!esAnterior(manual.etiqueta)) continue;
    const clave = `mano:${manual.id}`;
    porClave.set(clave, { clave, temporada: aTemporadaDeJugador(manual) });
  }
  const opciones = [...porClave.values()].sort((a, b) =>
    anioDeInicio(b.temporada.etiqueta) - anioDeInicio(a.temporada.etiqueta)
    || Number(Boolean(a.temporada.aMano)) - Number(Boolean(b.temporada.aMano)));
  const predeterminada = opciones.find((opcion) => !opcion.temporada.aMano) ?? opciones[0];
  // Mantener las claves pendientes permite elegir un año antes de que termine
  // su descarga; solo las opciones ya disponibles producen filas o métricas.
  const claves = [...new Set(seleccion ?? (predeterminada ? [predeterminada.clave] : []))];
  const elegidas = new Set(claves);
  const anteriores = opciones.filter((opcion) => elegidas.has(opcion.clave)).map((opcion) => opcion.temporada);
  const otrasLigasActuales: TemporadaEnFicha[] = [
    ...otrasBasesActuales.values(),
    ...manualesUnicas.filter((temporada) => inicio > 0 && anioDeInicio(temporada.etiqueta) === inicio).map(aTemporadaDeJugador),
  ];
  return {
    opciones,
    seleccion: claves,
    anteriores,
    otrasLigasActuales,
    adicionales: [...otrasLigasActuales, ...anteriores],
    anios: [...new Set([
      referencia.anio,
      ...otrasBasesActuales.keys(),
      ...anteriores.filter((temporada) => !temporada.aMano).map((temporada) => temporada.anio),
    ])],
  };
}
