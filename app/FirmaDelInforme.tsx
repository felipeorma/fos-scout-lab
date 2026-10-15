"use client";

import { createContext, useContext } from "react";
import { t } from "@/lib/i18n";

/**
 * Quién firma el informe y de qué club es.
 *
 * El informe es del club que lo encarga —Cavalry por defecto—, no de quien
 * lo hace: cada hoja lleva el escudo junto a la firma. (Hubo una marca de
 * agua con el escudo; se quitó el 15 de octubre de 2026 porque no se veía
 * bien.) Viaja por contexto para que todas las
 * hojas lo lean del mismo sitio; antes el pie de las páginas de análisis
 * tenía el nombre escrito a mano y no seguía a la firma elegida.
 */
export type FirmaDelInforme = {
  nombre: string;
  cargo: string;
  /** El club dueño del informe; vacío en la firma temporal. */
  club: string;
  /** Su escudo, para ir junto a la firma: el subido en "Tu firma" o, sin él, el pequeño de la app. */
  escudo: string;
};

export const FIRMA_INICIAL: FirmaDelInforme = { nombre: "Felipe Ormazabal", cargo: "Scouting · Cavalry FC", club: "", escudo: "" };

export const ContextoDeFirma = createContext<FirmaDelInforme>(FIRMA_INICIAL);

export function useFirma() {
  return useContext(ContextoDeFirma);
}

/** "Elaborado por", con el escudo del club al lado. */
export function AutorDelInforme() {
  const firma = useFirma();
  return <div className={firma.escudo ? "report-author con-escudo" : "report-author"}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {firma.escudo && <img src={firma.escudo} alt={firma.club} className="report-author-escudo" />}
    <span>{t("ELABORADO POR")}</span>
    <b>{firma.nombre}</b>
    {firma.cargo && <small>{firma.cargo}</small>}
  </div>;
}
