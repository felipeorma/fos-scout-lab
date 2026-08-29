"use client";

import { useMemo, useState } from "react";
import { t, tf } from "@/lib/i18n";
import { rankingPorArquetipo, type RankingArquetipo } from "@/lib/arquetipos";
import type { DataRow } from "@/lib/scouting";

/**
 * Arquetipos de la posición: quién es el mejor en cada perfil, no en general.
 *
 * La lectura que propone SkillCorner en su serie "Smarter Scouting" es que un
 * ranking único por posición mezcla jugadores que no compiten por el mismo
 * puesto. Aquí se ve al revés: primero el arquetipo, después el ranking, y el
 * jugador del informe marcado dentro para saber a cuál se parece.
 */

function BarraAjuste({ valor, destacado }: { valor: number; destacado: boolean }) {
  return <i className={destacado ? "arq-barra destacado" : "arq-barra"}>
    <em style={{ width: `${Math.max(2, valor)}%` }} />
  </i>;
}

export function Arquetipos({ rows, cohorte, minutosMin, jugador, onSelectPlayer }: {
  rows: DataRow[];
  cohorte: string;
  minutosMin: number;
  /** El jugador del informe: se marca en cada ranking. */
  jugador: string;
  onSelectPlayer?: (indice: number) => void;
}) {
  const rankings = useMemo(
    () => rankingPorArquetipo(rows, cohorte, minutosMin),
    [rows, cohorte, minutosMin],
  );
  const [abierto, setAbierto] = useState("");

  if (!rankings.length) return null;

  /** En qué arquetipo encaja mejor el jugador del informe. */
  const suyo = rankings
    .map((ranking) => ({
      ranking,
      fila: ranking.jugadores.find((candidato) => candidato.nombre === jugador),
    }))
    .filter((entrada): entrada is { ranking: RankingArquetipo; fila: NonNullable<typeof entrada.fila> } => Boolean(entrada.fila))
    .sort((a, b) => b.fila.ajuste - a.fila.ajuste)[0];

  return <section className="arq-block">
    <h3>{t("Arquetipos de la posición")}</h3>
    <p>{t("Un ranking por perfil, no uno solo por posición: un central con salida y un central de duelo son buenos en cosas distintas y ordenarlos juntos los mezcla. El ajuste es la media de sus percentiles en las métricas de ese arquetipo, contra los jugadores de su misma posición en la base.")}</p>

    {suyo && <p className="arq-lectura">
      {tf("{jugador} encaja sobre todo como {arquetipo}: ajuste {ajuste} sobre 100, {puesto}º de {n} en la base.", {
        jugador,
        arquetipo: t(suyo.ranking.arquetipo.nombre).toLowerCase(),
        ajuste: suyo.fila.ajuste,
        puesto: suyo.ranking.jugadores.indexOf(suyo.fila) + 1,
        n: suyo.ranking.jugadores.length,
      })}
    </p>}

    <div className="arq-grid">
      {rankings.map((ranking) => {
        const propio = ranking.jugadores.find((candidato) => candidato.nombre === jugador);
        const expandido = abierto === ranking.arquetipo.id;
        const visibles = expandido ? ranking.jugadores.slice(0, 15) : ranking.jugadores.slice(0, 5);
        // Al jugador del informe se le hace sitio aunque no entre en el corte:
        // la ficha existe para situarlo a él.
        const lista = propio && !visibles.includes(propio) ? [...visibles, propio] : visibles;
        return <div key={ranking.arquetipo.id} className="arq-card">
          <h4>{t(ranking.arquetipo.nombre)}</h4>
          <p>{t(ranking.arquetipo.resumen)}</p>
          <ol>
            {lista.map((fila) => {
              const puesto = ranking.jugadores.indexOf(fila) + 1;
              const esPropio = fila.nombre === jugador;
              return <li
                key={fila.indice}
                className={esPropio ? "propio" : ""}
                onClick={() => onSelectPlayer?.(fila.indice)}
                title={fila.detalle.map((d) => `${t(d.etiqueta)}: P${d.percentil}`).join("\n")}
              >
                <span className="arq-puesto">{puesto}</span>
                <span className="arq-nombre">{fila.nombre}<small>{fila.equipo}{Number.isFinite(fila.edad) ? ` · ${fila.edad}` : ""}</small></span>
                <BarraAjuste valor={fila.ajuste} destacado={esPropio} />
                <b>{fila.ajuste}</b>
              </li>;
            })}
          </ol>
          {ranking.jugadores.length > 5 && (
            <button type="button" className="arq-mas" onClick={() => setAbierto(expandido ? "" : ranking.arquetipo.id)}>
              {expandido ? t("Ver menos") : tf("Ver los {n} primeros", { n: Math.min(15, ranking.jugadores.length) })}
            </button>
          )}
          <small className="arq-metricas">
            {tf("Mide: {lista}.", { lista: ranking.disponibles.map((etiqueta) => t(etiqueta).toLowerCase()).join(", ") })}
            {ranking.faltantes.length > 0 && ` ${tf("Sin datos en esta base: {lista}.", {
              lista: ranking.faltantes.map((etiqueta) => t(etiqueta).toLowerCase()).join(", "),
            })}`}
          </small>
        </div>;
      })}
    </div>
  </section>;
}
