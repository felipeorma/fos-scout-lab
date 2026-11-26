"use client";

import { useRef, useState, type FormEvent } from "react";
import { numberLocale, t, tf } from "@/lib/i18n";
import { LISTA_POR_DEFECTO, anotar, borrarLista, crearLista, dejarDeSeguir, juntar, leerEstado, mover, renombrarLista } from "@/lib/seguimiento";
import { cambiarSeguimiento, useSeguimiento } from "./useSeguimiento";
import { BotonExportar } from "./BotonExportar";
import { ArrowDownToLine, ChevronRight, Plus, Trash, Upload, X } from "./Icons";

/**
 * Las listas de seguimiento: a quién se está siguiendo, por qué y cómo se le
 * midió cuando se le marcó. Se marca con la estrella de la barra del jugador
 * o del Ranking; aquí se ordenan en listas, se anotan y se abren.
 *
 * Es una página de trabajo, no una hoja del informe: se exporta a CSV (para
 * el director o el staff) y como copia para llevarla a otro ordenador.
 */
export function SeguimientoPage({ estaEnLaBase, onAbrir, onComparar }: {
  /** Si el jugador está en las bases cargadas (si no, no se puede abrir). */
  estaEnLaBase: (clave: string) => boolean;
  onAbrir: (clave: string) => void;
  onComparar: (clave: string) => void;
}) {
  const estado = useSeguimiento();
  const [elegida, setElegida] = useState(LISTA_POR_DEFECTO);
  const [nueva, setNueva] = useState("");
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const archivo = useRef<HTMLInputElement>(null);
  const lista = estado.listas.includes(elegida) ? elegida : LISTA_POR_DEFECTO;
  const entradas = estado.entradas.filter((e) => e.lista === lista).sort((a, b) => b.anadido - a.anadido);
  const fecha = (ms: number) => (ms ? new Date(ms).toLocaleDateString(numberLocale(), { day: "numeric", month: "short", year: "numeric" }) : "—");

  const crear = (evento: FormEvent) => {
    evento.preventDefault();
    const nombre = nueva.trim();
    if (!nombre) return;
    cambiarSeguimiento((actual) => crearLista(actual, nombre));
    setElegida(nombre.replace(/\s+/g, " "));
    setNueva("");
  };
  const exportarCopia = () => {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([JSON.stringify(estado, null, 2)], { type: "application/json" }));
    enlace.download = `seguimiento-${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };
  const importarCopia = async (fichero: File | undefined) => {
    if (!fichero) return;
    try {
      const copia = leerEstado(JSON.parse(await fichero.text()));
      if (!copia) { setAviso(t("Ese archivo no es una copia de seguimiento.")); return; }
      cambiarSeguimiento((actual) => juntar(actual, copia));
      setAviso(tf("Importados {n} jugadores; no se borró nada de lo que ya había.", { n: copia.entradas.length }));
    } catch {
      setAviso(t("No se pudo leer el archivo."));
    }
  };

  return <section className="seguimiento-page" data-hoja-vacia={estado.entradas.length ? undefined : ""}>
    <header>
      <div>
        <span>{t("LISTAS DE SEGUIMIENTO")}</span>
        <h2>{t("Los jugadores que sigues")}</h2>
        <p>{t("Márcalos con la estrella de la barra del jugador o del Ranking. Aquí se ordenan en listas, se anotan y se abren. Se guardan en este navegador; para llevarlas a otro ordenador, exporta una copia.")}</p>
      </div>
    </header>

    <div className="seguimiento-barra">
      <div className="rank-tabs seguimiento-listas" role="tablist" aria-label={t("Listas")}>
        {estado.listas.map((nombre) => {
          const cuantos = estado.entradas.filter((e) => e.lista === nombre).length;
          return <button key={nombre} type="button" role="tab" aria-selected={nombre === lista} className={nombre === lista ? "on" : undefined} onClick={() => setElegida(nombre)}>
            {nombre === LISTA_POR_DEFECTO ? t(LISTA_POR_DEFECTO) : nombre}<small>{cuantos}</small>
          </button>;
        })}
      </div>
      <form className="seguimiento-nueva" onSubmit={crear}>
        <input value={nueva} onChange={(evento) => setNueva(evento.target.value)} placeholder={t("Nueva lista…")} aria-label={t("Nombre de la nueva lista")} />
        <button type="submit" className="button secondary compact" disabled={!nueva.trim()}><Plus size={13} />{t("Crear")}</button>
      </form>
      <div className="seguimiento-acciones">
        {lista !== LISTA_POR_DEFECTO && (renombrando === null
          ? <button type="button" className="button secondary compact" onClick={() => setRenombrando(lista)}>{t("Renombrar")}</button>
          : <form className="seguimiento-nueva" onSubmit={(evento) => { evento.preventDefault(); cambiarSeguimiento((actual) => renombrarLista(actual, lista, renombrando)); setElegida(renombrando.trim().replace(/\s+/g, " ") || lista); setRenombrando(null); }}>
            <input autoFocus value={renombrando} onChange={(evento) => setRenombrando(evento.target.value)} aria-label={t("Nuevo nombre de la lista")} />
            <button type="submit" className="button secondary compact">{t("Guardar")}</button>
            <button type="button" className="button secondary compact" onClick={() => setRenombrando(null)} aria-label={t("Cancelar")}><X size={13} /></button>
          </form>)}
        <button type="button" className="button secondary compact" disabled={!entradas.length && lista === LISTA_POR_DEFECTO}
          onClick={() => {
            const pregunta = lista === LISTA_POR_DEFECTO
              ? tf("¿Vaciar «{l}»? Se quitan sus {n} jugadores.", { l: t(LISTA_POR_DEFECTO), n: entradas.length })
              : tf("¿Borrar la lista «{l}» y sus {n} jugadores?", { l: lista, n: entradas.length });
            if (window.confirm(pregunta)) { cambiarSeguimiento((actual) => borrarLista(actual, lista)); setElegida(LISTA_POR_DEFECTO); }
          }}><Trash size={13} />{lista === LISTA_POR_DEFECTO ? t("Vaciar") : t("Borrar lista")}</button>
        <BotonExportar nombre={[t("seguimiento"), lista]} cuantas={entradas.length}
          columnas={[t("Lista"), t("Jugador"), t("Equipo"), t("Posición"), t("Edad"), t("Ligas"), t("Período"), t("Índice"), t("Nota"), t("Añadido")]}
          filas={() => entradas.map((e) => [e.lista, e.nombre, e.equipo, e.posicion, e.edad, e.ligas.join(" · "), e.periodo, e.indice, e.nota, fecha(e.anadido)])} />
        <button type="button" className="button secondary compact" onClick={exportarCopia} disabled={!estado.entradas.length}><ArrowDownToLine size={13} />{t("Exportar copia")}</button>
        <button type="button" className="button secondary compact" onClick={() => archivo.current?.click()}><Upload size={13} />{t("Importar copia")}</button>
        <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={(evento) => { void importarCopia(evento.target.files?.[0]); evento.target.value = ""; }} />
      </div>
      {aviso && <p className="seguimiento-aviso" role="status">{aviso}</p>}
    </div>

    {entradas.length ? <ol className="seguimiento-lista">
      {entradas.map((e) => {
        const enLaBase = estaEnLaBase(e.clave);
        return <li key={`${e.lista}|${e.clave}`}>
          <div className="seguimiento-quien">
            <b>{e.nombre}</b>
            <small>{[e.equipo, e.posicion, e.edad ? tf("{n} años", { n: e.edad }) : "", e.ligas.join(" · ")].filter(Boolean).join(" · ")}</small>
            <small>{[e.periodo, e.indice !== null ? tf("índice {n}", { n: e.indice }) : "", tf("añadido {f}", { f: fecha(e.anadido) })].filter(Boolean).join(" · ")}</small>
          </div>
          <textarea value={e.nota} rows={2} placeholder={t("Tu nota: por qué, qué ver en vídeo, siguiente paso…")} aria-label={tf("Nota sobre {p}", { p: e.nombre })}
            onChange={(evento) => cambiarSeguimiento((actual) => anotar(actual, e.clave, e.lista, evento.target.value))} />
          <div className="seguimiento-fila-acciones">
            <button type="button" className="button secondary compact" disabled={!enLaBase} title={enLaBase ? undefined : t("No está en las bases cargadas: carga su liga para abrirle.")} onClick={() => onAbrir(e.clave)}>{t("Abrir ficha")}<ChevronRight size={13} /></button>
            <button type="button" className="button secondary compact" disabled={!enLaBase} onClick={() => onComparar(e.clave)}>{t("Buscar parecidos")}</button>
            {estado.listas.length > 1 && <select aria-label={tf("Mover a {p} a otra lista", { p: e.nombre })} value="" onChange={(evento) => { const a = evento.target.value; if (a) cambiarSeguimiento((actual) => mover(actual, e.clave, e.lista, a)); }}>
              <option value="">{t("Mover a…")}</option>
              {estado.listas.filter((l) => l !== e.lista).map((l) => <option key={l} value={l}>{l === LISTA_POR_DEFECTO ? t(LISTA_POR_DEFECTO) : l}</option>)}
            </select>}
            <button type="button" className="seguimiento-quitar" aria-label={tf("Quitar a {p} de la lista", { p: e.nombre })} title={t("Quitar de la lista")}
              onClick={() => cambiarSeguimiento((actual) => dejarDeSeguir(actual, e.clave, e.lista))}><X size={14} /></button>
          </div>
        </li>;
      })}
    </ol> : <p className="seguimiento-vacia">{t("Esta lista está vacía. Marca jugadores con la estrella de la barra del jugador o del Ranking.")}</p>}
  </section>;
}
