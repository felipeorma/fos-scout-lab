"use client";

import { useEffect, useMemo, useState } from "react";
import { t, tf } from "@/lib/i18n";
import { CuadranteMetricas, type PuntoCuadrante } from "./ContextCharts";
import {
  fetchContext360,
  fetchStatsbombCompetitions,
  type ApiCompetition,
  type Respuesta360,
} from "@/lib/remoteData";

/**
 * Contexto defensivo de StatsBomb 360.
 *
 * El 360 guarda dónde estaba cada jugador visible en el instante de la acción.
 * De ahí salen tres cosas que ninguna estadística de evento responde: con
 * cuánto espacio recibe, cuántas veces rompe línea al pasar y cuántos rivales
 * tiene por delante al conducir.
 *
 * CPL no tiene 360 —StatsBomb no lo recolecta para esa liga— y la página lo
 * dice en vez de aparecer vacía. Donde sí hay es en MLS Next Pro y USL, que
 * es donde juegan los canadienses jóvenes.
 */

const MOTIVOS: Record<string, string> = {
  sin_360: "sin 360 en el partido",
  red: "sin respuesta",
  json: "respuesta ilegible",
};

/** Mínimo de recepciones para que las medias signifiquen algo. */
const MINIMO_RECEPCIONES = 40;

export function Context360Page() {
  const [competiciones, setCompeticiones] = useState<ApiCompetition[]>([]);
  const [elegida, setElegida] = useState("");
  const [equipo, setEquipo] = useState("Whitecaps");
  const [datos, setDatos] = useState<Respuesta360 | null>(null);
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(false);
  const [foco, setFoco] = useState("");

  useEffect(() => {
    let montado = true;
    void fetchStatsbombCompetitions()
      .then((lista) => {
        if (!montado) return;
        setCompeticiones(lista);
        const anio = String(new Date().getFullYear());
        // MLS Next Pro del año en curso: es donde hay 360 y canadienses.
        const conDatos = lista.filter((competicion) => /next pro|usl/i.test(competicion.name ?? ""));
        const preferida = conDatos.find((competicion) => String(competicion.season ?? "").includes(anio))
          ?? conDatos[conDatos.length - 1];
        if (preferida) setElegida(claveDe(preferida));
      })
      .catch(() => {
        if (montado) setEstado(t("El servidor local no está corriendo. Arranca npm run bg:server y recarga."));
      });
    return () => { montado = false; };
  }, []);

  const competicion = useMemo(
    () => competiciones.find((item) => claveDe(item) === elegida) ?? null,
    [competiciones, elegida],
  );

  async function cargar() {
    if (!competicion || !equipo.trim()) return;
    setCargando(true);
    setEstado(t("Bajando eventos y frames… un partido son unos 9 MB, la primera vez tarda."));
    try {
      const respuesta = await fetchContext360(competicion, equipo.trim());
      setDatos(respuesta);
      setFoco("");
      if (!respuesta.partidosCon360) {
        setEstado(tf("{liga} no tiene datos 360: StatsBomb no los recolecta para esta competición.", {
          liga: `${competicion.name} ${competicion.season}`,
        }));
      } else {
        const faltan = Object.entries(respuesta.estados).filter(([clave]) => clave !== "ok");
        setEstado(tf("{c} de {p} partidos del equipo tienen 360.{extra}", {
          c: respuesta.partidosCon360, p: respuesta.partidos,
          extra: faltan.length
            ? ` ${faltan.map(([clave, n]) => `${n} ${t(MOTIVOS[clave] ?? clave)}`).join(", ")}.`
            : "",
        }));
      }
    } catch (error) {
      setDatos(null);
      setEstado(error instanceof Error ? error.message : String(error));
    } finally {
      setCargando(false);
    }
  }

  const plantel = useMemo(
    () => (datos?.jugadores ?? []).filter((jugador) => jugador.recepciones >= MINIMO_RECEPCIONES),
    [datos],
  );

  const masApretado = useMemo(() => {
    const conDato = plantel.filter((jugador) => jugador.distanciaMedia !== null);
    return [...conDato].sort((a, b) => (a.distanciaMedia as number) - (b.distanciaMedia as number))[0] ?? null;
  }, [plantel]);
  const masApretadoNombre = masApretado?.jugador ?? "";

  /**
   * El cruce que más dice de un perfil: cuánto espacio le dan al recibir
   * contra cuánto rompe línea al pasar. Arriba a la izquierda viven los que
   * juegan apretados y aun así progresan, que es el perfil caro.
   */
  const cuadrante = useMemo<PuntoCuadrante[]>(() => plantel
    .filter((jugador) => jugador.distanciaMedia !== null && jugador.rompeLineaPct !== null && jugador.pases >= 40)
    .map((jugador) => ({
      x: jugador.distanciaMedia as number,
      y: jugador.rompeLineaPct as number,
      nombre: jugador.jugador,
      equipo: jugador.equipo,
      // El gráfico atenúa todo menos al jugador en foco: sin uno marcado, la
      // nube entera queda ilegible. Por defecto, el que juega más apretado.
      esObjetivo: jugador.jugador === (foco || masApretadoNombre),
    })), [plantel, foco, masApretadoNombre]);

  return <section className="ctx360-page">
    <header>
      <div>
        <span>{t("STATSBOMB · 360")}</span>
        <h2>{t("Contexto defensivo")}</h2>
        <p>{t("El 360 guarda dónde estaba cada jugador visible en el instante de la acción. De ahí sale lo que ninguna estadística de evento responde: con cuánto espacio recibe, cuánto rompe línea al pasar y cuántos rivales tiene por delante al conducir.")}</p>
      </div>
    </header>

    <p className="ctx360-aviso">
      {t("La CPL no tiene 360: StatsBomb no lo recolecta para esa liga. Sí lo hay en MLS Next Pro y USL Championship, que es donde juegan los canadienses jóvenes.")}
    </p>

    <div className="ctx360-controls">
      <label><span>{t("Competición")}</span>
        <select value={elegida} onChange={(event) => setElegida(event.target.value)}>
          <option value="">{t("Elegir competición")}…</option>
          {competiciones.map((competicion) => (
            <option key={claveDe(competicion)} value={claveDe(competicion)}>
              {competicion.name} · {competicion.season}
            </option>
          ))}
        </select>
      </label>
      <label><span>{t("Equipo")}</span>
        <input value={equipo} placeholder="Whitecaps" onChange={(event) => setEquipo(event.target.value)} />
      </label>
      <button type="button" className="ctx360-load" disabled={cargando || !competicion} onClick={() => void cargar()}>
        {cargando ? t("Cargando…") : t("Cargar contexto")}
      </button>
      {estado && <small className="ctx360-estado">{estado}</small>}
    </div>

    {plantel.length > 0 && <>
      {cuadrante.length >= 6 && <div className="ctx360-quadrant">
        <h3>{t("Espacio al recibir contra ruptura de líneas")}</h3>
        <p>{t("A la izquierda, los que reciben con un rival encima; arriba, los que rompen línea al pasar. El cuadrante superior izquierdo es el perfil caro: juega apretado y aun así progresa.")}</p>
        <CuadranteMetricas
          titulo=""
          ejeX={t("Metros libres al recibir")}
          ejeY={t("Pases rompe-líneas %")}
          puntos={cuadrante}
        />
      </div>}

      {masApretado && <p className="ctx360-lectura">
        {tf("El que juega más apretado es {jugador}: recibe con {m} m libres de media, contra los {media} m del resto del plantel.", {
          jugador: masApretado.jugador,
          m: (masApretado.distanciaMedia as number).toFixed(1),
          media: media(plantel.map((jugador) => jugador.distanciaMedia).filter((valor): valor is number => valor !== null)).toFixed(1),
        })}
      </p>}

      <div className="ctx360-table">
        <h3>{t("El plantel en su contexto")} <i>{plantel.length}</i></h3>
        <p>{tf("Solo jugadores con {n} recepciones o más: por debajo, las medias son ruido. Haz clic en una fila para situarla en el cuadrante.", { n: MINIMO_RECEPCIONES })}</p>
        <table>
          <thead><tr>
            <th>{t("Jugador")}</th><th>{t("PJ")}</th><th>{t("Recep.")}</th>
            <th>{t("Metros libres")}</th><th>{t("Recibe en espacio")}</th>
            <th>{t("Pases")}</th><th>{t("Rompe línea")}</th><th>{t("Rivales por delante")}</th>
          </tr></thead>
          <tbody>
            {plantel.map((jugador) => (
              <tr
                key={jugador.jugador}
                className={jugador.jugador === (foco || masApretadoNombre) ? "activo" : ""}
                onClick={() => setFoco(jugador.jugador)}
              >
                <td className="ctx360-name">{jugador.jugador}</td>
                <td>{jugador.partidos}</td>
                <td>{jugador.recepciones}</td>
                <td><b>{jugador.distanciaMedia ?? "—"}</b></td>
                <td>{jugador.enEspacioPct !== null ? `${jugador.enEspacioPct}%` : "—"}</td>
                <td>{jugador.pases}</td>
                <td><b>{jugador.rompeLineaPct !== null ? `${jugador.rompeLineaPct}%` : "—"}</b></td>
                <td>{jugador.defensoresMedia ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>}
  </section>;
}

/** StatsBomb identifica una temporada por el par competición+temporada. */
function claveDe(competicion: ApiCompetition) {
  return `${competicion.competition_id}:${competicion.season_id}`;
}

function media(valores: number[]) {
  return valores.length ? valores.reduce((suma, valor) => suma + valor, 0) / valores.length : 0;
}
