"use client";

import { t } from "@/lib/i18n";

/**
 * La firma del informe: quién lo hace, sobre quién es y para quién va.
 *
 * Vivía dentro del diseñador de páginas visuales, así que las páginas de
 * análisis —Carreras, y las que vengan— salían en el PDF sin firmar: el mismo
 * documento llevaba hojas con pie y hojas sin él. Aquí está una sola vez para
 * que las dos digan lo mismo y no se separen con el tiempo.
 *
 * Los colores no se fijan aquí: las clases son las del reporte y cada página
 * las ajusta a su fondo. La hoja de diseño va sobre papel; la de Carreras,
 * sobre el tema de la plataforma.
 */
export function PieDeReporte({ asunto, destinatario, logo, className = "" }: {
  /** De quién es la hoja: el jugador, o el equipo cuando es de todo el plantel. */
  asunto: string;
  /** Club destinatario; si va vacío se dice así, no se inventa uno. */
  destinatario: string;
  /** Link o data URI del escudo; sin él se pintan las iniciales. */
  logo: string;
  className?: string;
}) {
  const club = destinatario || t("Club destinatario");
  const enlace = logo.trim();
  return <footer className={`visual-page-footer visual-page-signature ${className}`.trim()}>
    <div className="report-signatures">
      <div className="report-author"><span>{t("ELABORADO POR")}</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div>
      <span className="visual-footer-confidential">{asunto.toUpperCase()} · {t("REPORTE CONFIDENCIAL")}</span>
      <div className="report-recipient">
        {/^(https?:\/\/|data:image\/)/i.test(enlace)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={enlace} alt={club} className="dossier-footer-club-logo" />
          : <span className="dossier-footer-club-fallback">{club.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase()}</span>}
        <div>
          <span>{t("REPORTE GENERADO PARA")}</span>
          <b>{club}</b>
        </div>
      </div>
    </div>
  </footer>;
}
