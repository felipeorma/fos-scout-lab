"use client";

import { useState } from "react";
import { PieDeReporte } from "./PieDeReporte";
import { PiezaFicha, useDatosFicha, type ContextoFicha, type IdPieza } from "./PiezasFicha";
import { t, tf } from "@/lib/i18n";
import type { DataRow, PlayerReport } from "@/lib/scouting";
import type { TransfermarktProfile } from "@/lib/transfermarkt";

/**
 * Ficha ampliada: la página 2 del dossier ("Player Snapshot") con StatsBomb.
 *
 * Arriba, quién es y en qué destaca: la ficha, las trece familias en radar y
 * en tabla, un top 10 y dónde ha jugado. En medio, con quién se parece y qué
 * hace con el balón —tiros, ocasiones, regates—. Abajo, dónde lo hace —pases,
 * mapa de calor, defensa— y cómo queda frente a su grupo.
 *
 * Cada gráfico es una pieza de PiezasFicha: los mismos que Visuales ofrece
 * sueltos para montar una hoja a medida.
 */
export function SnapshotPage({ rows, indice, informe, perfilTm, minutosMin, destinatario = "", logoDestinatario = "", onAbrirJugador }: {
  rows: DataRow[];
  indice: number;
  informe: PlayerReport;
  perfilTm?: Partial<TransfermarktProfile>;
  minutosMin: number;
  destinatario?: string;
  logoDestinatario?: string;
  onAbrirJugador?: (indice: number) => void;
}) {
  const contexto: ContextoFicha = { rows, indice, informe, perfilTm, minutosMin, onAbrirJugador };
  const datos = useDatosFicha(contexto, true);
  const [familiaTop, setFamiliaTop] = useState("progresion");
  const pieza = (id: IdPieza) => <PiezaFicha pieza={id} datos={datos} />;

  return <section className="snap-page">
    <header>
      <div>
        <span>{t("STATSBOMB · FICHA AMPLIADA")}</span>
        <h2>{datos.jugador}</h2>
        <p>{tf("Familias contra {n} {grupo} de la base cargada, con al menos {m} minutos.", { n: datos.grupo.indices.length, grupo: datos.nombreGrupo.toLowerCase(), m: minutosMin })}</p>
      </div>
    </header>
    {datos.estado && <p className="snap-estado" role="status">{datos.estado}</p>}

    <div className="snap-fila snap-fila-1">
      <div className="snap-columna">
        {pieza("ficha")}
        {pieza("tabla")}
      </div>
      {pieza("radar")}
      <PiezaFicha pieza="top10" datos={datos} opcion={familiaTop} onOpcion={setFamiliaTop} />
      {pieza("puestos")}
    </div>

    <div className="snap-fila snap-fila-2">
      {pieza("parecidos")}
      {pieza("tiros")}
      {pieza("ocasiones")}
      {pieza("regates")}
    </div>

    <div className="snap-fila snap-fila-3">
      {pieza("pases_inicio")}
      {pieza("pases_fin")}
      {pieza("calor")}
      {pieza("defensa")}
    </div>

    <div className="snap-fila snap-fila-4">
      {pieza("enjambres")}
      {pieza("dispersion")}
    </div>

    <PieDeReporte asunto={datos.jugador} destinatario={destinatario} logo={logoDestinatario} />
  </section>;
}
