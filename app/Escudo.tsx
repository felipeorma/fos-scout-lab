"use client";

import { useEffect, useState } from "react";
import { fetchLogo } from "@/lib/remoteData";

/**
 * El escudo de un club, de API-Football (ver /api/logos en el puente).
 *
 * Se pide una vez por equipo en la sesión y, como mucho, cuatro a la vez: una
 * lista de cuarenta filas no puede lanzar cuarenta peticiones de golpe. Si el
 * puente dice que no hay clave, se deja de preguntar hasta recargar.
 */

const guardados = new Map<string, string | null>();
const enCamino = new Map<string, Promise<string | null>>();
const cola: Array<() => void> = [];
let activas = 0;
let sinClave = false;

function turno<T>(tarea: () => Promise<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const lanzar = () => {
      activas += 1;
      tarea().then(resolver, rechazar).finally(() => {
        activas -= 1;
        cola.shift()?.();
      });
    };
    if (activas < 4) lanzar(); else cola.push(lanzar);
  });
}

function pedirLogo(equipo: string, liga: string) {
  const clave = `${equipo}|${liga}`;
  let promesa = enCamino.get(clave);
  if (!promesa) {
    // Lo que ya esperaba turno cuando llegó el "sin clave" no sale.
    promesa = turno(() => (sinClave ? Promise.resolve({ logo: null, estado: "sin-clave" }) : fetchLogo(equipo, liga)))
      .then((respuesta) => {
        // Sin clave o con la clave mala, igual: no se pregunta más hasta recargar.
        if (respuesta.estado === "sin-clave" || respuesta.estado === "clave-invalida") sinClave = true;
        guardados.set(clave, respuesta.logo ?? null);
        return respuesta.logo ?? null;
      })
      .catch(() => null)
      .finally(() => enCamino.delete(clave));
    enCamino.set(clave, promesa);
  }
  return promesa;
}

export function useEscudo(equipo: string, liga = ""): string | null {
  const clave = `${equipo}|${liga}`;
  // Solo se guarda lo que llega de la red; lo ya pedido se lee del caché.
  const [llegado, setLlegado] = useState<{ clave: string; logo: string | null } | null>(null);
  useEffect(() => {
    if (!equipo || guardados.has(clave) || sinClave) return;
    let vivo = true;
    void pedirLogo(equipo, liga).then((logo) => { if (vivo) setLlegado({ clave, logo }); });
    return () => { vivo = false; };
  }, [clave, equipo, liga]);
  if (!equipo) return null;
  return guardados.get(clave) ?? (llegado?.clave === clave ? llegado.logo : null);
}

/**
 * El escudo, o nada. Con `respaldo`, si no hay escudo sale un círculo con las
 * iniciales: para las cabeceras, donde un hueco se nota. En las listas, mejor
 * nada que cuarenta círculos iguales.
 */
export function Escudo({ equipo, liga = "", tamano = 18, respaldo = false, className = "" }: {
  equipo: string;
  liga?: string;
  tamano?: number;
  respaldo?: boolean;
  className?: string;
}) {
  const logo = useEscudo(equipo, liga);
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`escudo ${className}`.trim()} src={logo} width={tamano} height={tamano} style={{ width: tamano, height: tamano }} alt="" loading="lazy" />;
  }
  if (!respaldo || !equipo) return null;
  const iniciales = equipo.replace(/\b(FC|CF|SC|AFC|CD|FK|IF|BK|IK)\b/gi, "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`escudo escudo-vacio ${className}`.trim()} style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.42) }} aria-hidden="true">{iniciales}</span>;
}
