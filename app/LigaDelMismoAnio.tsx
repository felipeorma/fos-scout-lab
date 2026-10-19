"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "./Icons";
import { AnadirTemporadaWyscout } from "./AnadirTemporadaWyscout";
import { TemporadaEscrita, type LigaSugerida } from "./TemporadaAMano";
import { MenuDeCompeticiones } from "./estudio/piezas";
import { t, tf } from "@/lib/i18n";
import type { NombreDeBase } from "@/lib/nombresDeBase";
import type { ApiCompetition } from "@/lib/remoteData";
import type { DatosDeTemporada, TemporadaAMano } from "@/lib/temporadasAMano";

/** Otra etapa de un traspaso durante el mismo año, sin sustituir la anterior. */
export function LigaDelMismoAnio({ temporada, inicio, catalogo, ligasSugeridas, manuales, cargando, error, onCargar, onArchivo, onManual, onQuitar }: {
  temporada: NombreDeBase;
  inicio: number;
  catalogo: ApiCompetition[];
  ligasSugeridas: LigaSugerida[];
  manuales: TemporadaAMano[];
  cargando: boolean;
  error: string;
  onCargar: (competicion: ApiCompetition) => Promise<void>;
  onArchivo: (archivo: File, nombre: NombreDeBase) => Promise<void>;
  onManual: (datos: DatosDeTemporada) => void;
  onQuitar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState("");
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  useEffect(() => {
    if (abierto) dialogo.current?.showModal();
  }, [abierto]);

  return <>
    <button type="button" className="liga-mismo-anio-boton" disabled={!inicio || cargando} onClick={() => setAbierto(true)}>
      <Plus size={12} />{t("Añadir liga del mismo año")}
    </button>
    {abierto && createPortal(<dialog ref={dialogo} className="liga-mismo-anio-dialog" aria-labelledby={tituloId}
      onClose={() => setAbierto(false)} onCancel={(evento) => { if (cargando) evento.preventDefault(); }}>
      <header>
        <h2 id={tituloId}>{t("Otra liga del mismo año")}</h2>
        <button type="button" className="button secondary compact" aria-label={t("Cerrar")} disabled={cargando} onClick={() => dialogo.current?.close()}><X size={18} /></button>
      </header>
      <p>{tf("Añade la otra liga en la que jugó durante {s}. La temporada anterior se conserva.", { s: temporada.temporada })}</p>
      {catalogo.length > 0 && <section className="previa-via">
        <h3>{t("De StatsBomb")}</h3>
        <MenuDeCompeticiones lista={catalogo} elegida={elegida} onElegir={setElegida} />
        <button type="button" className="button secondary compact" disabled={cargando || !elegida}
          onClick={() => { const competicion = catalogo[Number(elegida)]; if (competicion) { setElegida(""); void onCargar(competicion); } }}>
          <Plus size={13} />{t("Cargar esta temporada")}
        </button>
      </section>}
      <section className="previa-via">
        <h3>{t("Desde un Excel de Wyscout")}</h3>
        <p>{t("El archivo entra entero como base y suma al radar. Escribe su liga y su temporada.")}</p>
        <AnadirTemporadaWyscout actual={temporada} mismoAnio deshabilitado={cargando} onAnadir={onArchivo} />
      </section>
      <section className="previa-via">
        <h3>{t("Escribiendo los datos")}</h3>
        <p>{t("Añadida a mano: sale en la ficha, pero sin métricas no entra en el radar ni en el índice.")}</p>
        <TemporadaEscrita inicioDeReferencia={inicio} mismoAnio temporadaPropuesta={temporada.temporada}
          ligasSugeridas={ligasSugeridas} deshabilitado={cargando} onAnadir={onManual} />
        {manuales.map((manual) => <div className="liga-mismo-anio-manual" key={manual.id}>
          <span>{`${manual.etiqueta} · ${manual.liga} · ${manual.equipo} · ${manual.minutos}′`}</span>
          <button type="button" className="button secondary compact" disabled={cargando} onClick={() => onQuitar(manual.id)}>{t("Quitar esta temporada")}</button>
        </div>)}
      </section>
      {cargando && <p role="status">{t("Cargando…")}</p>}
      {error && <p role="alert" className="anadir-wyscout-error">{error}</p>}
    </dialog>, document.body)}
  </>;
}
