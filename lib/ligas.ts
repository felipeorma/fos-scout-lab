/**
 * Las ligas en API-Football: el id de cada una, para su logo. Las imágenes
 * (media.api-sports.io/football/leagues/{id}.png) son públicas: no piden
 * clave ni gastan cuota, así que la app las pone sin pasar por el puente.
 *
 * Los nombres son los de StatsBomb, que son los que llevan la base, los
 * filtros y los menús. El mismo mapa vive en el puente (_AF_LIGAS en
 * scripts/bg-server.py), que lo usa para buscar los escudos de los clubes:
 * una liga nueva va en los dos sitios.
 */
export const LIGAS_API_FOOTBALL: Record<string, number> = {
  "canadian premier league": 479,
  mls: 253,
  "major league soccer": 253,
  "mls next pro": 909,
  "usl championship": 255,
  "usl league one": 489,
  allsvenskan: 113,
  superettan: 114,
  "obos-ligaen": 104,
  veikkausliiga: 244,
  "eerste divisie": 89,
  "ligue 3": 63,
  "national league": 43,
  "premier division": 357,
};

const normal = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** La URL del logo de una liga, o null si no está en API-Football (las NCAA, las de Wyscout). */
export function logoDeLiga(nombre: string | null | undefined): string | null {
  const id = LIGAS_API_FOOTBALL[normal(nombre ?? "")];
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}
