/**
 * Las secuencias: un tramo de fases guardado sin nombres para soltarlo en
 * cualquier otro sistema.
 *
 * Un sistema es una pizarra entera: el campo, los dos equipos, cada fase. Una
 * secuencia es solo el movimiento de unas cuantas fichas —una salida de tres,
 * una pared con desmarque, un cambio de orientación— con los nombres y los
 * dorsales quitados. Al soltarla en otra pizarra, las fichas de cada equipo
 * más cercanas a donde empieza cada uno hacen ese papel: van a su sitio al
 * final de la fase actual y en las fases que se añaden detrás repiten las
 * carreras y los envíos. En espejo, lo mismo por la otra banda.
 */

import {
  CAMPO, agregarFase, fijarCarrera, fijarPase, limitar, nuevoId, pasesDe, pasoDe, posFinal, posar, posarBalon,
  type Equipo, type Fase, type Jugada, type Punto,
} from "./abp.ts";
import { esPortero } from "./medidas.ts";

export type FaseDeSecuencia = {
  nombre: string;
  nota: string;
  pausa: number;
  duracion: number;
  /** Dónde empieza cada papel de la secuencia, por su clave ("s1", "s2"…). */
  pos: Record<string, Punto>;
  balon: Punto;
  carreras: Array<{ clave: string; hasta: Punto; curva: number; paso: number }>;
  pases: Array<{ hasta: Punto; tipo: "aereo" | "raso"; paso: number }>;
};
export type Secuencia = {
  id: string;
  nombre: string;
  creada: number;
  /** Los papeles: de qué equipo es cada uno y si es el del portero (solo lo hace un portero). */
  papeles: Array<{ clave: string; equipo: Equipo; portero?: boolean }>;
  fases: FaseDeSecuencia[];
};

export const CLAVE_SECUENCIAS = "fos-scout-lab:secuencias";
export const MAX_SECUENCIAS = 40;

/**
 * Los que entran en una secuencia: los elegidos o, si no se elige a nadie,
 * los que se mueven en esas fases y los que dan o reciben un envío.
 */
export function quienesSeMueven(jugada: Jugada, desde: number, hasta: number): string[] {
  const ids = new Set<string>();
  for (const fase of jugada.fases.slice(desde, hasta + 1)) {
    for (const c of fase.carreras) ids.add(c.fichaId);
    let balon = fase.balon;
    for (const pase of pasesDe(fase)) {
      for (const f of jugada.fichas) {
        const p = posFinal(fase, f.id), q = fase.pos[f.id];
        if ([p, q].some((x) => x && (Math.hypot(x.x - balon.x, x.z - balon.z) < 2.5 || Math.hypot(x.x - pase.hasta.x, x.z - pase.hasta.z) < 2.5))) ids.add(f.id);
      }
      balon = pase.hasta;
    }
  }
  return jugada.fichas.map((f) => f.id).filter((id) => ids.has(id));
}

/** Guarda las fases `desde`–`hasta` como secuencia de `fichas` (por defecto, las que se mueven). */
export function secuenciaDe(jugada: Jugada, desde: number, hasta: number, nombre: string, fichas?: string[]): Secuencia | null {
  const a = Math.max(0, Math.min(desde, hasta)), b = Math.min(jugada.fases.length - 1, Math.max(desde, hasta));
  const ids = (fichas?.length ? fichas : quienesSeMueven(jugada, a, b)).filter((id) => jugada.fichas.some((f) => f.id === id));
  if (!ids.length) return null;
  const clave = new Map(ids.map((id, k) => [id, `s${k + 1}`]));
  const fases = jugada.fases.slice(a, b + 1).map((f): FaseDeSecuencia => ({
    nombre: f.nombre, nota: f.nota, pausa: f.pausa, duracion: f.duracion,
    pos: Object.fromEntries(ids.filter((id) => f.pos[id]).map((id) => [clave.get(id)!, { ...f.pos[id] }])),
    balon: { ...f.balon },
    carreras: f.carreras.filter((c) => clave.has(c.fichaId)).map((c) => ({ clave: clave.get(c.fichaId)!, hasta: { ...c.hasta }, curva: c.curva, paso: pasoDe(c) })),
    pases: pasesDe(f).map((p) => ({ hasta: { ...p.hasta }, tipo: p.tipo, paso: pasoDe(p) })),
  }));
  return {
    id: nuevoId("q"), nombre: nombre.trim().slice(0, 60) || "Secuencia", creada: Date.now(),
    papeles: ids.map((id) => {
      const ficha = jugada.fichas.find((f) => f.id === id)!;
      return { clave: clave.get(id)!, equipo: ficha.equipo, ...(esPortero(ficha.rol) ? { portero: true } : {}) };
    }),
    fases,
  };
}

/** Lo mismo por la otra banda: el ancho cambia de signo y las curvas, de lado. */
export function enEspejo(s: Secuencia): Secuencia {
  const p = (q: Punto): Punto => ({ x: q.x, z: -q.z });
  return {
    ...s,
    fases: s.fases.map((f) => ({
      ...f,
      pos: Object.fromEntries(Object.entries(f.pos).map(([k, q]) => [k, p(q)])),
      balon: p(f.balon),
      carreras: f.carreras.map((c) => ({ ...c, hasta: p(c.hasta), curva: -c.curva })),
      pases: f.pases.map((x) => ({ ...x, hasta: p(x.hasta) })),
    })),
  };
}

/**
 * A quién le toca cada papel: las parejas (papel, ficha del mismo equipo) de
 * menos a más distancia entre donde empieza el papel y donde está la ficha al
 * final de la fase actual, sin repetir ni papel ni ficha.
 */
export function repartirPapeles(s: Secuencia, fase: Fase, fichas: Jugada["fichas"]): Map<string, string> {
  const inicio = s.fases[0]?.pos ?? {};
  const parejas: Array<{ clave: string; id: string; d: number }> = [];
  for (const papel of s.papeles) {
    const desde = inicio[papel.clave];
    if (!desde) continue;
    for (const f of fichas) {
      // Un portero solo hace de portero, y el papel del portero solo lo hace un portero.
      if (f.equipo !== papel.equipo || esPortero(f.rol) !== Boolean(papel.portero)) continue;
      const p = posFinal(fase, f.id);
      if (p) parejas.push({ clave: papel.clave, id: f.id, d: Math.hypot(p.x - desde.x, p.z - desde.z) });
    }
  }
  parejas.sort((a, b) => a.d - b.d);
  const asignado = new Map<string, string>(), usadas = new Set<string>();
  for (const { clave, id } of parejas) {
    if (asignado.has(clave) || usadas.has(id)) continue;
    asignado.set(clave, id);
    usadas.add(id);
  }
  return asignado;
}

/**
 * Suelta una secuencia detrás de la fase `indice`: las fichas elegidas para
 * cada papel van a su sitio de salida al final de esa fase, y cada fase de la
 * secuencia se añade detrás con sus carreras y sus envíos.
 */
export function soltarSecuencia(jugada: Jugada, indice: number, secuencia: Secuencia, espejo = false): { jugada: Jugada; papeles: number } {
  const s = espejo ? enEspejo(secuencia) : secuencia;
  const actual = jugada.fases[indice];
  if (!actual || !s.fases.length) return { jugada, papeles: 0 };
  const papel = repartirPapeles(s, actual, jugada.fichas);
  if (!papel.size) return { jugada, papeles: 0 };
  let j = jugada, i = indice;
  for (const f of s.fases) {
    j = agregarFase(j, i, f.nombre);
    i += 1;
    j = { ...j, fases: j.fases.map((x, k) => (k === i ? { ...x, nota: f.nota, pausa: f.pausa, duracion: f.duracion } : x)) };
    // Cada papel, a su sitio al empezar esta fase: es el final de la anterior.
    for (const [clave, id] of papel) {
      const p = f.pos[clave];
      if (p) j = posar(j, i, id, limitar(p));
    }
    j = posarBalon(j, i, limitar(f.balon));
    for (const c of f.carreras) {
      const id = papel.get(c.clave);
      if (id) j = fijarCarrera(j, i, id, limitar(c.hasta), c.curva, c.paso);
    }
    for (const p of f.pases) j = fijarPase(j, i, limitar(p.hasta), p.tipo, p.paso);
  }
  return { jugada: j, papeles: papel.size };
}

/** Lo leído del navegador, sano; lo que no se entiende se descarta. */
export function secuenciasValidas(v: unknown): Secuencia[] {
  if (!Array.isArray(v)) return [];
  const punto = (q: unknown): Punto | null => {
    const p = q as Punto;
    return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? limitar({ x: p.x, z: p.z }) : null;
  };
  const salida: Secuencia[] = [];
  for (const bruta of v as Array<Record<string, unknown>>) {
    if (!bruta || typeof bruta.id !== "string" || !Array.isArray(bruta.papeles) || !Array.isArray(bruta.fases)) continue;
    const papeles = (bruta.papeles as Array<Record<string, unknown>>)
      .filter((p) => p && typeof p.clave === "string" && (p.equipo === "local" || p.equipo === "rival"))
      .map((p) => ({ clave: p.clave as string, equipo: p.equipo as Equipo, ...(p.portero === true ? { portero: true } : {}) }));
    const claves = new Set(papeles.map((p) => p.clave));
    const fases = (bruta.fases as Array<Record<string, unknown>>).filter((f) => f && punto(f.balon)).map((f): FaseDeSecuencia => ({
      nombre: typeof f.nombre === "string" ? f.nombre.slice(0, 40) : "",
      nota: typeof f.nota === "string" ? f.nota.slice(0, 160) : "",
      pausa: Number.isFinite(f.pausa) ? Math.max(0, Math.min(6, f.pausa as number)) : 0.8,
      duracion: Number.isFinite(f.duracion) ? Math.max(0.2, Math.min(3, f.duracion as number)) : 2.4,
      pos: Object.fromEntries(Object.entries((f.pos ?? {}) as Record<string, unknown>).filter(([k]) => claves.has(k)).map(([k, q]) => [k, punto(q)]).filter(([, q]) => q)),
      balon: punto(f.balon)!,
      carreras: (Array.isArray(f.carreras) ? f.carreras as Array<Record<string, unknown>> : [])
        .filter((c) => c && claves.has(c.clave as string) && punto(c.hasta))
        .map((c) => ({ clave: c.clave as string, hasta: punto(c.hasta)!, curva: Number.isFinite(c.curva) ? Math.max(-30, Math.min(30, c.curva as number)) : 0, paso: Number.isFinite(c.paso) ? Math.max(0, Math.min(3, Math.round(c.paso as number))) : 0 })),
      pases: (Array.isArray(f.pases) ? f.pases as Array<Record<string, unknown>> : [])
        .filter((p) => p && punto(p.hasta))
        .map((p) => ({ hasta: punto(p.hasta)!, tipo: p.tipo === "aereo" ? "aereo" as const : "raso" as const, paso: Number.isFinite(p.paso) ? Math.max(0, Math.min(3, Math.round(p.paso as number))) : 0 })),
    }));
    if (!papeles.length || !fases.length) continue;
    salida.push({
      id: bruta.id, nombre: typeof bruta.nombre === "string" ? bruta.nombre.slice(0, 60) : "Secuencia",
      creada: Number.isFinite(bruta.creada) ? bruta.creada as number : 0, papeles, fases,
    });
  }
  return salida.slice(0, MAX_SECUENCIAS);
}

/** Si una secuencia va de un lado del campo: para decir «banda izquierda» o «derecha» al soltarla. */
export const ladoDe = (s: Secuencia) => {
  const zs = Object.values(s.fases[0]?.pos ?? {}).map((p) => p.z);
  const media = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
  return Math.abs(media) < CAMPO.ancho / 8 ? "centro" : media > 0 ? "derecha" : "izquierda";
};
