"use client";

import { useEffect, useState } from "react";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchDondeAparece, type AparicionDeJugador, type ApiCompetition } from "@/lib/remoteData";
import { Check } from "./Icons";

/** Lo ya buscado en esta sesión, por jugador: no se vuelve a pedir. */
const recordadas = new Map<string, Promise<{ apariciones: AparicionDeJugador[]; revisadas: number }>>();

/**
 * En qué ligas aparece el jugador, en TODO el catálogo de StatsBomb de la
 * suscripción: las ya cargadas, con un check; las que no, con un botón para
 * cargarlas. Sale sola al elegir al objetivo o al comparable, para no tener
 * que adivinar qué temporada suya falta (antes se proponían las de sus ligas
 * a ciegas, y a veces no estaba en ellas).
 */
export function DondeAparece({ jugador, nacimiento, estaCargada, onCargar, cargando = false }: {
  jugador: string;
  nacimiento: string;
  estaCargada: (competicion: ApiCompetition) => boolean;
  onCargar?: (competicion: ApiCompetition) => void;
  cargando?: boolean;
}) {
  const clave = `${jugador}|${nacimiento}`;
  const [resultado, setResultado] = useState<{ clave: string; apariciones: AparicionDeJugador[]; revisadas: number; error: string } | null>(null);
  useEffect(() => {
    if (!jugador) return;
    let vivo = true;
    if (!recordadas.has(clave)) {
      const promesa = fetchDondeAparece(jugador, nacimiento);
      promesa.catch(() => recordadas.delete(clave));
      recordadas.set(clave, promesa);
    }
    recordadas.get(clave)!
      .then((datos) => { if (vivo) setResultado({ clave, ...datos, error: "" }); })
      .catch((error: unknown) => { if (vivo) setResultado({ clave, apariciones: [], revisadas: 0, error: error instanceof Error ? error.message : String(error) }); });
    return () => { vivo = false; };
  }, [clave, jugador, nacimiento]);

  const vigente = resultado?.clave === clave ? resultado : null;
  const faltan = vigente?.apariciones.filter((a) => !estaCargada(a)) ?? [];
  return <div className="donde-aparece" aria-live="polite">
    <span className="temporadas-chips-titulo">{tf("Dónde aparece {p}", { p: jugador })}</span>
    {!vigente && <small className="temporadas-chips-nota">{t("Buscándole en todo el catálogo de StatsBomb… la primera vez tarda hasta un minuto.")}</small>}
    {vigente?.error && <small className="temporadas-chips-nota aviso">{t("No se pudo buscar dónde aparece: ¿está abierto el puente local?")}</small>}
    {vigente && !vigente.error && <>
      <div className="temporadas-chips-lista">
        {vigente.apariciones.map((a) => {
          const cargada = estaCargada(a);
          const texto = <><b>{`${a.name} ${a.season}`}</b><small>{`${a.equipo} · ${Math.round(a.minutos).toLocaleString(numberLocale())}′`}</small></>;
          return cargada
            ? <span key={`${a.competition_id}-${a.season_id}`} className="temporada-chip on fija" title={t("Ya cargada")}><Check size={12} />{texto}</span>
            : <button key={`${a.competition_id}-${a.season_id}`} type="button" className="temporada-chip cargable" disabled={cargando || !onCargar}
              title={tf("Cargar {liga} {s} de StatsBomb", { liga: a.name, s: a.season })} onClick={() => onCargar?.(a)}><i aria-hidden="true" />{texto}</button>;
        })}
      </div>
      <small className="temporadas-chips-nota">{vigente.apariciones.length
        ? faltan.length
          ? tf("{n} de sus {t} temporadas en StatsBomb están sin cargar: tócalas para sumarlas.", { n: faltan.length, t: vigente.apariciones.length })
          : tf("Todas sus temporadas en StatsBomb ({t}) están cargadas.", { t: vigente.apariciones.length })
        : tf("No aparece en ninguna de las {n} competiciones de StatsBomb de la suscripción.", { n: vigente.revisadas })}</small>
    </>}
  </div>;
}
