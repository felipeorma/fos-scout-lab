"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Columns,
  Grip,
  ImageIcon,
  MoveDown,
  MoveUp,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  TextIcon,
  Trash,
  Upload,
} from "./Icons";
import { DEFAULT_REPORT_THEME, REPORT_THEMES, reportThemeStyle, type ReportTheme } from "./reportTheme";
import { SimilarityReportMain, type SimilarityReportPayload } from "./SimilarityReport";
import { t, tDefault, tf } from "@/lib/i18n";
import {
  clampReportBlockHeight,
  clampReportBlockSpan,
  reportBlockHeightBounds,
  resizeReportBlock,
  similarityGridRows,
  type ReportBlockResizeMode,
} from "@/lib/reportPageLayout";

type BlockType = "image" | "text";
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
  kind: BlockType;
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
      columns: 2,
      gap: 18,
      blocks: [
        imageBlock(`p${pageNumber}-shotmap`, "Mapa de remates"),
        imageBlock(`p${pageNumber}-heatmap`, "Mapa de calor"),
        imageBlock(`p${pageNumber}-actions`, "Acciones con balón"),
        imageBlock(`p${pageNumber}-defence`, "Acciones defensivas"),
      ],
    };
  }
  return {
    title: "Observaciones y contexto",
    columns: 2,
    gap: 18,
    blocks: [
      textBlock(`p${pageNumber}-summary`, "Resumen del scout", "Agrega aquí tu lectura del jugador: contexto competitivo, rol ideal, fortalezas transferibles y riesgos observados.", 2, 190),
      imageBlock(`p${pageNumber}-frame-a`, "Secuencia destacada", 1, 300),
      imageBlock(`p${pageNumber}-frame-b`, "Comportamiento táctico", 1, 300),
      textBlock(`p${pageNumber}-decision`, "Conclusión", "Recomendación final y próximos pasos de seguimiento.", 2, 160),
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



export function ReportPageDesigner({ pageNumber, player, team, position, theme, onThemeChange, recipientName = "", recipientLogoUrl = "", persist = true }: { pageNumber: number; player: string; team: string; position: string; theme: ReportTheme; onThemeChange: (theme: ReportTheme) => void; recipientName?: string; recipientLogoUrl?: string; persist?: boolean }) {
  const [pages, setPages] = useState<DesignerState>(() => defaultPages(pageNumber));
  const [selectedId, setSelectedId] = useState(() => defaultPage(pageNumber).blocks[0].id);
  const [draggedId, setDraggedId] = useState("");
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const [loaded, setLoaded] = useState(false);
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
        const nextPages: DesignerState = { ...saved };
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

  function patchSelected(patch: Partial<PageBlock>) {
    if (!selected) return;
    setConfig((current) => updateBlock(current, selected.id, patch));
  }

  function addBlock(type: BlockType) {
    if (hasSimilarityComparison) {
      setSelectedId(type === "text" ? SIMILARITY_NOTES_BLOCK_ID : SIMILARITY_BLOCK_ID);
      return;
    }
    const id = `p${pageNumber}-${type}-${Date.now()}`;
    // Se guarda la clave en español; la traducción ocurre al mostrar, así el
    // bloque no queda congelado en el idioma activo al crearlo.
    const block = type === "image"
      ? imageBlock(id, "Nueva visualización", 1, 260)
      : { ...textBlock(id, "Nuevo bloque de texto", "Escribe aquí tu análisis…", Math.min(2, config.columns), 180), color: theme.ink };
    setConfig((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setSelectedId(id);
  }

  function addImageComment(placement: "below" | "side") {
    if (!selected || selected.type !== "image") return;
    if (hasSimilarityComparison) {
      setSelectedId(SIMILARITY_NOTES_BLOCK_ID);
      return;
    }
    const id = `p${pageNumber}-comment-${Date.now()}`;
    setConfig((current) => {
      const columns = placement === "side" ? Math.max(2, current.columns) : current.columns;
      const imageSpan = placement === "side" ? Math.max(1, columns - 1) : columns;
      const commentSpan = placement === "side" ? 1 : columns;
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
    setSelectedId(id);
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

  function applyLayout(layout: "single" | "split" | "feature" | "mosaic") {
    if (hasSimilarityComparison) return;
    const columns = layout === "single" ? 1 : layout === "mosaic" ? 3 : 2;
    setConfig((current) => ({
      ...current,
      columns,
      blocks: current.blocks.map((block, index) => ({
        ...block,
        span: layout === "single" ? 1 : layout === "feature" && index === 0 ? 2 : layout === "mosaic" && index === 0 ? 2 : 1,
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
    setSelectedId(block.id);
    setDraggedId("");
    setResizeSession({
      id: block.id,
      pointerId: event.pointerId,
      mode,
      kind: block.type,
      similarityNotes: block.id === SIMILARITY_NOTES_BLOCK_ID,
      startX: event.clientX,
      startY: event.clientY,
      startHeight: clampReportBlockHeight(block.height, block.type, block.id === SIMILARITY_NOTES_BLOCK_ID),
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
        height: clampReportBlockHeight(block.height + direction * step, block.type, block.id === SIMILARITY_NOTES_BLOCK_ID),
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
    ? reportBlockHeightBounds(selected.type, selected.id === SIMILARITY_NOTES_BLOCK_ID)
    : reportBlockHeightBounds("text");
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
      <aside className="designer-controls">
        <div className="designer-panel-head"><div><span className="mini-icon"><Columns size={18} /></span><div><h2>{tf("Diseño de página {n}", { n: pageNumber })}</h2><p>{t("Grid, estilo y contenido")}</p></div></div><span className="tiny-state">AUTO SAVE</span></div>

        <label className="field-group designer-title-field"><span className="field-label">{t("Título de la página")}</span><input className="text-input" value={config.title} onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))} /></label>

        <div className="designer-section">
          <div className="designer-section-title"><span>{t("Plantilla de grid")}</span><small>{tf("{n} columnas", { n: config.columns })}</small></div>
          <div className="layout-presets">
            <button disabled={hasSimilarityComparison} onClick={() => applyLayout("single")} title={t("Una columna")}><i className="layout-one"><b /></i><span>{t("Simple")}</span></button>
            <button disabled={hasSimilarityComparison} onClick={() => applyLayout("split")} title={t("Dos columnas")}><i className="layout-two"><b /><b /></i><span>{t("Doble")}</span></button>
            <button disabled={hasSimilarityComparison} onClick={() => applyLayout("feature")} title={t("Bloque destacado")}><i className="layout-feature"><b /><b /><b /></i><span>{t("Portada")}</span></button>
            <button disabled={hasSimilarityComparison} onClick={() => applyLayout("mosaic")} title={t("Mosaico")}><i className="layout-mosaic"><b /><b /><b /></i><span>{t("Mosaico")}</span></button>
          </div>
          {hasSimilarityComparison && <p className="shared-design-note">{t("La comparación mantiene una estructura fija para que el texto nunca se superponga con la visualización.")}</p>}
          <label className="range-row"><span>{t("Espacio entre bloques")} <b>{config.gap}px</b></span><input type="range" min="4" max="40" value={config.gap} onChange={(event) => setConfig((current) => ({ ...current, gap: Number(event.target.value) }))} /></label>
        </div>

        <div className="designer-section">
          <div className="designer-section-title"><span>{t("Diseño compartido")}</span><Palette size={15} /></div>
          <p className="shared-design-note">{t("Se aplica automáticamente a Ficha, Visuales y Observaciones.")}</p>
          <div className="theme-swatches">{REPORT_THEMES.map((option) => <button key={option.name} className={theme.name === option.name ? "active" : ""} onClick={() => applyTheme(option)} title={option.name}><i style={{ background: option.paper }}><b style={{ background: option.accent }} /></i><span>{option.name}</span></button>)}</div>
          <div className="color-inputs"><label><span>{t("Acento")}</span><input type="color" value={theme.accent} onChange={(event) => onThemeChange({ ...theme, name: "Personalizado", accent: event.target.value })} /></label><label><span>{t("Papel")}</span><input type="color" value={theme.paper} onChange={(event) => onThemeChange({ ...theme, name: "Personalizado", paper: event.target.value })} /></label><label><span>{t("Texto")}</span><input type="color" value={theme.ink} onChange={(event) => applyTheme({ ...theme, name: "Personalizado", ink: event.target.value })} /></label></div>
        </div>

        <div className="designer-section add-block-section">
          <div className="designer-section-title"><span>{t("Agregar contenido")}</span><small>{tf("{n} bloques", { n: config.blocks.length })}</small></div>
          {hasSimilarityComparison
            ? <div className="add-block-buttons single"><button onClick={() => addBlock("text")}><TextIcon size={16} /><span><b>{t("Editar comentarios")}</b><small>{t("Texto debajo de la comparación")}</small></span></button></div>
            : <div className="add-block-buttons"><button onClick={() => addBlock("image")}><ImageIcon size={17} /><span><b>{t("Imagen")}</b><small>{t("Mapa, gráfico o captura")}</small></span></button><button onClick={() => addBlock("text")}><TextIcon size={16} /><span><b>{t("Texto")}</b><small>{t("Lectura u observación")}</small></span></button></div>}
        </div>

        {selected && <div className="designer-section selected-editor">
          <div className="designer-section-title"><span>{t("Bloque seleccionado")}</span><div className="order-buttons"><button disabled={hasSimilarityComparison} onClick={() => moveSelected(-1)} title={t("Mover antes")}><MoveUp size={14} /></button><button disabled={hasSimilarityComparison} onClick={() => moveSelected(1)} title={t("Mover después")}><MoveDown size={14} /></button><button disabled={hasSimilarityComparison && selected.id === SIMILARITY_NOTES_BLOCK_ID} className="delete-block" onClick={removeSelected} title={t("Eliminar bloque")}><Trash size={14} /></button></div></div>
          <label className="field-group"><span className="field-label">{t("Etiqueta")}</span><input className="text-input" value={displayText(selected.title)} onChange={(event) => patchSelected({ title: event.target.value })} /></label>
          {selected.id !== SIMILARITY_BLOCK_ID && <>
            {!hasSimilarityComparison && <div className="span-buttons"><span className="field-label">{t("Ancho")}</span><div>{Array.from({ length: config.columns }, (_, index) => index + 1).map((span) => <button key={span} className={clampReportBlockSpan(selected.span, config.columns) === span ? "active" : ""} onClick={() => patchSelected({ span })}>{span === config.columns ? t("Completo") : `${span}/${config.columns}`}</button>)}</div></div>}
            <label className="range-row block-height"><span>{t("Alto del espacio")} <b>{selected.height}px</b></span><input type="range" min={selectedHeightBounds.min} max={selectedHeightBounds.max} step="10" value={clampReportBlockHeight(selected.height, selected.type, selected.id === SIMILARITY_NOTES_BLOCK_ID)} onChange={(event) => patchSelected({ height: Number(event.target.value) })} /></label>
            <p className="resize-alignment-note"><b>{selected.type === "text" ? "↕" : "↘"}</b><span>{selected.type === "text" ? t("Arrastra el tirador inferior para cambiar solo el alto. La esquina mantiene el ajuste combinado.") : t("Arrastra la esquina del bloque. El ancho encaja en columnas y el alto en una retícula de 10 px.")}</span></p>
          </>}

          {selected.type === "image" ? <div className="image-options">
            {selected.id === SIMILARITY_BLOCK_ID
              ? <p className="native-similarity-note">
                  <b>{t(selected.similarity || selected.html ? "Calidad nativa activa" : "Comentarios separados")}</b>
                  <span>{t(selected.similarity || selected.html
                    ? "El texto y el radar se exportan como elementos vectoriales, no como una captura."
                    : "Usa «Editar comentarios» para mantener el texto debajo de la comparación.")}</span>
                </p>
              : <><span className="field-label">{t("Ajuste de imagen")}</span><div className="segmented"><button className={selected.fit === "contain" ? "active" : ""} onClick={() => patchSelected({ fit: "contain" })}>{t("Completa")}</button><button className={selected.fit === "cover" ? "active" : ""} onClick={() => patchSelected({ fit: "cover" })}>{t("Recorta")}</button></div>
                <div className="image-comment-tools"><span className="field-label">{t("Agregar comentario a esta imagen")}</span><div><button onClick={() => addImageComment("below")}><TextIcon size={15} /><span><b>{t("Debajo")}</b><small>{t("Imagen arriba, texto abajo")}</small></span></button><button onClick={() => addImageComment("side")}><Columns size={15} /><span><b>{t("Al lado")}</b><small>{t("Imagen y texto en columnas")}</small></span></button></div><p>{t("Se crea un bloque de texto independiente que puedes editar, mover y redimensionar.")}</p></div></>}
          </div> : <>
            <label className="field-group"><span className="field-label">{t("Contenido")}</span><textarea className="designer-textarea" value={displayText(selected.content)} onChange={(event) => patchSelected({ content: event.target.value })} /></label>
            <div className="text-toolbar"><button className={selected.bold ? "active" : ""} onClick={() => patchSelected({ bold: !selected.bold })}><b>B</b></button><button className={selected.italic ? "active" : ""} onClick={() => patchSelected({ italic: !selected.italic })}><i>I</i></button><select value={selected.font} onChange={(event) => patchSelected({ font: event.target.value })}>{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select><input type="color" value={usesSharedTextColor(selected.color, theme.ink) ? theme.ink : selected.color} onChange={(event) => patchSelected({ color: event.target.value })} title={t("Color de texto")} /></div>
            <label className="range-row"><span>{t("Tamaño de letra")} <b>{selected.fontSize}px</b></span><input type="range" min="11" max="42" value={selected.fontSize} onChange={(event) => patchSelected({ fontSize: Number(event.target.value) })} /></label>
            <div className="segmented align-buttons"><button className={selected.align === "left" ? "active" : ""} onClick={() => patchSelected({ align: "left" })}>{t("Izq.")}</button><button className={selected.align === "center" ? "active" : ""} onClick={() => patchSelected({ align: "center" })}>{t("Centro")}</button><button className={selected.align === "right" ? "active" : ""} onClick={() => patchSelected({ align: "right" })}>{t("Der.")}</button></div>
          </>}
        </div>}

        <button className="reset-design" onClick={() => { const base = defaultPage(pageNumber); const defaults = { ...base, blocks: base.blocks.map((block) => block.type === "text" ? { ...block, color: theme.ink } : block) }; setConfig(() => defaults); setSelectedId(defaults.blocks[0].id); }}><RotateCcw size={14} /> {t("Restablecer página")}</button>
      </aside>

      <section className="designer-stage" style={{ background: theme.canvas }}>
        <div className="preview-toolbar designer-toolbar"><div><span className="live-dot" /> {tf("Página {n} · Editor visual", { n: pageNumber })}</div><span><Grip size={14} /> {t("Arrastra para ordenar · ↕ cambia solo el alto · ↘ ajusta ambos")}</span></div>
        <div className="legal-page-shell">
        <article className={`visual-report-page unified-report-page ${hasSimilarityComparison ? "similarity-legal-page" : ""}`} style={canvasStyle}>
          {pageNumber >= FIRST_VISUAL_PAGE && <>
            <header className="visual-page-header">
              <div className="visual-page-folio"><span>FOS</span><small>{t("PÁGINA")}</small><b>{String(pageNumber).padStart(2, "0")}</b><em>{t("VISUALES")}</em></div>
              <div className="visual-page-identity"><span className="visual-identity-lupa"><Search size={11} /> {t("INFORME DE SCOUTING")}</span><h2>{player}</h2><p>{team} · {position}</p></div>
            </header>
            <div className="visual-page-title"><span>{t("ANÁLISIS COMPLEMENTARIO")}</span><h3>{displayText(config.title)}</h3></div>
          </>}
          <div ref={gridRef} className="visual-block-grid" style={gridStyle} onDragOver={(event) => event.preventDefault()}>
            {config.blocks.map((block) => {
              const span = clampReportBlockSpan(block.span, config.columns);
              const nativeSimilarity = block.id === SIMILARITY_BLOCK_ID && Boolean(block.similarity || block.html);
              const fixedSimilarityNotes = hasSimilarityComparison && block.id === SIMILARITY_NOTES_BLOCK_ID;
              const blockHeight = clampReportBlockHeight(block.height, block.type, block.id === SIMILARITY_NOTES_BLOCK_ID);
              const textStyle = { color: usesSharedTextColor(block.color, theme.ink) ? theme.ink : block.color, fontFamily: fontFamily(block.font), fontSize: block.fontSize, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal", textAlign: block.align } as CSSProperties;
              return <div key={block.id} data-block-id={block.id} draggable={!resizeSession && !nativeSimilarity && !hasSimilarityComparison} className={`visual-block visual-${block.type} ${block.id === SIMILARITY_BLOCK_ID ? "similarity-comparison-block" : ""} ${nativeSimilarity ? "similarity-native-block" : ""} ${fixedSimilarityNotes ? "similarity-notes-block" : ""} ${selected?.id === block.id ? "selected" : ""} ${draggedId === block.id ? "dragging" : ""} ${resizeSession?.id === block.id ? "resizing" : ""}`} style={{ gridColumn: `span ${span}`, height: blockHeight }} onClick={() => setSelectedId(block.id)} onDragStart={() => { if (!nativeSimilarity && !hasSimilarityComparison) { setDraggedId(block.id); setSelectedId(block.id); } }} onDragEnd={() => setDraggedId("")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropBlock(event, block.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(block.id); } }}>
                <div className="block-chrome"><span><Grip size={13} /> {displayText(block.title) || (block.type === "image" ? t("Imagen") : t("Texto"))}</span><small>{span}/{config.columns}</small></div>
                {block.type === "image" ? nativeSimilarity
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
          <footer className="visual-page-footer visual-page-signature">
            <div className="report-signatures">
              <div className="report-author"><span>{t("ELABORADO POR")}</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div>
              <span className="visual-footer-confidential">{player.toUpperCase()} · {t("REPORTE CONFIDENCIAL")}</span>
              <div className="report-recipient">
                {/^(https?:\/\/|data:image\/)/i.test(recipientLogoUrl.trim())
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={recipientLogoUrl.trim()} alt={recipientName || t("Club destinatario")} className="dossier-footer-club-logo" />
                  : <span className="dossier-footer-club-fallback">{(recipientName || t("Club destinatario")).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                <div><span>{t("REPORTE GENERADO PARA")}</span><b>{recipientName || t("Club destinatario")}</b></div>
              </div>
            </div>
          </footer>
        </article>
        </div>
      </section>
    </div>
  );
}
