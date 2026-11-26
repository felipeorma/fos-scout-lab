"use client";

import { useEffect, useState } from "react";
import { ESTADO_VACIO, leerEstado, type EstadoDeSeguimiento } from "@/lib/seguimiento";

/**
 * Las listas de seguimiento, una sola vez para toda la plataforma: la barra
 * del jugador, el Ranking y la página de seguimiento leen y escriben el mismo
 * estado. Se guarda en este navegador; para llevarlo a otro ordenador, la
 * página exporta e importa una copia.
 */
const CLAVE = "fos-seguimiento-v1";
let estado: EstadoDeSeguimiento = ESTADO_VACIO;
let leido = false;
const oyentes = new Set<(nuevo: EstadoDeSeguimiento) => void>();

function leer() {
  if (leido || typeof window === "undefined") return;
  leido = true;
  try {
    estado = leerEstado(JSON.parse(window.localStorage.getItem(CLAVE) ?? "null")) ?? ESTADO_VACIO;
  } catch { /* sin nada guardado */ }
}

/** Cambia el estado de todos y lo guarda. */
export function cambiarSeguimiento(cambio: (actual: EstadoDeSeguimiento) => EstadoDeSeguimiento) {
  leer();
  estado = cambio(estado);
  try { window.localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* sigue en esta sesión */ }
  for (const oyente of oyentes) oyente(estado);
}

export function useSeguimiento() {
  const [actual, setActual] = useState<EstadoDeSeguimiento>(ESTADO_VACIO);
  useEffect(() => {
    leer();
    oyentes.add(setActual);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActual(estado);
    // Otra pestaña del navegador cambió las listas: se recogen.
    const deOtraPestana = (evento: StorageEvent) => {
      if (evento.key !== CLAVE) return;
      estado = leerEstado(JSON.parse(evento.newValue ?? "null")) ?? ESTADO_VACIO;
      for (const oyente of oyentes) oyente(estado);
    };
    window.addEventListener("storage", deOtraPestana);
    return () => { oyentes.delete(setActual); window.removeEventListener("storage", deOtraPestana); };
  }, []);
  return actual;
}
