"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Plus } from "./Icons";
import { t, tf } from "@/lib/i18n";
import type { DataRow } from "@/lib/scouting";
import { readWorkbook } from "./estudio/datos";
import { datosDeFilaWyscout, errorDeTemporadaAMano, parecidoDeNombre, type DatosDeTemporada } from "@/lib/temporadasAMano";

/**
 * La temporada anterior de un jugador que no está en ninguna base: sacada de
 * su fila en un Excel de Wyscout o escrita a mano, de cualquier liga y año.
 * Solo números de temporada: la ficha la enseña, pero no entra en el radar.
 */

type Comun = {
  /** El jugador, para encontrar su fila en el Excel. */
  jugador: string;
  /** Año de inicio de la temporada que se mira: la anterior tiene que ser de antes. */
  inicioDeReferencia: number;
  /** La temporada que se propone ("2025" con 2026 de referencia). */
  temporadaPropuesta: string;
  /** Ligas conocidas para sugerir; se puede escribir cualquier otra. */
  ligasSugeridas: string[];
  deshabilitado?: boolean;
  onAnadir: (datos: DatosDeTemporada) => void;
};

const numeroDe = (texto: string) => (texto.trim() === "" ? Number.NaN : Number(texto.replace(",", ".")));

function CamposDeLigaYTemporada({ liga, etiqueta, ligasSugeridas, onLiga, onEtiqueta }: {
  liga: string; etiqueta: string; ligasSugeridas: string[]; onLiga: (valor: string) => void; onEtiqueta: (valor: string) => void;
}) {
  return <>
    <label><span>{t("Liga")}</span><input value={liga} list="ligas-sugeridas" placeholder={t("Cualquier liga")} onChange={(evento) => onLiga(evento.target.value)} /></label>
    <label><span>{t("Temporada")}</span><input value={etiqueta} inputMode="numeric" placeholder="2025 · 2024/2025" onChange={(evento) => onEtiqueta(evento.target.value)} /></label>
    <datalist id="ligas-sugeridas">{ligasSugeridas.map((nombre) => <option key={nombre} value={nombre} />)}</datalist>
  </>;
}

/** Su fila en un Excel de Wyscout de otra liga o temporada. */
export function TemporadaDesdeWyscout({ jugador, inicioDeReferencia, temporadaPropuesta, ligasSugeridas, deshabilitado = false, onAnadir }: Comun) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; filas: DataRow[] } | null>(null);
  const [indice, setIndice] = useState(-1);
  const [liga, setLiga] = useState("");
  const [etiqueta, setEtiqueta] = useState(temporadaPropuesta);
  const [leyendo, setLeyendo] = useState(false);
  const [fallo, setFallo] = useState("");

  // Primero los que se parecen a él, del más parecido al menos; después el resto.
  const opciones = useMemo(() => {
    if (!archivo) return { parecidos: [], resto: [] };
    const conParecido = archivo.filas.map((fila, posicion) => ({ posicion, fila, parecido: parecidoDeNombre(String(fila.Player ?? ""), jugador) }));
    const orden = (a: { fila: DataRow }, b: { fila: DataRow }) => String(a.fila.Player ?? "").localeCompare(String(b.fila.Player ?? ""), "es");
    return {
      parecidos: conParecido.filter((x) => x.parecido > 0).sort((a, b) => b.parecido - a.parecido || orden(a, b)),
      resto: conParecido.filter((x) => x.parecido === 0).sort(orden),
    };
  }, [archivo, jugador]);

  async function leer(elegido: File | undefined) {
    if (!elegido) return;
    setLeyendo(true);
    setFallo("");
    try {
      const leida = await readWorkbook(elegido);
      setArchivo({ nombre: elegido.name, filas: leida.rows });
      const parecidos = leida.rows.map((fila, posicion) => ({ posicion, parecido: parecidoDeNombre(String(fila.Player ?? ""), jugador) }))
        .filter((x) => x.parecido > 0).sort((a, b) => b.parecido - a.parecido);
      setIndice(parecidos[0]?.posicion ?? -1);
      setEtiqueta(temporadaPropuesta);
    } catch (error) {
      setFallo(error instanceof Error ? error.message : String(error));
    } finally {
      setLeyendo(false);
    }
  }

  const fila = archivo && indice >= 0 ? archivo.filas[indice] : null;
  const datos = fila ? datosDeFilaWyscout(fila, liga, etiqueta) : null;
  const error = !fila ? t("Elige su fila en el archivo.") : errorDeTemporadaAMano(datos!, inicioDeReferencia);
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!datos || error) return;
    onAnadir(datos);
    setArchivo(null);
  };
  const texto = (f: DataRow) => {
    const minutos = numeroDe(String(f["Minutes played"] ?? ""));
    return [String(f.Player ?? "—"), String(f["Team within selected timeframe"] ?? f.Team ?? ""), Number.isFinite(minutos) ? `${minutos}′` : ""].filter(Boolean).join(" · ");
  };

  return <div className="anadir-wyscout">
    <input ref={entrada} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(evento) => { void leer(evento.target.files?.[0]); evento.target.value = ""; }} />
    {!archivo && <button type="button" className="button secondary compact" disabled={deshabilitado || leyendo} onClick={() => entrada.current?.click()}>
      <Plus size={13} />{leyendo ? t("Leyendo…") : t("Elegir Excel de Wyscout")}
    </button>}
    {fallo && <small className="anadir-wyscout-error">{fallo}</small>}
    {archivo && <form className="anadir-wyscout-form" onSubmit={enviar}>
      <fieldset>
        <legend>{archivo.nombre}</legend>
        <label className="ancho"><span>{t("Su fila en el archivo")}</span>
          <select value={indice} onChange={(evento) => setIndice(Number(evento.target.value))}>
            <option value={-1} disabled>{t("Elegir jugador…")}</option>
            {opciones.parecidos.length > 0 && <optgroup label={t("Parecidos a su nombre")}>
              {opciones.parecidos.map(({ posicion, fila: f }) => <option key={posicion} value={posicion}>{texto(f)}</option>)}
            </optgroup>}
            <optgroup label={t("Todos")}>
              {opciones.resto.map(({ posicion, fila: f }) => <option key={posicion} value={posicion}>{texto(f)}</option>)}
            </optgroup>
          </select>
        </label>
        <CamposDeLigaYTemporada liga={liga} etiqueta={etiqueta} ligasSugeridas={ligasSugeridas} onLiga={setLiga} onEtiqueta={setEtiqueta} />
      </fieldset>
      {datos && <small className="temporada-previa-nota">{tf("{equipo} · {p} partidos · {m}′ · {g} goles · {a} asist.", {
        equipo: datos.equipo || "—", p: Number.isFinite(datos.partidos) ? datos.partidos : "—", m: Number.isFinite(datos.minutos) ? datos.minutos : "—",
        g: Number.isFinite(datos.goles) ? datos.goles : "—", a: Number.isFinite(datos.asistencias) ? datos.asistencias : "—",
      })}</small>}
      {error && <small className="anadir-wyscout-error">{error}</small>}
      <span className="anadir-wyscout-acciones">
        <button type="submit" className="button primary compact" disabled={Boolean(error) || deshabilitado}>{t("Añadir")}</button>
        <button type="button" className="button secondary compact" onClick={() => setArchivo(null)}>{t("Cancelar")}</button>
      </span>
    </form>}
  </div>;
}

/** Todos los datos escritos a mano. */
export function TemporadaEscrita({ inicioDeReferencia, temporadaPropuesta, ligasSugeridas, deshabilitado = false, onAnadir }: Omit<Comun, "jugador">) {
  const vacio = { liga: "", etiqueta: temporadaPropuesta, equipo: "", partidos: "", minutos: "", goles: "", asistencias: "" };
  const [abierto, setAbierto] = useState(false);
  const [campos, setCampos] = useState(vacio);
  const datos: DatosDeTemporada = {
    liga: campos.liga, etiqueta: campos.etiqueta, equipo: campos.equipo,
    partidos: numeroDe(campos.partidos), minutos: numeroDe(campos.minutos),
    goles: numeroDe(campos.goles), asistencias: numeroDe(campos.asistencias), origen: "mano",
  };
  const error = errorDeTemporadaAMano(datos, inicioDeReferencia);
  const cambiar = (campo: keyof typeof vacio) => (evento: { target: { value: string } }) => setCampos({ ...campos, [campo]: evento.target.value });
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (error) return;
    onAnadir(datos);
    setCampos(vacio);
    setAbierto(false);
  };

  if (!abierto) {
    return <button type="button" className="button secondary compact" disabled={deshabilitado} onClick={() => { setCampos(vacio); setAbierto(true); }}>
      <Plus size={13} />{t("Escribir los datos")}
    </button>;
  }
  return <form className="anadir-wyscout-form" onSubmit={enviar}>
    <fieldset>
      <legend>{t("Temporada anterior, a mano")}</legend>
      <CamposDeLigaYTemporada liga={campos.liga} etiqueta={campos.etiqueta} ligasSugeridas={ligasSugeridas} onLiga={(liga) => setCampos({ ...campos, liga })} onEtiqueta={(etiqueta) => setCampos({ ...campos, etiqueta })} />
      <label className="ancho"><span>{t("Equipo")}</span><input value={campos.equipo} onChange={cambiar("equipo")} /></label>
      <label><span>{t("Partidos")}</span><input value={campos.partidos} inputMode="numeric" onChange={cambiar("partidos")} /></label>
      <label><span>{t("Minutos")}</span><input value={campos.minutos} inputMode="numeric" onChange={cambiar("minutos")} /></label>
      <label><span>{t("Goles")}</span><input value={campos.goles} inputMode="numeric" placeholder="—" onChange={cambiar("goles")} /></label>
      <label><span>{t("Asistencias")}</span><input value={campos.asistencias} inputMode="numeric" placeholder="—" onChange={cambiar("asistencias")} /></label>
    </fieldset>
    {error && <small className="anadir-wyscout-error">{error}</small>}
    <span className="anadir-wyscout-acciones">
      <button type="submit" className="button primary compact" disabled={Boolean(error) || deshabilitado}>{t("Añadir")}</button>
      <button type="button" className="button secondary compact" onClick={() => setAbierto(false)}>{t("Cancelar")}</button>
    </span>
  </form>;
}
