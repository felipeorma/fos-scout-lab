/**
 * El enlace que se reproduce: un sistema entero dentro de la dirección, para
 * mandarlo por el chat del equipo y abrirlo en cualquier móvil sin cuenta.
 *
 * El sitio es estático (GitHub Pages): no hay servidor donde guardar nada, así
 * que el sistema viaja en el propio enlace, detrás de `#` —esa parte no sale
 * del navegador, nadie la recibe—, comprimido con deflate y en base64url. Un
 * sistema de once contra once con cuatro fases cabe en unos pocos miles de
 * caracteres. Es una foto: si después se cambia el sistema, hay que volver a
 * mandar el enlace.
 */

import { jugadaValida, nuevoId, type Jugada } from "./abp.ts";

export const PREFIJO = "#pizarra=";
/** "1": deflate; "0": sin comprimir, para un navegador sin CompressionStream. */
type Version = "0" | "1";

const aBase64Url = (bytes: Uint8Array) => {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deBase64Url = (texto: string) => {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

async function pasarPor(bytes: Uint8Array, flujo: CompressionStream | DecompressionStream) {
  const salida = new Blob([bytes as BlobPart]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

/** Lo que viaja: el sistema sin lo que solo sirve en el navegador de quien lo hizo. */
function paraEnviar(jugada: Jugada) {
  const { actualizada: _actualizada, ...resto } = jugada;
  void _actualizada;
  return resto;
}

/** El trozo `#pizarra=…` de un sistema. */
export async function hashDeJugada(jugada: Jugada): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(paraEnviar(jugada)));
  if (typeof CompressionStream === "undefined") return `${PREFIJO}0.${aBase64Url(json)}`;
  return `${PREFIJO}1.${aBase64Url(await pasarPor(json, new CompressionStream("deflate-raw")))}`;
}

/** El enlace completo, sobre la dirección de la página que se está viendo. */
export async function enlaceDeJugada(jugada: Jugada, pagina: string): Promise<string> {
  return `${pagina.split("#")[0]}${await hashDeJugada(jugada)}`;
}

/**
 * El sistema que trae un enlace, comprobado como lo guardado: lo que no se
 * entiende se descarta. Llega con un id nuevo, para no pisar el de nadie.
 * null si el enlace está roto o incompleto.
 */
export async function jugadaDeHash(hash: string): Promise<Jugada | null> {
  if (!hash.startsWith(PREFIJO)) return null;
  const cuerpo = hash.slice(PREFIJO.length);
  const punto = cuerpo.indexOf(".");
  const version = cuerpo.slice(0, punto) as Version;
  if (punto < 1 || (version !== "0" && version !== "1")) return null;
  try {
    let bytes = deBase64Url(cuerpo.slice(punto + 1));
    if (version === "1") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await pasarPor(bytes, new DecompressionStream("deflate-raw"));
    }
    const jugada = jugadaValida({ ...JSON.parse(new TextDecoder().decode(bytes)), actualizada: Date.now() });
    return jugada ? { ...jugada, id: nuevoId("j") } : null;
  } catch {
    return null;
  }
}
