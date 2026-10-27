"use client";

import { useRef, useState, type ReactNode } from "react";
import { reloj, type Codificacion, type Momento } from "@/lib/codificacion";
import { t, tf } from "@/lib/i18n";
import { ArrowDownToLine, Play, Trash, Upload } from "../Icons";

/**
 * Los códigos para marcar el partido: un botón por código con su tecla, los
 * segundos que guarda cada marca y la entrada y salida en CSV o XML.
 */
export function PanelDeCodigos({ codificacion, onMarcar, onCambiar, onImportar, onExportar }: {
  codificacion: Codificacion;
  onMarcar: (codigo: string) => void;
  onCambiar: (siguiente: Codificacion) => void;
  onImportar: (texto: string, nombre: string) => void;
  onExportar: (formato: "csv" | "xml") => void;
}) {
  const [editando, setEditando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const cuantos = (id: string) => codificacion.momentos.filter((m) => m.codigo === id).length;
  return <section className="inspector-grupo">
    <h3 className="inspector-titulo">{t("Codificar el partido")}<small>{tf(codificacion.momentos.length === 1 ? "{n} momento" : "{n} momentos", { n: codificacion.momentos.length })}</small></h3>
    <div className="pintado-codigos" role="group" aria-label={t("Códigos")}>
      {codificacion.codigos.map((c) => editando
        ? <div key={c.id} className="pintado-codigo-editable">
          <input type="color" value={c.color} aria-label={tf("Color de {codigo}", { codigo: c.nombre })}
            onChange={(e) => onCambiar({ ...codificacion, codigos: codificacion.codigos.map((x) => (x.id === c.id ? { ...x, color: e.target.value } : x)) })} />
          <input className="abp-campo" value={c.nombre} maxLength={40} aria-label={tf("Nombre del código {tecla}", { tecla: c.tecla || "·" })}
            onChange={(e) => onCambiar({ ...codificacion, codigos: codificacion.codigos.map((x) => (x.id === c.id ? { ...x, nombre: e.target.value } : x)) })} />
          <kbd>{c.tecla || "·"}</kbd>
        </div>
        : <button key={c.id} type="button" onClick={() => onMarcar(c.id)} title={c.tecla ? `${c.nombre} · ${tf("Tecla {tecla}", { tecla: c.tecla })}` : c.nombre}>
          <i style={{ background: c.color }} aria-hidden="true" /><span>{c.nombre}</span>{c.tecla && <kbd>{c.tecla}</kbd>}{cuantos(c.id) > 0 && <b>{cuantos(c.id)}</b>}
        </button>)}
    </div>
    <div className="inspector-tarjeta">
      <div className="inspector-fila" title={t("Cada marca guarda")}><span>{t("Clip")}</span>
        <span className="pintado-segundos">
          <input className="abp-campo corto" type="number" min={0} max={30} value={codificacion.antes} aria-label={t("Segundos antes")}
            onChange={(e) => onCambiar({ ...codificacion, antes: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })} /><small>{t("s antes")}</small>
          <input className="abp-campo corto" type="number" min={0} max={30} value={codificacion.despues} aria-label={t("Segundos después")}
            onChange={(e) => onCambiar({ ...codificacion, despues: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })} /><small>{t("s después")}</small>
        </span>
      </div>
      <div className="inspector-fila abp-acciones">
        <button type="button" className={editando ? "activa" : ""} aria-pressed={editando} onClick={() => setEditando((x) => !x)}>{editando ? t("Listo") : t("Editar los códigos")}</button>
        <button type="button" onClick={() => entrada.current?.click()}><Upload size={13} />{t("Importar")}</button>
        <button type="button" onClick={() => onExportar("csv")} disabled={!codificacion.momentos.length}><ArrowDownToLine size={13} />CSV</button>
        <button type="button" onClick={() => onExportar("xml")} disabled={!codificacion.momentos.length}><ArrowDownToLine size={13} />XML</button>
        <input ref={entrada} type="file" accept=".csv,.xml,text/csv,text/xml,application/xml" hidden
          onChange={async (e) => { const archivo = e.target.files?.[0]; e.target.value = ""; if (archivo) onImportar(await archivo.text(), archivo.name); }} />
      </div>
    </div>
    <p className="inspector-pie">{t("Mientras ves el partido, pulsa la tecla de cada código (1 a 0) en el momento que importa: se guarda un clip con unos segundos antes y después. Se guarda en este navegador para este vídeo; el vídeo no se sube. El XML es el de Sportscode, que leen las demás herramientas de análisis.")}</p>
  </section>;
}

/** Las marcas del partido sobre su línea de tiempo: una raya de su color en cada momento; al pulsarla, se va allí. */
export function MarcasEnLaLinea({ codificacion, total, onIr }: { codificacion: Codificacion; total: number; onIr: (m: Momento) => void }) {
  if (!total || !codificacion.momentos.length) return null;
  const color = new Map(codificacion.codigos.map((c) => [c.id, c.color]));
  const nombre = new Map(codificacion.codigos.map((c) => [c.id, c.nombre]));
  return <div className="pintado-marcas" aria-label={t("Momentos marcados")}>
    {codificacion.momentos.map((m) => <button key={m.id} type="button" style={{ left: `${(m.t / total) * 100}%`, background: color.get(m.codigo) }}
      title={`${nombre.get(m.codigo)} · ${reloj(m.t)}${m.nota ? ` · ${m.nota}` : ""}`} aria-label={`${nombre.get(m.codigo)} ${reloj(m.t)}`} onClick={() => onIr(m)} />)}
  </div>;
}

/** La lista de momentos: filtrable por código, cada uno con su clip, su nota y lo que se le quiera añadir. */
export function MomentosDelPartido({ codificacion, actual, onIr, onCambiar, extra }: {
  codificacion: Codificacion;
  /** El segundo del vídeo que se ve ahora: el momento que lo contiene sale marcado. */
  actual: number;
  onIr: (m: Momento) => void;
  onCambiar: (id: string, cambios: { nota?: string } | null) => void;
  /** Un botón más por momento (por ejemplo, llevarlo a la presentación). */
  extra?: (m: Momento) => ReactNode;
}) {
  const [filtro, setFiltro] = useState<Set<string>>(new Set());
  if (!codificacion.momentos.length) return null;
  const codigo = new Map(codificacion.codigos.map((c) => [c.id, c]));
  const usados = codificacion.codigos.filter((c) => codificacion.momentos.some((m) => m.codigo === c.id));
  const visibles = filtro.size ? codificacion.momentos.filter((m) => filtro.has(m.codigo)) : codificacion.momentos;
  const alternar = (id: string) => setFiltro((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <div className="pintado-momentos">
    <div className="pintado-filtros" role="group" aria-label={t("Filtrar por código")}>
      <button type="button" className={!filtro.size ? "activa" : ""} onClick={() => setFiltro(new Set())}>{t("Todos")}<b>{codificacion.momentos.length}</b></button>
      {usados.map((c) => <button key={c.id} type="button" className={filtro.has(c.id) ? "activa" : ""} onClick={() => alternar(c.id)}>
        <i style={{ background: c.color }} aria-hidden="true" />{c.nombre}<b>{codificacion.momentos.filter((m) => m.codigo === c.id).length}</b>
      </button>)}
    </div>
    <ol>
      {visibles.map((m) => {
        const c = codigo.get(m.codigo);
        const ahora = actual >= m.inicio && actual <= m.fin;
        return <li key={m.id} className={ahora ? "ahora" : ""}>
          <button type="button" className="pintado-momento-ir" onClick={() => onIr(m)} title={t("Ver el clip")}>
            <Play size={11} /><i style={{ background: c?.color }} aria-hidden="true" /><b>{c?.nombre}</b><span>{reloj(m.inicio)}–{reloj(m.fin)}</span>
          </button>
          <input className="abp-campo" value={m.nota} maxLength={200} placeholder={t("Nota para el jugador…")} aria-label={tf("Nota del momento de {t}", { t: reloj(m.t) })}
            onChange={(e) => onCambiar(m.id, { nota: e.target.value })} />
          {extra?.(m)}
          <button type="button" className="pintado-momento-quitar" aria-label={t("Quitar el momento")} title={t("Quitar el momento")} onClick={() => onCambiar(m.id, null)}><Trash size={12} /></button>
        </li>;
      })}
    </ol>
  </div>;
}
