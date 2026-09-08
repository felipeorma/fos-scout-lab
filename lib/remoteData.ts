import {
  isTransfermarktUrl,
  parseTransfermarktProfile,
  type TransfermarktProfile,
} from "./transfermarkt";
import { activeLang, t, tf } from "./i18n";

/**
 * En GitHub Pages no hay servidor: las rutas /api/* no existen. Este flag se
 * fija en tiempo de build (npm run build:pages) y activa los reemplazos
 * estáticos: proxy público de imágenes y lectura de Transfermarkt vía proxy
 * CORS con parseo en el navegador.
 */
export const IS_STATIC_DEPLOYMENT = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";

// En GitHub Pages la app vive bajo /fos-scout-lab; los assets de /public
// deben llevar ese prefijo (Next solo lo agrega a sus propios bundles).
export function assetPath(path: string) {
  return IS_STATIC_DEPLOYMENT ? `/fos-scout-lab${path}` : path;
}

/**
 * Candidatos para cargar una imagen en canvas, en orden de fiabilidad. Los
 * CDNs que envían CORS (escudos de Transfermarkt) van directo; el resto pasa
 * por weserv y su espejo, con el original como último intento.
 */
export function canvasImageCandidates(src: string): string[] {
  const value = src.trim();
  if (!value) return [];
  if (value.startsWith("data:image/") || value.startsWith("blob:") || value.startsWith("/")) return [value];
  const bare = value.replace(/^https?:\/\//i, "");
  const candidates: string[] = [];
  try {
    const host = new URL(value).hostname;
    if (/akamaized\.net$|githubusercontent\.com$|wikimedia\.org$/i.test(host)) candidates.push(value);
  } catch { return []; }
  if (!IS_STATIC_DEPLOYMENT) candidates.push(`/api/image?url=${encodeURIComponent(value)}`);
  candidates.push(`https://images.weserv.nl/?url=${encodeURIComponent(bare)}`);
  candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(bare)}`);
  if (!candidates.includes(value)) candidates.push(value);
  return candidates;
}

export function proxiedImageUrl(src: string) {
  if (IS_STATIC_DEPLOYMENT) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src.replace(/^https?:\/\//i, ""))}`;
  }
  return `/api/image?url=${encodeURIComponent(src)}`;
}

export async function fetchTransfermarktProfile(url: string): Promise<Partial<TransfermarktProfile>> {
  if (!isTransfermarktUrl(url.trim())) {
    throw new Error(t("Usa una URL válida de un perfil de Transfermarkt."));
  }
  // Se acepta el link de cualquier dominio (transfermarkt.es, .us, .com, .de…)
  // y se consulta la versión que coincide con el idioma activo del reporte,
  // para que posición, pie y nacionalidad lleguen en ese idioma.
  const target = new URL(url.trim());
  target.hostname = activeLang() === "es" ? "www.transfermarkt.es" : "www.transfermarkt.com";

  if (!IS_STATIC_DEPLOYMENT) {
    const response = await fetch("/api/transfermarkt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target.href }),
    });
    const result = await response.json() as Partial<TransfermarktProfile> & { error?: string };
    if (!response.ok) throw new Error(result.error || t("No se pudo leer el perfil."));
    return result;
  }

  /*
   * El puente local primero.
   *
   * Transfermarkt está detrás de un cortafuegos de AWS que bloquea las IPs de
   * centros de datos, y eso incluye a TODOS los proxies CORS públicos de
   * abajo: Jina responde 200 pero devuelve el muro de verificación en vez de
   * la ficha, y los otros dos ni llegan a conectar. Desde la IP de casa la
   * misma petición trae la página entera, así que se intenta por el puente
   * —que ya corre para StatsBomb y SkillCorner— antes de recurrir a ellos.
   *
   * Los proxies se quedan como respaldo para quien abra el sitio sin el
   * puente levantado: hoy no funcionan, pero esto cambia según lo que
   * Transfermarkt bloquee cada temporada, y no cuesta nada dejarlos.
   */
  const html = await fetchHtmlThroughLocalBridge(target.href) ?? await fetchHtmlThroughCorsProxy(target.href);
  const profile = parseTransfermarktProfile(html, target.href);
  if (!profile.name) {
    throw new Error(t("No pudimos reconocer el perfil. Revisa que sea la página principal del jugador."));
  }
  return profile;
}

async function fetchHtmlThroughLocalBridge(url: string) {
  try {
    const respuesta = await fetch(`${LOCAL_BRIDGE}/api/transfermarkt?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(35_000),
    });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json() as { html?: string };
    return datos.html?.trim() ? datos.html : null;
  } catch {
    // Sin puente levantado no es un error: se sigue por los proxies.
    return null;
  }
}

// Transfermarkt bloquea las IPs de la mayoría de proxies CORS públicos; el
// lector de Jina sí llega a la página real, así que va primero. Los demás
// quedan como respaldo por si Jina limita el número de peticiones.
const CORS_PROXIES: Array<{ url: (target: string) => string; headers?: Record<string, string>; timeoutMs: number }> = [
  { url: (target) => `https://r.jina.ai/${target}`, headers: { "x-return-format": "html" }, timeoutMs: 60_000 },
  { url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`, timeoutMs: 20_000 },
  { url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`, timeoutMs: 20_000 },
  { url: (target) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`, timeoutMs: 20_000 },
];

async function fetchHtmlThroughCorsProxy(url: string) {
  let lastError: Error | null = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy.url(url), {
        headers: proxy.headers,
        signal: AbortSignal.timeout(proxy.timeoutMs),
      });
      if (!response.ok) throw new Error(tf("El proxy respondió {code}.", { code: response.status }));
      const html = await response.text();
      if (html.length < 1_000) throw new Error(t("El proxy devolvió una respuesta vacía."));
      // Una página de bloqueo también puede llegar con estado 200: se valida
      // que el HTML contenga el encabezado real del perfil antes de aceptarlo.
      if (!html.includes("data-header")) throw new Error(t("El proxy devolvió una respuesta vacía."));
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw new Error(
    `${t("No se pudo leer Transfermarkt desde la versión publicada.")} ${lastError?.message ?? ""}`.trim(),
  );
}

// ---- Puente local de plataformas (StatsBomb / SkillCorner) ----
// El mismo servidor local del recorte de fondos expone los datos de las APIs
// con las credenciales guardadas SOLO en esta máquina.
import { extractSeason, type DataRow, type SourceDataset } from "./scouting";
import { OPTA_URL, type FotoMensual, type OptaLiga } from "./maldonado";

const LOCAL_BRIDGE = "http://127.0.0.1:7001";

export { temporadasUtiles } from "./temporadas.ts";

export type SourcesStatus = { statsbomb: boolean; skillcorner: boolean };

export type ApiCompetition = {
  competition_id?: number;
  season_id?: number;
  id?: number;
  name: string;
  season: string;
  country?: string;
  /** Si el proveedor ya publicó partidos de esta temporada. Solo StatsBomb lo
   *  informa; en SkillCorner viene indefinido y se asume que sí. */
  hasMatches?: boolean;
};


async function bridgeJson<T>(path: string, timeoutMs = 60_000): Promise<T> {
  const response = await fetch(`${LOCAL_BRIDGE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(tf("El servidor local respondió {code}.", { code: response.status }));
  return response.json() as Promise<T>;
}

export async function fetchSourcesStatus(): Promise<SourcesStatus | null> {
  try {
    return await bridgeJson<SourcesStatus>("/api/sources/status", 2_500);
  } catch {
    return null;
  }
}

export function fetchStatsbombCompetitions() {
  return bridgeJson<ApiCompetition[]>("/api/statsbomb/competitions");
}

export function fetchSkillcornerCompetitions() {
  return bridgeJson<ApiCompetition[]>("/api/skillcorner/competitions");
}

function toDataset(fileName: string, season: string, rows: DataRow[], provider: SourceDataset["provider"]): SourceDataset {
  if (!rows.length) throw new Error(t("La plataforma no devolvió jugadores para esa competición."));
  return {
    fileName,
    season: extractSeason(season),
    headers: Object.keys(rows[0]),
    rows,
    provider,
  };
}

export async function fetchStatsbombDataset(competition: ApiCompetition): Promise<SourceDataset> {
  const payload = await bridgeJson<{ rows: DataRow[] }>(
    `/api/statsbomb/player-stats?competition_id=${competition.competition_id}&season_id=${competition.season_id}`,
  );
  return toDataset(`StatsBomb · ${competition.name} ${competition.season}`, competition.season, payload.rows, "statsbomb");
}

export async function fetchSkillcornerDataset(competition: ApiCompetition): Promise<SourceDataset> {
  const payload = await bridgeJson<{ rows: DataRow[] }>(
    `/api/skillcorner/player-stats?competition_edition_id=${competition.id}`,
  );
  return toDataset(`SkillCorner · ${competition.name} ${competition.season}`, competition.season, payload.rows, "skillcorner");
}

// ---- Carreras sin balón, evento a evento ----

/** Una carrera con sus coordenadas: lo que dibuja una flecha en el mapa. */
export type CarreraSinBalon = {
  player_name: string;
  team_shortname: string;
  event_subtype: string;
  period: string;
  x_start: number | null;
  y_start: number | null;
  x_end: number | null;
  y_end: number | null;
  speed_avg: number | null;
  speed_avg_band: string;
  distance_covered: number | null;
  dangerous: boolean;
  received: boolean;
  targeted: boolean;
  xthreat: number | null;
  break_defensive_line: boolean;
  lead_to_shot: boolean;
  lead_to_goal: boolean;
};

export type RespuestaCarreras = {
  runs: CarreraSinBalon[];
  jugadores: string[];
  partidos: number;
  partidosConDatos: number;
  /** Por qué un partido no trae datos: calidad, sin_procesar, sin_licencia. */
  estados: Record<string, number>;
};

/**
 * Carreras sin balón de una temporada, por equipo. Pasa por el puente local
 * porque SkillCorner sirve un CSV por partido: la temporada entera son
 * decenas de llamadas que el servidor cachea en disco.
 *
 * La primera carga de un equipo tarda (baja todos sus partidos); a partir de
 * ahí sale del caché en milisegundos, por eso el timeout es largo.
 */
export function fetchOffBallRuns(competitionEditionId: number, equipo: string) {
  return bridgeJson<RespuestaCarreras>(
    `/api/skillcorner/off-ball-runs?competition_edition_id=${competitionEditionId}&team=${encodeURIComponent(equipo)}`,
    300_000,
  );
}

/** Los clubes de una edición, para elegirlos en vez de teclearlos. */
export function fetchSkillcornerTeams(competitionEditionId: number) {
  return bridgeJson<string[]>(`/api/skillcorner/teams?competition_edition_id=${competitionEditionId}`, 60_000);
}


// ---- Mesa de detección: ratings de liga y fotos mensuales ----

/**
 * Ratings de Opta Power Rankings. El feed es público y responde con
 * `access-control-allow-origin: *`, así que se lee directo desde el navegador
 * y funciona igual en GitHub Pages que en local, sin pasar por el puente.
 *
 * Devuelve null si no se pudo leer: quien llama decide qué decir en pantalla,
 * pero nunca se rellena con un valor inventado.
 */
export async function fetchOptaLeagueMeta(): Promise<OptaLiga[] | null> {
  try {
    const response = await fetch(OPTA_URL, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const payload = await response.json() as OptaLiga[];
    return Array.isArray(payload) && payload.length ? payload : null;
  } catch {
    return null;
  }
}

export type ResumenFoto = {
  archivo: string;
  liga: string;
  ligaNombre: string;
  mes: string;
  generado: string;
  minutosMin: number;
  jugadores: number;
};

/**
 * Las fotos mensuales viven SOLO en el servidor local (~/.fos-scouting/
 * snapshots). El repositorio es público y los datos de Wyscout están bajo
 * licencia: no pueden viajar a GitHub. Sin servidor, la función avisa en vez
 * de fallar en silencio.
 */
export async function fetchSnapshotList(liga: string): Promise<ResumenFoto[]> {
  try {
    return await bridgeJson<ResumenFoto[]>(`/api/snapshots/list?liga=${encodeURIComponent(liga)}`, 5_000);
  } catch {
    return [];
  }
}

export async function fetchSnapshot(liga: string, mes: string): Promise<FotoMensual | null> {
  try {
    return await bridgeJson<FotoMensual>(
      `/api/snapshots/get?liga=${encodeURIComponent(liga)}&mes=${encodeURIComponent(mes)}`,
      5_000,
    );
  } catch {
    return null;
  }
}

/** URL de descarga del respaldo: el navegador la abre y baja el ZIP. */
export function snapshotExportUrl() {
  return `${LOCAL_BRIDGE}/api/snapshots/export`;
}

/** Restaura un respaldo. Las fotos del ZIP pisan las del mismo mes y liga. */
export async function importSnapshots(archivo: File): Promise<{ importadas: number; omitidas: number }> {
  const cuerpo = new FormData();
  cuerpo.append("archivo", archivo);
  let response: Response;
  try {
    response = await fetch(`${LOCAL_BRIDGE}/api/snapshots/import`, {
      method: "POST", body: cuerpo, signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(t("El servidor local no está corriendo. Arranca npm run bg:server y reintenta."));
  }
  const payload = await response.json() as { importadas?: number; omitidas?: number; error?: string };
  if (!response.ok) throw new Error(payload.error || t("No se pudo restaurar el respaldo."));
  return { importadas: payload.importadas ?? 0, omitidas: payload.omitidas ?? 0 };
}

export async function saveSnapshot(foto: FotoMensual): Promise<{ archivo: string; ruta: string; jugadores: number }> {
  let response: Response;
  try {
    response = await fetch(`${LOCAL_BRIDGE}/api/snapshots/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(foto),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(t("El servidor local no está corriendo. Arranca npm run bg:server y reintenta."));
  }
  const payload = await response.json() as { archivo?: string; ruta?: string; jugadores?: number; error?: string };
  if (!response.ok || !payload.archivo) throw new Error(payload.error || t("No se pudo guardar la foto del mes."));
  return { archivo: payload.archivo, ruta: payload.ruta ?? "", jugadores: payload.jugadores ?? 0 };
}

// ---- Lecturas escritas por Claude (vía el puente local) ----
// La clave de Anthropic nunca llega al navegador: el texto se pide al
// servidor local, que es quien la guarda.

export type AiSummaryKind = "quick" | "extended" | "comparison";

export type AiPlayerFacts = {
  name: string;
  team: string;
  position: string;
  cohortLabel: string;
  age: string | number;
  minutes: string | number;
  matches: string | number;
  cohortSize: number;
  sources: string;
};

export type AiMetricFact = { label: string; value: number; percentile: number; inverse?: boolean };

export async function fetchAiSummary(body: {
  kind: AiSummaryKind;
  lang: string;
  player: AiPlayerFacts;
  metrics: AiMetricFact[];
  candidate?: AiPlayerFacts;
  candidateMetrics?: AiMetricFact[];
  similarity?: number;
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${LOCAL_BRIDGE}/api/ai/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
    });
  } catch {
    throw new Error(t("El servidor local no está corriendo. Arranca npm run bg:server y reintenta."));
  }
  const payload = await response.json() as { text?: string; error?: string };
  if (!response.ok || !payload.text) {
    const detail = payload.error ?? "";
    if (/credit balance|billing/i.test(detail)) throw new Error(t("La cuenta de Anthropic no tiene saldo. Recarga créditos y reintenta."));
    if (/sin clave/i.test(detail)) throw new Error(t("Falta la clave de Anthropic en el servidor local."));
    throw new Error(detail || t("No se pudo escribir el texto."));
  }
  return payload.text.trim();
}
