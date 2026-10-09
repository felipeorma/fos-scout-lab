"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMercadoDeLiga, fetchMercadoPorNombre } from "@/lib/remoteData";
import { indiceDeMercado, type JugadorDeMercado } from "@/lib/mercado";

/**
 * Valor y contrato de Transfermarkt para las filas de una lista.
 *
 * Las ligas se piden de una en una y solo cuando hace falta (al usar un
 * filtro de mercado): cada una es un minuto de llamadas la primera vez. Lo
 * bajado vale para toda la sesión y para cualquier pantalla. Después, a los
 * que no salieron en la plantilla de su club —se fueron a mitad de
 * temporada— se les busca por nombre, en tandas.
 */

type EstadoDeLiga = { estado: "cargando" | "lista" | "error" | "sin-cobertura"; jugadores: JugadorDeMercado[] };

const ligas = new Map<string, EstadoDeLiga>();
// clave "nombre|nacimiento" → lo encontrado por nombre (null: no está).
const buscados = new Map<string, JugadorDeMercado | null>();
const oyentes = new Set<() => void>();
const avisar = () => { for (const oyente of oyentes) oyente(); };
let cola: Promise<unknown> = Promise.resolve();
let buscando = false;

const TANDA = 25;
const sinTildes = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const claveDeBusqueda = (nombre: string, nacimiento: string) => `${sinTildes(nombre)}|${nacimiento}`;
const soloFecha = (valor: unknown) => String(valor ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";

function pedirLiga(liga: string) {
  if (!liga || ligas.has(liga)) return;
  ligas.set(liga, { estado: "cargando", jugadores: [] });
  // En fila: dos ligas a la vez no van más rápido y son el doble de llamadas seguidas a Transfermarkt.
  cola = cola.then(() => fetchMercadoDeLiga(liga)
    .then((respuesta) => { ligas.set(liga, { estado: respuesta.estado === "sin-cobertura" ? "sin-cobertura" : "lista", jugadores: respuesta.jugadores }); })
    .catch(() => { ligas.set(liga, { estado: "error", jugadores: [] }); })
    .finally(avisar));
}

export type FilaDeMercado = { indice: number; nombre: string; nacimiento: unknown; ligas: string[] };

export function useMercado(activo: boolean, filas: FilaDeMercado[]) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const oyente = () => setVersion((v) => v + 1);
    oyentes.add(oyente);
    return () => { oyentes.delete(oyente); };
  }, []);

  const ligasPedidas = useMemo(() => [...new Set(filas.flatMap((fila) => fila.ligas))].filter(Boolean).sort(), [filas]);
  useEffect(() => {
    if (!activo) return;
    for (const liga of ligasPedidas) pedirLiga(liga);
    avisar();
  }, [activo, ligasPedidas]);

  const indice = useMemo(() => {
    const todos = [...ligas.values()].flatMap((liga) => liga.jugadores);
    return indiceDeMercado(todos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const dato = (fila: FilaDeMercado): JugadorDeMercado | null => {
    const deLiga = indice.buscar(fila.nombre, fila.nacimiento);
    if (deLiga) return deLiga;
    const fecha = soloFecha(fila.nacimiento);
    return fecha ? buscados.get(claveDeBusqueda(fila.nombre, fecha)) ?? null : null;
  };

  const cargando = ligasPedidas.filter((liga) => ligas.get(liga)?.estado === "cargando");
  // Con las ligas ya bajadas, los que siguen sin dato y tienen fecha se buscan por nombre.
  useEffect(() => {
    if (!activo || cargando.length || buscando) return;
    const pendientes = filas
      .filter((fila) => fila.ligas.some((liga) => ligas.get(liga)?.estado === "lista"))
      .map((fila) => ({ nombre: fila.nombre, nacimiento: soloFecha(fila.nacimiento) }))
      .filter((fila) => fila.nacimiento && !indice.buscar(fila.nombre, fila.nacimiento) && !buscados.has(claveDeBusqueda(fila.nombre, fila.nacimiento)));
    if (!pendientes.length) return;
    buscando = true;
    const tanda = pendientes.slice(0, TANDA);
    fetchMercadoPorNombre(tanda)
      .then((hallados) => { for (const fila of tanda) { const clave = claveDeBusqueda(fila.nombre, fila.nacimiento); buscados.set(clave, hallados[clave] ?? null); } })
      // Si falla, se marcan como no encontrados para no reintentar en bucle esta sesión.
      .catch(() => { for (const fila of tanda) buscados.set(claveDeBusqueda(fila.nombre, fila.nacimiento), null); })
      .finally(() => { buscando = false; avisar(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, cargando.length, filas, version]);

  const porBuscar = activo && !cargando.length
    ? filas.filter((fila) => { const fecha = soloFecha(fila.nacimiento); return fecha && fila.ligas.some((liga) => ligas.get(liga)?.estado === "lista") && !indice.buscar(fila.nombre, fila.nacimiento) && !buscados.has(claveDeBusqueda(fila.nombre, fecha)); }).length
    : 0;

  return {
    dato,
    /** Las ligas que aún se están bajando, y cuántas se pidieron. */
    cargando, total: ligasPedidas.length,
    /** Jugadores que aún se están buscando por nombre. */
    porBuscar,
    sinCobertura: ligasPedidas.filter((liga) => ligas.get(liga)?.estado === "sin-cobertura"),
    conError: ligasPedidas.filter((liga) => ligas.get(liga)?.estado === "error"),
  };
}
