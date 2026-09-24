"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Check,
  ChevronRight,
  Columns,
  Grip,
  ImageIcon,
  LayoutDashboard,
  MoveDown,
  MoveUp,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TextIcon,
  Trash,
  Upload,
} from "./Icons";
import { DEFAULT_REPORT_THEME, REPORT_THEMES, reportThemeStyle, type ReportTheme } from "./reportTheme";
import { fetchAiSummary, type AiMetricFact, type AiPlayerFacts } from "@/lib/remoteData";
import { PieDeReporte } from "./PieDeReporte";
import { SimilarityReportMain, type SimilarityReportPayload } from "./SimilarityReport";
import { PIEZAS_FICHA, PiezaSuelta, esPieza, type ContextoFicha } from "./PiezasFicha";
import { COMPUESTAS } from "@/lib/snapshot";
import { t, tDefault, tf } from "@/lib/i18n";
import {
  clampReportBlockHeight,
  clampReportBlockSpan,
  reportBlockHeightBounds,
  resizeReportBlock,
  migrateReportGrid,
  REPORT_GRID_COLUMNS,
  REPORT_SPAN_PRESETS,
  similarityGridRows,
  type ReportBlockKind,
  type ReportBlockResizeMode,
} from "@/lib/reportPageLayout";

// "pieza" es un gráfico de la ficha ampliada dibujado con los datos del
// jugador del informe: se coloca y se estira como una imagen, pero es vector.
type BlockType = "image" | "text" | "pieza";
type TextAlign = "left" | "center" | "right";
type ImageFit = "cover" | "contain";

type PageBlock = {
  id: string;
  type: BlockType;
  title: string;
  content: string;
  image: string;
  html?: string;
  similarity?: SimilarityReportPayload;
  /** Qué pieza de la ficha ampliada dibuja un bloque "pieza". */
  pieza?: string;
  /** El ajuste propio de la pieza: la familia del Top 10. */
  opcion?: string;
  span: number;
  height: number;
  fit: ImageFit;
  bold: boolean;
  italic: boolean;
  font: string;
  fontSize: number;
  color: string;
  align: TextAlign;
};

type PageConfig = {
  title: string;
  columns: number;
  gap: number;
  blocks: PageBlock[];
};

type DesignerState = Record<number, PageConfig>;

type ResizeSession = {
  id: string;
  pointerId: number;
  mode: ReportBlockResizeMode;
  kind: ReportBlockKind;
  similarityNotes: boolean;
  startX: number;
  startY: number;
  startHeight: number;
  startSpan: number;
  columnStep: number;
  columns: number;
};

const FIRST_VISUAL_PAGE = 3;
const SIMILARITY_BLOCK_ID = "p2-similarity-comparison";
const SIMILARITY_NOTES_BLOCK_ID = "p2-similarity-notes";

const SHARED_TEXT_COLORS = new Set([
  ...REPORT_THEMES.map((theme) => theme.ink.toLowerCase()),
  "#17323a",
  "#2c4249",
]);

/** Para los altos mínimos y máximos, una pieza cuenta como una imagen. */
const altoDe = (type: BlockType): ReportBlockKind => (type === "text" ? "text" : "image");
const nombreTipo = (type: BlockType) => (type === "image" ? t("Imagen") : type === "pieza" ? t("Pieza") : t("Texto"));

function usesSharedTextColor(color: string, currentInk?: string) {
  const normalized = color.toLowerCase();
  return SHARED_TEXT_COLORS.has(normalized) || normalized === currentInk?.toLowerCase();
}

function imageBlock(id: string, title: string, span = 1, height = 280): PageBlock {
  return { id, type: "image", title, content: "", image: "", html: "", similarity: undefined, span, height, fit: "contain", bold: false, italic: false, font: "barlow", fontSize: 18, color: DEFAULT_REPORT_THEME.ink, align: "left" };
}

function textBlock(id: string, title: string, content: string, span = 2, height = 190): PageBlock {
  return { id, type: "text", title, content, image: "", span, height, fit: "cover", bold: false, italic: false, font: "barlow", fontSize: 17, color: DEFAULT_REPORT_THEME.ink, align: "left" };
}

// Plantilla para cualquier página de visualizaciones. La primera trae mapas,
// las siguientes arrancan con un lienzo mixto listo para llenar.
function defaultPage(pageNumber: number): PageConfig {
  if (pageNumber === FIRST_VISUAL_PAGE) {
    return {
      title: "Mapa visual del rendimiento",
      columns: REPORT_GRID_COLUMNS,
      gap: 18,
      blocks: [
        imageBlock(`p${pageNumber}-shotmap`, "Mapa de remates", 6),
        imageBlock(`p${pageNumber}-heatmap`, "Mapa de calor", 6),
        imageBlock(`p${pageNumber}-actions`, "Acciones con balón", 6),
        imageBlock(`p${pageNumber}-defence`, "Acciones defensivas", 6),
      ],
    };
  }
  return {
    title: "Observaciones y contexto",
    columns: REPORT_GRID_COLUMNS,
    gap: 18,
    blocks: [
      textBlock(`p${pageNumber}-summary`, "Resumen del scout", "Agrega aquí tu lectura del jugador: contexto competitivo, rol ideal, fortalezas transferibles y riesgos observados.", 12, 190),
      imageBlock(`p${pageNumber}-frame-a`, "Secuencia destacada", 6, 300),
      imageBlock(`p${pageNumber}-frame-b`, "Comportamiento táctico", 6, 300),
      textBlock(`p${pageNumber}-decision`, "Conclusión", "Recomendación final y próximos pasos de seguimiento.", 12, 160),
    ],
  };
}

function defaultPages(pageNumber: number): DesignerState {
  return { [pageNumber]: defaultPage(pageNumber) };
}

const FONT_OPTIONS = [
  { value: "barlow", label: "Barlow", family: "var(--font-barlow), Arial, sans-serif" },
  { value: "condensed", label: "Barlow Condensed", family: "var(--font-barlow-condensed), Arial, sans-serif" },
  { value: "serif", label: "Editorial Serif", family: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Mono", family: "'SFMono-Regular', Consolas, monospace" },
];

const COMMENT_PREFIX = "Comentario · ";

// Traduce títulos/contenidos SOLO cuando siguen siendo los textos por defecto
// de la app; lo escrito por el usuario se muestra tal cual. Los títulos
// compuestos "Comentario · X" traducen prefijo y, si aplica, el título X.
function displayText(value: string) {
  if (value.startsWith(COMMENT_PREFIX)) {
    return tf("Comentario · {t}", { t: tDefault(value.slice(COMMENT_PREFIX.length)) });
  }
  return tDefault(value);
}

function fontFamily(font: string) {
  return FONT_OPTIONS.find((option) => option.value === font)?.family ?? FONT_OPTIONS[0].family;
}

function LocalPreviewImage({ src, alt, fit }: { src: string; alt: string; fit: ImageFit }) {
  // La imagen es un archivo local del usuario; no debe pasar por un optimizador remoto.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ objectFit: fit }} />;
}

function updateBlock(config: PageConfig, id: string, patch: Partial<PageBlock>) {
  return { ...config, blocks: config.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) };
}



export function ReportPageDesigner({ pageNumber, player, team, position, theme, onThemeChange, recipientName = "", recipientLogoUrl = "", persist = true, aiFacts, ficha }: { pageNumber: number; player: string; team: string; position: string; theme: ReportTheme; onThemeChange: (theme: ReportTheme) => void; recipientName?: string; recipientLogoUrl?: string; persist?: boolean; aiFacts?: () => { lang: string; player: AiPlayerFacts; metrics: AiMetricFact[] }; ficha?: ContextoFicha }) {
  const [pages, setPages] = useState<DesignerState>(() => defaultPages(pageNumber));
  const [selectedId, setSelectedId] = useState(() => defaultPage(pageNumber).blocks[0].id);
  const [draggedId, setDraggedId] = useState("");
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [pestana, setPestana] = useState<"pagina" | "bloque">("pagina");
  const gridRef = useRef<HTMLDivElement>(null);
  const config = pages[pageNumber] ?? defaultPage(pageNumber);
  const selected = useMemo(() => config.blocks.find((block) => block.id === selectedId) ?? null, [config.blocks, selectedId]);
  const hasSimilarityComparison = pageNumber === 2 && config.blocks.some((block) => block.id === SIMILARITY_BLOCK_ID && Boolean(block.similarity || block.html || block.image));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("fos-scout-page-designer-v1");
        const saved = stored ? JSON.parse(stored) as DesignerState : {};
        // Cada página se repone con su plantilla si no existe todavía en el
        // diseño guardado; así funcionan las páginas 4, 5, 6… recién creadas.
        // Los diseños guardados con la rejilla vieja (1-3 columnas) se
        // convierten a doceavos para conservar sus proporciones.
        const nextPages: DesignerState = Object.fromEntries(
          Object.entries(saved).map(([key, page]) => [key, page?.blocks?.length ? migrateReportGrid(page) : page]),
        ) as DesignerState;
        if (!nextPages[pageNumber]?.blocks?.length) nextPages[pageNumber] = defaultPage(pageNumber);
        setPages(nextPages);
        setSelectedId(nextPages[pageNumber].blocks[0]?.id ?? "");
      } catch { /* La configuración local es opcional. */ }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pageNumber]);

  useEffect(() => {
    // Las instancias montadas solo para imprimir no escriben: varias páginas
    // simultáneas se pisarían la clave compartida con snapshots desfasados.
    if (!loaded || !persist) return;
    try { window.localStorage.setItem("fos-scout-page-designer-v1", JSON.stringify(pages)); } catch { /* Sin persistencia si el navegador la bloquea. */ }
  }, [loaded, pages, persist]);

  useEffect(() => {
    if (!loaded || !selectedId || selected?.type !== "text") return;
    const frame = window.requestAnimationFrame(() => {
      const content = gridRef.current?.querySelector<HTMLElement>(`[data-block-id="${selectedId}"] .visual-text-content`);
      if (!content) return;
      const extraHeight = content.scrollHeight - content.clientHeight;
      if (extraHeight <= 2) return;
      setPages((current) => {
        const currentBlock = current[pageNumber].blocks.find((block) => block.id === selectedId);
        if (!currentBlock || currentBlock.type !== "text") return current;
        const height = clampReportBlockHeight(
          currentBlock.height + extraHeight,
          currentBlock.type,
          currentBlock.id === SIMILARITY_NOTES_BLOCK_ID,
        );
        if (height === currentBlock.height) return current;
        return {
          ...current,
          [pageNumber]: updateBlock(current[pageNumber], currentBlock.id, { height }),
        };
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loaded, pageNumber, selected?.bold, selected?.content, selected?.font, selected?.fontSize, selected?.italic, selected?.type, selectedId]);

  useEffect(() => {
    if (!resizeSession) return;

    function finishResize(event: PointerEvent) {
      if (event.pointerId !== resizeSession?.pointerId) return;
      setResizeSession(null);
    }

    function resizeBlock(event: PointerEvent) {
      if (event.pointerId !== resizeSession?.pointerId) return;
      event.preventDefault();
      const nextSize = resizeReportBlock({
        mode: resizeSession.mode,
        kind: resizeSession.kind,
        similarityNotes: resizeSession.similarityNotes,
        startHeight: resizeSession.startHeight,
        startSpan: resizeSession.startSpan,
        deltaX: event.clientX - resizeSession.startX,
        deltaY: event.clientY - resizeSession.startY,
        columnStep: resizeSession.columnStep,
        columns: resizeSession.columns,
      });
      setPages((current) => ({
        ...current,
        [pageNumber]: updateBlock(current[pageNumber], resizeSession.id, nextSize),
      }));
    }

    document.body.classList.add("is-resizing-report-block");
    if (resizeSession.mode === "height") document.body.classList.add("is-resizing-report-block-height");
    window.addEventListener("pointermove", resizeBlock, { passive: false });
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      document.body.classList.remove("is-resizing-report-block");
      document.body.classList.remove("is-resizing-report-block-height");
      window.removeEventListener("pointermove", resizeBlock);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [pageNumber, resizeSession]);

  function setConfig(updater: (current: PageConfig) => PageConfig) {
    setPages((current) => ({ ...current, [pageNumber]: updater(current[pageNumber]) }));
  }

  // Tocar un bloque lleva el inspector a sus ajustes, como en Pages: quien
  // acaba de elegir algo quiere editarlo, no buscar dónde se edita.
  function elegirBloque(id: string) {
    setSelectedId(id);
    setPestana("bloque");
  }

  function patchSelected(patch: Partial<PageBlock>) {
    if (!selected) return;
    setConfig((current) => updateBlock(current, selected.id, patch));
  }

  function addBlock(type: BlockType) {
    if (hasSimilarityComparison) {
      elegirBloque(type === "text" ? SIMILARITY_NOTES_BLOCK_ID : SIMILARITY_BLOCK_ID);
      return;
    }
    const id = `p${pageNumber}-${type}-${Date.now()}`;
    // Se guarda la clave en español; la traducción ocurre al mostrar, así el
    // bloque no queda congelado en el idioma activo al crearlo.
    // Media hoja: un bloque recién creado tiene que nacer legible. Con la
    // rejilla de 12, un span de 1 o 2 dejaba tiras de 40-70 px inservibles.
    const newSpan = clampReportBlockSpan(Math.round(config.columns / 2), config.columns);
    const block = type === "image"
      ? imageBlock(id, "Nueva visualización", newSpan, 260)
      : { ...textBlock(id, "Nuevo bloque de texto", "Escribe aquí tu análisis…", newSpan, 180), color: theme.ink };
    setConfig((current) => ({ ...current, blocks: [...current.blocks, block] }));
    elegirBloque(id);
  }

  // Una pieza nace con el tamaño en que se lee sin tocar nada: los mapas de
  // campo entero, en tercios y altos; el radar y las listas, a media hoja.
  function addPieza(id: string) {
    const pieza = PIEZAS_FICHA.find((candidata) => candidata.id === id);
    if (!pieza || hasSimilarityComparison) return;
    const blockId = `p${pageNumber}-pieza-${Date.now()}`;
    const block: PageBlock = { ...imageBlock(blockId, pieza.titulo, clampReportBlockSpan(pieza.ancho, config.columns), pieza.alto), type: "pieza", pieza: pieza.id };
    setConfig((current) => ({ ...current, blocks: [...current.blocks, block] }));
    elegirBloque(blockId);
  }

  function addImageComment(placement: "below" | "side") {
    if (!selected || selected.type !== "image") return;
    if (hasSimilarityComparison) {
      elegirBloque(SIMILARITY_NOTES_BLOCK_ID);
      return;
    }
    const id = `p${pageNumber}-comment-${Date.now()}`;
    setConfig((current) => {
      const columns = Math.max(2, current.columns);
      // Al costado: dos tercios para la imagen y un tercio para el comentario.
      const imageSpan = placement === "side" ? clampReportBlockSpan(Math.round(columns * 2 / 3), columns) : columns;
      const commentSpan = placement === "side" ? clampReportBlockSpan(columns - imageSpan, columns) : columns;
      const sourceIndex = current.blocks.findIndex((block) => block.id === selected.id);
      // Si la página era de 1 columna, el resto de bloques ocupaba el ancho
      // completo: se escalan a las columnas nuevas para que no queden a mitad.
      const blocks = current.blocks.map((block) => {
        if (block.id === selected.id) return { ...block, span: imageSpan };
        return block.span >= current.columns && columns > current.columns ? { ...block, span: columns } : block;
      });
      const comment = { ...textBlock(
        id,
        `Comentario · ${selected.title || "Imagen"}`,
        "Escribe aquí la observación o el contexto de esta imagen…",
        commentSpan,
        placement === "side" ? selected.height : 150,
      ), color: theme.ink };
      blocks.splice(sourceIndex + 1, 0, comment);
      return { ...current, columns, blocks };
    });
    elegirBloque(id);
  }

  function removeSelected() {
    if (!selected) return;
    if (hasSimilarityComparison && selected.id === SIMILARITY_NOTES_BLOCK_ID) {
      setConfig((current) => updateBlock(current, selected.id, {
        content: t("Agrega aquí tu lectura, contexto o recomendación sobre la comparación."),
      }));
      return;
    }
    const index = config.blocks.findIndex((block) => block.id === selected.id);
    const nextBlocks = config.blocks.filter((block) => block.id !== selected.id);
    const removedComparison = selected.id === SIMILARITY_BLOCK_ID;
    setConfig((current) => ({
      ...current,
      blocks: nextBlocks.length || !removedComparison ? nextBlocks : defaultPage(pageNumber).blocks,
      // Al quitar la comparación importada, el título vuelve al de la página normal.
      title: removedComparison && /comparación de similitud|similarity comparison/i.test(current.title) ? defaultPage(pageNumber).title : current.title,
    }));
    setSelectedId(nextBlocks[Math.max(0, index - 1)]?.id ?? "");
  }

  function moveSelected(direction: -1 | 1) {
    if (!selected) return;
    if (hasSimilarityComparison) return;
    const from = config.blocks.findIndex((block) => block.id === selected.id);
    const to = Math.max(0, Math.min(config.blocks.length - 1, from + direction));
    if (from === to) return;
    const blocks = [...config.blocks];
    const [moving] = blocks.splice(from, 1);
    blocks.splice(to, 0, moving);
    setConfig((current) => ({ ...current, blocks }));
  }

  // Informe extendido dentro del bloque de texto seleccionado: se escribe en
  // el contenido del bloque, así que después se edita como cualquier otro.
  async function writeExtendedReport(blockId: string) {
    if (!aiFacts) return;
    setAiLoading(true);
    setAiError("");
    try {
      const facts = aiFacts();
      const text = await fetchAiSummary({ kind: "extended", lang: facts.lang, player: facts.player, metrics: facts.metrics });
      setPages((current) => ({ ...current, [pageNumber]: updateBlock(current[pageNumber], blockId, { content: text }) }));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiLoading(false);
    }
  }

  function applyLayout(layout: "single" | "split" | "feature" | "mosaic") {
    if (hasSimilarityComparison) return;
    // Las plantillas reparten la rejilla de 12: una columna (12), mitades (6),
    // destacado (8 + 4) y mosaico de tercios (4).
    const spanFor = (index: number) => {
      if (layout === "single") return 12;
      if (layout === "split") return 6;
      if (layout === "feature") return index === 0 ? 8 : 4;
      return index === 0 ? 8 : 4;
    };
    setConfig((current) => ({
      ...current,
      columns: REPORT_GRID_COLUMNS,
      blocks: current.blocks.map((block, index) => ({
        ...block,
        span: layout === "mosaic" ? 4 : spanFor(index),
      })),
    }));
  }

  function applyTheme(nextTheme: ReportTheme) {
    // Se recorren TODAS las páginas: con páginas 4, 5, 6… reconstruir solo dos
    // claves borraría el resto en silencio.
    setPages((current) => Object.fromEntries(Object.entries(current).map(([key, page]) => [
      key,
      { ...page, blocks: page.blocks.map((block) => block.type === "text" && usesSharedTextColor(block.color, theme.ink) ? { ...block, color: nextTheme.ink } : block) },
    ])));
    onThemeChange(nextTheme);
  }

  function onImage(file: File | undefined, blockId: string) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setConfig((current) => updateBlock(current, blockId, { image: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  }

  function onDropBlock(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (hasSimilarityComparison) return;
    if (!draggedId || draggedId === targetId) return;
    const blocks = [...config.blocks];
    const from = blocks.findIndex((block) => block.id === draggedId);
    const to = blocks.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const [moving] = blocks.splice(from, 1);
    blocks.splice(to, 0, moving);
    setConfig((current) => ({ ...current, blocks }));
    setDraggedId("");
  }

  function startBlockResize(event: ReactPointerEvent<HTMLButtonElement>, block: PageBlock, mode: ReportBlockResizeMode) {
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;
    const gridWidth = grid.getBoundingClientRect().width;
    const columnWidth = (gridWidth - config.gap * (config.columns - 1)) / config.columns;
    if (columnWidth <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    elegirBloque(block.id);
    setDraggedId("");
    setResizeSession({
      id: block.id,
      pointerId: event.pointerId,
      mode,
      kind: altoDe(block.type),
      similarityNotes: block.id === SIMILARITY_NOTES_BLOCK_ID,
      startX: event.clientX,
      startY: event.clientY,
      startHeight: clampReportBlockHeight(block.height, altoDe(block.type), block.id === SIMILARITY_NOTES_BLOCK_ID),
      startSpan: clampReportBlockSpan(block.span, config.columns),
      columnStep: columnWidth + config.gap,
      columns: config.columns,
    });
  }

  function resizeBlockWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, block: PageBlock, mode: ReportBlockResizeMode) {
    const step = event.shiftKey ? 40 : 10;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      setConfig((current) => updateBlock(current, block.id, {
        height: clampReportBlockHeight(block.height + direction * step, altoDe(block.type), block.id === SIMILARITY_NOTES_BLOCK_ID),
      }));
    }
    if (mode === "both" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setConfig((current) => updateBlock(current, block.id, { span: clampReportBlockSpan(block.span + direction, current.columns) }));
    }
  }

  const canvasStyle = reportThemeStyle(theme);
  const selectedHeightBounds = selected
    ? reportBlockHeightBounds(altoDe(selected.type), selected.id === SIMILARITY_NOTES_BLOCK_ID)
    : reportBlockHeightBounds("text");
  const spanElegido = selected ? clampReportBlockSpan(selected.span, config.columns) : 0;
  const similarityNotes = hasSimilarityComparison
    ? config.blocks.find((block) => block.id === SIMILARITY_NOTES_BLOCK_ID && block.type === "text")
    : undefined;
  const gridStyle = {
    gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
    gridTemplateRows: similarityNotes ? similarityGridRows(similarityNotes.height) : undefined,
    gap: config.gap,
  } as CSSProperties;

  return (
    <div className="designer-workspace">
      {/* El inspector, como el de Pages o Keynote.

          Eran cinco secciones seguidas en una columna de 1.150 px —plantilla,
          colores, añadir, el bloque elegido y restablecer—, cada una con su
          borde dentro de otro borde, así que para cambiar el tamaño de letra
          había que bajar pasando por la paleta. Ahora son dos pestañas: lo que
          afecta a la página y lo que afecta al bloque. Dentro, filas agrupadas:
          el nombre a la izquierda y el valor o el control a la derecha. */}
      <aside className="designer-controls inspector">
        <header className="inspector-cabecera">
          <h2>{tf("Página {n}", { n: pageNumber })}</h2>
          <span className="inspector-guardado"><Check size={12} />{t("Se guarda sola")}</span>
        </header>
        <div className="inspector-pestanas" role="tablist" aria-label={t("Ajustes del diseño")}>
          <button type="button" role="tab" aria-selected={pestana === "pagina"} className={pestana === "pagina" ? "activa" : ""} onClick={() => setPestana("pagina")}>{t("Página")}</button>
          <button type="button" role="tab" aria-selected={pestana === "bloque"} className={pestana === "bloque" ? "activa" : ""} onClick={() => setPestana("bloque")}>{t("Bloque")}</button>
        </div>

        {pestana === "pagina" ? <>
          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Plantilla de grid")}<small>{tf("{n} columnas", { n: config.columns })}</small></h3>
            <div className="inspector-tarjeta">
              <div className="inspector-plantillas">
                <button type="button" disabled={hasSimilarityComparison} onClick={() => applyLayout("single")} title={t("Una columna")}><i className="layout-one"><b /></i><span>{t("Simple")}</span></button>
                <button type="button" disabled={hasSimilarityComparison} onClick={() => applyLayout("split")} title={t("Dos columnas")}><i className="layout-two"><b /><b /></i><span>{t("Doble")}</span></button>
                <button type="button" disabled={hasSimilarityComparison} onClick={() => applyLayout("feature")} title={t("Bloque destacado")}><i className="layout-feature"><b /><b /><b /></i><span>{t("Portada")}</span></button>
                <button type="button" disabled={hasSimilarityComparison} onClick={() => applyLayout("mosaic")} title={t("Mosaico")}><i className="layout-mosaic"><b /><b /><b /></i><span>{t("Mosaico")}</span></button>
              </div>
              <label className="inspector-fila inspector-deslizador"><span>{t("Espacio entre bloques")}</span><b>{config.gap}px</b><input type="range" min="4" max="40" value={config.gap} onChange={(event) => setConfig((current) => ({ ...current, gap: Number(event.target.value) }))} /></label>
            </div>
            {hasSimilarityComparison && <p className="inspector-pie">{t("La comparación mantiene una estructura fija para que el texto nunca se superponga con la visualización.")}</p>}
          </section>

          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Diseño compartido")}</h3>
            <div className="inspector-tarjeta">
              <div className="inspector-temas">{REPORT_THEMES.map((option) => <button key={option.name} type="button" aria-pressed={theme.name === option.name} className={theme.name === option.name ? "activo" : ""} onClick={() => applyTheme(option)} title={option.name}><i style={{ background: option.paper }}><b style={{ background: option.accent }} /></i><span>{option.name}</span></button>)}</div>
              <label className="inspector-fila"><span>{t("Acento")}</span><input type="color" value={theme.accent} onChange={(event) => onThemeChange({ ...theme, name: "Personalizado", accent: event.target.value })} /></label>
              <label className="inspector-fila"><span>{t("Papel")}</span><input type="color" value={theme.paper} onChange={(event) => onThemeChange({ ...theme, name: "Personalizado", paper: event.target.value })} /></label>
              <label className="inspector-fila"><span>{t("Texto")}</span><input type="color" value={theme.ink} onChange={(event) => applyTheme({ ...theme, name: "Personalizado", ink: event.target.value })} /></label>
            </div>
            <p className="inspector-pie">{t("Se aplica automáticamente a Ficha, Visuales y Observaciones.")}</p>
          </section>

          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Agregar contenido")}<small>{tf("{n} bloques", { n: config.blocks.length })}</small></h3>
            <div className="inspector-tarjeta">
              {hasSimilarityComparison
                ? <button type="button" className="inspector-fila inspector-accion" onClick={() => addBlock("text")}><span className="inspector-icono"><TextIcon size={15} /></span><span className="inspector-accion-texto"><b>{t("Editar comentarios")}</b><small>{t("Texto debajo de la comparación")}</small></span><ChevronRight size={15} className="inspector-galon" /></button>
                : <>
                  <button type="button" className="inspector-fila inspector-accion" onClick={() => addBlock("image")}><span className="inspector-icono"><ImageIcon size={15} /></span><span className="inspector-accion-texto"><b>{t("Imagen")}</b><small>{t("Mapa, gráfico o captura")}</small></span><Plus size={16} className="inspector-galon" /></button>
                  <button type="button" className="inspector-fila inspector-accion" onClick={() => addBlock("text")}><span className="inspector-icono"><TextIcon size={15} /></span><span className="inspector-accion-texto"><b>{t("Texto")}</b><small>{t("Lectura u observación")}</small></span><Plus size={16} className="inspector-galon" /></button>
                </>}
            </div>
          </section>

          {ficha && !hasSimilarityComparison && <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Piezas de la ficha ampliada")}<small>{tf("{n} disponibles", { n: PIEZAS_FICHA.length })}</small></h3>
            <div className="inspector-tarjeta">
              {/* Un menú y no quince filas: la lista cabe en el inspector sin
                  empujar el resto hacia abajo, y elegir ya la agrega. El menú
                  cubre la fila entera, así que se abre toque donde se toque. */}
              <label className="inspector-fila inspector-accion inspector-pieza">
                <span className="inspector-icono"><LayoutDashboard size={15} /></span>
                <span className="inspector-accion-texto"><b>{t("Agregar pieza")}</b><small>{t("Radar, mapas, parecidos…")}</small></span>
                <select className="inspector-selector" aria-label={t("Agregar pieza")} value="" onChange={(event) => addPieza(event.target.value)}>
                  <option value="" disabled>{t("Elegir…")}</option>
                  {PIEZAS_FICHA.map((pieza) => <option key={pieza.id} value={pieza.id}>{t(pieza.titulo)}</option>)}
                </select>
                <Plus size={16} className="inspector-galon" />
              </label>
            </div>
            <p className="inspector-pie">{t("Se dibujan con los datos del jugador del informe y cambian con él. En el PDF salen como vectores.")}</p>
          </section>}

          <section className="inspector-grupo">
            <div className="inspector-tarjeta">
              <button type="button" className="inspector-fila inspector-restablecer" onClick={() => { const base = defaultPage(pageNumber); const defaults = { ...base, blocks: base.blocks.map((block) => block.type === "text" ? { ...block, color: theme.ink } : block) }; setConfig(() => defaults); setSelectedId(defaults.blocks[0].id); }}><RotateCcw size={14} />{t("Restablecer página")}</button>
            </div>
          </section>
        </> : !selected ? <p className="inspector-vacio">{t("Elige un bloque en la hoja para editarlo.")}</p> : <>
          <section className="inspector-grupo">
            <div className="inspector-tarjeta">
              <div className="inspector-fila inspector-bloque">
                <span className="inspector-bloque-nombre"><b>{displayText(selected.title) || nombreTipo(selected.type)}</b><small>{nombreTipo(selected.type)} · {spanElegido}/{config.columns}</small></span>
                <span className="inspector-orden">
                  <button type="button" disabled={hasSimilarityComparison} onClick={() => moveSelected(-1)} title={t("Mover antes")} aria-label={t("Mover antes")}><MoveUp size={15} /></button>
                  <button type="button" disabled={hasSimilarityComparison} onClick={() => moveSelected(1)} title={t("Mover después")} aria-label={t("Mover después")}><MoveDown size={15} /></button>
                  <button type="button" disabled={hasSimilarityComparison && selected.id === SIMILARITY_NOTES_BLOCK_ID} className="peligro" onClick={removeSelected} title={t("Eliminar bloque")} aria-label={t("Eliminar bloque")}><Trash size={15} /></button>
                </span>
              </div>
            </div>
          </section>

          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Etiqueta")}</h3>
            <div className="inspector-tarjeta"><input className="inspector-campo" aria-label={t("Etiqueta")} value={displayText(selected.title)} onChange={(event) => patchSelected({ title: event.target.value })} /></div>
          </section>

          {selected.id !== SIMILARITY_BLOCK_ID && <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Tamaño")}</h3>
            <div className="inspector-tarjeta">
              {!hasSimilarityComparison && <label className="inspector-fila"><span>{t("Ancho")}</span><select className="inspector-selector" value={spanElegido} onChange={(event) => patchSelected({ span: Number(event.target.value) })}>
                {/* Un bloque redimensionado a mano puede quedar en un ancho que no
                    es de la lista; sin esta opción el menú mentiría. */}
                {!REPORT_SPAN_PRESETS.some((preset) => preset.span === spanElegido) && <option value={spanElegido}>{spanElegido}/{config.columns}</option>}
                {REPORT_SPAN_PRESETS.map((preset) => <option key={preset.span} value={preset.span}>{preset.label === "Completo" ? t("Completo") : preset.label}</option>)}
              </select></label>}
              <label className="inspector-fila inspector-deslizador"><span>{t("Alto del espacio")}</span><b>{selected.height}px</b><input type="range" min={selectedHeightBounds.min} max={selectedHeightBounds.max} step="10" value={clampReportBlockHeight(selected.height, altoDe(selected.type), selected.id === SIMILARITY_NOTES_BLOCK_ID)} onChange={(event) => patchSelected({ height: Number(event.target.value) })} /></label>
            </div>
            <p className="inspector-pie">{selected.type === "text" ? t("Arrastra el tirador inferior para cambiar solo el alto. La esquina mantiene el ajuste combinado.") : t("Arrastra la esquina del bloque. El ancho encaja en columnas y el alto en una retícula de 10 px.")}</p>
          </section>}

          {selected.type === "pieza" ? <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Pieza")}</h3>
            <div className="inspector-tarjeta">
              <label className="inspector-fila"><span>{t("Muestra")}</span><select className="inspector-selector" value={selected.pieza ?? ""} onChange={(event) => {
                const antes = PIEZAS_FICHA.find((pieza) => pieza.id === selected.pieza);
                const despues = PIEZAS_FICHA.find((pieza) => pieza.id === event.target.value);
                if (!despues) return;
                // La etiqueta sigue a la pieza salvo que se haya escrito a mano.
                patchSelected({ pieza: despues.id, title: !selected.title || selected.title === antes?.titulo ? despues.titulo : selected.title });
              }}>
                {PIEZAS_FICHA.map((pieza) => <option key={pieza.id} value={pieza.id}>{t(pieza.titulo)}</option>)}
              </select></label>
              {selected.pieza === "top10" && <label className="inspector-fila"><span>{t("Familia")}</span><select className="inspector-selector" value={selected.opcion ?? "progresion"} onChange={(event) => patchSelected({ opcion: event.target.value })}>
                {COMPUESTAS.map((familia) => <option key={familia.id} value={familia.id}>{t(familia.etiqueta)}</option>)}
              </select></label>}
            </div>
            <p className="inspector-pie">{t("Se dibuja con los datos del jugador del informe y cambia con él.")}</p>
          </section> : selected.type === "image" ? (selected.id === SIMILARITY_BLOCK_ID
            ? <section className="inspector-grupo"><div className="inspector-tarjeta"><p className="inspector-nota">
                <b>{t(selected.similarity || selected.html ? "Calidad nativa activa" : "Comentarios separados")}</b>
                <span>{t(selected.similarity || selected.html
                  ? "El texto y el radar se exportan como elementos vectoriales, no como una captura."
                  : "Usa «Editar comentarios» para mantener el texto debajo de la comparación.")}</span>
              </p></div></section>
            : <>
              <section className="inspector-grupo">
                <h3 className="inspector-titulo">{t("Ajuste de imagen")}</h3>
                <div className="inspector-tarjeta"><div className="inspector-fila"><div className="inspector-segmentos ancho" role="group" aria-label={t("Ajuste de imagen")}><button type="button" aria-pressed={selected.fit === "contain"} className={selected.fit === "contain" ? "activa" : ""} onClick={() => patchSelected({ fit: "contain" })}>{t("Completa")}</button><button type="button" aria-pressed={selected.fit === "cover"} className={selected.fit === "cover" ? "activa" : ""} onClick={() => patchSelected({ fit: "cover" })}>{t("Recorta")}</button></div></div></div>
              </section>
              <section className="inspector-grupo">
                <h3 className="inspector-titulo">{t("Agregar comentario a esta imagen")}</h3>
                <div className="inspector-tarjeta">
                  <button type="button" className="inspector-fila inspector-accion" onClick={() => addImageComment("below")}><span className="inspector-icono"><TextIcon size={15} /></span><span className="inspector-accion-texto"><b>{t("Debajo")}</b><small>{t("Imagen arriba, texto abajo")}</small></span><Plus size={16} className="inspector-galon" /></button>
                  <button type="button" className="inspector-fila inspector-accion" onClick={() => addImageComment("side")}><span className="inspector-icono"><Columns size={15} /></span><span className="inspector-accion-texto"><b>{t("Al lado")}</b><small>{t("Imagen y texto en columnas")}</small></span><Plus size={16} className="inspector-galon" /></button>
                </div>
                <p className="inspector-pie">{t("Se crea un bloque de texto independiente que puedes editar, mover y redimensionar.")}</p>
              </section>
            </>) : <>
            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Contenido")}{aiFacts && <button type="button" className="designer-ai-button" disabled={aiLoading} onClick={() => void writeExtendedReport(selected.id)}><Sparkles size={11} /> {aiLoading ? t("Escribiendo…") : t("Informe con IA")}</button>}</h3>
              <div className="inspector-tarjeta"><textarea className="inspector-texto" aria-label={t("Contenido")} value={displayText(selected.content)} onChange={(event) => patchSelected({ content: event.target.value })} /></div>
              {aiError && <p className="inline-error">{aiError}</p>}
            </section>
            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Formato del texto")}</h3>
              <div className="inspector-tarjeta">
                <div className="inspector-fila"><span>{t("Estilo")}</span><div className="inspector-segmentos"><button type="button" aria-pressed={selected.bold} className={selected.bold ? "activa" : ""} onClick={() => patchSelected({ bold: !selected.bold })}><b>B</b></button><button type="button" aria-pressed={selected.italic} className={selected.italic ? "activa" : ""} onClick={() => patchSelected({ italic: !selected.italic })}><i>I</i></button></div><input type="color" value={usesSharedTextColor(selected.color, theme.ink) ? theme.ink : selected.color} onChange={(event) => patchSelected({ color: event.target.value })} title={t("Color de texto")} aria-label={t("Color de texto")} /></div>
                <label className="inspector-fila"><span>{t("Tipografía")}</span><select className="inspector-selector" value={selected.font} onChange={(event) => patchSelected({ font: event.target.value })}>{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
                <label className="inspector-fila inspector-deslizador"><span>{t("Tamaño de letra")}</span><b>{selected.fontSize}px</b><input type="range" min="11" max="42" value={selected.fontSize} onChange={(event) => patchSelected({ fontSize: Number(event.target.value) })} /></label>
                <div className="inspector-fila"><span>{t("Alineación")}</span><div className="inspector-segmentos"><button type="button" aria-pressed={selected.align === "left"} className={selected.align === "left" ? "activa" : ""} onClick={() => patchSelected({ align: "left" })}>{t("Izq.")}</button><button type="button" aria-pressed={selected.align === "center"} className={selected.align === "center" ? "activa" : ""} onClick={() => patchSelected({ align: "center" })}>{t("Centro")}</button><button type="button" aria-pressed={selected.align === "right"} className={selected.align === "right" ? "activa" : ""} onClick={() => patchSelected({ align: "right" })}>{t("Der.")}</button></div></div>
              </div>
            </section>
          </>}

          {!hasSimilarityComparison && <p className="inspector-pie inspector-pie-suelto">{t("Arrastra un bloque en la hoja para cambiarlo de sitio.")}</p>}
        </>}
      </aside>

      <section className="designer-stage" style={{ background: theme.canvas }}>
        <div className="legal-page-shell">
        <article className={`visual-report-page unified-report-page ${hasSimilarityComparison ? "similarity-legal-page" : ""}`} style={canvasStyle}>
          {pageNumber >= FIRST_VISUAL_PAGE && <>
            <header className="visual-page-header">
              <div className="visual-page-folio"><span>FOS</span><small>{t("PÁGINA")}</small><b>{String(pageNumber).padStart(2, "0")}</b><em>{t("VISUALES")}</em></div>
              <div className="visual-page-identity"><span className="visual-identity-lupa"><Search size={11} /> {t("INFORME DE SCOUTING")}</span><h2>{player}</h2><p>{team} · {position}</p></div>
            </header>
          </>}
          <div ref={gridRef} className={`visual-block-grid ${draggedId || resizeSession ? "show-guides" : ""}`} style={gridStyle} onDragOver={(event) => event.preventDefault()}>
            {(draggedId || resizeSession) && <div className="grid-guides" aria-hidden="true">{Array.from({ length: REPORT_GRID_COLUMNS }, (_, index) => <i key={index} />)}</div>}
            {config.blocks.map((block) => {
              const span = clampReportBlockSpan(block.span, config.columns);
              const nativeSimilarity = block.id === SIMILARITY_BLOCK_ID && Boolean(block.similarity || block.html);
              const fixedSimilarityNotes = hasSimilarityComparison && block.id === SIMILARITY_NOTES_BLOCK_ID;
              const blockHeight = clampReportBlockHeight(block.height, altoDe(block.type), block.id === SIMILARITY_NOTES_BLOCK_ID);
              const textStyle = { color: usesSharedTextColor(block.color, theme.ink) ? theme.ink : block.color, fontFamily: fontFamily(block.font), fontSize: block.fontSize, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal", textAlign: block.align } as CSSProperties;
              return <div key={block.id} data-block-id={block.id} draggable={!resizeSession && !nativeSimilarity && !hasSimilarityComparison} className={`visual-block visual-${block.type} ${block.id === SIMILARITY_BLOCK_ID ? "similarity-comparison-block" : ""} ${nativeSimilarity ? "similarity-native-block" : ""} ${fixedSimilarityNotes ? "similarity-notes-block" : ""} ${selected?.id === block.id ? "selected" : ""} ${draggedId === block.id ? "dragging" : ""} ${resizeSession?.id === block.id ? "resizing" : ""}`} style={{ gridColumn: `span ${span}`, height: blockHeight }} onClick={() => elegirBloque(block.id)} onDragStart={() => { if (!nativeSimilarity && !hasSimilarityComparison) { setDraggedId(block.id); elegirBloque(block.id); } }} onDragEnd={() => setDraggedId("")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropBlock(event, block.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elegirBloque(block.id); } }}>
                <div className="block-chrome"><span><Grip size={13} /> {displayText(block.title) || nombreTipo(block.type)}</span><small>{span}/{config.columns}</small></div>
                {block.type === "pieza" ? <div className="visual-pieza-content">
                  {ficha && esPieza(block.pieza)
                    ? <PiezaSuelta pieza={block.pieza} contexto={ficha} opcion={block.opcion} onOpcion={(opcion) => setConfig((current) => updateBlock(current, block.id, { opcion }))} />
                    : <p className="snap-vacio">{t("Elige un jugador para dibujar esta pieza.")}</p>}
                </div> : block.type === "image" ? nativeSimilarity
                  ? block.similarity
                    ? <div className="similarity-native-content similarity-report-sheet" aria-label={t("Reporte de similitud en calidad nativa")}><SimilarityReportMain payload={block.similarity} /></div>
                    : <div className="similarity-native-content similarity-report-sheet" aria-label={t("Reporte de similitud en calidad nativa")} dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
                  : <label className={`visual-image-slot ${block.image ? "has-image" : ""}`} onClick={(event) => event.stopPropagation()}>
                    {block.image ? <LocalPreviewImage src={block.image} alt={displayText(block.title)} fit={block.fit} /> : <span><span className="image-placeholder-icon"><ImageIcon size={27} /></span><b>{t("Agregar imagen")}</b><small>{t("PNG, JPG o WEBP")}</small><em><Upload size={13} /> {t("Elegir archivo")}</em></span>}
                    <input type="file" accept="image/*" hidden onChange={(event) => onImage(event.target.files?.[0], block.id)} />
                  </label> : <div className="visual-text-content" style={textStyle}><p>{displayText(block.content) || t("Escribe tu análisis desde el panel lateral.")}</p></div>}
                {!nativeSimilarity && !fixedSimilarityNotes && <button type="button" className="block-resize-handle" draggable={false} aria-label={tf("Redimensionar {t}", { t: displayText(block.title) || t("bloque") })} title={t("Arrastra para ajustar ancho y alto")} onPointerDown={(event) => startBlockResize(event, block, "both")} onKeyDown={(event) => resizeBlockWithKeyboard(event, block, "both")} onClick={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>↘</button>}
                {block.type === "text" && <button type="button" className="block-height-resize-handle" draggable={false} aria-label={tf("Ajustar solo la altura de {t}", { t: displayText(block.title) || t("bloque") })} title={t("Arrastra para ajustar solo el alto")} onPointerDown={(event) => startBlockResize(event, block, "height")} onKeyDown={(event) => resizeBlockWithKeyboard(event, block, "height")} onClick={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>↕</button>}
              </div>;
            })}
            {!config.blocks.length && <button className="empty-designer-page" onClick={() => addBlock("image")}><Sparkles size={26} /><b>{t("Tu página está vacía")}</b><span>{t("Agrega una imagen o un texto desde el panel.")}</span></button>}
          </div>
          <PieDeReporte asunto={player} destinatario={recipientName} logo={recipientLogoUrl} />
        </article>
        </div>
      </section>
    </div>
  );
}
