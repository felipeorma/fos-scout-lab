"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Estrella, EstrellaLlena, Search } from "./Icons";
import { t, tf } from "@/lib/i18n";

export type JugadorDeLaBarra = { index: number; player: string; team: string };

const normal = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAXIMO_RESULTADOS = 40;

/**
 * La barra del jugador principal, debajo de la de arriba y en todas las
 * pestañas.
 *
 * Tres cosas que se perdían al cambiar de página:
 *  - atrás y adelante: las pestañas cambiaban dentro de la página sin dejar
 *    rastro, y el "atrás" del navegador sacaba de la plataforma y se perdía
 *    todo lo cargado. Ahora cada página y cada jugador son una entrada del
 *    historial, y estos dos botones hacen lo mismo que los del navegador;
 *  - a quién se está mirando, y con qué temporadas: un solo sitio, el mismo
 *    en la ficha, la comparación, la ficha ampliada y el resto;
 *  - los últimos vistos, para volver a uno con un clic.
 *
 * Elegir aquí cambia el jugador en todas las pestañas y no cambia de página.
 */
export function BarraDelJugador({ jugadores, elegido, club, periodo, recientes, onElegir, historial, siguiendo = false, onSeguir }: {
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
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activa, setActiva] = useState(0);
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

  // Fuera del buscador, se cierra.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: PointerEvent) => { if (!raiz.current?.contains(evento.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const abrir = () => { setTexto(""); setActiva(0); setAbierto(true); requestAnimationFrame(() => entrada.current?.focus()); };
  const elegir = (jugador: JugadorDeLaBarra) => { setAbierto(false); onElegir(jugador.index); };
  const teclas = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === "ArrowDown") { evento.preventDefault(); setActiva((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (evento.key === "ArrowUp") { evento.preventDefault(); setActiva((i) => Math.max(i - 1, 0)); }
    else if (evento.key === "Enter") { evento.preventDefault(); const jugador = resultados[activa]; if (jugador) elegir(jugador); }
    else if (evento.key === "Escape") { evento.preventDefault(); setAbierto(false); }
  };

  return <div className="barra-jugador" role="navigation" aria-label={t("Jugador principal y navegación")}>
    <div className="barra-jugador-historial">
      <button type="button" className="barra-jugador-flecha" disabled={!historial.puedeVolver} onClick={historial.volver} aria-label={t("Atrás")} title={t("Atrás")}><ChevronLeft size={16} /></button>
      <button type="button" className="barra-jugador-flecha" disabled={!historial.puedeAvanzar} onClick={historial.avanzar} aria-label={t("Adelante")} title={t("Adelante")}><ChevronRight size={16} /></button>
    </div>
    <div className="barra-jugador-buscador" ref={raiz}>
      <button type="button" className="barra-jugador-actual" aria-haspopup="listbox" aria-expanded={abierto} onClick={() => (abierto ? setAbierto(false) : abrir())}>
        <span className="barra-jugador-etiqueta">{t("Jugador")}</span>
        <b>{elegido?.player ?? t("Elige un jugador")}</b>
        {club && <small>{club}</small>}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {abierto && <div className="barra-jugador-panel">
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
      </div>}
    </div>
    {elegido && onSeguir && <button type="button" className={siguiendo ? "barra-jugador-seguir on" : "barra-jugador-seguir"} aria-pressed={siguiendo} onClick={onSeguir}
      title={siguiendo ? t("Quitar de tus listas de seguimiento") : t("Añadir a tu lista de seguimiento")}>
      {siguiendo ? <EstrellaLlena size={15} /> : <Estrella size={15} />}<span>{siguiendo ? t("Siguiendo") : t("Seguir")}</span>
    </button>}
    {periodo && <span className="barra-jugador-periodo">{periodo}</span>}
    {recientes.length > 0 && <div className="barra-jugador-recientes" aria-label={t("Vistos hace poco")}>
      {recientes.slice(0, 4).map((jugador) => <button key={jugador.index} type="button" onClick={() => onElegir(jugador.index)} title={jugador.team}>
        {jugador.player.split(/\s+/).slice(-1)[0]}
      </button>)}
    </div>}
  </div>;
}
