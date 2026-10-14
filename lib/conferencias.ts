/**
 * Cómo se reparte una liga: la MLS en sus dos conferencias, el resto en un
 * solo grupo. Es el esqueleto del mapa conceptual de Football Blueprints
 * —liga → conferencias → equipos— y del reel.
 *
 * Los nombres de club cambian según el proveedor ("LA Galaxy" y "Los Angeles
 * Galaxy", "CF Montréal" y "Montreal Impact", "D.C. United" y "DC United"),
 * así que se reconoce a cada club por una seña que no cambia: su ciudad o
 * su apodo. El orden de las reglas importa donde dos clubes comparten
 * ciudad: "new york city" antes que "new york".
 */

export type GrupoDeLiga = {
  /** "Conferencia Este", "Conferencia Oeste" o el nombre de la liga. */
  nombre: string;
  equipos: string[];
};

/** La MLS de 2025 y 2026: treinta clubes, quince por conferencia. */
const MLS: Array<{ conferencia: "Este" | "Oeste"; senas: RegExp }> = [
  { conferencia: "Este", senas: /\batlanta\b/ },
  { conferencia: "Este", senas: /\bcharlotte\b/ },
  { conferencia: "Este", senas: /\bchicago\b/ },
  { conferencia: "Este", senas: /\bcincinnati\b/ },
  { conferencia: "Este", senas: /\bcolumbus\b/ },
  { conferencia: "Este", senas: /\bd ?c united\b|\bwashington\b/ },
  { conferencia: "Este", senas: /\bmiami\b/ },
  { conferencia: "Este", senas: /\bmontreal\b/ },
  { conferencia: "Este", senas: /\bnashville\b/ },
  { conferencia: "Este", senas: /\bnew england\b|\brevolution\b/ },
  { conferencia: "Este", senas: /\bnew york city\b|\bnycfc\b/ },
  { conferencia: "Este", senas: /\bred bulls?\b|\bnew york\b/ },
  { conferencia: "Este", senas: /\borlando\b/ },
  { conferencia: "Este", senas: /\bphiladelphia\b/ },
  { conferencia: "Este", senas: /\btoronto\b/ },
  { conferencia: "Oeste", senas: /\baustin\b/ },
  { conferencia: "Oeste", senas: /\bcolorado\b/ },
  { conferencia: "Oeste", senas: /\bdallas\b/ },
  { conferencia: "Oeste", senas: /\bhouston\b/ },
  { conferencia: "Oeste", senas: /\bgalaxy\b/ },
  { conferencia: "Oeste", senas: /\blafc\b|\blos angeles f ?c\b/ },
  { conferencia: "Oeste", senas: /\bminnesota\b/ },
  { conferencia: "Oeste", senas: /\bportland\b/ },
  { conferencia: "Oeste", senas: /\breal salt lake\b|\bsalt lake\b/ },
  { conferencia: "Oeste", senas: /\bsan diego\b/ },
  { conferencia: "Oeste", senas: /\bsan jose\b/ },
  { conferencia: "Oeste", senas: /\bseattle\b/ },
  { conferencia: "Oeste", senas: /\bkansas city\b|\bsporting kc\b/ },
  { conferencia: "Oeste", senas: /\bst louis\b|\bsaint louis\b/ },
  { conferencia: "Oeste", senas: /\bvancouver\b/ },
];

const normalizar = (texto: string) => texto
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[.\-']/g, " ").replace(/\s+/g, " ").trim();

/** ¿Es la MLS? Por nombre, no por id, que cambia entre proveedores. */
export function esMls(liga: string) {
  const nombre = normalizar(liga);
  // La MLS Next Pro es otra liga —la de los filiales— y no tiene estas conferencias.
  if (/next pro/.test(nombre)) return false;
  return nombre === "mls" || nombre.includes("major league soccer") || /^mls\b/.test(nombre);
}

/** La conferencia de un club de la MLS, o null si no se reconoce. */
export function conferenciaMls(equipo: string): "Este" | "Oeste" | null {
  const nombre = normalizar(equipo);
  return MLS.find((regla) => regla.senas.test(nombre))?.conferencia ?? null;
}

/**
 * Los grupos del mapa conceptual. En la MLS, Este y Oeste (y, si algún club
 * no se reconoce, un tercer grupo para que no desaparezca); en cualquier otra
 * liga, un solo grupo con su nombre. Dentro de cada grupo, por orden alfabético.
 */
export function gruposDeLiga(liga: string, equipos: string[]): GrupoDeLiga[] {
  const ordenados = [...equipos].sort((a, b) => a.localeCompare(b, "es"));
  if (!esMls(liga)) return [{ nombre: liga, equipos: ordenados }];
  const este = ordenados.filter((equipo) => conferenciaMls(equipo) === "Este");
  const oeste = ordenados.filter((equipo) => conferenciaMls(equipo) === "Oeste");
  const otros = ordenados.filter((equipo) => conferenciaMls(equipo) === null);
  return [
    { nombre: "Conferencia Este", equipos: este },
    { nombre: "Conferencia Oeste", equipos: oeste },
    ...(otros.length ? [{ nombre: "Sin conferencia", equipos: otros }] : []),
  ].filter((grupo) => grupo.equipos.length);
}
