"use client";

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import {
  Columns,
  Grip,
  ImageIcon,
  MoveDown,
  MoveUp,
  Palette,
  RotateCcw,
  Sparkles,
  TextIcon,
  Trash,
  Upload,
} from "./Icons";
import { DEFAULT_REPORT_THEME, REPORT_THEMES, reportThemeStyle, type ReportTheme } from "./reportTheme";

type BlockType = "image" | "text";
type TextAlign = "left" | "center" | "right";
type ImageFit = "cover" | "contain";

type PageBlock = {
  id: string;
  type: BlockType;
  title: string;
  content: string;
  image: string;
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

type DesignerState = Record<2 | 3, PageConfig>;

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
  return { id, type: "image", title, content: "", image: "", span, height, fit: "contain", bold: false, italic: false, font: "barlow", fontSize: 18, color: DEFAULT_REPORT_THEME.ink, align: "left" };
}

function textBlock(id: string, title: string, content: string, span = 2, height = 190): PageBlock {
  return { id, type: "text", title, content, image: "", span, height, fit: "cover", bold: false, italic: false, font: "barlow", fontSize: 17, color: DEFAULT_REPORT_THEME.ink, align: "left" };
}

function defaultPages(): DesignerState {
  return {
    2: {
      title: "Mapa visual del rendimiento",
      columns: 2,
      gap: 18,
      blocks: [
        imageBlock("p2-shotmap", "Mapa de remates"),
        imageBlock("p2-heatmap", "Mapa de calor"),
        imageBlock("p2-actions", "Acciones con balón"),
        imageBlock("p2-defence", "Acciones defensivas"),
      ],
    },
    3: {
      title: "Observaciones y contexto",
      columns: 2,
      gap: 18,
      blocks: [
        textBlock("p3-summary", "Resumen del scout", "Agrega aquí tu lectura del jugador: contexto competitivo, rol ideal, fortalezas transferibles y riesgos observados en vídeo.", 2, 190),
        imageBlock("p3-frame-a", "Secuencia destacada", 1, 300),
        imageBlock("p3-frame-b", "Comportamiento táctico", 1, 300),
        textBlock("p3-decision", "Conclusión", "Recomendación final y próximos pasos de seguimiento.", 2, 160),
      ],
    },
  };
}

const FONT_OPTIONS = [
  { value: "barlow", label: "Barlow", family: "var(--font-barlow), Arial, sans-serif" },
  { value: "condensed", label: "Barlow Condensed", family: "var(--font-barlow-condensed), Arial, sans-serif" },
  { value: "serif", label: "Editorial Serif", family: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Mono", family: "'SFMono-Regular', Consolas, monospace" },
];

function fontFamily(font: string) {
  return FONT_OPTIONS.find((option) => option.value === font)?.family ?? FONT_OPTIONS[0].family;
}

function LocalPreviewImage({ src, alt, fit }: { src: string; alt: string; fit: ImageFit }) {
  // La imagen es un archivo local del usuario; no debe pasar por un optimizador remoto.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ objectFit: fit }} />;
}

function clampSpan(span: number, columns: number) {
  return Math.max(1, Math.min(columns, span));
}

function updateBlock(config: PageConfig, id: string, patch: Partial<PageBlock>) {
  return { ...config, blocks: config.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) };
}

export function ReportPageDesigner({ pageNumber, player, team, position, theme, onThemeChange }: { pageNumber: 2 | 3; player: string; team: string; position: string; theme: ReportTheme; onThemeChange: (theme: ReportTheme) => void }) {
  const [pages, setPages] = useState<DesignerState>(defaultPages);
  const [selectedId, setSelectedId] = useState(defaultPages()[pageNumber].blocks[0].id);
  const [draggedId, setDraggedId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const config = pages[pageNumber];
  const selected = useMemo(() => config.blocks.find((block) => block.id === selectedId) ?? null, [config.blocks, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("fos-scout-page-designer-v1");
        if (stored) setPages({ ...defaultPages(), ...JSON.parse(stored) });
      } catch { /* La configuración local es opcional. */ }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem("fos-scout-page-designer-v1", JSON.stringify(pages)); } catch { /* Sin persistencia si el navegador la bloquea. */ }
  }, [loaded, pages]);

  function setConfig(updater: (current: PageConfig) => PageConfig) {
    setPages((current) => ({ ...current, [pageNumber]: updater(current[pageNumber]) }));
  }

  function patchSelected(patch: Partial<PageBlock>) {
    if (!selected) return;
    setConfig((current) => updateBlock(current, selected.id, patch));
  }

  function addBlock(type: BlockType) {
    const id = `p${pageNumber}-${type}-${Date.now()}`;
    const block = type === "image"
      ? imageBlock(id, "Nueva visualización", 1, 260)
      : { ...textBlock(id, "Nuevo bloque de texto", "Escribe aquí tu análisis…", Math.min(2, config.columns), 180), color: theme.ink };
    setConfig((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setSelectedId(id);
  }

  function addImageComment(placement: "below" | "side") {
    if (!selected || selected.type !== "image") return;
    const id = `p${pageNumber}-comment-${Date.now()}`;
    setConfig((current) => {
      const columns = placement === "side" ? Math.max(2, current.columns) : current.columns;
      const imageSpan = placement === "side" ? Math.max(1, columns - 1) : columns;
      const commentSpan = placement === "side" ? 1 : columns;
      const sourceIndex = current.blocks.findIndex((block) => block.id === selected.id);
      const blocks = current.blocks.map((block) => block.id === selected.id ? { ...block, span: imageSpan } : block);
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
    const index = config.blocks.findIndex((block) => block.id === selected.id);
    const nextBlocks = config.blocks.filter((block) => block.id !== selected.id);
    setConfig((current) => ({ ...current, blocks: nextBlocks }));
    setSelectedId(nextBlocks[Math.max(0, index - 1)]?.id ?? "");
  }

  function moveSelected(direction: -1 | 1) {
    if (!selected) return;
    const from = config.blocks.findIndex((block) => block.id === selected.id);
    const to = Math.max(0, Math.min(config.blocks.length - 1, from + direction));
    if (from === to) return;
    const blocks = [...config.blocks];
    const [moving] = blocks.splice(from, 1);
    blocks.splice(to, 0, moving);
    setConfig((current) => ({ ...current, blocks }));
  }

  function applyLayout(layout: "single" | "split" | "feature" | "mosaic") {
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
    setPages((current) => ({
      2: { ...current[2], blocks: current[2].blocks.map((block) => block.type === "text" && usesSharedTextColor(block.color, theme.ink) ? { ...block, color: nextTheme.ink } : block) },
      3: { ...current[3], blocks: current[3].blocks.map((block) => block.type === "text" && usesSharedTextColor(block.color, theme.ink) ? { ...block, color: nextTheme.ink } : block) },
    }));
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

  const canvasStyle = reportThemeStyle(theme);

  return (
    <div className="designer-workspace">
      <aside className="designer-controls">
        <div className="designer-panel-head"><div><span className="mini-icon"><Columns size={18} /></span><div><h2>Diseño de página {pageNumber}</h2><p>Grid, estilo y contenido</p></div></div><span className="tiny-state">AUTO SAVE</span></div>

        <label className="field-group designer-title-field"><span className="field-label">Título de la página</span><input className="text-input" value={config.title} onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))} /></label>

        <div className="designer-section">
          <div className="designer-section-title"><span>Plantilla de grid</span><small>{config.columns} columnas</small></div>
          <div className="layout-presets">
            <button onClick={() => applyLayout("single")} title="Una columna"><i className="layout-one"><b /></i><span>Simple</span></button>
            <button onClick={() => applyLayout("split")} title="Dos columnas"><i className="layout-two"><b /><b /></i><span>Doble</span></button>
            <button onClick={() => applyLayout("feature")} title="Bloque destacado"><i className="layout-feature"><b /><b /><b /></i><span>Portada</span></button>
            <button onClick={() => applyLayout("mosaic")} title="Mosaico"><i className="layout-mosaic"><b /><b /><b /></i><span>Mosaico</span></button>
          </div>
          <label className="range-row"><span>Espacio entre bloques <b>{config.gap}px</b></span><input type="range" min="4" max="40" value={config.gap} onChange={(event) => setConfig((current) => ({ ...current, gap: Number(event.target.value) }))} /></label>
        </div>

        <div className="designer-section">
          <div className="designer-section-title"><span>Diseño compartido</span><Palette size={15} /></div>
          <p className="shared-design-note">Se aplica automáticamente a Ficha, Visuales y Observaciones.</p>
          <div className="theme-swatches">{REPORT_THEMES.map((option) => <button key={option.name} className={theme.name === option.name ? "active" : ""} onClick={() => applyTheme(option)} title={option.name}><i style={{ background: option.paper }}><b style={{ background: option.accent }} /></i><span>{option.name}</span></button>)}</div>
          <div className="color-inputs"><label><span>Acento</span><input type="color" value={theme.accent} onChange={(event) => onThemeChange({ ...theme, name: "Personalizado", accent: event.target.value })} /></label><label><span>Papel</span><input type="color" value={theme.paper} onChange={(event) => onThemeChange({ ...theme, name: "Personalizado", paper: event.target.value })} /></label><label><span>Texto</span><input type="color" value={theme.ink} onChange={(event) => applyTheme({ ...theme, name: "Personalizado", ink: event.target.value })} /></label></div>
        </div>

        <div className="designer-section add-block-section">
          <div className="designer-section-title"><span>Agregar contenido</span><small>{config.blocks.length} bloques</small></div>
          <div className="add-block-buttons"><button onClick={() => addBlock("image")}><ImageIcon size={17} /><span><b>Imagen</b><small>Mapa, gráfico o captura</small></span></button><button onClick={() => addBlock("text")}><TextIcon size={16} /><span><b>Texto</b><small>Lectura u observación</small></span></button></div>
        </div>

        {selected && <div className="designer-section selected-editor">
          <div className="designer-section-title"><span>Bloque seleccionado</span><div className="order-buttons"><button onClick={() => moveSelected(-1)} title="Mover antes"><MoveUp size={14} /></button><button onClick={() => moveSelected(1)} title="Mover después"><MoveDown size={14} /></button><button className="delete-block" onClick={removeSelected} title="Eliminar bloque"><Trash size={14} /></button></div></div>
          <label className="field-group"><span className="field-label">Etiqueta</span><input className="text-input" value={selected.title} onChange={(event) => patchSelected({ title: event.target.value })} /></label>
          <div className="span-buttons"><span className="field-label">Ancho</span><div>{Array.from({ length: config.columns }, (_, index) => index + 1).map((span) => <button key={span} className={clampSpan(selected.span, config.columns) === span ? "active" : ""} onClick={() => patchSelected({ span })}>{span === config.columns ? "Completo" : `${span}/${config.columns}`}</button>)}</div></div>
          <label className="range-row block-height"><span>Alto del espacio <b>{selected.height}px</b></span><input type="range" min="140" max="620" step="10" value={selected.height} onChange={(event) => patchSelected({ height: Number(event.target.value) })} /></label>

          {selected.type === "image" ? <div className="image-options">
            <span className="field-label">Ajuste de imagen</span><div className="segmented"><button className={selected.fit === "contain" ? "active" : ""} onClick={() => patchSelected({ fit: "contain" })}>Completa</button><button className={selected.fit === "cover" ? "active" : ""} onClick={() => patchSelected({ fit: "cover" })}>Recorta</button></div>
            <div className="image-comment-tools"><span className="field-label">Agregar comentario a esta imagen</span><div><button onClick={() => addImageComment("below")}><TextIcon size={15} /><span><b>Debajo</b><small>Imagen arriba, texto abajo</small></span></button><button onClick={() => addImageComment("side")}><Columns size={15} /><span><b>Al lado</b><small>Imagen y texto en columnas</small></span></button></div><p>Se crea un bloque de texto independiente que puedes editar, mover y redimensionar.</p></div>
          </div> : <>
            <label className="field-group"><span className="field-label">Contenido</span><textarea className="designer-textarea" value={selected.content} onChange={(event) => patchSelected({ content: event.target.value })} /></label>
            <div className="text-toolbar"><button className={selected.bold ? "active" : ""} onClick={() => patchSelected({ bold: !selected.bold })}><b>B</b></button><button className={selected.italic ? "active" : ""} onClick={() => patchSelected({ italic: !selected.italic })}><i>I</i></button><select value={selected.font} onChange={(event) => patchSelected({ font: event.target.value })}>{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select><input type="color" value={usesSharedTextColor(selected.color, theme.ink) ? theme.ink : selected.color} onChange={(event) => patchSelected({ color: event.target.value })} title="Color de texto" /></div>
            <label className="range-row"><span>Tamaño de letra <b>{selected.fontSize}px</b></span><input type="range" min="11" max="42" value={selected.fontSize} onChange={(event) => patchSelected({ fontSize: Number(event.target.value) })} /></label>
            <div className="segmented align-buttons"><button className={selected.align === "left" ? "active" : ""} onClick={() => patchSelected({ align: "left" })}>Izq.</button><button className={selected.align === "center" ? "active" : ""} onClick={() => patchSelected({ align: "center" })}>Centro</button><button className={selected.align === "right" ? "active" : ""} onClick={() => patchSelected({ align: "right" })}>Der.</button></div>
          </>}
        </div>}

        <button className="reset-design" onClick={() => { const base = defaultPages()[pageNumber]; const defaults = { ...base, blocks: base.blocks.map((block) => block.type === "text" ? { ...block, color: theme.ink } : block) }; setConfig(() => defaults); setSelectedId(defaults.blocks[0].id); }}><RotateCcw size={14} /> Restablecer página</button>
      </aside>

      <section className="designer-stage" style={{ background: theme.canvas }}>
        <div className="preview-toolbar designer-toolbar"><div><span className="live-dot" /> Página {pageNumber} · Editor visual</div><span><Grip size={14} /> Arrastra los bloques para reordenar</span></div>
        <article className="visual-report-page unified-report-page" style={canvasStyle}>
          <header className="visual-page-header">
            <div className="visual-page-folio"><span>FOS</span><small>PÁGINA</small><b>0{pageNumber}</b><em>{pageNumber === 2 ? "VISUALES" : "OBSERVACIONES"}</em></div>
            <div className="visual-page-identity"><span>FOS SCOUT LAB · INFORME DE SCOUTING</span><h2>{player}</h2><p>{team} · {position}</p></div>
          </header>
          <div className="visual-page-title"><span>ANÁLISIS COMPLEMENTARIO</span><h3>{config.title}</h3></div>
          <div className="visual-block-grid" style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`, gap: config.gap }} onDragOver={(event) => event.preventDefault()}>
            {config.blocks.map((block) => {
              const span = clampSpan(block.span, config.columns);
              const textStyle = { color: usesSharedTextColor(block.color, theme.ink) ? theme.ink : block.color, fontFamily: fontFamily(block.font), fontSize: block.fontSize, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal", textAlign: block.align } as CSSProperties;
              return <div key={block.id} draggable className={`visual-block visual-${block.type} ${selected?.id === block.id ? "selected" : ""} ${draggedId === block.id ? "dragging" : ""}`} style={{ gridColumn: `span ${span}`, height: block.height }} onClick={() => setSelectedId(block.id)} onDragStart={() => { setDraggedId(block.id); setSelectedId(block.id); }} onDragEnd={() => setDraggedId("")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropBlock(event, block.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(block.id); }}>
                <div className="block-chrome"><span><Grip size={13} /> {block.title || (block.type === "image" ? "Imagen" : "Texto")}</span><small>{span}/{config.columns}</small></div>
                {block.type === "image" ? <label className={`visual-image-slot ${block.image ? "has-image" : ""}`} onClick={(event) => event.stopPropagation()}>
                  {block.image ? <LocalPreviewImage src={block.image} alt={block.title} fit={block.fit} /> : <span><span className="image-placeholder-icon"><ImageIcon size={27} /></span><b>Agregar imagen</b><small>PNG, JPG o WEBP</small><em><Upload size={13} /> Elegir archivo</em></span>}
                  <input type="file" accept="image/*" hidden onChange={(event) => onImage(event.target.files?.[0], block.id)} />
                </label> : <div className="visual-text-content" style={textStyle}><p>{block.content || "Escribe tu análisis desde el panel lateral."}</p></div>}
              </div>;
            })}
            {!config.blocks.length && <button className="empty-designer-page" onClick={() => addBlock("image")}><Sparkles size={26} /><b>Tu página está vacía</b><span>Agrega una imagen o un texto desde el panel.</span></button>}
          </div>
          <footer className="visual-page-footer"><span>{player.toUpperCase()} · REPORTE CONFIDENCIAL</span><span>FOS SCOUT LAB</span></footer>
        </article>
      </section>
    </div>
  );
}
