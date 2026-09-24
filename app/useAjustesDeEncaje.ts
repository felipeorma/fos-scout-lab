"use client";

import { useEffect, useState } from "react";
import { peerCohort } from "@/lib/scouting";

/**
 * Qué necesita cada puesto de cada equipo: las dimensiones que el scout
 * quiere reforzar ("este año los extremos no centran"). Se guardan por equipo
 * y grupo de posición en el navegador, y los leen el encaje de la ficha
 * ampliada y la columna de Ranking y Entre ligas: se marca una vez y vale en
 * todas partes.
 */

const CLAVE = "fos-encaje-ajustes-v1";
type Ajustes = Record<string, string[]>;

let ajustes: Ajustes = {};
let leidos = false;
const oyentes = new Set<() => void>();

function leer() {
  if (leidos) return;
  leidos = true;
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado) ajustes = JSON.parse(guardado) as Ajustes;
  } catch { /* Sin almacenamiento, los ajustes viven solo en esta sesión. */ }
}

// Por el grupo de referencia y no por la lente: "extremos directos" y
// "extremos" son el mismo puesto del equipo, y el ajuste marcado en la ficha
// de uno tiene que valer en el Ranking del otro.
const claveDe = (equipo: string, cohorte: string) => `${equipo.trim().toLowerCase()}|${peerCohort(cohorte)}`;

export function refuerzosDe(equipo: string, cohorte: string): string[] {
  leer();
  return ajustes[claveDe(equipo, cohorte)] ?? [];
}

export function guardarRefuerzos(equipo: string, cohorte: string, refuerzos: string[]) {
  leer();
  const clave = claveDe(equipo, cohorte);
  if (refuerzos.length) ajustes = { ...ajustes, [clave]: refuerzos };
  else { const { [clave]: _fuera, ...resto } = ajustes; void _fuera; ajustes = resto; }
  try { window.localStorage.setItem(CLAVE, JSON.stringify(ajustes)); } catch { /* Solo en esta sesión. */ }
  for (const oyente of oyentes) oyente();
}

/** Una versión que cambia cada vez que se toca un ajuste: para recalcular lo que depende de ellos. */
export function useVersionDeAjustes() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const oyente = () => setVersion((v) => v + 1);
    oyentes.add(oyente);
    return () => { oyentes.delete(oyente); };
  }, []);
  return version;
}

/** Los refuerzos de un equipo y puesto, y cómo cambiarlos. */
export function useRefuerzos(equipo: string, cohorte: string) {
  useVersionDeAjustes();
  const refuerzos = equipo ? refuerzosDe(equipo, cohorte) : [];
  const alternar = (id: string) => guardarRefuerzos(equipo, cohorte,
    refuerzos.includes(id) ? refuerzos.filter((x) => x !== id) : [...refuerzos, id]);
  const limpiar = () => guardarRefuerzos(equipo, cohorte, []);
  return { refuerzos, alternar, limpiar };
}
