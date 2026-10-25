/**
 * Guardar en el navegador sin chocar con el límite de localStorage.
 *
 * Los perfiles de Transfermarkt y las páginas visuales llevan imágenes en
 * base64: una foto sin fondo pesa uno o dos megas, y localStorage da unos
 * cinco por sitio. Al tercer o cuarto jugador la escritura fallaba en
 * silencio —el `catch` se lo tragaba— y la foto se perdía al recargar.
 *
 * Aquí el JSON sigue en localStorage (pequeño, y se lee de forma síncrona,
 * como siempre), pero cada imagen grande va a IndexedDB, que tiene cientos de
 * megas, y en su sitio queda una referencia "idb:…". Al arrancar se precargan
 * todas en memoria, así que leer sigue siendo síncrono. Si algo no se puede
 * guardar se avisa a quien escuche, en vez de callarlo.
 */

import { t, tf } from "./i18n.ts";

const BASE = "fos-scout-lab";
const TABLA = "imagenes";
const PREFIJO = "idb:";
/** Por debajo de esto una imagen cabe sin problema en el JSON. */
const TAMANO_MINIMO = 2048;

const enMemoria = new Map<string, string>();
let precarga: Promise<void> | null = null;
const oyentes = new Set<(mensaje: string) => void>();

/** Para que la interfaz se entere cuando algo no se pudo guardar. */
export function alFallarElGuardado(oyente: (mensaje: string) => void) {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}
function avisar(mensaje: string) {
  for (const oyente of oyentes) oyente(mensaje);
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === "undefined") { rechazar(new Error("sin IndexedDB")); return; }
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => { peticion.result.createObjectStore(TABLA); };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

async function operar(modo: IDBTransactionMode, hacer: (tabla: IDBObjectStore) => void) {
  const db = await abrir();
  await new Promise<void>((resolver, rechazar) => {
    const transaccion = db.transaction(TABLA, modo);
    hacer(transaccion.objectStore(TABLA));
    transaccion.oncomplete = () => resolver();
    transaccion.onerror = () => rechazar(transaccion.error);
    transaccion.onabort = () => rechazar(transaccion.error);
  });
  db.close();
}

/** Carga en memoria todas las imágenes guardadas. Se llama una vez al arrancar. */
export function precargarImagenes(): Promise<void> {
  if (!precarga) {
    precarga = (async () => {
      const db = await abrir();
      await new Promise<void>((resolver) => {
        const cursor = db.transaction(TABLA, "readonly").objectStore(TABLA).openCursor();
        cursor.onsuccess = () => {
          const actual = cursor.result;
          if (!actual) { resolver(); return; }
          if (typeof actual.value === "string") enMemoria.set(String(actual.key), actual.value);
          actual.continue();
        };
        cursor.onerror = () => resolver();
      });
      db.close();
    })().catch(() => { /* Sin IndexedDB todo sigue en localStorage, como antes. */ });
  }
  return precarga;
}

type Separado = { valor: unknown; imagenes: Map<string, string> };

/** Saca las imágenes grandes de un valor y deja referencias en su lugar. */
export function separarImagenes(clave: string, valor: unknown, ruta = ""): Separado {
  const imagenes = new Map<string, string>();
  const recorrer = (nodo: unknown, camino: string): unknown => {
    if (typeof nodo === "string") {
      if (nodo.startsWith("data:") && nodo.length > TAMANO_MINIMO) {
        const referencia = `${clave}#${camino}`;
        imagenes.set(referencia, nodo);
        return PREFIJO + referencia;
      }
      return nodo;
    }
    if (Array.isArray(nodo)) return nodo.map((elemento, indice) => recorrer(elemento, `${camino}[${indice}]`));
    if (nodo && typeof nodo === "object") {
      return Object.fromEntries(Object.entries(nodo).map(([campo, elemento]) => [campo, recorrer(elemento, camino ? `${camino}.${campo}` : campo)]));
    }
    return nodo;
  };
  return { valor: recorrer(valor, ruta), imagenes };
}

/** Vuelve a poner las imágenes donde estaban sus referencias. Las que aún no estén en memoria quedan vacías. */
export function unirImagenes<T>(valor: T, imagenes: ReadonlyMap<string, string> = enMemoria): T {
  const recorrer = (nodo: unknown): unknown => {
    if (typeof nodo === "string") return nodo.startsWith(PREFIJO) ? imagenes.get(nodo.slice(PREFIJO.length)) ?? "" : nodo;
    if (Array.isArray(nodo)) return nodo.map(recorrer);
    if (nodo && typeof nodo === "object") return Object.fromEntries(Object.entries(nodo).map(([campo, elemento]) => [campo, recorrer(elemento)]));
    return nodo;
  };
  return recorrer(valor) as T;
}

function referenciasDe(texto: string | null) {
  return new Set([...(texto ?? "").matchAll(/"idb:([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Guarda un valor: el JSON en localStorage y sus imágenes en IndexedDB.
 * Devuelve false (y avisa) si no se pudo guardar el JSON.
 */
export function guardarConImagenes(clave: string, valor: unknown, queEs = ""): boolean {
  const { valor: ligero, imagenes } = separarImagenes(clave, valor);
  for (const [referencia, imagen] of imagenes) enMemoria.set(referencia, imagen);
  let anteriores = new Set<string>();
  try { anteriores = referenciasDe(window.localStorage.getItem(clave)); } catch { /* sin lectura, no hay nada que limpiar */ }
  const sobran = [...anteriores].filter((referencia) => !imagenes.has(referencia));
  if (imagenes.size || sobran.length) {
    void operar("readwrite", (tabla) => {
      for (const [referencia, imagen] of imagenes) tabla.put(imagen, referencia);
      for (const referencia of sobran) tabla.delete(referencia);
    }).catch(() => avisar(queEs
      ? tf("No se pudieron guardar las imágenes de {que} en este navegador: se perderán al recargar.", { que: queEs })
      : t("No se pudieron guardar las imágenes en este navegador: se perderán al recargar.")));
    for (const referencia of sobran) enMemoria.delete(referencia);
  }
  try {
    window.localStorage.setItem(clave, JSON.stringify(ligero));
    return true;
  } catch {
    avisar(queEs
      ? tf("No se pudo guardar {que} en este navegador: no queda espacio. Se perderá al recargar.", { que: queEs })
      : t("No se pudo guardar en este navegador: no queda espacio. Se perderá al recargar."));
    return false;
  }
}

/**
 * Lee un valor guardado con `guardarConImagenes` (o con el formato viejo, con
 * las imágenes dentro: entonces las mueve a IndexedDB al leerlo, y libera
 * localStorage).
 */
export function leerConImagenes<T>(...claves: string[]): T | null {
  for (const clave of claves) {
    let texto: string | null = null;
    try { texto = window.localStorage.getItem(clave); } catch { return null; }
    if (!texto) continue;
    try {
      const valor = JSON.parse(texto) as T;
      const tieneImagenesDentro = /"data:[^"]{2048,}/.test(texto);
      if (tieneImagenesDentro && clave === claves[0]) guardarConImagenes(clave, valor);
      return tieneImagenesDentro ? valor : unirImagenes(valor);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Pasa a IndexedDB las imágenes de todo lo guardado con el formato viejo bajo
 * estos prefijos. Se llama al arrancar, después de precargar: libera
 * localStorage de golpe en vez de jugador a jugador.
 */
export function migrarImagenesViejas(prefijos: string[]) {
  let claves: string[] = [];
  try { claves = Object.keys(window.localStorage).filter((clave) => prefijos.some((prefijo) => clave.startsWith(prefijo))); } catch { return; }
  for (const clave of claves) {
    try {
      const texto = window.localStorage.getItem(clave);
      if (texto && /"data:[^"]{2048,}/.test(texto)) guardarConImagenes(clave, JSON.parse(texto));
    } catch { /* una entrada rota no frena a las demás */ }
  }
}
