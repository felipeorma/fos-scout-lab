"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  CATEGORIAS, FORMACIONES, TIPOS_ABP, deSerie, jugadaValida, nombreDeFormacion, nuevoId, plantilla, sistemaDePartido, type Categoria, type Jugada, type TipoABP,
} from "@/lib/abp";
import { t, tf, type Lang } from "@/lib/i18n";
import { Cancha, Duplicar, ArrowDownToLine, Plus, Trash, Upload, X } from "./Icons";

type Pestana = "partido" | "abp" | "entrenamiento" | "libre";

/** El archivo de un sistema, para llevarlo a otro navegador o guardarlo aparte. */
export const archivoDeSistema = (jugada: Jugada) => ({ formato: "fos-sistema", version: 1, jugada });
export const archivoDeCuaderno = (jugadas: Jugada[]) => ({ formato: "fos-cuaderno", version: 1, jugadas });

/**
 * Lee lo que se importe: un sistema, una copia de todo o una jugada suelta.
 * Cada sistema entra con un id nuevo para no pisar uno que ya esté.
 */
export function leerArchivo(texto: string): Jugada[] {
  const datos = JSON.parse(texto) as Record<string, unknown>;
  const brutas = Array.isArray(datos.jugadas) ? datos.jugadas : datos.jugada ? [datos.jugada] : [datos];
  return (brutas as unknown[]).map(jugadaValida).filter((j): j is Jugada => j !== null).map((j) => ({ ...j, id: nuevoId("j"), actualizada: Date.now() }));
}

export function Portal({ jugadas, miniaturas, idioma, onAbrir, onCrear, onDuplicar, onQuitar, onImportar, onDescargar, onCopiaDeTodo }: {
  jugadas: Jugada[];
  miniaturas: Record<string, string>;
  idioma: Lang;
  onAbrir: (id: string) => void;
  onCrear: (jugada: Jugada) => void;
  onDuplicar: (id: string) => void;
  onQuitar: (id: string) => void;
  onImportar: (jugadas: Jugada[]) => void;
  onDescargar: (id: string) => void;
  onCopiaDeTodo: () => void;
}) {
  const [filtro, setFiltro] = useState<Categoria | "todas">("todas");
  const [nuevo, setNuevo] = useState<Pestana | null>(null);
  const [propia, setPropia] = useState("433");
  const [rival, setRival] = useState("442");
  const [balon, setBalon] = useState<"nuestro" | "suyo">("nuestro");
  const [categoria, setCategoria] = useState<Categoria>("salida");
  const [aviso, setAviso] = useState("");
  const entradaRef = useRef<HTMLInputElement>(null);
  const deSerieEn = (texto: string) => deSerie(texto, idioma);

  const ordenadas = [...jugadas].sort((a, b) => b.actualizada - a.actualizada);
  const visibles = filtro === "todas" ? ordenadas : ordenadas.filter((j) => j.categoria === filtro);
  const cuenta = (c: Categoria) => jugadas.filter((j) => j.categoria === c).length;

  /** Lo que sale de una plantilla, con los nombres de serie ya en el idioma de la pantalla. */
  function traducida(jugada: Jugada): Jugada {
    return {
      ...jugada,
      nombre: deSerieEn(jugada.nombre),
      fases: jugada.fases.map((f) => ({ ...f, nombre: deSerieEn(f.nombre), nota: deSerieEn(f.nota) })),
    };
  }
  function crearDePlantilla(tipo: TipoABP) {
    onCrear(traducida(plantilla(tipo)));
    setNuevo(null);
  }
  function crearPartido() {
    onCrear(traducida(sistemaDePartido(propia, rival, balon, categoria)));
    setNuevo(null);
  }
  async function importar(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    try {
      const leidas = leerArchivo(await archivo.text());
      if (!leidas.length) { setAviso(t("Ese archivo no trae ningún sistema.")); return; }
      onImportar(leidas);
      setAviso(tf(leidas.length === 1 ? "{n} sistema importado." : "{n} sistemas importados.", { n: leidas.length }));
    } catch {
      setAviso(t("No se pudo leer el archivo. Tiene que ser un .json del estudio."));
    }
  }

  const fecha = (ms: number) => (ms ? new Date(ms).toLocaleDateString(idioma === "es" ? "es-CL" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const pestanas: Array<{ id: Pestana; nombre: string }> = [
    { id: "partido", nombre: t("Partido") },
    { id: "abp", nombre: t("Balón parado") },
    { id: "entrenamiento", nombre: t("Entrenamiento") },
    { id: "libre", nombre: t("Libre") },
  ];

  return <div className="tactico-portal">
    <div className="tactico-portal-barra">
      <div className="tactico-filtros" role="tablist" aria-label={t("Categorías")}>
        <button type="button" role="tab" aria-selected={filtro === "todas"} className={filtro === "todas" ? "activa" : ""} onClick={() => setFiltro("todas")}>
          {t("Todos")}<b>{jugadas.length}</b>
        </button>
        {CATEGORIAS.map((c) => <button key={c.id} type="button" role="tab" aria-selected={filtro === c.id} className={filtro === c.id ? "activa" : ""} onClick={() => setFiltro(c.id)}>
          {deSerieEn(c.nombre)}<b>{cuenta(c.id)}</b>
        </button>)}
      </div>
      <div className="tactico-portal-acciones">
        <button type="button" className="button secondary compact" onClick={() => entradaRef.current?.click()}><Upload size={14} />{t("Importar")}</button>
        <button type="button" className="button secondary compact" onClick={onCopiaDeTodo} disabled={!jugadas.length}><ArrowDownToLine size={14} />{t("Copia de todo")}</button>
        <button type="button" className="button primary compact" onClick={() => setNuevo("partido")}><Plus size={14} />{t("Nuevo sistema")}</button>
        <input ref={entradaRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importar(e)} />
      </div>
    </div>
    {aviso && <p className="tactico-aviso" role="status">{aviso}</p>}

    {nuevo && <section className="tactico-nuevo" aria-label={t("Nuevo sistema")}>
      <header>
        <h3>{t("Nuevo sistema")}</h3>
        <button type="button" className="menu-cerrar" aria-label={t("Cerrar")} onClick={() => setNuevo(null)}><X size={15} /></button>
      </header>
      <div className="inspector-segmentos ancho tactico-pestanas" role="tablist">
        {pestanas.map((p) => <button key={p.id} type="button" role="tab" aria-selected={nuevo === p.id} className={nuevo === p.id ? "activa" : ""} onClick={() => setNuevo(p.id)}>{p.nombre}</button>)}
      </div>
      {nuevo === "partido" && <div className="tactico-formulario">
        <label><span>{t("Nuestro dibujo")}</span>
          <select value={propia} onChange={(e) => setPropia(e.target.value)}>{FORMACIONES.map((f) => <option key={f} value={f}>{nombreDeFormacion(f)}</option>)}</select>
        </label>
        <label><span>{t("Su dibujo")}</span>
          <select value={rival} onChange={(e) => setRival(e.target.value)}>{FORMACIONES.map((f) => <option key={f} value={f}>{nombreDeFormacion(f)}</option>)}</select>
        </label>
        <div><span>{t("Balón")}</span>
          <div className="inspector-segmentos">
            <button type="button" className={balon === "nuestro" ? "activa" : ""} onClick={() => { setBalon("nuestro"); setCategoria("salida"); }}>{t("Nuestro")}</button>
            <button type="button" className={balon === "suyo" ? "activa" : ""} onClick={() => { setBalon("suyo"); setCategoria("presion"); }}>{t("Suyo")}</button>
          </div>
        </div>
        <label><span>{t("Categoría")}</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {CATEGORIAS.filter((c) => ["salida", "presion", "ataque", "defensa"].includes(c.id)).map((c) => <option key={c.id} value={c.id}>{deSerieEn(c.nombre)}</option>)}
          </select>
        </label>
        <button type="button" className="button primary compact" onClick={crearPartido}>{tf("Crear {a} contra {b}", { a: nombreDeFormacion(propia), b: nombreDeFormacion(rival) })}</button>
      </div>}
      {nuevo === "abp" && <div className="tactico-plantillas">
        {TIPOS_ABP.filter((x) => ["corner_der", "corner_izq", "falta_frontal", "falta_lateral", "banda"].includes(x.id)).map((x) =>
          <button key={x.id} type="button" onClick={() => crearDePlantilla(x.id)}><Cancha size={16} />{deSerieEn(x.nombre)}</button>)}
      </div>}
      {nuevo === "entrenamiento" && <div className="tactico-plantillas">
        <button type="button" onClick={() => crearDePlantilla("rondo")}><Cancha size={16} />{deSerieEn("Rondo 4 contra 2")}</button>
        <button type="button" onClick={() => crearDePlantilla("salida")}><Cancha size={16} />{deSerieEn("Salida de balón")}</button>
      </div>}
      {nuevo === "libre" && <div className="tactico-plantillas">
        <button type="button" onClick={() => crearDePlantilla("libre")}><Cancha size={16} />{deSerieEn("Pizarra libre")}</button>
      </div>}
    </section>}

    {visibles.length ? <div className="tactico-rejilla">
      {visibles.map((j) => <article key={j.id} className="tactico-tarjeta">
        <button type="button" className="tactico-tarjeta-abrir" onClick={() => onAbrir(j.id)} aria-label={tf("Abrir {nombre}", { nombre: j.nombre })}>
          {miniaturas[j.id]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={miniaturas[j.id]} alt="" />
            : <span className="tactico-tarjeta-vacia"><Cancha size={28} /></span>}
        </button>
        <div className="tactico-tarjeta-texto">
          <b>{j.nombre}</b>
          <small>{deSerieEn(CATEGORIAS.find((c) => c.id === j.categoria)?.nombre ?? "Libre")} · {tf(j.fases.length === 1 ? "{n} fase" : "{n} fases", { n: j.fases.length })}{j.actualizada ? ` · ${fecha(j.actualizada)}` : ""}</small>
        </div>
        <div className="tactico-tarjeta-acciones">
          <button type="button" title={t("Duplicar")} aria-label={t("Duplicar")} onClick={() => onDuplicar(j.id)}><Duplicar size={14} /></button>
          <button type="button" title={t("Descargar archivo")} aria-label={t("Descargar archivo")} onClick={() => onDescargar(j.id)}><ArrowDownToLine size={14} /></button>
          <button type="button" className="peligro" title={t("Quitar")} aria-label={t("Quitar")} onClick={() => onQuitar(j.id)}><Trash size={14} /></button>
        </div>
      </article>)}
    </div> : <p className="tactico-vacio">{filtro === "todas" ? t("Todavía no hay sistemas. Crea el primero.") : t("No hay sistemas en esta categoría.")}</p>}
  </div>;
}
