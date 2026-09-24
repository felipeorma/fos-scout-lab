"use client";

import { useEffect, useMemo, useState } from "react";
import { Desplegable } from "./BarraDeFiltros";
import { useEstilos } from "./useEstilos";
import { useRoles } from "./useRolesDeLiga";
import type { DatosFicha } from "./PiezasFicha";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchPuestosDeEquipo } from "@/lib/remoteData";
import { buildPlayerReport, detectCoreColumns, headersOf, numeric } from "@/lib/scouting";
import { COMPUESTAS, ROLES_SECUENCIA, fuenteStatsbomb, rolesFrenteAlGrupo } from "@/lib/snapshot";
import { EQUIPO_PROPIO, crearBuscadorDeEquipos, mismoEquipo, parecidoDeEstilo, perfilesDeEstilo } from "@/lib/estiloEquipo";
import {
  compararConPuesto,
  nivelFrenteAPlantilla,
  percentilAZ,
  perfilDelPuesto,
  presenciaDelPuesto,
  tramo,
  type Alineaciones,
  type Perfil,
} from "@/lib/encaje";

/**
 * Encaje con un equipo: si el jugador sirve a ese equipo, en cuatro partes
 * que se leen por separado (ver lib/encaje.ts). El equipo es Cavalry por
 * defecto y se puede cambiar por cualquiera de la base.
 */

// Las alineaciones de cada equipo ya pedidas, y las que están en camino.
const puestosGuardados = new Map<string, Alineaciones>();
const puestosEnCamino = new Map<string, Promise<Alineaciones>>();

function usePuestos(clave: string) {
  const [datos, setDatos] = useState<Alineaciones | null>(() => (clave ? puestosGuardados.get(clave) ?? null : null));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!clave) { setDatos(null); setError(""); return; }
    const guardado = puestosGuardados.get(clave);
    if (guardado) { setDatos(guardado); setError(""); return; }
    setDatos(null);
    setError("");
    let vivo = true;
    let promesa = puestosEnCamino.get(clave);
    if (!promesa) {
      promesa = fetchPuestosDeEquipo(clave)
        .then((respuesta) => { puestosGuardados.set(clave, respuesta); return respuesta; })
        .finally(() => puestosEnCamino.delete(clave));
      puestosEnCamino.set(clave, promesa);
    }
    promesa
      .then((respuesta) => { if (vivo) setDatos(respuesta); })
      .catch((fallo) => {
        if (!vivo) return;
        setError(fallo instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : fallo instanceof Error ? fallo.message : String(fallo));
      });
    return () => { vivo = false; };
  }, [clave]);
  return { datos, error };
}

/** El puesto de un rol, en singular y en minúscula: "con un extremo". */
const PUESTO_DEL_ROL: Record<string, string> = {
  Goalkeeper: "portero", Fullback: "lateral", Defender: "central", "Defensive Midfielder": "pivote",
  "Box2Box Midfielder": "interior", "Attack Midfielder": "mediapunta", Wingers: "extremo", "Direct Winger": "extremo", Forward: "delantero",
};

const conSigno = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toLocaleString(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const ordinal = (n: number) => `${n}.º`;

/** El nombre de una dimensión: una familia, o un rol en la secuencia. */
function nombreDe(id: string) {
  if (id.startsWith("rol:")) {
    const rol = ROLES_SECUENCIA.find((r) => r.id === id.slice(4));
    return rol ? tf("Rol: {r}", { r: t(rol.etiqueta) }) : id;
  }
  return t(COMPUESTAS.find((c) => c.id === id)?.etiqueta ?? id);
}

export function EncajeEquipo({ datos, equipo: elegido = "", onEquipo, detalle = true }: {
  datos: DatosFicha;
  /** El equipo de destino; vacío, Cavalry si está en la base. */
  equipo?: string;
  onEquipo?: (equipo: string) => void;
  /** La comparación dimensión a dimensión, debajo del resumen. */
  detalle?: boolean;
}) {
  const { contexto, grupo, propias, roles: rolesJugador, nombreGrupo } = datos;
  const { rows, indice, minutosMin, informe } = contexto;
  const fila = rows[indice];
  const equipoJugador = String(fila?.Team ?? informe.team);
  const columnaMinutos = useMemo(() => detectCoreColumns(headersOf(rows)).minutes, [rows]);
  const minutos = (i: number) => (columnaMinutos ? numeric(rows[i]?.[columnaMinutos]) : 0) || 0;

  const equipos = useMemo(() => [...new Set(rows.map((r) => String(r.Team ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)), [rows]);
  const porDefecto = equipos.find((e) => mismoEquipo(e, EQUIPO_PROPIO)) ?? equipoJugador;
  const destino = elegido && equipos.includes(elegido) ? elegido : porDefecto;
  const esSuEquipo = mismoEquipo(destino, equipoJugador);

  // Los que ya ocupan su puesto en el equipo de destino, con el mínimo de minutos.
  const actuales = useMemo(
    () => grupo.indices.filter((i) => i !== indice && mismoEquipo(String(rows[i]?.Team ?? ""), destino)),
    [grupo, indice, rows, destino],
  );

  // 1. Estilo de origen.
  const { filas: filasEquipo, cargando: cargandoEstilos } = useEstilos();
  const perfiles = useMemo(() => (filasEquipo ? perfilesDeEstilo(filasEquipo) : []), [filasEquipo]);
  const buscar = useMemo(() => crearBuscadorDeEquipos(perfiles), [perfiles]);
  const origen = buscar(equipoJugador);
  const llegada = buscar(destino);
  const estilo = origen && llegada ? (origen.clave === llegada.clave ? 100 : parecidoDeEstilo(origen, llegada)) : Number.NaN;

  // 2. El rol que pide el puesto: familias y roles en la secuencia.
  const fuenteDestino = useMemo(() => {
    for (const i of [...actuales, ...rows.keys()]) {
      if (!mismoEquipo(String(rows[i]?.Team ?? ""), destino)) continue;
      const fuente = fuenteStatsbomb(rows[i]?.["Data sources"]);
      if (fuente) return fuente;
    }
    return null;
  }, [actuales, rows, destino]);
  const { roles: rolesDestino, estado: estadoRoles } = useRoles(fuenteDestino?.liga ?? "", fuenteDestino?.temporada ?? "", Boolean(fuenteDestino));
  const perfilJugador = useMemo(() => {
    const perfil: Perfil = {};
    for (const [id, valor] of Object.entries(propias)) perfil[id] = valor.z;
    for (const f of rolesJugador?.filas ?? []) perfil[`rol:${f.id}`] = percentilAZ(f.percentil);
    return perfil;
  }, [propias, rolesJugador]);
  const puesto = useMemo(() => perfilDelPuesto(actuales.map((i) => {
    const perfil: Perfil = {};
    for (const [id, valor] of Object.entries(grupo.valores.get(i) ?? {})) perfil[id] = valor.z;
    const roles = rolesDestino ? rolesFrenteAlGrupo(rows, grupo.indices, i, rolesDestino.jugadores) : null;
    for (const f of roles?.filas ?? []) perfil[`rol:${f.id}`] = percentilAZ(f.percentil);
    return { perfil, minutos: minutos(i) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [actuales, grupo, rolesDestino, rows, columnaMinutos]);
  const comparacion = useMemo(() => compararConPuesto(perfilJugador, puesto), [perfilJugador, puesto]);

  // 3. Sitio en el dibujo.
  const { datos: alineaciones, error: errorPuestos } = usePuestos(llegada?.clave ?? "");
  const presencia = alineaciones ? presenciaDelPuesto(alineaciones, fila?.Position) : null;

  // 4. Nivel frente a la plantilla. El índice del jugador se recalcula igual
  // que el de los demás —misma cohorte, sin selección manual de métricas—
  // para comparar lo mismo con lo mismo.
  const nivel = useMemo(() => {
    const suyo = buildPlayerReport(rows, indice, minutosMin, informe.cohort)?.indice ?? informe.indice;
    const otros = actuales.map((i) => ({
      nombre: String(rows[i]?.Player ?? ""),
      indice: buildPlayerReport(rows, i, minutosMin, informe.cohort)?.indice ?? 0,
      minutos: minutos(i),
    }));
    return { suyo, ...nivelFrenteAPlantilla(suyo, otros) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, indice, minutosMin, informe.cohort, informe.indice, actuales, columnaMinutos]);

  // La lectura de conjunto, frase a frase. Cada una dice solo lo que sale de
  // su parte; si falta el dato, esa frase no se escribe.
  const frases: string[] = [];
  if (Number.isFinite(estilo) && !esSuEquipo) {
    frases.push(tramo(estilo) === "alto"
      ? tf("{origen} juega parecido a {destino}: la adaptación debería ser corta.", { origen: origen!.equipo, destino: llegada!.equipo })
      : tramo(estilo) === "medio"
        ? tf("{origen} juega algo distinto a {destino}: le tocará adaptarse.", { origen: origen!.equipo, destino: llegada!.equipo })
        : tf("{origen} juega muy distinto a {destino}: la adaptación es el riesgo.", { origen: origen!.equipo, destino: llegada!.equipo }));
  }
  if (comparacion) {
    frases.push(tramo(comparacion.parecido) === "alto"
      ? tf("Hace lo que {destino} pide a sus {grupo}.", { destino, grupo: nombreGrupo.toLowerCase() })
      : tramo(comparacion.parecido) === "medio"
        ? tf("Hace en parte lo que {destino} pide a sus {grupo}.", { destino, grupo: nombreGrupo.toLowerCase() })
        : tf("Su perfil no es el que {destino} pide a sus {grupo}.", { destino, grupo: nombreGrupo.toLowerCase() }));
  }
  if (presencia) {
    frases.push(presencia.porcentajeRol >= 70
      ? tf("El puesto es fijo en su dibujo ({p} % de los partidos).", { p: presencia.porcentajeRol })
      : presencia.porcentajeRol >= 30
        ? tf("Usa ese puesto a veces ({p} % de los partidos).", { p: presencia.porcentajeRol })
        : tf("Casi no juega con ese puesto ({p} % de los partidos).", { p: presencia.porcentajeRol }));
  }
  if (actuales.length) {
    frases.push(nivel.lugar === 1
      ? tf("Por índice, sería el mejor de sus {n} {grupo}.", { n: nivel.de, grupo: nombreGrupo.toLowerCase() })
      : tf("Por índice, sería el {l} de sus {n} {grupo}.", { l: ordinal(nivel.lugar), n: nivel.de, grupo: nombreGrupo.toLowerCase() }));
  }

  const dimensiones = Object.keys(puesto)
    .filter((id) => Number.isFinite(perfilJugador[id]))
    .sort((a, b) => puesto[b] - puesto[a]);
  const escala = (z: number) => `${((Math.max(-2.5, Math.min(2.5, z)) + 2.5) / 5) * 100}%`;

  return <div className="encaje">
    <header className="encaje-titulo">
      <b>{tf("Encaje con {equipo}", { equipo: destino })}</b>
      <small>{t("Cuatro partes que se leen por separado: juntarlas en un número escondería cuál falla.")}</small>
    </header>
    <div className="encaje-cabecera">
      <Desplegable etiqueta={t("Equipo")} valor={destino} activo={false}>
        <select aria-label={t("Equipo de destino")} value={destino} onChange={(evento) => onEquipo?.(evento.target.value)} onClick={(evento) => evento.stopPropagation()}>
          {equipos.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </Desplegable>
      {esSuEquipo && <small className="encaje-aviso">{t("Es su equipo: se compara con sus compañeros de puesto.")}</small>}
    </div>
    <p className="encaje-lectura">{frases.length ? frases.join(" ") : t("Reuniendo los datos del equipo…")}</p>

    <div className="encaje-partes">
      <section className="encaje-parte">
        <h4>{t("Estilo de origen")}</h4>
        {Number.isFinite(estilo)
          ? <><b className={`encaje-cifra ${tramo(estilo)}`}>{Math.round(estilo)}</b>
            <small>{esSuEquipo ? t("Mismo equipo") : `${origen!.equipo} → ${llegada!.equipo}`}</small></>
          : <small>{cargandoEstilos ? t("Cargando los estilos de equipo…") : t("Sin estadísticas de equipo de StatsBomb para uno de los dos.")}</small>}
        <p>{t("Cuánto se parece cómo juega su equipo a cómo juega el de destino. 100 es igual; 50, nada que ver.")}</p>
      </section>

      <section className="encaje-parte">
        <h4>{t("Lo que pide el puesto")}</h4>
        {comparacion
          ? <><b className={`encaje-cifra ${tramo(comparacion.parecido)}`}>{Math.round(comparacion.parecido)}</b>
            <small>{tf("Frente a {n} {grupo} de {destino}", { n: actuales.length, grupo: nombreGrupo.toLowerCase(), destino })}</small>
            <dl className="encaje-listas">
              {comparacion.pideYDa.length > 0 && <div><dt>{t("Pide y da")}</dt><dd>{comparacion.pideYDa.map(nombreDe).join(" · ")}</dd></div>}
              {comparacion.pideYNoDa.length > 0 && <div className="falta"><dt>{t("Pide y no da")}</dt><dd>{comparacion.pideYNoDa.map(nombreDe).join(" · ")}</dd></div>}
              {comparacion.daDeMas.length > 0 && <div className="extra"><dt>{t("Da de más")}</dt><dd>{comparacion.daDeMas.map(nombreDe).join(" · ")}</dd></div>}
            </dl></>
          : <small>{!actuales.length
            ? tf("{destino} no tiene {grupo} con {m} minutos en la base.", { destino, grupo: nombreGrupo.toLowerCase(), m: minutosMin })
            : estadoRoles || t("Sin datos suficientes.")}</small>}
      </section>

      <section className="encaje-parte">
        <h4>{t("Sitio en el dibujo")}</h4>
        {presencia
          ? <><b className="encaje-cifra">{`${presencia.porcentajeRol}%`}</b>
            <small>{tf("de los partidos con un {rol} ({n} de {total})", { rol: presencia.rol && PUESTO_DEL_ROL[presencia.rol] ? t(PUESTO_DEL_ROL[presencia.rol]) : presencia.codigo, n: presencia.deRol, total: presencia.partidos })}</small>
            <i className="encaje-barra"><b style={{ width: `${presencia.porcentajeRol}%` }} /></i>
            <small>{tf("Con {codigo} exacto: {p} % ({n} partidos)", { codigo: presencia.codigo, p: presencia.porcentajeExacto, n: presencia.exacto })}</small></>
          : <small>{errorPuestos || (!llegada
            ? t("Sin datos de StatsBomb de este equipo.")
            : tf("Leyendo las alineaciones de {equipo}…", { equipo: llegada.equipo }))}</small>}
      </section>

      <section className="encaje-parte">
        <h4>{t("Nivel frente a la plantilla")}</h4>
        {actuales.length
          ? <><b className="encaje-cifra">{tf("{l} de {n}", { l: ordinal(nivel.lugar), n: nivel.de })}</b>
            <ol className="encaje-plantilla">
              {[...nivel.actuales.map((a) => ({ ...a, suyo: false })), { nombre: datos.jugador, indice: nivel.suyo, minutos: 0, suyo: true }]
                .sort((a, b) => b.indice - a.indice)
                .map((a) => <li key={`${a.nombre}-${a.suyo}`} className={a.suyo ? "suyo" : undefined}>
                  <span>{a.nombre}</span>
                  <i><b style={{ width: `${Math.max(2, Math.min(100, a.indice))}%` }} /></i>
                  <em>{a.indice}</em>
                </li>)}
            </ol></>
          : <small>{tf("{destino} no tiene {grupo} con {m} minutos en la base.", { destino, grupo: nombreGrupo.toLowerCase(), m: minutosMin })}</small>}
      </section>
    </div>

    {detalle && comparacion && <section className="encaje-detalle">
      <h4>{t("Dimensión a dimensión")}</h4>
      <p className="encaje-detalle-leyenda">
        <span><i className="puesto" />{tf("Lo que pide el puesto en {destino}", { destino })}</span>
        <span><i className="jugador" />{datos.jugador}</span>
        <small>{t("Desviaciones típicas frente a su grupo; los roles, de su percentil. Ordenado por lo que más pide el puesto.")}</small>
      </p>
      <ol className="encaje-mancuernas">
        {dimensiones.map((id) => {
          const pide = puesto[id], da = perfilJugador[id];
          return <li key={id}>
            <span>{nombreDe(id)}</span>
            <i className="pista">
              <b className="cero" />
              <b className="tramo" style={{ left: escala(Math.min(pide, da)), width: `calc(${escala(Math.max(pide, da))} - ${escala(Math.min(pide, da))})` }} />
              <b className="puesto" style={{ left: escala(pide) }} />
              <b className="jugador" style={{ left: escala(da) }} />
            </i>
            <em>{`${conSigno(pide)} / ${conSigno(da)}`}</em>
          </li>;
        })}
      </ol>
    </section>}
  </div>;
}
