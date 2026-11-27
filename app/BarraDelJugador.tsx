"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Estrella, EstrellaLlena, Search } from "./Icons";
import { numberLocale, t, tf } from "@/lib/i18n";

export type JugadorDeLaBarra = { index: number; player: string; team: string; ligas?: string[] };

/** Evento para abrir el buscador desde cualquier página ("Cambiar jugador"). */
export const ABRIR_BUSCADOR = "fos-abrir-buscador";

const normal = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAXIMO_RESULTADOS = 40;
const ordenar = new Intl.Collator("es", { sensitivity: "base", numeric: true }).compare;

/**
 * La barra del jugador principal: EL sitio donde se elige a quién se mira,
 * en todas las pestañas. Antes había tres —esta barra, el panel de la ficha
 * (liga y año → equipo → jugador) y el paso 1 de Similitud— y cada uno
 * pedía lo mismo a su manera.
 *
 *  - Buscar: por nombre o por club, con teclado.
 *  - Explorar: liga → club → jugador, para quien no sabe el nombre.
 *  - Atrás y adelante: el mismo historial que el navegador.
 *  - Con qué temporadas se le mide, seguirle, y los últimos vistos.
 *  - Qué hay cargado, y el paso a Base activa para cambiarlo.
 *
 * Elegir aquí cambia el jugador en todas las pestañas y no cambia de página.
 */
export function BarraDelJugador({ jugadores, elegido, club, periodo, recientes, onElegir, historial, siguiendo = false, onSeguir, base }: {
  jugadores: JugadorDeLaBarra[];
  elegido: JugadorDeLaBarra | null;
  club: string;
  /** "Temporada 2026" o "Media de 2025 + 2026". */
  periodo: string;
  /** Los últimos vistos, del más reciente al más viejo, sin el actual. */
  recientes: JugadorDeLaBarra[];
  onElegir: (indice: number) => void;
  historial: { puedeVolver: boolean; puedeAvanzar: boolean; volver: () => void; avanzar: () => void };
  /** Si el jugador está en alguna lista de seguimiento, y cómo cambiarlo. */
  siguiendo?: boolean;
  onSeguir?: () => void;
  /** Lo cargado ("15 competiciones · 2025–2026") y cómo ir a cambiarlo. */
  base?: { texto: string; detalle: string; logos?: ReactNode; onCambiar: () => void };
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"buscar" | "explorar">("buscar");
  const [texto, setTexto] = useState("");
  const [activa, setActiva] = useState(0);
  const [liga, setLiga] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const resultados = useMemo(() => {
    const buscado = normal(texto.trim());
    if (!buscado) return recientes;
    const lista: JugadorDeLaBarra[] = [];
    for (const jugador of jugadores) {
      if (normal(`${jugador.player} ${jugador.team}`).includes(buscado)) lista.push(jugador);
      if (lista.length >= MAXIMO_RESULTADOS) break;
    }
    return lista;
  }, [texto, jugadores, recientes]);

  // Explorar: solo se cuenta cuando el panel está en ese modo.
  const ligas = useMemo(() => {
    if (!abierto || modo !== "explorar") return [];
    const cuenta = new Map<string, number>();
    for (const jugador of jugadores) for (const l of jugador.ligas ?? []) cuenta.set(l, (cuenta.get(l) ?? 0) + 1);
    return [...cuenta].sort((a, b) => ordenar(a[0], b[0]));
  }, [abierto, modo, jugadores]);
  const equipos = useMemo(() => {
    if (!liga) return [];
    const cuenta = new Map<string, number>();
    for (const jugador of jugadores) if (jugador.ligas?.includes(liga) && jugador.team) cuenta.set(jugador.team, (cuenta.get(jugador.team) ?? 0) + 1);
    return [...cuenta].sort((a, b) => ordenar(a[0], b[0]));
  }, [liga, jugadores]);
  const delEquipo = useMemo(
    () => (liga && equipo ? jugadores.filter((j) => j.team === equipo && j.ligas?.includes(liga)).sort((a, b) => ordenar(a.player, b.player)) : []),
    [liga, equipo, jugadores],
  );

  // Fuera del buscador, se cierra.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: PointerEvent) => { if (!raiz.current?.contains(evento.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const abrir = (como: "buscar" | "explorar" = "buscar") => {
    setTexto(""); setActiva(0); setModo(como); setAbierto(true);
    if (como === "buscar") requestAnimationFrame(() => entrada.current?.focus());
  };
  // "Cambiar jugador" desde otra página abre este mismo buscador.
  useEffect(() => {
    const desdeFuera = () => { raiz.current?.scrollIntoView({ block: "nearest" }); abrir("buscar"); };
    window.addEventListener(ABRIR_BUSCADOR, desdeFuera);
    return () => window.removeEventListener(ABRIR_BUSCADOR, desdeFuera);
  }, []);
  // Atajo de teclado: ⌘K / Ctrl+K desde cualquier sitio, o "/" si no se está
  // escribiendo. Solo con la barra a la vista (en las pizarras no está, y la
  // del estudio táctico usa ⌘K para su propia paleta).
  useEffect(() => {
    const escribiendo = (objetivo: EventTarget | null) => objetivo instanceof HTMLElement
      && (objetivo.isContentEditable || Boolean(objetivo.closest("input, textarea, select")));
    const alPulsar = (evento: globalThis.KeyboardEvent) => {
      if (evento.defaultPrevented || evento.isComposing || !raiz.current?.offsetParent) return;
      const mando = (evento.metaKey || evento.ctrlKey) && !evento.altKey && !evento.shiftKey && evento.key.toLowerCase() === "k";
      const barra = evento.key === "/" && !evento.metaKey && !evento.ctrlKey && !evento.altKey && !escribiendo(evento.target);
      if (!mando && !barra) return;
      evento.preventDefault();
      raiz.current.scrollIntoView({ block: "nearest" });
      abrir("buscar");
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);
  // El atajo que se enseña: ⌘K en Mac, Ctrl K en lo demás. Se decide en el
  // cliente para que el HTML estático no cambie al hidratar.
  const [atajo, setAtajo] = useState("");
  useEffect(() => { setAtajo(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"); }, []);
  const elegir = (jugador: JugadorDeLaBarra) => { setAbierto(false); onElegir(jugador.index); };
  const teclas = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === "ArrowDown") { evento.preventDefault(); setActiva((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (evento.key === "ArrowUp") { evento.preventDefault(); setActiva((i) => Math.max(i - 1, 0)); }
    else if (evento.key === "Enter") { evento.preventDefault(); const jugador = resultados[activa]; if (jugador) elegir(jugador); }
    else if (evento.key === "Escape") { evento.preventDefault(); setAbierto(false); }
  };
  const cuenta = (n: number) => n.toLocaleString(numberLocale());

  return <div className="barra-jugador" role="navigation" aria-label={t("Jugador principal y navegación")}>
    <div className="barra-jugador-historial">
      <button type="button" className="barra-jugador-flecha" disabled={!historial.puedeVolver} onClick={historial.volver} aria-label={t("Atrás")} title={t("Atrás")}><ChevronLeft size={16} /></button>
      <button type="button" className="barra-jugador-flecha" disabled={!historial.puedeAvanzar} onClick={historial.avanzar} aria-label={t("Adelante")} title={t("Adelante")}><ChevronRight size={16} /></button>
    </div>
    <div className="barra-jugador-buscador" ref={raiz}>
      <button type="button" className="barra-jugador-actual" aria-haspopup="dialog" aria-expanded={abierto} onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-keyshortcuts="Meta+K Control+K /" title={atajo ? tf("Buscar jugador ({a} o /)", { a: atajo }) : undefined}>
        <Search size={15} aria-hidden="true" />
        <b>{elegido?.player ?? t("Elige un jugador")}</b>
        {club && <small>{club}</small>}
        {atajo && <kbd className="barra-jugador-atajo" aria-hidden="true">{atajo}</kbd>}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {abierto && <div className="barra-jugador-panel" role="dialog" aria-label={t("Elegir jugador")}
        onKeyDown={(evento) => { if (evento.key === "Escape") setAbierto(false); }}>
        <div className="rank-tabs barra-jugador-modos" role="tablist" aria-label={t("Cómo elegir")}>
          <button type="button" role="tab" aria-selected={modo === "buscar"} className={modo === "buscar" ? "on" : undefined} onClick={() => abrir("buscar")}>{t("Buscar")}</button>
          <button type="button" role="tab" aria-selected={modo === "explorar"} className={modo === "explorar" ? "on" : undefined} onClick={() => { setModo("explorar"); setLiga(null); setEquipo(null); }}>{t("Explorar por liga")}</button>
        </div>
        {modo === "buscar" ? <>
          <label className="barra-jugador-campo">
            <Search size={15} aria-hidden="true" />
            <input ref={entrada} type="search" value={texto} placeholder={t("Busca por nombre o club…")} role="combobox" aria-expanded="true" aria-controls={idLista}
              aria-activedescendant={resultados[activa] ? `${idLista}-${resultados[activa].index}` : undefined}
              onChange={(evento) => { setTexto(evento.target.value); setActiva(0); }} onKeyDown={teclas} />
          </label>
          {!texto.trim() && recientes.length > 0 && <span className="barra-jugador-grupo">{t("Vistos hace poco")}</span>}
          <ul id={idLista} role="listbox" aria-label={t("Jugadores")}>
            {resultados.map((jugador, i) => <li key={jugador.index} id={`${idLista}-${jugador.index}`} role="option" aria-selected={i === activa}
              className={i === activa ? "activa" : undefined} onPointerEnter={() => setActiva(i)} onClick={() => elegir(jugador)}>
              <b>{jugador.player}</b><small>{jugador.team}</small>
            </li>)}
          </ul>
          {texto.trim() && !resultados.length && <p className="barra-jugador-vacio">{tf("Nadie con «{q}» en las bases cargadas.", { q: texto.trim() })}</p>}
          {!texto.trim() && !recientes.length && <p className="barra-jugador-vacio">{t("Escribe un nombre o un club.")}</p>}
        </> : <>
          {/* Liga → club → jugador, con la ruta arriba para volver un paso. */}
          <nav className="barra-jugador-ruta" aria-label={t("Dónde estás")}>
            <button type="button" onClick={() => { setLiga(null); setEquipo(null); }} aria-current={!liga ? "step" : undefined}>{t("Ligas")}</button>
            {liga && <><ChevronRight size={12} aria-hidden="true" /><button type="button" onClick={() => setEquipo(null)} aria-current={!equipo ? "step" : undefined}>{liga}</button></>}
            {equipo && <><ChevronRight size={12} aria-hidden="true" /><span aria-current="step">{equipo}</span></>}
          </nav>
          <ul aria-label={!liga ? t("Ligas") : !equipo ? t("Clubes") : t("Jugadores")}>
            {!liga && ligas.map(([nombre, n]) => <li key={nombre} onClick={() => setLiga(nombre)}><b>{nombre}</b><small>{tf("{n} jugadores", { n: cuenta(n) })}</small></li>)}
            {liga && !equipo && equipos.map(([nombre, n]) => <li key={nombre} onClick={() => setEquipo(nombre)}><b>{nombre}</b><small>{tf("{n} jugadores", { n: cuenta(n) })}</small></li>)}
            {liga && equipo && delEquipo.map((jugador) => <li key={jugador.index} onClick={() => elegir(jugador)}><b>{jugador.player}</b></li>)}
          </ul>
          {!liga && !ligas.length && <p className="barra-jugador-vacio">{t("Las bases cargadas no dicen de qué liga es cada jugador: usa Buscar.")}</p>}
        </>}
      </div>}
    </div>
    {elegido && onSeguir && <button type="button" className={siguiendo ? "barra-jugador-seguir on" : "barra-jugador-seguir"} aria-pressed={siguiendo} onClick={onSeguir}
      title={siguiendo ? t("Quitar de tus listas de seguimiento") : t("Añadir a tu lista de seguimiento")}>
      {siguiendo ? <EstrellaLlena size={15} /> : <Estrella size={15} />}<span>{siguiendo ? t("Siguiendo") : t("Seguir")}</span>
    </button>}
    {periodo && <span className="barra-jugador-periodo">{periodo}</span>}
    {recientes.length > 0 && <div className="barra-jugador-recientes" aria-label={t("Vistos hace poco")}>
      {recientes.slice(0, 3).map((jugador) => <button key={jugador.index} type="button" onClick={() => onElegir(jugador.index)} title={`${jugador.player} · ${jugador.team}`}>
        {jugador.player.split(/\s+/).slice(-1)[0]}
      </button>)}
    </div>}
    {base && <button type="button" className="barra-jugador-base" onClick={base.onCambiar} title={t("Cambiar lo cargado en Base activa")}>
      {base.logos}<span><b>{base.texto}</b><small>{base.detalle}</small></span><ChevronRight size={13} aria-hidden="true" />
    </button>}
  </div>;
}
