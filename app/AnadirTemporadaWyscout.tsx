"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus } from "./Icons";
import { t, tf } from "@/lib/i18n";
import { temporadaAnteriorDe, temporadaValida, type NombreDeBase } from "@/lib/nombresDeBase";

/**
 * Añadir a mano la temporada anterior de una base de Wyscout.
 *
 * Con la API, la temporada anterior se carga sola; con Wyscout hay que subir
 * otro Excel, y Wyscout no dice en el archivo de qué liga ni de qué año es.
 * Aquí se elige el archivo y se escriben las dos cosas —las de la base que ya
 * está y las de la nueva—, con la misma liga y el año anterior ya puestos.
 */
export function AnadirTemporadaWyscout({ actual, deshabilitado = false, onAnadir }: {
  /** Liga y temporada de la base que se está mirando. */
  actual: NombreDeBase;
  deshabilitado?: boolean;
  onAnadir: (archivo: File, anterior: NombreDeBase, actual: NombreDeBase) => void | Promise<void>;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [esta, setEsta] = useState<NombreDeBase>(actual);
  const [nueva, setNueva] = useState<NombreDeBase>({ liga: actual.liga, temporada: temporadaAnteriorDe(actual.temporada) });

  const elegir = (elegido: File | undefined) => {
    if (!elegido) return;
    setArchivo(elegido);
    setEsta(actual);
    setNueva({ liga: actual.liga, temporada: temporadaAnteriorDe(actual.temporada) });
  };
  const inicio = (temporada: string) => Number(temporada.match(/\d{4}/)?.[0] ?? 0);
  const error = !esta.liga.trim() || !nueva.liga.trim() ? t("Escribe la liga de las dos bases.")
    : !esta.temporada.trim() || !nueva.temporada.trim() ? t("Escribe la temporada de las dos bases: sin año no hay temporada anterior.")
    : !temporadaValida(esta.temporada) || !temporadaValida(nueva.temporada) ? t("La temporada se escribe 2026 o 2025/2026.")
    : inicio(nueva.temporada) >= inicio(esta.temporada) ? t("La anterior tiene que ser de un año anterior a esta.")
    : "";
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!archivo || error) return;
    const elegido = archivo;
    setArchivo(null);
    void onAnadir(elegido, nueva, esta);
  };

  return <div className="anadir-wyscout">
    <input ref={entrada} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(evento) => { elegir(evento.target.files?.[0]); evento.target.value = ""; }} />
    {!archivo && <button type="button" className="button secondary compact" disabled={deshabilitado} onClick={() => entrada.current?.click()}>
      <Plus size={13} />{t("Añadir temporada anterior (Excel de Wyscout)")}
    </button>}
    {archivo && <form className="anadir-wyscout-form" onSubmit={enviar}>
      <fieldset>
        <legend>{t("Esta base")}</legend>
        <label><span>{t("Liga")}</span><input value={esta.liga} onChange={(evento) => setEsta({ ...esta, liga: evento.target.value })} /></label>
        <label><span>{t("Temporada")}</span><input value={esta.temporada} inputMode="numeric" placeholder="2026 · 2025/2026" onChange={(evento) => setEsta({ ...esta, temporada: evento.target.value })} /></label>
      </fieldset>
      <fieldset>
        <legend>{tf("La anterior: {archivo}", { archivo: archivo.name })}</legend>
        <label><span>{t("Liga")}</span><input value={nueva.liga} onChange={(evento) => setNueva({ ...nueva, liga: evento.target.value })} /></label>
        <label><span>{t("Temporada")}</span><input value={nueva.temporada} inputMode="numeric" placeholder="2025 · 2024/2025" onChange={(evento) => setNueva({ ...nueva, temporada: evento.target.value })} /></label>
      </fieldset>
      {error && <small className="anadir-wyscout-error">{error}</small>}
      <span className="anadir-wyscout-acciones">
        <button type="submit" className="button primary compact" disabled={Boolean(error) || deshabilitado}>{t("Añadir")}</button>
        <button type="button" className="button secondary compact" onClick={() => setArchivo(null)}>{t("Cancelar")}</button>
      </span>
    </form>}
  </div>;
}
