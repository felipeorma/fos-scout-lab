/**
 * Codificar un partido: ver el vídeo entero y marcar con una tecla cada
 * momento que importa. Cada marca guarda un clip alrededor del instante en
 * que se pulsó (unos segundos antes, porque la jugada empieza antes de que se
 * reconozca, y unos pocos después) con su código y una nota.
 *
 * Se guarda por vídeo en el navegador (el vídeo no se sube) y sale o entra en
 * CSV y en XML con la forma de Sportscode (instancias con inicio, fin, código
 * y etiqueta), que leen las herramientas de análisis habituales.
 */

export type Codigo = { id: string; tecla: string; nombre: string; color: string };
export type Momento = { id: string; codigo: string; t: number; inicio: number; fin: number; nota: string };
export type Codificacion = {
  version: 1;
  /** Segundos que guarda cada marca antes y después del instante en que se pulsa. */
  antes: number;
  despues: number;
  codigos: Codigo[];
  momentos: Momento[];
};

export const PREFIJO_CODIFICACION = "fos-scout-lab:codificacion:";
const MAX_MOMENTOS = 2000;

export const CODIGOS_POR_DEFECTO: Codigo[] = [
  { id: "c1", tecla: "1", nombre: "Recuperación", color: "#3aa0ff" },
  { id: "c2", tecla: "2", nombre: "Pérdida", color: "#ff5f57" },
  { id: "c3", tecla: "3", nombre: "Ocasión a favor", color: "#34c759" },
  { id: "c4", tecla: "4", nombre: "Ocasión en contra", color: "#ff9f0a" },
  { id: "c5", tecla: "5", nombre: "Balón parado a favor", color: "#bf5af2" },
  { id: "c6", tecla: "6", nombre: "Balón parado en contra", color: "#ff375f" },
  { id: "c7", tecla: "7", nombre: "Presión alta", color: "#ffd60a" },
  { id: "c8", tecla: "8", nombre: "Salida de balón", color: "#64d2ff" },
  { id: "c9", tecla: "9", nombre: "Transición", color: "#30d158" },
  { id: "c0", tecla: "0", nombre: "Gol", color: "#f5f5f7" },
];

export const codificacionVacia = (): Codificacion => ({ version: 1, antes: 8, despues: 5, codigos: CODIGOS_POR_DEFECTO.map((c) => ({ ...c })), momentos: [] });

/** La clave de un vídeo en el navegador: su nombre y su tamaño, que no cambian al volver a abrirlo. */
export const claveDeVideo = (nombre: string, tamano: number) => `${PREFIJO_CODIFICACION}${nombre}|${tamano}`;

let contador = 0;
const nuevoId = (prefijo: string) => { contador += 1; return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}`; };
const redondo = (s: number) => Math.round(s * 100) / 100;

/** Una marca del código `codigo` en el segundo `t`: el clip va de `antes` segundos antes a `despues` después, sin salirse del vídeo. */
export function marcar(c: Codificacion, codigo: string, t: number, duracion = Infinity): { codificacion: Codificacion; momento: Momento } {
  const momento: Momento = {
    id: nuevoId("m"), codigo, t: redondo(t),
    inicio: redondo(Math.max(0, t - c.antes)), fin: redondo(Math.min(duracion, t + c.despues)), nota: "",
  };
  const momentos = [...c.momentos, momento].sort((a, b) => a.t - b.t).slice(-MAX_MOMENTOS);
  return { codificacion: { ...c, momentos }, momento };
}

export const cambiarMomento = (c: Codificacion, id: string, cambios: Partial<Pick<Momento, "nota" | "inicio" | "fin" | "codigo">>): Codificacion => ({
  ...c, momentos: c.momentos.map((m) => (m.id === id ? { ...m, ...cambios } : m)),
});
export const quitarMomento = (c: Codificacion, id: string): Codificacion => ({ ...c, momentos: c.momentos.filter((m) => m.id !== id) });

/** «1:05:12» o «12:07»: un segundo del vídeo como se lee en un reloj. */
export function reloj(s: number) {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), seg = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}` : `${m}:${String(seg).padStart(2, "0")}`;
}

// ---- Lo guardado ---------------------------------------------------------------------------

const esColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const numero = (v: unknown, respaldo: number) => (typeof v === "number" && Number.isFinite(v) ? v : respaldo);

export function codificacionValida(v: unknown): Codificacion {
  const c = v as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return codificacionVacia();
  const codigos = Array.isArray(c.codigos) ? (c.codigos as Array<Record<string, unknown>>)
    .filter((x) => x && typeof x.id === "string" && typeof x.nombre === "string")
    .map((x): Codigo => ({ id: x.id as string, tecla: typeof x.tecla === "string" ? x.tecla.slice(0, 1) : "", nombre: (x.nombre as string).slice(0, 40), color: esColor(x.color) ? x.color : "#f5f5f7" }))
    .slice(0, 30) : [];
  const ids = new Set(codigos.map((x) => x.id));
  const momentos = Array.isArray(c.momentos) ? (c.momentos as Array<Record<string, unknown>>)
    .filter((m) => m && typeof m.id === "string" && ids.has(m.codigo as string) && Number.isFinite(m.t))
    .map((m): Momento => {
      const t = Math.max(0, m.t as number);
      const inicio = Math.max(0, Math.min(t, numero(m.inicio, t - 8)));
      return { id: m.id as string, codigo: m.codigo as string, t, inicio, fin: Math.max(t, numero(m.fin, t + 5)), nota: typeof m.nota === "string" ? m.nota.slice(0, 200) : "" };
    })
    .sort((a, b) => a.t - b.t).slice(-MAX_MOMENTOS) : [];
  return {
    version: 1,
    antes: Math.max(0, Math.min(30, numero(c.antes, 8))),
    despues: Math.max(0, Math.min(30, numero(c.despues, 5))),
    codigos: codigos.length ? codigos : codificacionVacia().codigos,
    momentos,
  };
}

// ---- CSV -----------------------------------------------------------------------------------

const comillas = (texto: string) => (/[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto);

/** Una fila por momento: código, inicio, fin, instante (en segundos) y nota. */
export function aCSV(c: Codificacion): string {
  const nombre = new Map(c.codigos.map((x) => [x.id, x.nombre]));
  const filas = c.momentos.map((m) => [comillas(nombre.get(m.codigo) ?? ""), m.inicio.toFixed(2), m.fin.toFixed(2), m.t.toFixed(2), comillas(m.nota)].join(","));
  return ["codigo,inicio,fin,instante,nota", ...filas].join("\n");
}

/** Parte una línea de CSV respetando las comillas; acepta coma o punto y coma. */
function campos(linea: string, separador: string): string[] {
  const salida: string[] = [];
  let actual = "", dentro = false;
  for (let i = 0; i < linea.length; i += 1) {
    const ch = linea[i];
    if (dentro) {
      if (ch === '"' && linea[i + 1] === '"') { actual += '"'; i += 1; }
      else if (ch === '"') dentro = false;
      else actual += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === separador) { salida.push(actual); actual = ""; }
    else actual += ch;
  }
  salida.push(actual);
  return salida.map((x) => x.trim());
}

type Leido = { nombre: string; inicio: number; fin: number; t?: number; nota: string; color?: string };

/** Mete lo leído de otro sitio: cada código por su nombre (los que no existen se crean) y cada momento con su clip. */
function sumar(c: Codificacion, leidos: Leido[]): { codificacion: Codificacion; nuevos: number } {
  const codigos = [...c.codigos];
  const paleta = ["#5e5ce6", "#ff9f0a", "#64d2ff", "#ff375f", "#30d158", "#bf5af2", "#ffd60a", "#ac8e68"];
  const porNombre = new Map(codigos.map((x) => [x.nombre.toLocaleLowerCase("es"), x.id]));
  const momentos = [...c.momentos];
  let nuevos = 0;
  for (const l of leidos) {
    if (!l.nombre || !Number.isFinite(l.inicio) || !Number.isFinite(l.fin) || l.fin < l.inicio) continue;
    const clave = l.nombre.toLocaleLowerCase("es");
    let id = porNombre.get(clave);
    if (!id) {
      id = nuevoId("c");
      codigos.push({ id, tecla: "", nombre: l.nombre.slice(0, 40), color: l.color ?? paleta[codigos.length % paleta.length] });
      porNombre.set(clave, id);
    }
    const t = l.t !== undefined && Number.isFinite(l.t) ? l.t : l.inicio + Math.min(c.antes, (l.fin - l.inicio) / 2);
    // Lo que ya estaba (mismo código, mismo inicio) no se duplica al importar dos veces.
    if (momentos.some((m) => m.codigo === id && Math.abs(m.inicio - l.inicio) < 0.05)) continue;
    momentos.push({ id: nuevoId("m"), codigo: id, t: redondo(t), inicio: redondo(l.inicio), fin: redondo(l.fin), nota: l.nota.slice(0, 200) });
    nuevos += 1;
  }
  momentos.sort((a, b) => a.t - b.t);
  return { codificacion: { ...c, codigos, momentos: momentos.slice(-MAX_MOMENTOS) }, nuevos };
}

export function deCSV(c: Codificacion, texto: string): { codificacion: Codificacion; nuevos: number } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { codificacion: c, nuevos: 0 };
  const separador = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cabecera = campos(lineas[0], separador).map((x) => x.toLowerCase());
  const col = (...nombres: string[]) => cabecera.findIndex((x) => nombres.includes(x));
  const iCodigo = col("codigo", "código", "code"), iInicio = col("inicio", "start"), iFin = col("fin", "end"), iT = col("instante", "time"), iNota = col("nota", "note", "text");
  if (iCodigo < 0 || iInicio < 0 || iFin < 0) return { codificacion: c, nuevos: 0 };
  const num = (x: string | undefined) => Number(String(x ?? "").replace(",", "."));
  return sumar(c, lineas.slice(1).map((l) => {
    const f = campos(l, separador);
    return { nombre: f[iCodigo] ?? "", inicio: num(f[iInicio]), fin: num(f[iFin]), t: iT >= 0 && f[iT] ? num(f[iT]) : undefined, nota: iNota >= 0 ? f[iNota] ?? "" : "" };
  }));
}

// ---- XML (la forma de Sportscode) ---------------------------------------------------------

const escapar = (texto: string) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const desescapar = (texto: string) => texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function aXML(c: Codificacion): string {
  const codigo = new Map(c.codigos.map((x) => [x.id, x]));
  const instancias = c.momentos.map((m, i) => {
    const nota = m.nota.trim() ? `<label><group>Nota</group><text>${escapar(m.nota)}</text></label>` : "";
    return `    <instance><ID>${i + 1}</ID><start>${m.inicio.toFixed(2)}</start><end>${m.fin.toFixed(2)}</end><code>${escapar(codigo.get(m.codigo)?.nombre ?? "")}</code>${nota}</instance>`;
  });
  // Los colores de las filas, en 0–65535 como los guarda Sportscode.
  const filas = c.codigos.map((x) => {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(x.color.slice(k, k + 2), 16) * 257);
    return `    <row><code>${escapar(x.nombre)}</code><R>${r}</R><G>${g}</G><B>${b}</B></row>`;
  });
  return ['<?xml version="1.0" encoding="utf-8"?>', "<file>", "  <ALL_INSTANCES>", ...instancias, "  </ALL_INSTANCES>", "  <ROWS>", ...filas, "  </ROWS>", "</file>"].join("\n");
}

export function deXML(c: Codificacion, texto: string): { codificacion: Codificacion; nuevos: number } {
  const campo = (bloque: string, nombre: string) => {
    const m = bloque.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`, "i"));
    return m ? desescapar(m[1].trim()) : "";
  };
  const colores = new Map<string, string>();
  for (const [, fila] of texto.matchAll(/<row>([\s\S]*?)<\/row>/gi)) {
    const nombre = campo(fila, "code"), rgb = ["R", "G", "B"].map((k) => Number(campo(fila, k)));
    if (nombre && rgb.every((v) => Number.isFinite(v))) colores.set(nombre.toLocaleLowerCase("es"), `#${rgb.map((v) => Math.round(Math.max(0, Math.min(65535, v)) / 257).toString(16).padStart(2, "0")).join("")}`);
  }
  const leidos: Leido[] = [];
  for (const [, bloque] of texto.matchAll(/<instance>([\s\S]*?)<\/instance>/gi)) {
    const nombre = campo(bloque, "code");
    const notas = [...bloque.matchAll(/<label>([\s\S]*?)<\/label>/gi)].map(([, l]) => campo(l, "text")).filter(Boolean);
    leidos.push({ nombre, inicio: Number(campo(bloque, "start")), fin: Number(campo(bloque, "end")), nota: notas.join(" · "), color: colores.get(nombre.toLocaleLowerCase("es")) });
  }
  return sumar(c, leidos);
}
