"use client";
import { Interruptor } from "./Interruptor";
import { Paso } from "./Paso";
import { Desplegable } from "./BarraDeFiltros";
import { MenuDeLigas } from "./MenuDesplegable";
import { colorContrastante } from "@/lib/colores";
import { PERFILES, PERFILES_FILTRO } from "@/lib/perfiles";

/** El nombre de un grupo de métricas ("B2B" → "Interiores (box-to-box)"). */
const nombreDeGrupo = (id: string) => PERFILES.find((perfil) => perfil.id === id)?.nombre ?? id;

import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, Printer, RotateCcw, Search, Sparkles, Upload, X } from "./Icons";
import { reportThemeStyle, type ReportTheme } from "./reportTheme";
import { SimilarityReportMain, type SimilarityReportPayload } from "./SimilarityReport";
import type { EstiloRadarComparativo } from "./ComparisonRadar";
import { PeriodoDelJugador, type Periodo, type TemporadaDelPeriodo } from "./PeriodoDelJugador";
import { useCruceDeAnios } from "./estudio/useCruceDeAnios";
import { compararConSusTemporadas } from "@/lib/similitudPorPeriodo";
import { origenPorFila, type Procedencia } from "@/lib/procedencia";
import { MenuDeCompeticiones } from "./estudio/piezas";
import { DondeAparece } from "./DondeAparece";
import { ABRIR_BUSCADOR } from "./BarraDelJugador";
import type { ApiCompetition } from "@/lib/remoteData";
import {
  buildSimilaritySearch,
  secondaryRoleOptions,
  similarityOptions,
  type SimilarityFilters,
  type SimilarityMetricWeights,
  type SimilarityPlayer,
} from "@/lib/similarity";
import { cohortOf, extractSeason, temporadasDeFila, type CellValue, type DataRow, type SourceDataset } from "@/lib/scouting";
import { formatPlayerPositions, selectedCohortPosition, type PlayerPosition } from "@/lib/positions";
import { similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { createEmptyTransfermarktProfile, profileStorageKey, readStoredJson, type TransfermarktProfile } from "@/lib/transfermarkt";
import { removePlayerImageBackground } from "@/lib/playerImageBackground";
import { canvasImageCandidates, fetchAiSummary, fetchTransfermarktProfile, proxiedImageUrl, type AiMetricFact, type AiPlayerFacts } from "@/lib/remoteData";
import { reportExportBaseName } from "@/lib/reportExportName";
import { t, tf, numberLocale, type Lang } from "@/lib/i18n";
import { guardarConImagenes } from "@/lib/almacen";
import { AutorDelInforme } from "./FirmaDelInforme";
import { clavesDeSimilitud, coincidenciasYDiferencias, duelosDeSimilitud } from "@/lib/similitudClaves";
import { coberturaDeLigas, ordenarPorCobertura } from "@/lib/cobertura";
import { nivelDeLiga, type EntradaOpta } from "@/lib/nivelDeLiga";
import { EQUIPO_PROPIO, crearEncaje, perfilesDeEstilo } from "@/lib/estiloEquipo";
import { useEstilos } from "./useEstilos";
import { equiposParaEncaje, useEncajeDeLista } from "./useEncajeDeLista";
import { CeldaEncaje } from "./CeldaEncaje";
import { CeldaEncajeEquipo } from "./CeldaEncajeEquipo";
import { BotonExportar } from "./BotonExportar";

type ProfileSide = "target" | "candidate";

type SimilarityStudioProps = {
  rows: DataRow[];
  selectedIndex: number;
  sourceName: string;
  lang?: Lang;
  aiControlsHidden?: boolean;
  metricLabels?: string[] | null;
  minimumMinutes?: number;
  onMinimumMinutes?: (minutos: number) => void;
  /** Conjunto de métricas asignado en la ficha de la Página 1 */
  reportCohort?: string;
  /**
   * La liga y el año de cada fila. Sirve para dos cosas distintas: acotar por
   * competición a quién se elige —objetivo y candidatos— y medir los
   * percentiles contra la propia liga.
   */
  procedenciaPorFila?: Array<{ ligas: string[]; anios: number[]; claves?: string[] }> | null;
  /** Los Opta Power Rankings, para el nivel de la liga de cada candidato. */
  feedOpta?: EntradaOpta[] | null;
  /**
   * Las columnas de encaje (estilo del club con el nuestro y, si se elige, con
   * un equipo): solo en Cavalry y cuando se mira la página, porque piden las
   * estadísticas de equipo de todas las ligas.
   */
  conEncaje?: boolean;
  /** Si la ficha mide contra su liga ("Comparar con"): entonces Similitud empieza en "Su liga y su año". */
  medirEnSuLiga?: boolean;
  theme: ReportTheme;
  targetProfile: TransfermarktProfile;
  recipientName: string;
  recipientLogoUrl: string;
  onTargetProfileChange: (profile: TransfermarktProfile) => void;
  onRecipientNameChange: (value: string) => void;
  onRecipientLogoChange: (value: string) => void;
  onOpenReports: () => void;
  /**
   * Las filas del período del objetivo —las temporadas suyas que se eligieron,
   * con todos los demás en esas mismas temporadas— y dónde está él. Null:
   * todo lo cargado, que es lo que traen `rows`.
   */
  periodo?: { filas: DataRow[]; indice: number; procedencia: Origen[] | null } | null;
  /** El período del objetivo se está calculando todavía. */
  periodoPendiente?: boolean;
  /** Los años de ese período; null si son todos los cargados. */
  aniosDelPeriodo?: number[] | null;
  /** Las temporadas del objetivo como fichas: las mismas que se eligen en la ficha. */
  /** La pregunta de temporadas del objetivo: la misma de la ficha (se contesta una vez para las tres páginas). */
  preguntaDelObjetivo?: ReactNode;
  /** Con qué temporadas entra el objetivo ("2025 + 2026"), para la hoja. */
  temporadasDelObjetivoEnLaHoja?: string;
  /** Para rehacer al comparable con otras temporadas suyas. */
  basesActivas?: SourceDataset[];
  procedencias?: Procedencia[];
  /** Lo que se puede cargar de StatsBomb y aún no está: para sumarle temporadas al comparable. */
  catalogoParaCargar?: ApiCompetition[];
  cargando?: boolean;
  onCargarCompeticion?: (competicion: ApiCompetition) => Promise<void> | void;
  /** Cargar una temporada suya para el objetivo (entra en su período, como en la ficha). */
  onCargarParaElObjetivo?: (competicion: ApiCompetition) => void;
};

const CLAVE_ESTILO_RADAR = "fos-similitud-estilo-radar-v1";
const SIN_BASES: SourceDataset[] = [];
type Origen = { ligas: string[]; anios: number[]; claves?: string[] };
/** El mismo jugador en otras filas: por nombre y, si las dos lo traen, por nacimiento. */
const mismoJugador = (a: DataRow | undefined, b: DataRow) => {
  if (!a) return false;
  const nacimientoA = String(a["Birth date"] ?? ""), nacimientoB = String(b["Birth date"] ?? "");
  return String(a.Player ?? "") === String(b.Player ?? "") && (!nacimientoA || !nacimientoB || nacimientoA === nacimientoB);
};
const PLAYER_PALETTE = ["#1f5fd6", "#e95b3f", "#43a8a0", "#9e07ae", "#d7a62c", "#16a34a", "#0f172a", "#f97316"];

const alphabeticCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const TRANSFERMARKT_LOGO = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true"
  ? "/fos-scout-lab/tm_logo.svg"
  : "/tm_logo.svg";

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeFileName(value: string) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function candidateProfileSeed(candidate: SimilarityPlayer | null) {
  return createEmptyTransfermarktProfile({
    name: candidate?.name ?? "",
    club: candidate?.team ?? "",
    position: candidate?.position ?? "",
    age: candidate?.age === null || candidate?.age === undefined ? "" : String(candidate.age),
    citizenship: candidate?.passport === "—" ? "" : candidate?.passport ?? "",
  });
}

function loadStoredProfile(candidate: SimilarityPlayer) {
  const base = candidateProfileSeed(candidate);
  const saved = readStoredJson<Partial<TransfermarktProfile>>(
    profileStorageKey(candidate.name, candidate.team),
    profileStorageKey(candidate.name),
  );
  return saved ? { ...base, ...saved } as TransfermarktProfile : base;
}

function canvasImageSource(src: string) {
  return src.startsWith("data:image/") || src.startsWith("/") ? src : proxiedImageUrl(src);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(t("No se pudo convertir la imagen procesada.")));
    reader.readAsDataURL(blob);
  });
}

export function SimilarityStudio({ rows, selectedIndex, sourceName, lang = "es", aiControlsHidden = false, metricLabels = null, minimumMinutes: minutosBase, onMinimumMinutes, reportCohort = "AUTO", procedenciaPorFila = null, feedOpta = null, conEncaje = false, medirEnSuLiga = false, theme, targetProfile, recipientName, recipientLogoUrl, onTargetProfileChange, onRecipientNameChange, onRecipientLogoChange, onOpenReports, periodo = null, periodoPendiente = false, aniosDelPeriodo = null, preguntaDelObjetivo = null, temporadasDelObjetivoEnLaHoja = "", basesActivas = SIN_BASES, procedencias = [], catalogoParaCargar = [], cargando = false, onCargarCompeticion, onCargarParaElObjetivo }: SimilarityStudioProps) {
  /** Si una competición del catálogo ya está cargada (no está entre las que faltan). */
  const estaCargada = (competicion: ApiCompetition) => !catalogoParaCargar.some((c) => c.competition_id === competicion.competition_id && c.season_id === competicion.season_id);
  /*
   * Con qué filas se busca. El objetivo se elige en la base entera (`rows`),
   * pero el ranking se hace en su período: si se le mira con 2025 + 2026,
   * todos entran con su 2025 + 2026. Los índices de los candidatos son los de
   * estas filas, y su liga y su año, los de esta procedencia.
   */
  /*
   * Mientras el período se rehace (unos segundos al cargar otra base o
   * cambiar sus temporadas) se sigue con el anterior, si es del mismo
   * jugador. Sin esto, la lista volvía un momento a "todo lo cargado" —con
   * temporadas que no se eligieron— y los parecidos bailaban.
   */
  const [periodoAnterior, setPeriodoAnterior] = useState(periodo);
  if (periodo && periodo !== periodoAnterior) setPeriodoAnterior(periodo);
  const objetivoDeLaBase = rows[selectedIndex];
  const periodoVigente = periodo ?? (periodoPendiente && periodoAnterior && objetivoDeLaBase
    && mismoJugador(periodoAnterior.filas[periodoAnterior.indice], objetivoDeLaBase) ? periodoAnterior : null);
  const filasDeBusqueda = periodoVigente?.filas ?? rows;
  const indiceDeBusqueda = periodoVigente ? periodoVigente.indice : selectedIndex;
  const procedenciaDeBusqueda = periodoVigente ? periodoVigente.procedencia : procedenciaPorFila;
  const [query, setQuery] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  // El mínimo de minutos es el mismo de la Página 01 y de Contexto: una sola
  // red de filtros, para que las tres hojas describan al jugador contra el
  // mismo grupo de referencia.
  const [minimumMinutes, setMinimumMinutes] = useState(String(minutosBase ?? 500));
  useEffect(() => { if (minutosBase !== undefined) setMinimumMinutes(String(minutosBase)); }, [minutosBase]);
  const cambiarMinutos = (valor: string) => {
    setMinimumMinutes(valor);
    const numero = Number(valor);
    if (Number.isFinite(numero) && onMinimumMinutes) onMinimumMinutes(Math.max(0, numero));
  };
  const [passport, setPassport] = useState("");
  const [position, setPosition] = useState("");
  const [secondaryRole, setSecondaryRole] = useState("");
  const [side, setSide] = useState<"" | "left" | "right">("");
  /*
   * Contra qué se miden los percentiles.
   *
   * "Combinado" es lo de siempre: un solo grupo con todas las ligas cargadas,
   * y el parecido dice quién produce lo mismo. "Por liga" mide a cada uno
   * contra su propia competición, y entonces lo que sale es parecido de ROL:
   * quién hace el mismo papel donde juega. Hay que llamarlo distinto porque
   * mide otra cosa —el modo por liga esconde el nivel: un P90 de la CPL y uno
   * de la MLS salen iguales sin serlo—.
   */
  /*
   * Con qué set de métricas se dibuja el radar.
   *
   * Iba pegado al filtro de "rol principal": elegir por dónde buscar cambiaba
   * también con qué se mide, y no hay motivo para que sean lo mismo. Se puede
   * querer ver a un lateral con las métricas de central —para saber si aguanta
   * ahí— sin dejar de buscar entre laterales. Vacío significa el puesto del
   * propio jugador.
   */
  const [rolMetricas, setRolMetricas] = useState("");

  // Empieza como "Comparar con" de la ficha: si allí se mide contra su liga,
  // aquí también. Tocar el interruptor manda sobre eso en esta sesión.
  const [modoElegido, setBaseDePercentiles] = useState<"combinado" | "liga" | null>(null);
  const baseDePercentiles = modoElegido ?? (medirEnSuLiga ? "liga" : "combinado");
  /* Para MEDIR se usa la clave liga+año, no la liga sola: si no, dos
     temporadas de la misma competición caerían en el mismo grupo y comparar a
     un jugador con su propia versión del año pasado los mediría a los dos
     contra la mezcla. Los FILTROS siguen usando liga y año por separado,
     porque ahí sí se pregunta por una cosa o por la otra. */
  const ligasPorFila = useMemo(
    () => (procedenciaDeBusqueda ? procedenciaDeBusqueda.map((x) => x.claves ?? x.ligas) : null),
    [procedenciaDeBusqueda],
  );
  /** ¿Hay contra qué comparar? Con una sola competición, medir "contra su
   *  liga" y "contra todo" es exactamente lo mismo. */
  const hayVariasCompeticiones = useMemo(
    () => new Set((ligasPorFila ?? []).flat()).size > 1,
    [ligasPorFila],
  );
  // En un useMemo: un objeto nuevo en cada render rehacía la búsqueda entera en cada render.
  const porLiga = useMemo(
    () => (baseDePercentiles === "liga" && hayVariasCompeticiones && ligasPorFila?.length ? { ligasPorFila } : null),
    [baseDePercentiles, hayVariasCompeticiones, ligasPorFila],
  );

  /*
   * Acotar por competición, a los dos lados.
   *
   * Con dieciséis ligas cargadas, el desplegable de clubes del objetivo pasa
   * de ocho a más de doscientos, y la lista de candidatos mezcla competiciones
   * que quizá no interesan. Estos filtros no tocan el cálculo: acotan a quién
   * se elige y a quién se muestra, igual que en el ranking y en la ficha.
   */
  const ligasDelFondo = useMemo(
    () => [...new Set((procedenciaPorFila ?? []).flatMap((x) => x.ligas))].sort(alphabeticCollator.compare),
    [procedenciaPorFila],
  );
  const aniosDelFondo = useMemo(
    () => [...new Set((procedenciaPorFila ?? []).flatMap((x) => x.anios))].filter(Boolean).sort(),
    [procedenciaPorFila],
  );
  const [ligaCandidato, setLigaCandidato] = useState("TODAS");
  const [anioCandidato, setAnioCandidato] = useState(0);

  /** Lo mismo para los candidatos, que viven en las filas del período. */
  const encajaCandidato = useCallback((indice: number, liga: string, anio: number) => {
    if (liga === "TODAS" && !anio) return true;
    const origen = procedenciaDeBusqueda?.[indice];
    if (!origen) return false;
    if (liga !== "TODAS" && !origen.ligas.includes(liga)) return false;
    if (anio && !origen.anios.includes(anio)) return false;
    return true;
  }, [procedenciaDeBusqueda]);

  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [nombreDelElegido, setNombreDelElegido] = useState("");
  const [candidateProfileState, setCandidateProfileState] = useState<TransfermarktProfile>(() => createEmptyTransfermarktProfile());
  const [candidateProfileKey, setCandidateProfileKey] = useState("");
  const [profileBusy, setProfileBusy] = useState<ProfileSide | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState<ProfileSide | null>(null);
  const [backgroundOriginals, setBackgroundOriginals] = useState<Record<string, string>>({});
  const [profileStatus, setProfileStatus] = useState<Record<ProfileSide, string>>({ target: "", candidate: "" });
  const [targetColorChoice, setTargetColorChoice] = useState("");
  const [candidateColorChoice, setCandidateColorChoice] = useState("#ff0000");
  /* Cuñas o radar superpuesto: se recuerda en este navegador, que es una
     preferencia de lectura y no parte de la comparación. */
  const [estiloRadar, setEstiloRadar] = useState<EstiloRadarComparativo>("cunas");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_ESTILO_RADAR) === "radar") setEstiloRadar("radar");
    } catch { /* sin almacenamiento: se queda en cuñas */ }
  }, []);
  const elegirEstiloRadar = (estilo: EstiloRadarComparativo) => {
    setEstiloRadar(estilo);
    try { window.localStorage.setItem(CLAVE_ESTILO_RADAR, estilo); } catch { /* no pasa nada */ }
  };
  const [targetLabelColorChoice, setTargetLabelColorChoice] = useState("");
  const [candidateLabelColorChoice, setCandidateLabelColorChoice] = useState("");
  const [targetLabelTransparency, setTargetLabelTransparency] = useState(82);
  const [candidateLabelTransparency, setCandidateLabelTransparency] = useState(82);
  const [targetPhotoScale, setTargetPhotoScale] = useState(100);
  const [candidatePhotoScale, setCandidatePhotoScale] = useState(100);
  const [metricWeights, setMetricWeights] = useState<SimilarityMetricWeights>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  // El panel de pesos ocupa mucho y no siempre se usa: se puede plegar y la
  // elección se recuerda.
  // Plegado de entrada: es calibración fina, no el camino normal.
  const [pesosVisibles, setPesosVisibles] = useState(false);
  // "Más filtros" (pasaporte, rol secundario, lado, encaje): el mismo cajón
  // de la derecha que en el Ranking y en "Personalizar" de la ficha.
  const [masFiltrosAbierto, setMasFiltrosAbierto] = useState(false);
  useEffect(() => {
    if (!masFiltrosAbierto) return;
    const alPulsar = (evento: KeyboardEvent) => { if (evento.key === "Escape") setMasFiltrosAbierto(false); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [masFiltrosAbierto]);
  const barraDeLaHojaRef = useRef<HTMLDivElement | null>(null);
  const rankingRef = useRef<HTMLElement | null>(null);
  /** La pestaña abierta de "Personalizar la hoja". */
  const [ajusteDeHoja, setAjusteDeHoja] = useState<"texto" | "fotos" | "colores">("texto");
  useEffect(() => {
    // Plegados salvo que se hayan abierto a propósito. Con "!== off" arrancaban
    // abiertos para todo el que no los hubiera cerrado nunca —el comentario
    // decía "sigue plegada" y el código hacía lo contrario— y eran 666 px de
    // barras entre el jugador objetivo y la lista que se venía a ver.
    try { setPesosVisibles(window.localStorage.getItem("fos-scout-weight-panel") === "on"); } catch { /* opcional */ }
  }, []);
  const cambiarPesosVisibles = (valor: boolean) => {
    setPesosVisibles(valor);
    try { window.localStorage.setItem("fos-scout-weight-panel", valor ? "on" : "off"); } catch { /* opcional */ }
  };
  const [comparisonNote, setComparisonNote] = useState("");
  const [comparisonAiLoading, setComparisonAiLoading] = useState(false);
  const [comparisonAiError, setComparisonAiError] = useState("");
  const [targetPhotoFit, setTargetPhotoFit] = useState<"auto" | "contain" | "cover">("auto");
  const [candidatePhotoFit, setCandidatePhotoFit] = useState<"auto" | "contain" | "cover">("auto");
  const reportSheetRef = useRef<HTMLElement>(null);
  const options = useMemo(() => similarityOptions(rows), [rows]);
  const secondaryOptions = useMemo(() => secondaryRoleOptions(rows, position), [rows, position]);
  /**
   * ¿Hay posiciones secundarias en esta base?
   *
   * Solo existen cuando un jugador trae varias posiciones, y eso lo dan los
   * Excel de Wyscout o el cruce de temporadas y fuentes. Una liga suelta de la
   * API trae una sola por jugador —medido: la CPL de StatsBomb (2024, 2025 y
   * 2026) y la de SkillCorner, cero filas con más de una—, así que la ficha no
   * podía encenderse nunca: se quedaba apagada, con un aviso que mandaba a
   * elegir un rol principal que tampoco la encendía. Sin nada que ofrecer, no
   * se muestra.
   */
  const hayRolesSecundarios = useMemo(() => secondaryRoleOptions(rows, "").length > 0, [rows]);
  const filters = useMemo<SimilarityFilters>(() => ({
    query,
    ageMin: optionalNumber(ageMin),
    ageMax: optionalNumber(ageMax),
    minimumMinutes: Math.max(0, optionalNumber(minimumMinutes) ?? 0),
    passport,
    position,
    secondaryRole,
    side,
  }), [ageMax, ageMin, minimumMinutes, passport, position, query, secondaryRole, side]);
  /*
   * Cuánto cambia de verdad medir contra su liga.
   *
   * Sin esto el interruptor parece roto: se acciona y los mismos jugadores
   * siguen arriba con porcentajes casi iguales. Y es correcto, no un fallo —a
   * un extremo que está en P98 entre todas las ligas no le queda sitio para
   * subir dentro de la suya— pero no se puede pedir a nadie que lo deduzca.
   * Así que se calcula la otra versión y se dice el efecto: cuánto se mueve
   * el perfil del jugador y cuántas caras cambian arriba.
   */
  const comparativaDeModo = useMemo(() => {
    if (!porLiga || !ligasPorFila?.length) return null;
    const otra = buildSimilaritySearch(filasDeBusqueda, indiceDeBusqueda, filters, metricWeights, rolMetricas || reportCohort, metricLabels, null);
    const esta = buildSimilaritySearch(filasDeBusqueda, indiceDeBusqueda, filters, metricWeights, rolMetricas || reportCohort, metricLabels, porLiga);
    if (!otra?.candidates.length || !esta?.candidates.length) return null;
    const perfilA = new Map(otra.candidates[0].metrics.map((m) => [m.key, m.targetPercentile]));
    const perfilB = new Map(esta.candidates[0].metrics.map((m) => [m.key, m.targetPercentile]));
    const difs = [...perfilA.keys()].filter((k) => perfilB.has(k)).map((k) => Math.abs((perfilA.get(k) ?? 0) - (perfilB.get(k) ?? 0)));
    if (!difs.length) return null;
    const antes = otra.candidates.slice(0, 10).map((c) => c.name);
    const ahora = esta.candidates.slice(0, 10).map((c) => c.name);
    return {
      medio: Math.round((difs.reduce((x, y) => x + y, 0) / difs.length) * 10) / 10,
      maximo: Math.max(...difs),
      nuevos: ahora.filter((n) => !antes.includes(n)).length,
    };
  }, [porLiga, ligasPorFila, filasDeBusqueda, indiceDeBusqueda, filters, metricWeights, rolMetricas, reportCohort, metricLabels]);

  /*
   * La posición que se enseña bajo el nombre.
   *
   * Al elegir "Métricas de: Delanteros" para un extremo, el radar y todos los
   * percentiles pasan a ser los de delantero, pero el rótulo seguía diciendo
   * "Extremo": el informe se contradecía consigo mismo. Si se ha elegido un
   * puesto a mano, manda ése; si no, la posición natural del jugador.
   */
  const posicionMostrada = useCallback((natural: string, cohorteNatural: string) => (
    rolMetricas ? selectedCohortPosition(rolMetricas, natural) : (
      reportCohort !== "AUTO" ? selectedCohortPosition(cohorteNatural, natural) : natural
    )
  ), [rolMetricas, reportCohort]);

  // `lang` va a propósito: el cálculo devuelve las etiquetas ya traducidas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => buildSimilaritySearch(filasDeBusqueda, indiceDeBusqueda, filters, metricWeights, rolMetricas || reportCohort, metricLabels, porLiga), [filters, metricWeights, filasDeBusqueda, indiceDeBusqueda, lang, rolMetricas, reportCohort, metricLabels, porLiga]);
  /** El jugador objetivo para la barra de arriba, haya o no resultados: sin él no se puede cambiar de grupo de métricas. */
  const objetivo = useMemo(() => {
    if (search) return { player: search.target.player, team: search.target.team, position: search.target.position, cohort: search.target.cohort, age: search.target.age };
    const fila = rows[selectedIndex];
    if (!fila) return null;
    return {
      player: String(fila.Player ?? ""), team: String(fila.Team ?? ""), position: String(fila.Position ?? ""),
      cohort: cohortOf(fila.Position as CellValue), age: fila.Age === undefined || fila.Age === null || fila.Age === "" ? "—" : String(fila.Age),
    };
  }, [search, rows, selectedIndex]);
  /*
   * Los candidatos se acotan DESPUÉS del motor. La liga es una decisión de
   * mercado —"de aquí no vamos a fichar"— y no puede cambiar el percentil de
   * nadie: filtrando antes, cerrar una competición movería el parecido de
   * todos los demás, porque el grupo de referencia sería otro.
   */
  /*
   * Ordenados por el parecido corregido por cobertura, como hacía Entre ligas:
   * sin la corrección, un candidato de una liga con pocas métricas se compara
   * en menos dimensiones y sube por tener peores datos, no por parecerse más.
   * Y sabiendo qué publica la liga de cada uno: lo que su liga no publica (los
   * desmarques de SkillCorner fuera de CPL y MLS Next Pro) no le resta. Sin
   * esto, la misma persona bajaba 17 puestos por jugar en una liga sin
   * SkillCorner; con esto, 5.
   * Se corrige sobre todos y después se filtra (ver lib/cobertura).
   */
  const coberturaDe = useMemo(
    () => (search && ligasPorFila?.length ? coberturaDeLigas(filasDeBusqueda, ligasPorFila, search.target.metrics.map((metric) => metric.key)) : null),
    [search, filasDeBusqueda, ligasPorFila],
  );
  const candidates = useMemo(
    () => (search ? ordenarPorCobertura(search.candidates, search.target.metrics.length, coberturaDe ? (candidate) => coberturaDe(candidate.index) : undefined) : [])
      .filter((candidate) => encajaCandidato(candidate.index, ligaCandidato, anioCandidato)),
    [search, encajaCandidato, ligaCandidato, anioCandidato, coberturaDe],
  );
  // Lo que traía Entre ligas: el encaje de estilo del club de cada candidato
  // con el nuestro y, si se elige, el encaje con un equipo concreto.
  const estilos = useEstilos(conEncaje);
  const encaje = useMemo(() => crearEncaje(estilos.filas ? perfilesDeEstilo(estilos.filas) : [], EQUIPO_PROPIO), [estilos.filas]);
  const [equipoEncaje, setEquipoEncaje] = useState("");
  const equiposEncaje = useMemo(() => (conEncaje ? equiposParaEncaje(rows) : []), [conEncaje, rows]);
  const encajeEquipo = useEncajeDeLista(filasDeBusqueda, Number(minimumMinutes) || 0, conEncaje ? equipoEncaje : "");
  const ligasDeFila = (indice: number) => procedenciaDeBusqueda?.[indice]?.ligas ?? [];
  const opta = (liga: string) => {
    const nivel = nivelDeLiga(feedOpta, liga);
    return nivel ? nivel.rating.toLocaleString(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
  };
  const activeMetricWeights = search?.target.metrics.filter((metric) => (metricWeights[metric.key] ?? 1) !== 1).length ?? 0;
  /*
   * El elegido se busca también por nombre: al cambiar las temporadas del
   * objetivo cambian las filas, y el mismo índice pasa a ser otro jugador.
   */
  const candidatoDelRanking = candidates.find((candidate) => candidate.index === selectedCandidateIndex && (!nombreDelElegido || candidate.name === nombreDelElegido))
    ?? (nombreDelElegido ? candidates.find((candidate) => candidate.name === nombreDelElegido) : undefined)
    ?? candidates[0] ?? null;

  /*
   * Las temporadas del comparable. Por defecto, las suyas dentro del período
   * del objetivo —con las que entró en el ranking—. Se pueden quitar o sumar
   * otras que estén cargadas; entonces se le rehace con esas, medido contra
   * los de ese mismo período (lib/similitudPorPeriodo), y la hoja lo dice.
   */
  const filaDelComparable = candidatoDelRanking ? filasDeBusqueda[candidatoDelRanking.index] : undefined;
  const filaBaseDelComparable = useMemo(
    () => (filaDelComparable ? rows.find((fila) => mismoJugador(filaDelComparable, fila)) ?? null : null),
    [filaDelComparable, rows],
  );
  const temporadasDelComparable = useMemo(() => temporadasDeFila(filaBaseDelComparable ?? undefined), [filaBaseDelComparable]);
  const aniosPorDefecto = useMemo(
    () => temporadasDelComparable.map((temporada) => temporada.anio).filter((anio) => aniosDelPeriodo === null || aniosDelPeriodo.includes(anio)),
    [temporadasDelComparable, aniosDelPeriodo],
  );
  const claveDelComparable = filaDelComparable ? `${String(filaDelComparable.Player ?? "")}|${String(filaDelComparable["Birth date"] ?? "")}` : "";
  /* Su período, como el del objetivo: una temporada o la media de varias.
     Sin contestar, las suyas dentro del período del objetivo. */
  const [periodosDelComparable, setPeriodosDelComparable] = useState<Record<string, Periodo>>({});
  const periodoElegidoDelComparable = periodosDelComparable[claveDelComparable];
  const aniosDelComparable = (periodoElegidoDelComparable?.anios ?? aniosPorDefecto).filter((anio) => temporadasDelComparable.some((temporada) => temporada.anio === anio));
  const periodoDelComparable: Periodo = { modo: periodoElegidoDelComparable?.modo ?? (aniosPorDefecto.length > 1 ? "media" : "una"), anios: aniosDelComparable };
  const temporadasDelComparableParaElegir: TemporadaDelPeriodo[] = [...temporadasDelComparable].sort((a, b) => b.anio - a.anio).map((temporada) => ({
    clave: String(temporada.anio), anio: temporada.anio, etiqueta: temporada.etiqueta, minutos: temporada.minutos,
    detalle: [temporada.equipo, temporada.ligas.join(", ")].filter(Boolean).join(" · "),
  }));
  const comparableConOtrasTemporadas = aniosDelComparable.length > 0
    && (aniosDelComparable.length !== aniosPorDefecto.length || aniosDelComparable.some((anio) => !aniosPorDefecto.includes(anio)));
  const cruceDelComparable = useCruceDeAnios(basesActivas, comparableConOtrasTemporadas ? [...aniosDelComparable].sort((a, b) => b - a).join(",") : "");
  function cambiarPeriodoDelComparable(periodo: Periodo) {
    setPeriodosDelComparable((antes) => ({ ...antes, [claveDelComparable]: periodo }));
  }
  const comparableEnSuPeriodo = useMemo(() => {
    if (!comparableConOtrasTemporadas || !cruceDelComparable || !candidatoDelRanking || !search || !filaDelComparable) return null;
    const indice = cruceDelComparable.findIndex((fila) => mismoJugador(filaDelComparable, fila));
    if (indice < 0) return null;
    const claves = procedencias.length > 1 ? origenPorFila(cruceDelComparable, procedencias).map((origen) => origen.claves) : null;
    const resultado = compararConSusTemporadas({
      objetivo: { filas: filasDeBusqueda, indice: indiceDeBusqueda, claves: ligasPorFila },
      comparable: { filas: cruceDelComparable, indice, claves },
      porLiga: Boolean(porLiga),
      filters, metricWeights, reportCohort: rolMetricas || reportCohort, metricLabels,
    });
    if (!resultado) return null;
    const cobertura = claves?.length ? coberturaDeLigas(cruceDelComparable, claves, search.target.metrics.map((metric) => metric.key)) : null;
    const [ajustado] = ordenarPorCobertura([resultado], search.target.metrics.length, cobertura ? () => cobertura(indice) : undefined);
    // Sigue siendo la fila del ranking que se eligió: el índice es el de allí.
    return ajustado ? { ...ajustado, index: candidatoDelRanking.index } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparableConOtrasTemporadas, cruceDelComparable, candidatoDelRanking, search, filaDelComparable, procedencias, filasDeBusqueda, indiceDeBusqueda, ligasPorFila, porLiga, filters, metricWeights, rolMetricas, reportCohort, metricLabels, lang]);
  /*
   * Temporadas suyas que aún no están cargadas. Primero, las de las ligas en
   * las que ya aparece (las más recientes); para cualquier otra, el catálogo
   * entero. Al cargar una, se enciende sola si él aparece en ella; si no
   * aparece, se dice.
   */
  const [otraLigaDelComparable, setOtraLigaDelComparable] = useState("");
  const [pedidaDelComparable, setPedidaDelComparable] = useState<{ clave: string; competicion: ApiCompetition } | null>(null);
  async function cargarParaElComparable(competicion: ApiCompetition) {
    if (!onCargarCompeticion) return;
    const anio = extractSeason(String(competicion.season));
    const clave = claveDelComparable;
    setPeriodosDelComparable((antes) => {
      const actuales = antes[clave]?.anios ?? aniosPorDefecto;
      return { ...antes, [clave]: { modo: "media", anios: [...new Set([...actuales, anio])] } };
    });
    setPedidaDelComparable({ clave, competicion });
    setOtraLigaDelComparable("");
    await onCargarCompeticion(competicion);
  }
  const pedida = pedidaDelComparable?.clave === claveDelComparable ? pedidaDelComparable.competicion : null;
  const pedidaSinElComparable = pedida && !cargando && !catalogoParaCargar.includes(pedida)
    && !temporadasDelComparable.some((temporada) => temporada.anio === extractSeason(String(pedida.season)) && temporada.ligas.includes(pedida.name))
    ? pedida : null;
  /** Si se pidieron otras temporadas y todavía no están, o con ellas no llega (minutos, métricas). */
  const estadoDelComparable = !comparableConOtrasTemporadas ? "" : !cruceDelComparable ? "calculando" : comparableEnSuPeriodo ? "" : "no-llega";
  const selectedCandidate = comparableEnSuPeriodo ?? candidatoDelRanking;
  const etiquetasDe = (temporadas: Array<{ etiqueta: string; anio: number }>, anios: number[]) =>
    temporadas.filter((temporada) => anios.includes(temporada.anio)).map((temporada) => temporada.etiqueta).sort().join(" + ");
  const temporadasDelComparableEnLaHoja = comparableEnSuPeriodo ? etiquetasDe(temporadasDelComparable, aniosDelComparable) : etiquetasDe(temporadasDelComparable, aniosPorDefecto);

  // La opinión sobre la comparación se escribe en el mismo campo editable que
  // ya viaja a la hoja, así que se puede corregir antes de exportar.
  async function writeComparisonNote() {
    if (!search?.target || !selectedCandidate) return;
    setComparisonAiLoading(true);
    setComparisonAiError("");
    const facts = (name: string, team: string, position: string, cohortSize: number): AiPlayerFacts => ({
      name, team, position, cohortLabel: position, age: "", minutes: "", matches: "", cohortSize, sources: sourceName,
    });
    const targetMetrics: AiMetricFact[] = selectedCandidate.metrics.map((metric) => ({ label: t(metric.label), value: metric.targetValue, percentile: metric.targetPercentile }));
    const candidateMetrics: AiMetricFact[] = selectedCandidate.metrics.map((metric) => ({ label: t(metric.label), value: metric.candidateValue, percentile: metric.candidatePercentile }));
    try {
      const text = await fetchAiSummary({
        kind: "comparison",
        lang,
        player: facts(search.target.player, search.target.team, search.target.position, search.target.cohortSize),
        metrics: targetMetrics,
        candidate: facts(selectedCandidate.name, selectedCandidate.team, selectedCandidate.position, search.target.cohortSize),
        candidateMetrics,
        // Ya viene en % (0-100): multiplicarlo mandaba "8200%" al texto.
        similarity: selectedCandidate.similarity,
      });
      setComparisonNote(text);
    } catch (error) {
      setComparisonAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setComparisonAiLoading(false);
    }
  }

  const activeCandidateKey = selectedCandidate ? profileStorageKey(selectedCandidate.name, selectedCandidate.team) : "";
  // El fallback (candidato auto-seleccionado sin pulsar "Comparar") también
  // recupera el perfil Transfermarkt guardado, no solo la semilla vacía.
  const candidateProfile = candidateProfileKey === activeCandidateKey
    ? candidateProfileState
    : (selectedCandidate && typeof window !== "undefined" ? loadStoredProfile(selectedCandidate) : candidateProfileSeed(selectedCandidate));
  /*
   * Negro el objetivo y rojo puro el comparado, por decisión de dirección.
   *
   * Es además el par con más separación posible en un radar de dos áreas:
   * uno no tiene tono y el otro lo tiene saturado al máximo, así que se
   * distinguen impresos en escala de grises y con cualquier daltonismo. Lo
   * que había antes —el acento del cliente contra un naranja rojizo fijo—
   * daba rojo contra rojo a diez grados de tono con Cavalry.
   *
   * `colorContrastante` sigue en pie para cuando se elige a mano el color del
   * objetivo: entonces el del comparado se recalcula contra ése.
   */
  // En la hoja oscura (look Night) el par es el mismo al revés: blanco el
  // objetivo, el rojo del acento el comparado.
  const targetColor = targetColorChoice || (theme.oscuro ? "#f5f5f7" : "#111111");
  const candidateColor = candidateColorChoice || (targetColorChoice ? colorContrastante(targetColor) : theme.oscuro ? "#ff3b30" : "#ff0000");
  const targetLabelColor = targetLabelColorChoice || targetColor;
  const candidateLabelColor = candidateLabelColorChoice || candidateColor;
  const paletteColors = useMemo(() => [...new Set([theme.accent, theme.dark, ...PLAYER_PALETTE])], [theme.accent, theme.dark]);
  const reportRecipient = recipientName.trim() || t("Club destinatario");
  const recipientLogoReady = /^(https?:\/\/|data:image\/)/i.test(recipientLogoUrl.trim());
  const similarityReportPayload = useMemo<SimilarityReportPayload | null>(() => {
    if (!search?.target || !selectedCandidate) return null;
    return {
      version: 2,
      sourceName,
      metricCohort: search.target.cohort,
      similarity: selectedCandidate.similarity,
      target: {
        profile: targetProfile,
        name: search.target.player,
        team: search.target.team,
        // La misma posición que se enseña en pantalla: si el informe dijera
        // una y la ficha otra, quien lo lee no sabe con qué se le midió.
        position: posicionMostrada(search.target.position, search.target.cohort),
        age: search.target.age,
        temporadas: temporadasDelObjetivoEnLaHoja || undefined,
        passport: search.target.passport,
        color: targetColor,
        labelColor: targetLabelColor,
        labelTransparency: targetLabelTransparency,
        photoScale: targetPhotoScale,
        photoFit: targetPhotoFit,
      },
      candidate: {
        profile: candidateProfile,
        name: selectedCandidate.name,
        team: selectedCandidate.team,
        // El candidato se mide con el MISMO set de métricas que el objetivo,
        // así que su rótulo tiene que decir ese puesto y no el suyo natural:
        // los percentiles que hay debajo son los de ese puesto.
        position: posicionMostrada(selectedCandidate.position, selectedCandidate.cohort),
        age: selectedCandidate.age === null ? "—" : String(selectedCandidate.age),
        temporadas: temporadasDelComparableEnLaHoja || undefined,
        passport: selectedCandidate.passport,
        color: candidateColor,
        labelColor: candidateLabelColor,
        labelTransparency: candidateLabelTransparency,
        photoScale: candidatePhotoScale,
        photoFit: candidatePhotoFit,
      },
      metrics: selectedCandidate.metrics,
      estiloRadar,
      extra: (() => {
        // Duelos, coincidencias, claves y otros parecidos: se calculan aquí y
        // viajan con la hoja, así que una comparación guardada se lee igual.
        const ligaDe = (indice: number) => procedenciaDeBusqueda?.[indice]?.ligas?.[0] ?? null;
        const edadObjetivo = Number(search.target.age);
        const metricas = selectedCandidate.metrics;
        const otros = search.candidates.filter((c) => c.index !== selectedCandidate.index).slice(0, 5).map((c) => ({
          nombre: c.name,
          equipo: c.team,
          detalle: [c.team, ligaDe(c.index), c.age === null ? "" : String(c.age)].filter(Boolean).join(" · "),
          parecido: c.similarity,
        }));
        return {
          duelos: duelosDeSimilitud(metricas, { edad: edadObjetivo, minutos: search.target.minutes }, { edad: selectedCandidate.age ?? Number.NaN, minutos: selectedCandidate.minutes }),
          ...coincidenciasYDiferencias(metricas),
          claves: clavesDeSimilitud({
            metricas,
            objetivo: { nombre: search.target.player, minutos: search.target.minutes, liga: ligaDe(indiceDeBusqueda) },
            comparable: { nombre: selectedCandidate.name, minutos: selectedCandidate.minutes, liga: ligaDe(selectedCandidate.index) },
          }),
          otros,
        };
      })(),
    };
    // `lang` va a propósito: las claves se escriben ya traducidas al calcularlas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    procedenciaDeBusqueda,
    indiceDeBusqueda,
    lang,
    estiloRadar,
    temporadasDelObjetivoEnLaHoja,
    temporadasDelComparableEnLaHoja,
    candidateColor,
    candidateLabelColor,
    candidateLabelTransparency,
    candidatePhotoFit,
    candidatePhotoScale,
    candidateProfile,
    posicionMostrada,
    search,
    selectedCandidate,
    sourceName,
    targetColor,
    targetLabelColor,
    targetLabelTransparency,
    targetPhotoFit,
    targetPhotoScale,
    targetProfile,
  ]);

  function chooseCandidate(candidate: SimilarityPlayer, irALaHoja = false) {
    setSelectedCandidateIndex(candidate.index);
    setNombreDelElegido(candidate.name);
    setCandidateProfileState(loadStoredProfile(candidate));
    setCandidateProfileKey(profileStorageKey(candidate.name, candidate.team));
    setProfileStatus((current) => ({ ...current, candidate: "" }));
    // Al elegir en la lista, la hoja: estaba 1.500 px más abajo y no se veía que había cambiado.
    if (irALaHoja) requestAnimationFrame(() => irA(barraDeLaHojaRef.current));
  }

  /** Desplaza hasta un bloque; sin animación si el sistema pide menos movimiento. */
  function irA(elemento: HTMLElement | null) {
    if (!elemento) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    elemento.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  }

  /*
   * El objetivo se elige en la barra del jugador (en todas las pestañas). Al
   * cambiar, se empieza de cero con el comparable y los pesos, como cuando
   * se elegía aquí.
   */
  const claveDelObjetivo = `${String(rows[selectedIndex]?.Player ?? "")}|${String(rows[selectedIndex]?.["Birth date"] ?? "")}`;
  const [objetivoAnterior, setObjetivoAnterior] = useState(claveDelObjetivo);
  if (claveDelObjetivo !== objetivoAnterior) {
    setObjetivoAnterior(claveDelObjetivo);
    setSelectedCandidateIndex(null);
    setNombreDelElegido("");
    setCandidateProfileKey("");
    setMetricWeights({});
  }

  const masFiltrosActivos = [passport, secondaryRole, side, conEncaje && equipoEncaje].filter(Boolean).length;
  function resetFilters() {
    setQuery("");
    setAgeMin("");
    setAgeMax("");
    setMinimumMinutes("500");
    setPassport("");
    setPosition("");
    setSecondaryRole("");
    setSide("");
    setLigaCandidato("TODAS");
    setAnioCandidato(0);
  }

  function updateMetricWeight(key: string, percentage: number) {
    const weight = Math.max(0, Math.min(300, percentage)) / 100;
    setMetricWeights((current) => {
      if (weight === 1) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: weight };
    });
  }

  function resetMetricWeights() {
    setMetricWeights({});
  }

  function sideStorageKey(side: ProfileSide) {
    return side === "target"
      ? profileStorageKey(search?.target.player ?? "", search?.target.team ?? "")
      : profileStorageKey(selectedCandidate?.name ?? "", selectedCandidate?.team ?? "");
  }

  function saveProfile(side: ProfileSide, playerName: string, next: TransfermarktProfile) {
    if (side === "target") onTargetProfileChange(next);
    else {
      setCandidateProfileState(next);
      setCandidateProfileKey(sideStorageKey(side));
    }
    guardarConImagenes(sideStorageKey(side), next, tf("el perfil de {jugador}", { jugador: playerName || next.name }));
  }

  function clearBackgroundOriginal(side: ProfileSide) {
    setBackgroundOriginals((originals) => {
      const key = sideStorageKey(side);
      if (!(key in originals)) return originals;
      const nextOriginals = { ...originals };
      delete nextOriginals[key];
      return nextOriginals;
    });
  }

  async function extractProfile(side: ProfileSide, url: string) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName) return;
    setProfileBusy(side);
    setProfileStatus((status) => ({ ...status, [side]: t("Leyendo datos e imágenes…") }));
    try {
      const result = await fetchTransfermarktProfile(url);
      const populated = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== "" && value !== undefined));
      const next = { ...current, ...populated, sourceUrl: url } as TransfermarktProfile;
      saveProfile(side, playerName, next);
      clearBackgroundOriginal(side);
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Foto, escudo y datos cargados.") }));
    } catch (error) {
      setProfileStatus((status) => ({ ...status, [side]: error instanceof Error ? error.message : t("No se pudo extraer el perfil.") }));
    } finally {
      setProfileBusy(null);
    }
  }

  function applyPlayerImageUrl(side: ProfileSide, value: string) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName) return;
    try {
      const url = new URL(value.trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
      saveProfile(side, playerName, { ...current, playerImage: url.href });
      clearBackgroundOriginal(side);
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Foto aplicada desde el enlace. Puedes quitarle el fondo con IA.") }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: t("Ingresa un enlace de imagen válido que comience con http:// o https://.") }));
    }
  }

  async function loadPlayerImage(side: ProfileSide, file?: File) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName || !file) return;
    if (!file.type.startsWith("image/")) {
      setProfileStatus((status) => ({ ...status, [side]: t("Selecciona un archivo de imagen PNG, WEBP o JPG.") }));
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      saveProfile(side, playerName, { ...current, playerImage: dataUrl });
      clearBackgroundOriginal(side);
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Foto cargada desde el ordenador. Puedes quitarle el fondo con IA.") }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: t("No se pudo leer la imagen seleccionada.") }));
    }
  }

  async function removePlayerBackground(side: ProfileSide) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    const source = current.playerImage.trim();
    if (!playerName || !source) {
      setProfileStatus((status) => ({ ...status, [side]: t("Primero extrae o carga una foto del jugador.") }));
      return;
    }
    setBackgroundBusy(side);
    setProfileStatus((status) => ({ ...status, [side]: t("Preparando el modelo de IA… La primera vez puede tardar.") }));
    try {
      const result = await removePlayerImageBackground({
        playerImage: source,
        onProgress: (key, currentProgress, total) => {
          const percent = total > 0 ? Math.min(100, Math.round(currentProgress / total * 100)) : 0;
          setProfileStatus((status) => ({ ...status, [side]: percent ? tf("Descargando modelo IA · {p}%", { p: percent }) : tf("Preparando {k}…", { k: t(key) }) }));
        },
      });
      const dataUrl = await blobToDataUrl(result);
      const storageKey = sideStorageKey(side);
      setBackgroundOriginals((originals) => originals[storageKey] ? originals : { ...originals, [storageKey]: source });
      saveProfile(side, playerName, { ...current, playerImage: dataUrl });
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Fondo eliminado. La foto transparente ya está aplicada al reporte.") }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: t("No se pudo eliminar el fondo. Reintenta o utiliza otra imagen.") }));
    } finally {
      setBackgroundBusy(null);
    }
  }

  function restorePlayerBackground(side: ProfileSide) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    const storageKey = sideStorageKey(side);
    const original = backgroundOriginals[storageKey];
    if (!playerName || !original) return;
    saveProfile(side, playerName, { ...current, playerImage: original });
    setBackgroundOriginals((originals) => {
      const nextOriginals = { ...originals };
      delete nextOriginals[storageKey];
      return nextOriginals;
    });
    setProfileStatus((status) => ({ ...status, [side]: t("✓ Imagen original restaurada.") }));
  }

  async function downloadAsset(src: string, name: string) {
    if (!src) return;
    try {
      const response = await fetch(canvasImageSource(src));
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(name)}.${blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportStatus(t("No se pudo descargar esa imagen. Revisa el enlace de Transfermarkt."));
    }
  }


  async function exportAssetDataUrl(url: string) {
    if (url.startsWith("data:image/")) return url;
    let parsed: URL;
    try {
      parsed = new URL(url, window.location.href);
    } catch {
      return false;
    }
    const candidates = parsed.protocol === "blob:" || parsed.origin === window.location.origin
      ? [parsed.href]
      : canvasImageCandidates(parsed.href);
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) continue;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) continue;
        return await blobToDataUrl(blob);
      } catch { /* Se intenta el siguiente proxy o fuente disponible. */ }
    }
    return false;
  }

  async function captureReportNode(reportSheet: HTMLElement, scale: number) {
    await document.fonts?.ready;
    await Promise.all(Array.from(reportSheet.querySelectorAll("img")).map(async (image) => {
      try {
        await Promise.race([
          image.decode?.() ?? Promise.resolve(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 10_000)),
        ]);
      } catch { /* La captura conserva el espacio aunque una fuente externa falle. */ }
    }));
    const { domToPng } = await import("modern-screenshot");
    return domToPng(reportSheet, {
      scale,
      backgroundColor: theme.paper,
      timeout: 30_000,
      fetchFn: exportAssetDataUrl,
      fetch: { bypassingCache: true },
      features: { restoreScrollPosition: true },
    });
  }

  async function captureVisibleReport() {
    const reportSheet = reportSheetRef.current;
    if (!reportSheet) throw new Error("report-not-ready");
    return captureReportNode(reportSheet, 2);
  }

  async function downloadComparison() {
    setExportBusy(true);
    try {
      const image = await captureVisibleReport();
      if (!image || !selectedCandidate || !search?.target) return;
      const exportName = reportExportBaseName({
        recipient: reportRecipient,
        player: search.target.player,
        position: formatPlayerPositions(targetProfile.position || search.target.position),
      });
      const link = document.createElement("a");
      link.href = image;
      link.download = `${exportName}.png`;
      link.click();
      setExportStatus(t("✓ PNG exportado exactamente como aparece en el reporte."));
    } catch {
      setExportStatus(t("No se pudo exportar el reporte. Revisa que las imágenes estén disponibles."));
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadComparisonPdf() {
    setExportBusy(true);
    try {
      const image = await captureVisibleReport();
      if (!image || !selectedCandidate || !search?.target || !reportSheetRef.current) return;
      const { jsPDF } = await import("jspdf");
      const reportWidth = reportSheetRef.current.offsetWidth;
      const reportHeight = reportSheetRef.current.offsetHeight;
      const pdf = new jsPDF({
        orientation: reportWidth > reportHeight ? "landscape" : "portrait",
        unit: "px",
        format: [reportWidth, reportHeight],
        compress: true,
        hotfixes: ["px_scaling"],
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(image, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      const exportName = reportExportBaseName({
        recipient: reportRecipient,
        player: search.target.player,
        position: formatPlayerPositions(targetProfile.position || search.target.position),
      });
      pdf.save(`${exportName}.pdf`);
      setExportStatus(t("✓ PDF exportado exactamente como aparece en el reporte."));
    } catch {
      setExportStatus(t("No se pudo exportar el reporte. Revisa que las imágenes estén disponibles."));
    } finally {
      setExportBusy(false);
    }
  }


  return <div className="page-content similarity-page similarity-report-theme" data-oscuro={theme.oscuro ? "" : undefined} style={reportThemeStyle(theme)}>
    {!rows.length || !objetivo ? <section className="dataset-onboarding similarity-empty"><span className="dataset-step">{t("SECCIÓN DE SIMILITUD")}</span><span className="dataset-icon"><Search size={30} /></span><h2>{t("Primero carga una base de datos")}</h2><p>{t("La comparación usa la base activa, ya sea una liga, temporada o combinación.")}</p><button className="button primary" onClick={onOpenReports}>{t("Ir a cargar datos")}</button></section> : <>
      <Paso numero={1}>Cómo se mide al objetivo</Paso>
      <section className="similarity-target-bar">
        {/* El objetivo es el jugador de la barra de arriba, el mismo en todas
            las pestañas: aquí se dice quién es y se cambia desde allí. Antes
            había aquí cuatro selectores (liga, año, club, jugador) que
            repetían lo que ya hace la barra. */}
        <div className="similarity-target-copy">
          <b>{objetivo.player}</b>
          <small>{tf("{team} · {pos} · {age} años", { team: objetivo.team, pos: posicionMostrada(objetivo.position, objetivo.cohort), age: objetivo.age })}</small>
          <button type="button" className="similarity-cambiar-objetivo" onClick={() => window.dispatchEvent(new Event(ABRIR_BUSCADOR))}>{t("Cambiar jugador")}</button>
        </div>
        {/* Sus temporadas, las mismas que se eligen en la ficha: el ranking
            entero se hace con ese período. */}
        <div className="similarity-temporadas-objetivo">
          {preguntaDelObjetivo}
          {periodoPendiente && <small className="temporadas-chips-nota" aria-live="polite">{t("Rehaciendo el ranking con esas temporadas…")}</small>}
          {/* Dónde aparece en todo el catálogo: lo cargado y lo que falta, con un toque para sumarlo. */}
          {rows[selectedIndex] && <DondeAparece jugador={String(rows[selectedIndex].Player ?? "")} nacimiento={String(rows[selectedIndex]["Birth date"] ?? "")}
            estaCargada={estaCargada} onCargar={onCargarParaElObjetivo} cargando={cargando} />}
        </div>
        {/* Con más de una liga o año cargados hay dos preguntas posibles y
            conviene cambiar entre ellas de un golpe: "quién produce lo mismo"
            (todo junto) y "quién hace el mismo papel en su contexto" (cada uno
            contra los suyos). La segunda es la que permite comparar al mismo
            jugador en dos temporadas: cada Messi contra los delanteros de SU
            año, y no contra la mezcla de los dos. */}
        {/* El bloque entero colgaba de tener procedencia por fila, o sea de
            haber cargado varias ligas. Pero dentro hay dos controles que no
            dependen de lo mismo: elegir con qué SET DE MÉTRICAS se mide a un
            jugador tiene sentido con una sola liga cargada —medir a un
            extremo como delantero es una pregunta legítima aunque solo esté
            la CPL—, mientras que el interruptor de "todo junto contra su
            liga" no significa nada si solo hay una. Así que el selector se
            muestra siempre y el interruptor solo cuando hay contra qué
            comparar. */}
        <div className="similarity-base-modo">
          <span>{t("Medir contra")}</span>
          <label className="similarity-rol-metricas"><span>{t("Métricas de")}</span>
            <select value={rolMetricas} onChange={(event) => setRolMetricas(event.target.value)}>
              <option value="">{t("Su propio puesto")}</option>
              {PERFILES_FILTRO.map((perfil) => <option key={perfil.id} value={perfil.id}>{t(perfil.nombre)}</option>)}
            </select>
          </label>
          {hayVariasCompeticiones && <Interruptor
            activo={baseDePercentiles === "liga"}
            onCambio={(porSuLiga) => setBaseDePercentiles(porSuLiga ? "liga" : "combinado")}
            etiquetaApagado={t("Todo junto")}
            etiquetaEncendido={t("Su liga y su año")}
            titulo={t("Contra quién se calculan los percentiles")}
          />}
        </div>
        {/* Qué modelo mide. Era una caja con borde que ocupaba una fila entera
            para un dato que se lee una vez: ahora es una línea de pie. */}
        <p className="similarity-modelo"><Sparkles size={13} /><b>{porLiga ? t("Parecido de rol") : t("Baseline estadístico")}</b><span>{porLiga ? t("Cada uno contra su liga") : t("Percentiles + contexto de edad y rol")}</span></p>
      </section>

      {/* Sin resultados, la barra de arriba se queda: antes la página entera
          se cambiaba por el aviso y con ella desaparecía el selector de
          "Métricas de", así que no había forma de deshacer la elección. */}
      {!search ? <section className="dataset-onboarding similarity-empty similarity-empty-inline">
        <span className="dataset-step">{porLiga ? t("SIN COHORTE EN SU LIGA") : t("SIN COMPARACIÓN POSIBLE")}</span>
        <span className="dataset-icon"><Search size={30} /></span>
        <h2>{porLiga ? t("Su liga no tiene suficientes jugadores de este puesto") : t("Este jugador no se puede comparar")}</h2>
        <p>{porLiga
          ? t("Ni sumando los puestos vecinos llega a diez en su liga con estos minutos, y con menos el percentil no significa nada. Baja el mínimo de minutos, mide contra todas las ligas juntas o elige otro grupo de métricas arriba.")
          : t("No llega al mínimo de minutos, o su base no trae suficientes métricas de este grupo. Baja el mínimo de minutos, elige otro grupo de métricas arriba o a otro jugador.")}</p>
        <div className="similarity-empty-acciones">
          {/* Los minutos, aquí también: su control vive en el ranking, que no
              sale sin resultados, y subirlos de más dejaba la página atascada. */}
          <label className="filtro-chip numero">
            <span>{t("Mín. minutos")}</span>
            <input type="number" min="0" step="100" inputMode="numeric" value={minimumMinutes} onChange={(event) => cambiarMinutos(event.target.value)} aria-label={t("Mínimo de minutos")} />
          </label>
          {Number(minimumMinutes) > 500 && <button className="button secondary" onClick={() => cambiarMinutos("500")}>{t("Volver a 500′")}</button>}
          {porLiga && <button className="button primary" onClick={() => setBaseDePercentiles("combinado")}>{t("Medir contra todas las ligas")}</button>}
          {rolMetricas && <button className="button secondary" onClick={() => setRolMetricas("")}>{t("Volver a su propio puesto")}</button>}
        </div>
      </section> : <>

      {/* Pocos de ese grupo en su liga: se dice contra quién se midió. */}
      {search.ampliado && <p className="similarity-ampliado">{tf("En su liga solo hay {n} {grupo} con {m}′: los percentiles se calculan con ellos y con {vecinos} de su liga, {total} en total.", {
        n: search.ampliado.enElGrupo,
        grupo: t(nombreDeGrupo(search.ampliado.grupo)).toLowerCase(),
        m: minimumMinutes,
        vecinos: search.ampliado.vecinos.map((g) => t(nombreDeGrupo(g)).toLowerCase()).join(t(" y ")),
        total: search.ampliado.tamano,
      })}</p>}

      {/* Un solo aviso: lo que cambia al medir contra su liga arriba, y el
          porqué —largo— plegado debajo, para quien lo quiera leer. */}
      {porLiga && <div className="similarity-aviso">
        {comparativaDeModo && <p className="similarity-efecto-modo">
        {comparativaDeModo.medio < 3 && comparativaDeModo.nuevos === 0
          ? t("Medir contra su liga apenas cambia nada aquí, y eso ya dice algo: este jugador ocupa el mismo sitio en su competición que entre todas. Suele pasar con los que están muy arriba, porque no les queda margen para subir.")
          : tf("Contra su liga, el perfil del jugador se mueve {medio} puntos de percentil de media y hasta {maximo} en una métrica; {nuevos} de los diez primeros son distintos.", {
            medio: comparativaDeModo.medio, maximo: comparativaDeModo.maximo, nuevos: comparativaDeModo.nuevos,
          })}
        </p>}
        <details className="similarity-aviso-rol">
          <summary>{t("Por qué es parecido de rol y no de nivel")}</summary>
          <p>{t("Cada jugador se mide contra los de SU liga en su puesto, no contra los de todas. Eso responde a “quién hace el mismo papel donde juega”, pero esconde el nivel: un percentil 90 de la Canadian Premier League y uno de la MLS salen idénticos y no lo son. Por eso esto es parecido de rol, no parecido a secas. Quedan fuera los jugadores cuya liga no llegue a diez en su puesto, porque ahí un percentil no dice nada.")}</p>
        </details>
      </div>}

      <Paso numero={2}>Dónde buscas, y quién sale</Paso>
      {/* Una sola columna. Los filtros vivían en una columna lateral de 250 px
          junto a los resultados, y los pesos, abiertos, ANTES de ellos: para
          ver quién se parece había que bajar por 666 px de barras. Ahora la
          lista va justo después del jugador objetivo, con sus filtros encima
          como fichas y los pesos plegados dentro, un nivel más abajo. La
          columna mezclaba además cosas que no eran filtros —una nota interna
          del motor y el destinatario del informe— que se van a su sitio. */}
      <div className="similarity-workspace">
        <main className="similarity-results">
          <section ref={rankingRef} className="similarity-ranking-card">
            <div className="similarity-results-head"><div><span>{t("LISTADO DE JUGADORES")}</span><h2>{t("Ranking de similitud")}</h2></div><div className="similarity-results-acciones"><small>{tf("{n} coincidencias", { n: candidates.length })}</small>
              {/* El CSV lleva todos los que pasan los filtros, con las dos cifras de parecido y la cobertura: un 90% con 55% de cobertura no es un 90% con 100. */}
              <BotonExportar
                nombre={[t("parecidos-a"), search?.target.player, ligaCandidato || null, anioCandidato || null]}
                columnas={[t("#"), t("Jugador"), t("Equipo"), t("Liga"), t("Nivel Opta"), t("Año"), t("Edad"), t("Min"), t("Pasaporte"), t("Parecido"), t("Bruto"), t("Cobertura"),
                  ...(conEncaje ? [tf("Encaje de estilo con {equipo}", { equipo: EQUIPO_PROPIO })] : []),
                  ...(encajeEquipo.activo ? [tf("Encaje con {equipo}: puesto", { equipo: equipoEncaje }), tf("Encaje con {equipo}: lugar en la plantilla", { equipo: equipoEncaje }), tf("Encaje con {equipo}: % de partidos con su puesto", { equipo: equipoEncaje })] : [])]}
                cuantas={candidates.length}
                filas={() => candidates.map((candidato, posicion) => [
                  posicion + 1, candidato.name, candidato.team,
                  ligasDeFila(candidato.index).join(" · "),
                  ligasDeFila(candidato.index).map(opta).filter(Boolean).join(" · ") || null,
                  (procedenciaDeBusqueda?.[candidato.index]?.anios ?? []).join(" · "),
                  candidato.age ?? null, Math.round(candidato.minutes), candidato.passport,
                  candidato.ajustado, candidato.similarity, candidato.coverage,
                  ...(conEncaje ? [encaje(candidato.team)?.valor ?? null] : []),
                  ...(encajeEquipo.activo ? (() => {
                    const suyo = encajeEquipo.para(candidato.index);
                    return [suyo?.puesto ?? null, suyo?.lugar ? `${suyo.lugar.lugar}/${suyo.lugar.de}` : null, suyo?.sitio ?? null];
                  })() : []),
                ])}
              />
            </div></div>
            <div className="filtros-barra similarity-filtros" role="group" aria-label={t("Filtros")}>
              <label className="campo-busqueda"><Search size={14} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Escribe un nombre…")} aria-label={t("Buscar jugador o club")} /></label>
              <div className="filtros-chips">
                {ligasDelFondo.length > 1 && <MenuDeLigas ligas={ligasDelFondo} elegida={ligaCandidato}
                  onElegir={setLigaCandidato} ariaLabel={t("Liga del candidato")} />}
                {aniosDelFondo.length > 1 && <Desplegable etiqueta={t("Año")} valor={anioCandidato ? String(anioCandidato) : t("Todos")} activo={Boolean(anioCandidato)}>
                  <select aria-label={t("Año del candidato")} value={anioCandidato || ""} onChange={(event) => setAnioCandidato(Number(event.target.value))}>
                    <option value="">{t("Todos")}</option>
                    {aniosDelFondo.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
                  </select>
                </Desplegable>}
                <label className={ageMin || ageMax ? "filtro-chip numero activo" : "filtro-chip numero"}>
                  <span>{t("Edad")}</span>
                  <input type="number" min="14" max="50" inputMode="numeric" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} placeholder="—" aria-label={t("Edad mínima")} />
                  <span aria-hidden="true">–</span>
                  <input type="number" min="14" max="50" inputMode="numeric" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} placeholder="—" aria-label={t("Edad máxima")} />
                </label>
                <label className="filtro-chip numero">
                  <span>{t("Mín. minutos")}</span>
                  <input type="number" min="0" step="100" inputMode="numeric" value={minimumMinutes} onChange={(event) => cambiarMinutos(event.target.value)} aria-label={t("Mínimo de minutos")} />
                </label>
                <Desplegable etiqueta={t("Rol")} valor={position || t("Todos")} activo={Boolean(position)}>
                  <select aria-label={t("Rol principal")} value={position} onChange={(event) => { setPosition(event.target.value); setSecondaryRole(""); }}><option value="">{t("Todos los roles")}</option>{options.positions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                </Desplegable>
                <button type="button" className={masFiltrosActivos ? "filtro-chip activo rank-mas-filtros" : "filtro-chip rank-mas-filtros"}
                  onClick={() => setMasFiltrosAbierto(true)} aria-controls="mas-filtros-de-similitud" aria-expanded={masFiltrosAbierto}>
                  <span>{t("Más filtros")}</span>{masFiltrosActivos > 0 && <b>{masFiltrosActivos}</b>}
                </button>
              </div>
              <div className="filtros-barra-cola"><button type="button" onClick={resetFilters}>{t("Restablecer filtros")}</button></div>
            </div>
            {/* Lo que estrecha la lista y se usa menos, en el cajón de la
                derecha: la fila de arriba queda para nombre, liga, año, edad,
                minutos y rol. */}
            <aside id="mas-filtros-de-similitud" className={masFiltrosAbierto ? "control-panel cajon-ajustes abierto" : "control-panel cajon-ajustes"}
              aria-label={t("Más filtros")} aria-hidden={!masFiltrosAbierto} inert={!masFiltrosAbierto}>
              <header className="cajon-cabecera">
                <h2>{t("Más filtros")}</h2>
                <button type="button" className="menu-cerrar" aria-label={t("Cerrar")} onClick={() => setMasFiltrosAbierto(false)}><X size={15} /></button>
              </header>
              <div className="panel-seccion">
                <span className="panel-seccion-titulo">{t("Quiénes")}</span>
                <div className="filtros-barra"><div className="filtros-chips">
                  <Desplegable etiqueta={t("Pasaporte")} valor={passport || t("Todos")} activo={Boolean(passport)}>
                    <select aria-label={t("Pasaporte · principal o secundario")} value={passport} onChange={(event) => setPassport(event.target.value)}><option value="">{t("Todos los pasaportes")}</option>{options.passports.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                  </Desplegable>
                </div></div>
              </div>
              <div className="panel-seccion">
                <span className="panel-seccion-titulo">{t("Puesto")}</span>
                <div className="filtros-barra"><div className="filtros-chips">
                  {hayRolesSecundarios && <Desplegable etiqueta={t("Rol secundario")} valor={secondaryRole || t("Cualquiera")} activo={Boolean(secondaryRole)} apagado={!secondaryOptions.length} aviso={secondaryOptions.length ? undefined : t("Este rol no tiene posiciones secundarias en la base")}>
                    <select aria-label={t("Rol secundario · según el primer filtro")} value={secondaryRole} onChange={(event) => setSecondaryRole(event.target.value)} disabled={!secondaryOptions.length}><option value="">{t("Cualquiera")}</option>{secondaryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                  </Desplegable>}
                  <Desplegable etiqueta={t("Lado")} valor={side === "left" ? t("Izquierdo (L)") : side === "right" ? t("Derecho (R)") : t("Cualquiera")} activo={Boolean(side)}>
                    <select aria-label={t("Lado del campo · prefijo L / R")} value={side} onChange={(event) => setSide(event.target.value as "" | "left" | "right")}><option value="">{t("Cualquiera")}</option><option value="left">{t("Izquierdo (L)")}</option><option value="right">{t("Derecho (R)")}</option></select>
                  </Desplegable>
                </div></div>
              </div>
              {conEncaje && <div className="panel-seccion">
                <span className="panel-seccion-titulo">{t("Encaje con un equipo")}</span>
                <div className="filtros-barra"><div className="filtros-chips">
                  <Desplegable etiqueta={t("Encaje con")} valor={equipoEncaje || t("No mostrar")} activo={Boolean(equipoEncaje)}>
                    <select aria-label={t("Encaje con un equipo")} value={equipoEncaje} onChange={(event) => setEquipoEncaje(event.target.value)}>
                      <option value="">{t("No mostrar")}</option>
                      {equiposEncaje.map((equipo) => <option key={equipo} value={equipo}>{equipo}</option>)}
                    </select>
                  </Desplegable>
                </div></div>
                <small className="temporadas-chips-nota">{t("Añade una columna con lo que ese equipo pide en el puesto y el lugar que ocuparía en su plantilla.")}</small>
              </div>}
              <div className="panel-seccion">
                <button type="button" className="button secondary compact" onClick={resetFilters}><RotateCcw size={13} />{t("Restablecer filtros")}</button>
              </div>
            </aside>
            {/* La ponderación sigue junto a la búsqueda porque es parte de
                ella —cambiar un peso cambia QUIÉN sale— pero como una fila
                que se despliega: es afinado, no el camino normal. */}
            <section className={`similarity-weight-panel${pesosVisibles ? "" : " plegado"}`}>
              <button type="button" className="similarity-pesos-fila" aria-expanded={pesosVisibles} onClick={() => cambiarPesosVisibles(!pesosVisibles)}>
                <span><b>{t("Importancia de las métricas")}</b><small>{activeMetricWeights ? tf("{n} métrica{s} con peso personalizado", { n: activeMetricWeights, s: activeMetricWeights === 1 ? "" : "s" }) : t("Todas las métricas tienen peso neutral")}</small></span>
                <ChevronDown size={14} />
              </button>
              {pesosVisibles && <>
                <div className="similarity-pesos-ayuda">
                  <p>{t("100% mantiene el peso normal. Sube una métrica para que influya más en el ranking o llévala a 0% para excluirla.")}</p>
                  <p>{activeMetricWeights
                    ? t("Con pesos personalizados, el parecido se mide solo con estas métricas.")
                    : t("Con los pesos neutrales, el parecido usa todas las métricas que trae la base —no solo estas—, cada una con el peso de lo que se repite de una temporada a otra. Al tocar un peso se mide solo con las de esta lista.")}</p>
                  <button type="button" onClick={resetMetricWeights} disabled={!activeMetricWeights}><RotateCcw size={14} /> {t("Restablecer pesos")}</button>
                </div>
                <div className="similarity-weight-grid">
          {search.target.metrics.map((metric) => {
            const weight = metricWeights[metric.key] ?? 1;
            const percentage = Math.round(weight * 100);
            const group = similarityMetricGroup(metric, search.target.cohort);
            return <label className={weight !== 1 ? "weighted" : ""} style={{ "--metric-weight-color": group.color } as CSSProperties} key={metric.key}>
              <span><i /><b>{t(metric.label)}</b><output>{percentage === 0 ? t("Sin influencia") : `${percentage}%`}</output></span>
              <input type="range" min="0" max="300" step="25" value={percentage} onChange={(event) => updateMetricWeight(metric.key, Number(event.target.value))} aria-label={tf("Peso de {m}: {p}%", { m: t(metric.label), p: percentage })} />
              <small><span>0%</span><span>{t("Neutral 100%")}</span><span>{t("Máx. 300%")}</span></small>
            </label>;
          })}
                </div>
              </>}
            </section>
            {candidates.length ? <div className="similarity-table-wrap"><table className="similarity-table"><thead><tr><th>#</th><th>{t("Jugador")}</th><th>{t("Posiciones")}</th><th>{t("Edad")}</th><th>{t("Minutos")}</th><th>{t("Pasaporte")}</th>{conEncaje && <th title={tf("Cuánto se parece el estilo de su club al de {equipo}", { equipo: EQUIPO_PROPIO })}>{t("Encaje")}</th>}{encajeEquipo.activo && <th>{equipoEncaje}</th>}<th title={t("Parecido corregido por cobertura; debajo, el bruto y la cobertura")}>{t("Similitud")}</th><th /></tr></thead><tbody>{candidates.slice(0, 150).map((candidate, index) => <tr key={candidate.index} className={selectedCandidate?.index === candidate.index ? "selected" : ""} onClick={() => chooseCandidate(candidate, true)}>
              <td>{String(index + 1).padStart(2, "0")}</td>
              <td><b>{candidate.name}</b><small>{[candidate.team, ...ligasDeFila(candidate.index).map((liga) => (opta(liga) ? `${liga} · Opta ${opta(liga)}` : liga))].join(" · ")}</small></td>
              <td><PositionRoles positions={candidate.positions} /></td><td>{candidate.age ?? "—"}</td><td>{Math.round(candidate.minutes).toLocaleString(numberLocale())}</td><td>{candidate.passport}</td>
              {conEncaje && <td><CeldaEncaje encaje={encaje(candidate.team)} cargando={estilos.cargando} /></td>}
              {encajeEquipo.activo && <td><CeldaEncajeEquipo encaje={encajeEquipo.para(candidate.index)} cargandoSitio={encajeEquipo.cargandoSitio} /></td>}
              <td><span className="similarity-score-pill">{candidate.ajustado}%</span><small className={candidate.coverage < 60 ? "similarity-bruto baja" : "similarity-bruto"}>{tf("bruto {n}% · cobertura {c}%", { n: candidate.similarity, c: candidate.coverage })}</small></td>
              <td>{/* El clic sube a la fila: con teclado, el botón es el que la elige. */}<button type="button" aria-pressed={selectedCandidate?.index === candidate.index}>{selectedCandidate?.index === candidate.index ? t("Comparando") : t("Comparar")}</button></td></tr>)}</tbody></table></div> : <div className="similarity-no-results"><Search size={24} /><b>{t("No hay jugadores con estos filtros")}</b><span>{t("Reduce los requisitos de edad, minutos, pasaporte o posición.")}</span></div>}
            <p className="similarity-motor-nota"><b>{t("Motor actual: baseline")}</b> {t("Esta comparación es explicable y funciona con Excel agregados. RisingBALLER–Wyscout podrá reemplazar el vector cuando existan datos por partido.")}</p>
          </section>

          {selectedCandidate && <>
            <Paso numero={3}>El informe de la comparación</Paso>
            {/* La hoja va justo después del ranking, con su barra encima: a quién
                compara, volver a la lista y descargar. Lo que la personaliza
                —fotos, colores, destinatario y comentarios— pasa a pestañas
                debajo: antes eran tres paneles que la empujaban 900 px abajo. */}
            <div ref={barraDeLaHojaRef} className="similarity-hoja-barra">
              <p><span>{t("Comparando")}</span><b>{search.target.player}</b><i aria-hidden="true">↔</i><b>{selectedCandidate.name}</b><em title={t("Parecido corregido por cobertura; debajo, el bruto y la cobertura")}>{`${selectedCandidate.ajustado}%`}</em><small>{tf("bruto {n}% · cobertura {c}%", { n: selectedCandidate.similarity, c: selectedCandidate.coverage })}</small></p>
              <button type="button" className="similarity-volver" onClick={() => irA(rankingRef.current)}>{t("↑ Volver al ranking")}</button>
              {temporadasDelComparable.length > 0 && <div className="similarity-temporadas-comparable">
                <PeriodoDelJugador jugador={selectedCandidate.name} temporadas={temporadasDelComparableParaElegir} periodo={periodoDelComparable}
                  respondido={Boolean(periodoElegidoDelComparable)} onCambiar={cambiarPeriodoDelComparable} donde={t("la comparación")} deshabilitado={cargando} />
                {estadoDelComparable === "calculando" && <small className="temporadas-chips-nota" aria-live="polite">{t("Rehaciéndolo con esas temporadas…")}</small>}
                {estadoDelComparable === "no-llega" && <small className="temporadas-chips-nota aviso" aria-live="polite">{t("Con esas temporadas no llega a los minutos mínimos o le faltan métricas: la hoja sigue con las del ranking.")}</small>}
                {filaDelComparable && <DondeAparece jugador={String(filaDelComparable.Player ?? "")} nacimiento={String(filaDelComparable["Birth date"] ?? "")}
                  estaCargada={estaCargada} onCargar={onCargarCompeticion ? (competicion) => void cargarParaElComparable(competicion) : undefined} cargando={cargando} />}
                {onCargarCompeticion && catalogoParaCargar.length > 0 && <div className="temporadas-cargables" role="group" aria-label={tf("Cargar más temporadas de {p}", { p: selectedCandidate.name })}>
                  <span className="temporadas-chips-titulo">{t("Otra competición")}</span>
                  <div className="temporadas-chips-lista">
                    <span className="temporadas-otra-liga">
                      <MenuDeCompeticiones lista={catalogoParaCargar} elegida={otraLigaDelComparable} onElegir={setOtraLigaDelComparable} />
                      <button type="button" className="button secondary compact" disabled={cargando || !otraLigaDelComparable}
                        onClick={() => { const competicion = catalogoParaCargar[Number(otraLigaDelComparable)]; if (competicion) void cargarParaElComparable(competicion); }}>{t("Cargar")}</button>
                    </span>
                  </div>
                  {cargando && pedida && <small className="temporadas-chips-nota" aria-live="polite">{tf("Cargando {liga} {s}…", { liga: pedida.name, s: pedida.season })}</small>}
                  {pedidaSinElComparable && <small className="temporadas-chips-nota aviso" aria-live="polite">{tf("No aparece en {liga} {s}: prueba con otra liga.", { liga: pedidaSinElComparable.name, s: pedidaSinElComparable.season })}</small>}
                </div>}
              </div>}
              <div className="rank-tabs similarity-estilo-radar" role="group" aria-label={t("Estilo del radar")}>
                <button type="button" className={estiloRadar === "cunas" ? "on" : undefined} aria-pressed={estiloRadar === "cunas"} onClick={() => elegirEstiloRadar("cunas")}>{t("Cuñas")}</button>
                <button type="button" className={estiloRadar === "radar" ? "on" : undefined} aria-pressed={estiloRadar === "radar"} onClick={() => elegirEstiloRadar("radar")}>{t("Radar")}</button>
              </div>
              <div className="comparison-actions"><button className="button secondary" onClick={() => void downloadComparison()} disabled={exportBusy}><ArrowDownToLine size={16} /> {exportBusy ? t("Preparando…") : t("Descargar PNG")}</button><button className="button secondary" onClick={() => void downloadComparisonPdf()} disabled={exportBusy}><Printer size={16} /> {exportBusy ? t("Preparando…") : t("Descargar PDF")}</button></div>
            </div>
            {/* La hoja de similitud en el mismo marco de impresión que Ficha y
                radar: Legal, 8 mm de margen y el ajuste a la hoja de las demás.
                En pantalla, .legal-page-shell es transparente (display: contents). */}
            <div className="legal-page-shell">
              <section ref={reportSheetRef} className="similarity-report-sheet">
                {similarityReportPayload && <SimilarityReportMain payload={similarityReportPayload} />}
                {comparisonNote.trim() && <div className="similarity-note-block"><span>{t("Comentarios")}</span><p>{comparisonNote}</p></div>}
                <footer className="dossier-footer similarity-report-footer"><p>{tf("Percentiles P0–P100 · métricas comunes {n}% · {w}.", { n: selectedCandidate.coverage, w: activeMetricWeights ? tf("{n} ponderaciones personalizadas activas", { n: activeMetricWeights }) : t("pesos métricos uniformes") })}</p><div className="report-signatures"><AutorDelInforme /><div className="report-recipient">{recipientLogoReady ? <ReportImage src={recipientLogoUrl.trim()} alt={reportRecipient} className="dossier-footer-club-logo" /> : <span className="dossier-footer-club-fallback">{reportRecipient.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<div><span>{t("REPORTE GENERADO PARA")}</span><b>{reportRecipient}</b></div></div></div></footer>
              </section>
            </div>
            {exportStatus && <p className="similarity-export-status" aria-live="polite">{exportStatus}</p>}

            <section className="similarity-ajustes" aria-label={t("Personalizar la hoja")}>
              <div className="similarity-ajustes-pestanas" role="tablist">
                {([["texto", t("Destinatario y comentarios")], ["fotos", t("Fotos y perfil")], ["colores", t("Colores y etiquetas")]] as const).map(([id, nombre]) => (
                  <button key={id} type="button" role="tab" id={`ajuste-${id}`} aria-selected={ajusteDeHoja === id} aria-controls="ajuste-panel" onClick={() => setAjusteDeHoja(id)}>{nombre}</button>
                ))}
              </div>
              <div id="ajuste-panel" role="tabpanel" aria-labelledby={`ajuste-${ajusteDeHoja}`} className={`similarity-ajustes-panel ${ajusteDeHoja}`}>
                {ajusteDeHoja === "texto" && <>
                <div className="similarity-recipient-editor">
                  <span>{t("REPORTE GENERADO PARA")}</span>
                  <input value={recipientName} onChange={(event) => onRecipientNameChange(event.target.value)} placeholder={t("Nombre del club")} aria-label={t("Nombre del club destinatario")} />
                  <input type="url" value={recipientLogoUrl} onChange={(event) => onRecipientLogoChange(event.target.value)} placeholder="https://logo-del-club.png" aria-label={t("Link del logo del club destinatario")} />
                  <small>{recipientLogoReady ? t("✓ Logo aplicado a la comparación.") : t("El logo es independiente de los clubes comparados.")}</small>
                </div>
                <div className="similarity-note-editor">
                  <label>
                    <span>{t("Comentarios")}{!aiControlsHidden && <button type="button" className="reading-ai" disabled={comparisonAiLoading} onClick={() => void writeComparisonNote()}><Sparkles size={11} /> {comparisonAiLoading ? t("Escribiendo…") : t("Escribir con IA")}</button>}</span>
                    <textarea value={comparisonNote} rows={3} placeholder={t("Escribe tu lectura de la comparación: contexto, rol y recomendación.")} onChange={(event) => setComparisonNote(event.target.value)} />
                    {comparisonAiError && !aiControlsHidden && <small className="inline-error ai-error"><span>{comparisonAiError}</span><button type="button" onClick={() => setComparisonAiError("")} aria-label={t("Ocultar aviso")}>×</button></small>}
                  </label>
                  <small>{t("Aparece dentro de la hoja, debajo de la comparación, respetando los márgenes de la página.")}</small>
                </div>
                </>}
                {ajusteDeHoja === "fotos" && <>
                <section className="similarity-enrichment-grid">
                  <ProfileEnrichment side="target" label={t("Jugador objetivo")} player={search.target.player} color={targetColor} profile={targetProfile} busy={profileBusy === "target"} backgroundBusy={backgroundBusy === "target"} locked={profileBusy !== null || backgroundBusy !== null} canRestore={Boolean(backgroundOriginals[profileStorageKey(search.target.player, search.target.team)])} status={profileStatus.target} onExtract={(url) => extractProfile("target", url)} onImageUrl={(url) => applyPlayerImageUrl("target", url)} onImageFile={(file) => loadPlayerImage("target", file)} onRemoveBackground={() => removePlayerBackground("target")} onRestoreBackground={() => restorePlayerBackground("target")} onDownload={downloadAsset} />
                  <ProfileEnrichment side="candidate" label={t("Jugador comparable")} player={selectedCandidate.name} color={candidateColor} profile={candidateProfile} busy={profileBusy === "candidate"} backgroundBusy={backgroundBusy === "candidate"} locked={profileBusy !== null || backgroundBusy !== null} canRestore={Boolean(backgroundOriginals[profileStorageKey(selectedCandidate.name, selectedCandidate.team)])} status={profileStatus.candidate} onExtract={(url) => extractProfile("candidate", url)} onImageUrl={(url) => applyPlayerImageUrl("candidate", url)} onImageFile={(file) => loadPlayerImage("candidate", file)} onRemoveBackground={() => removePlayerBackground("candidate")} onRestoreBackground={() => restorePlayerBackground("candidate")} onDownload={downloadAsset} />
                </section>
                </>}
                {ajusteDeHoja === "colores" && <>
                <section className="similarity-color-panel">
                  <div className="similarity-color-heading"><span>{t("PALETA DE COMPARACIÓN")}</span><b>{t("Personaliza jugadores y labels")}</b><small>{t("Define el color del jugador, el color del label de percentil y la transparencia de su fondo.")}</small></div>
                  <PalettePicker label={t("Jugador objetivo")} player={search.target.player} color={targetColor} labelColor={targetLabelColor} labelTransparency={targetLabelTransparency} photoScale={targetPhotoScale} photoFit={targetPhotoFit} onPhotoFitChange={setTargetPhotoFit} colors={paletteColors} onChange={setTargetColorChoice} onLabelColorChange={setTargetLabelColorChoice} onLabelTransparencyChange={setTargetLabelTransparency} onPhotoScaleChange={setTargetPhotoScale} />
                  <PalettePicker label={t("Jugador comparable")} player={selectedCandidate.name} color={candidateColor} labelColor={candidateLabelColor} labelTransparency={candidateLabelTransparency} photoScale={candidatePhotoScale} photoFit={candidatePhotoFit} onPhotoFitChange={setCandidatePhotoFit} colors={paletteColors} onChange={setCandidateColorChoice} onLabelColorChange={setCandidateLabelColorChoice} onLabelTransparencyChange={setCandidateLabelTransparency} onPhotoScaleChange={setCandidatePhotoScale} />
                </section>
                </>}
              </div>
            </section>
          </>}
        </main>
      </div>
      </>}
    </>}
  </div>;
}

function ProfileEnrichment({ side, label, player, color, profile, busy, backgroundBusy, locked, canRestore, status, onExtract, onImageUrl, onImageFile, onRemoveBackground, onRestoreBackground, onDownload }: { side: ProfileSide; label: string; player: string; color: string; profile: TransfermarktProfile; busy: boolean; backgroundBusy: boolean; locked: boolean; canRestore: boolean; status: string; onExtract: (url: string) => void; onImageUrl: (url: string) => void; onImageFile: (file?: File) => void; onRemoveBackground: () => void; onRestoreBackground: () => void; onDownload: (src: string, name: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("transfermarktUrl") ?? "").trim();
    if (url) onExtract(url);
  }
  function submitImageUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("playerImageUrl") ?? "").trim();
    if (url) onImageUrl(url);
  }
  const remotePlayerImage = /^https?:\/\//i.test(profile.playerImage) ? profile.playerImage : "";
  return <article className="similarity-enrichment-card" style={{ "--player-color": color } as CSSProperties}>
    <div className="enrichment-profile-preview">{profile.playerImage ? <ReportImage src={profile.playerImage} alt={player} className="enrichment-player-image" /> : <span>{player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}{profile.clubLogo && <ReportImage src={profile.clubLogo} alt={profile.club || t("Club")} className="enrichment-club-logo" />}</div>
    <div className="enrichment-profile-copy">
      <span>{label}</span><b>{player}</b><small>{profile.club || t("Agrega Transfermarkt para cargar club, foto y escudo")}</small>
      <ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="enrichment-transfermarkt-logo" />
      <form key={`${side}-${player}-${profile.sourceUrl}`} onSubmit={submit}><input name="transfermarktUrl" type="url" required defaultValue={profile.sourceUrl} placeholder="https://www.transfermarkt.com/..." aria-label={tf("Link de Transfermarkt de {p}", { p: player })} /><button type="submit" disabled={locked}><Sparkles size={13} /> {busy ? t("Extrayendo…") : t("Extraer imágenes")}</button></form>
      <form className="enrichment-image-source" key={`${side}-${player}-${remotePlayerImage || "local"}`} onSubmit={submitImageUrl}>
        <span>{t("FOTO DEL JUGADOR · LINK O ARCHIVO")}</span>
        <input name="playerImageUrl" type="url" required defaultValue={remotePlayerImage} placeholder="https://imagen-del-jugador.png" aria-label={tf("Link directo de la foto de {p}", { p: player })} />
        <button type="submit" disabled={locked}>{t("Usar link")}</button>
        <label><Upload size={12} /><span>{t("Ordenador")}</span><input type="file" accept="image/png,image/webp,image/jpeg" hidden disabled={locked} onChange={(event) => { onImageFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </form>
      {status && <p aria-live="polite">{status}</p>}
      <div className="enrichment-background-tools"><button type="button" onClick={onRemoveBackground} disabled={locked || !profile.playerImage}><Sparkles size={12} /> {backgroundBusy ? t("Quitando fondo…") : t("Quitar fondo solo a la foto")}</button>{canRestore && <button className="restore" type="button" onClick={onRestoreBackground} disabled={locked}>{t("Restaurar original")}</button>}</div>
      <small className="enrichment-background-note">{t("El escudo conserva siempre su fondo original.")}</small>
      <div className="enrichment-downloads"><button type="button" disabled={!profile.playerImage || backgroundBusy} onClick={() => onDownload(profile.playerImage, `${player}-${t("foto")}`)}>{t("⇩ Foto")}</button><button type="button" disabled={!profile.clubLogo || backgroundBusy} onClick={() => onDownload(profile.clubLogo, `${profile.club || player}-${t("escudo")}`)}>{t("⇩ Escudo")}</button></div>
    </div>
  </article>;
}

function PalettePicker({ label, player, color, labelColor, labelTransparency, photoScale = 100, photoFit = "auto", colors, onChange, onLabelColorChange, onLabelTransparencyChange, onPhotoScaleChange, onPhotoFitChange }: { label: string; player: string; color: string; labelColor: string; labelTransparency: number; photoScale?: number; photoFit?: "auto" | "contain" | "cover"; colors: string[]; onChange: (color: string) => void; onLabelColorChange: (color: string) => void; onLabelTransparencyChange: (value: number) => void; onPhotoScaleChange?: (value: number) => void; onPhotoFitChange?: (value: "auto" | "contain" | "cover") => void }) {
  const labelOpacity = `${100 - labelTransparency}%`;
  return <div className="similarity-palette-picker">
    <div><span>{label}</span><b><i style={{ backgroundColor: color }} />{player}</b></div>
    <div className="similarity-palette-swatches">{colors.map((option) => <button key={option} type="button" className={option.toLocaleLowerCase("en") === color.toLocaleLowerCase("en") ? "selected" : ""} style={{ "--swatch": option } as CSSProperties} aria-label={tf("Asignar color {c} a {p}", { c: option, p: player })} aria-pressed={option.toLocaleLowerCase("en") === color.toLocaleLowerCase("en")} onClick={() => onChange(option)}><span /></button>)}<label><span>{t("Personalizado")}</span><input type="color" value={color} onChange={(event) => onChange(event.target.value)} aria-label={tf("Color personalizado para {p}", { p: player })} /></label></div>
    <div className="similarity-percentile-style">
      <span>{t("LABEL DE PERCENTIL")}</span>
      <output style={{ "--label-preview-color": labelColor, "--label-preview-opacity": labelOpacity } as CSSProperties}>P85</output>
      <label className="label-color-control"><span>{t("Color")}</span><input type="color" value={labelColor} onChange={(event) => onLabelColorChange(event.target.value)} aria-label={tf("Color del label de percentil de {p}", { p: player })} /></label>
      <label className="label-transparency-control"><span>{t("Transparencia del fondo")} <b>{labelTransparency}%</b></span><input type="range" min="0" max="100" step="1" value={labelTransparency} onChange={(event) => onLabelTransparencyChange(Number(event.target.value))} aria-label={tf("Transparencia del label de percentil de {p}", { p: player })} /></label>
    </div>
    {onPhotoFitChange && <div className="photo-fit-control" role="group" aria-label={tf("Ajuste de la foto de {p}", { p: player })}>
      <span>{t("Ajuste de la foto")}</span>
      <div>
        {([["auto", t("Automático")], ["contain", t("Completa")], ["cover", t("Rellenar")]] as Array<["auto" | "contain" | "cover", string]>).map(([mode, texto]) => (
          <button key={mode} type="button" className={photoFit === mode ? "active" : ""} onClick={() => onPhotoFitChange(mode)}>{texto}</button>
        ))}
      </div>
    </div>}
    {onPhotoScaleChange && <label className="photo-scale-control"><span>{t("Tamaño de la foto")} <b>{photoScale}%</b></span><input type="range" min="60" max="140" step="5" value={photoScale} onChange={(event) => onPhotoScaleChange(Number(event.target.value))} aria-label={tf("Tamaño de la foto de {p}", { p: player })} /></label>}
  </div>;
}

function ReportImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Las imágenes provienen de Transfermarkt o de un enlace elegido por el usuario.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

function PositionRoles({ positions }: { positions: PlayerPosition[] }) {
  if (!positions.length) return <span>—</span>;
  return <div className="position-role-list">{positions.map((position, index) => <span key={`${position.code}-${index}`}><em>{index === 0 ? t("1ª") : index === 1 ? t("2ª") : index === 2 ? t("3ª") : tf("{n}ª", { n: index + 1 })}</em><b>{position.role}</b><small>{position.code}</small></span>)}</div>;
}
