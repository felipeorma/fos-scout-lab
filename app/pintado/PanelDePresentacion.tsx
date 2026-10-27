"use client";

import { useEffect, useState } from "react";
import { deSerie, normalizarCuaderno, type Jugada } from "@/lib/abp";
import type { Codificacion } from "@/lib/codificacion";
import { activeLang, t, tf } from "@/lib/i18n";
import {
  CLAVE_CUADERNO, agregarSistema, cambiarNota, diapositivas, duracionDePresentacion, moverElemento, quitarElemento, type Presentacion,
} from "@/lib/presentacion";
import { reloj } from "@/lib/codificacion";
import { ArrowDownToLine, Cancha, MoveDown, MoveUp, Play, Trash, Video } from "../Icons";
import { tituloDe } from "./Presentacion";

/** Los sistemas del estudio táctico, leídos de donde los guarda; si no hay o no se puede leer, ninguno. */
export function sistemasDelEstudio(): Jugada[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_CUADERNO);
    return crudo ? normalizarCuaderno(JSON.parse(crudo))?.jugadas ?? [] : [];
  } catch {
    return [];
  }
}

/**
 * La presentación para el vestuario: clips del partido y sistemas del
 * estudio en orden, cada uno con su nota. Se presenta a pantalla completa o
 * se baja como un solo vídeo.
 */
export function PanelDePresentacion({ presentacion, codificacion, hayVideo, grabando, onCambiar, onPresentar, onDescargar }: {
  presentacion: Presentacion;
  codificacion: Codificacion | null;
  hayVideo: boolean;
  grabando: boolean;
  onCambiar: (siguiente: Presentacion) => void;
  onPresentar: () => void;
  onDescargar: () => void;
}) {
  // Los sistemas del estudio se leen al abrir y cada vez que se despliega la lista: pueden haber cambiado allí.
  const [sistemas, setSistemas] = useState<Jugada[]>([]);
  useEffect(() => { setSistemas(sistemasDelEstudio()); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  const lista = diapositivas(presentacion, codificacion?.momentos ?? [], sistemas);
  const segundos = duracionDePresentacion(lista);
  const nombre = (j: Jugada) => deSerie(j.nombre, activeLang());
  return <section className="inspector-grupo">
    <h3 className="inspector-titulo">{t("Presentación")}<small>{presentacion.elementos.length ? `${presentacion.elementos.length} · ${reloj(segundos)}` : ""}</small></h3>
    <div className="inspector-tarjeta">
      <label className="inspector-fila"><span>{t("Título")}</span>
        <input className="abp-campo" value={presentacion.titulo} maxLength={80} placeholder={t("Charla del sábado")} onChange={(e) => onCambiar({ ...presentacion, titulo: e.target.value })} />
      </label>
      <label className="inspector-fila"><span>{t("Añadir un sistema")}</span>
        <select className="inspector-selector" value="" onFocus={() => setSistemas(sistemasDelEstudio())} onPointerDown={() => setSistemas(sistemasDelEstudio())}
          onChange={(e) => { if (e.target.value) onCambiar(agregarSistema(presentacion, e.target.value)); }}>
          <option value="">{t("Del estudio táctico…")}</option>
          {sistemas.map((j) => <option key={j.id} value={j.id}>{nombre(j)}</option>)}
        </select>
      </label>
    </div>
    {lista.length > 0 && <ol className="pintado-presentacion-lista">
      {lista.map((d, k) => <li key={d.elemento.id} className={d.tipo === "falta" ? "falta" : ""}>
        <div className="pintado-presentacion-fila">
          <b>{String(k + 1).padStart(2, "0")}</b>
          {d.tipo === "sistema" ? <Cancha size={13} /> : <Video size={13} />}
          <span>{tituloDe(d, codificacion)}</span>
          <span className="pintado-presentacion-mover">
            <button type="button" aria-label={t("Subir")} disabled={k === 0} onClick={() => onCambiar(moverElemento(presentacion, d.elemento.id, -1))}><MoveUp size={12} /></button>
            <button type="button" aria-label={t("Bajar")} disabled={k === lista.length - 1} onClick={() => onCambiar(moverElemento(presentacion, d.elemento.id, 1))}><MoveDown size={12} /></button>
            <button type="button" aria-label={t("Quitar")} onClick={() => onCambiar(quitarElemento(presentacion, d.elemento.id))}><Trash size={12} /></button>
          </span>
        </div>
        <input className="abp-campo" value={d.elemento.nota} maxLength={200} placeholder={t("Lo que tienen que ver aquí…")} aria-label={tf("Nota de la diapositiva {n}", { n: k + 1 })}
          onChange={(e) => onCambiar(cambiarNota(presentacion, d.elemento.id, e.target.value))} />
      </li>)}
    </ol>}
    <div className="inspector-fila abp-acciones">
      <button type="button" onClick={onPresentar} disabled={!lista.some((d) => d.tipo !== "falta")}><Play size={13} />{t("Presentar")}</button>
      <button type="button" onClick={onDescargar} disabled={grabando || !lista.some((d) => d.tipo === "sistema" || (d.tipo === "momento" && hayVideo))}>
        <ArrowDownToLine size={13} />{grabando ? t("Grabando…") : t("Descargar vídeo")}
      </button>
    </div>
    <p className="inspector-pie">{t("Añade clips desde la lista de momentos (+) y sistemas del estudio. Presentar: flechas para pasar, espacio para volver a ver, P para el lápiz y Esc para salir. El vídeo sale entero, sin sonido.")}</p>
  </section>;
}
