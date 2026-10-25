"use client";

import { useMemo, useState } from "react";
import { PieDeReporte } from "./PieDeReporte";
import { Antetitulo } from "./KitNight";
import { PiezaFicha, useDatosFicha, type ContextoFicha, type IdPieza } from "./PiezasFicha";
import { marcoConNivel, type EntradaOpta } from "@/lib/nivelDeLiga";
import { t, tf } from "@/lib/i18n";
import { MINIMO_COHORTE_EN_SU_LIGA, type DataRow, type PlayerReport } from "@/lib/scouting";
import type { TransfermarktProfile } from "@/lib/transfermarkt";

/**
 * Ficha ampliada: la página 2 del dossier ("Player Snapshot") con StatsBomb.
 *
 * Una sola hoja, como Ficha y radar. Arriba, quién es y en qué destaca: la
 * ficha y las familias, el Top 10 con cómo participa en la jugada, y con quién
 * se parece y cómo recibe. Debajo, los campos en dos filas de cinco columnas
 * iguales, así que todos los campos enteros salen del mismo tamaño: qué hace
 * con el balón (tiros y ocasiones en el último tercio, acciones ganadas,
 * pases y mapa de calor) y dónde juega y cómo le llega (defensa, puestos, dónde recibe, de
 * dónde y de quién). Cada fila estira sus piezas al mismo alto. "Frente a su grupo", "Construcción frente a
 * asociación" y el encaje con un equipo salieron de esta página.
 *
 * Cada gráfico es una pieza de PiezasFicha.
 */
export function SnapshotPage({ rows, indice, informe, perfilTm, minutosMin, destinatario = "", logoDestinatario = "", onAbrirJugador, claseHoja = "legal-page-shell", temporada, clavesPorFila = null, feedOpta = null, ligasDeFila = null, avisoSkillcorner = "" }: {
  /** Si SkillCorner no publica su liga en esta temporada (o solo los físicos): una línea bajo el título. */
  avisoSkillcorner?: string;
  /** Las claves "liga año" de cada fila cuando se mide contra su liga. */
  clavesPorFila?: string[][] | null;
  /** Las claves "liga año" de cada fila, siempre: acotan el Top 10 y los parecidos. */
  ligasDeFila?: string[][] | null;
  feedOpta?: EntradaOpta[] | null;
  /** La temporada que se mira en la ficha; sin ella, la más reciente del jugador. */
  temporada?: string;
  rows: DataRow[];
  indice: number;
  informe: PlayerReport;
  perfilTm?: Partial<TransfermarktProfile>;
  minutosMin: number;
  destinatario?: string;
  logoDestinatario?: string;
  onAbrirJugador?: (indice: number) => void;
  /** La clase de la hoja de impresión. */
  claseHoja?: string;
}) {
  // El Top 10 y los parecidos: su liga, y las que se añadan.
  const [ligasExtra, setLigasExtra] = useState<string[]>([]);
  const susLigas = ligasDeFila?.[indice] ?? [];
  const otrasLigas = useMemo(
    () => [...new Set((ligasDeFila ?? []).flat())].filter((liga) => !susLigas.includes(liga)).sort((x, y) => x.localeCompare(y)),
    // susLigas sale de ligasDeFila e indice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ligasDeFila, indice],
  );
  // Siempre contra su liga y su cohorte, se mida como se mida la ficha: aquí se mira a un jugador en su sitio.
  const contexto: ContextoFicha = { rows, indice, informe, perfilTm, minutosMin, onAbrirJugador, temporada, clavesPorFila, feedOpta, ligasDeFila, ligasExtra, siempreSuLiga: true };
  const datos = useDatosFicha(contexto, true, true);
  const [familiaTop, setFamiliaTop] = useState("progresion");
  // El mapa de recepciones y su reparto se agrupan igual: cambiar uno cambia los dos.
  const [agruparRecepciones, setAgruparRecepciones] = useState("tipo");
  const pieza = (id: IdPieza) => <PiezaFicha pieza={id} datos={datos} />;

  const cabecera = <header>
    <div>
      <Antetitulo>{t("STATSBOMB · FICHA AMPLIADA")}</Antetitulo>
      <h2>{datos.jugador}</h2>
      <p>{datos.marco?.modo === "liga"
        ? `${tf("Familias contra {n} {grupo} de su liga y temporada ({marco}), con al menos {m} minutos.", { n: datos.grupo.indices.length, grupo: datos.nombreGrupo.toLowerCase(), m: minutosMin, marco: datos.marco.texto })}${datos.marco.enSuLiga < MINIMO_COHORTE_EN_SU_LIGA ? ` ${t("Son pocos: cada puesto de diferencia mueve mucho el percentil.")}` : ""}`
        : datos.marco
          ? tf("Familias contra {n} {grupo} de la base cargada, con al menos {m} minutos: su liga ({marco}) solo tiene {k} de su puesto, pocos para un grupo propio.", { n: datos.grupo.indices.length, grupo: datos.nombreGrupo.toLowerCase(), m: minutosMin, marco: datos.marco.texto, k: datos.marco.enSuLiga })
          : tf("Familias contra {n} {grupo} de la base cargada, con al menos {m} minutos.", { n: datos.grupo.indices.length, grupo: datos.nombreGrupo.toLowerCase(), m: minutosMin })}</p>
      {avisoSkillcorner && <p className="snap-aviso-sc">{avisoSkillcorner}</p>}
      {susLigas.length > 0 && otrasLigas.length > 0 && <div className="snap-ligas" role="group" aria-label={t("Ligas del Top 10 y de los parecidos")}>
        <span>{t("Top 10 y parecidos")}</span>
        <b className="snap-liga propia">{marcoConNivel(susLigas, feedOpta)}</b>
        {ligasExtra.map((liga) => <button key={liga} type="button" className="snap-liga" onClick={() => setLigasExtra((actuales) => actuales.filter((x) => x !== liga))}
          title={t("Quitar")}>{marcoConNivel([liga], feedOpta)} ×</button>)}
        <select aria-label={t("Añadir una liga")} value="" onChange={(evento) => { const liga = evento.target.value; if (liga) setLigasExtra((actuales) => [...actuales, liga]); }}>
          <option value="">{t("+ Añadir liga")}</option>
          {otrasLigas.filter((liga) => !ligasExtra.includes(liga)).map((liga) => <option key={liga} value={liga}>{marcoConNivel([liga], feedOpta)}</option>)}
        </select>
        {ligasExtra.length > 0 && <button type="button" className="snap-liga-limpiar" onClick={() => setLigasExtra([])}>{t("Solo su liga")}</button>}
      </div>}
    </div>
  </header>;
  const pie = <PieDeReporte asunto={datos.jugador} destinatario={destinatario} logo={logoDestinatario} />;


  return <div className={claseHoja}>
    <section className="snap-page snap-hoja-unica">
      {cabecera}
      {datos.estado && <p className="snap-estado" role="status">{datos.estado}</p>}

      {/* Quién es: la ficha y sus familias; el Top 10 con la jugada debajo; con quién se parece y cómo recibe. */}
      <div className="snap-fila snap-una-1">
        <div className="snap-columna">
          {pieza("ficha")}
          {pieza("tabla")}
        </div>
        <div className="snap-columna snap-participacion">
          <PiezaFicha pieza="top10" datos={datos} opcion={familiaTop} onOpcion={setFamiliaTop} />
          {pieza("roles")}
        </div>
        <div className="snap-columna">
          {pieza("parecidos")}
          <PiezaFicha pieza="recepciones_tipo" datos={datos} opcion={agruparRecepciones} onOpcion={setAgruparRecepciones} />
        </div>
      </div>

      {/* Los campos, todos del mismo tamaño: dos filas de cinco columnas iguales.
          Tiros y ocasiones solo necesitan el último tercio: van uno sobre otro,
          a la misma escala que los campos enteros. */}
      {/* Qué hace con el balón. */}
      <div className="snap-fila snap-campos">
        <div className="snap-columna">
          {pieza("tiros")}
          {pieza("ocasiones")}
        </div>
        {pieza("ganadas")}
        {pieza("pases_inicio")}
        {pieza("pases_fin")}
        {pieza("calor")}
      </div>

      {/* Dónde juega y cómo le llega: dónde defiende, sus puestos, dónde recibe, de dónde y de quién. */}
      <div className="snap-fila snap-campos">
        {pieza("defensa")}
        {pieza("puestos")}
        <PiezaFicha pieza="recepciones" datos={datos} opcion={agruparRecepciones} onOpcion={setAgruparRecepciones} />
        {pieza("recepciones_origen")}
        {pieza("recepciones_pasadores")}
      </div>
      {pie}
    </section>
  </div>;
}
