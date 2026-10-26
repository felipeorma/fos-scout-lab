"use client";

import { useEffect, useState } from "react";
import type { Fase, Jugada } from "@/lib/abp";
import { t, tf } from "@/lib/i18n";
import { CLAVE_SECUENCIAS, MAX_SECUENCIAS, ladoDe, secuenciaDe, secuenciasValidas, soltarSecuencia, type Secuencia } from "@/lib/secuencias";
import { Trash } from "../Icons";

/**
 * Las secuencias del estudio: guardar un tramo de fases de este sistema (sin
 * nombres) y soltar cualquiera de las guardadas detrás de la fase actual, por
 * la misma banda o en espejo. Se guardan en este navegador, para todos los
 * sistemas.
 */
export function PanelDeSecuencias({ jugada, indice, elegidas, nombreDeFase, onSoltar, onAviso }: {
  jugada: Jugada;
  indice: number;
  /** Las fichas del grupo elegido, si lo hay: la secuencia es solo de ellas. */
  elegidas: string[];
  nombreDeFase: (f: Fase, i: number) => string;
  /** El sistema con la secuencia ya soltada y cuántas fases nuevas tiene detrás de la actual. */
  onSoltar: (siguiente: Jugada, fasesNuevas: number) => void;
  onAviso: (texto: string) => void;
}) {
  const [secuencias, setSecuencias] = useState<Secuencia[]>([]);
  const [leidas, setLeidas] = useState(false);
  const [desde, setDesde] = useState(indice);
  const [hasta, setHasta] = useState(Math.min(indice + 1, jugada.fases.length - 1));
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    try {
      const guardadas = window.localStorage.getItem(CLAVE_SECUENCIAS);
      if (guardadas) setSecuencias(secuenciasValidas(JSON.parse(guardadas))); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* sin almacenamiento: las secuencias viven mientras esté abierto */ }
    setLeidas(true);
  }, []);
  useEffect(() => {
    if (!leidas) return;
    try { window.localStorage.setItem(CLAVE_SECUENCIAS, JSON.stringify(secuencias)); } catch { /* ídem */ }
  }, [secuencias, leidas]);

  // Si cambia el sistema o se quitan fases, el tramo se queda dentro.
  const ultima = jugada.fases.length - 1;
  const a = Math.min(desde, ultima), b = Math.min(Math.max(hasta, a), ultima);

  function guardar() {
    const s = secuenciaDe(jugada, a, b, nombre || tf("{sistema}, fases {a}–{b}", { sistema: jugada.nombre, a: a + 1, b: b + 1 }), elegidas);
    if (!s) { onAviso(t("En esas fases nadie se mueve: elige otras o un grupo de fichas.")); return; }
    setSecuencias((actuales) => [s, ...actuales].slice(0, MAX_SECUENCIAS));
    setNombre("");
    onAviso(tf("Secuencia guardada: {n} jugadores y {f} fases. Suéltala en cualquier sistema.", { n: s.papeles.length, f: s.fases.length }));
  }

  function soltar(s: Secuencia, espejo: boolean) {
    const { jugada: siguiente, papeles } = soltarSecuencia(jugada, indice, s, espejo);
    if (!papeles) { onAviso(t("No hay fichas de ese equipo en este sistema para hacer la secuencia.")); return; }
    onSoltar(siguiente, s.fases.length);
    onAviso(tf("«{nombre}»: {n} jugadores la hacen en {f} fases nuevas detrás de esta.", { nombre: s.nombre, n: papeles, f: s.fases.length }));
  }

  const lado = (s: Secuencia) => ({ izquierda: t("por la izquierda"), derecha: t("por la derecha"), centro: t("por el centro") })[ladoDe(s)];

  return <section className="inspector-grupo">
    <h3 className="inspector-titulo">{t("Secuencias")}<small>{secuencias.length || ""}</small></h3>
    <div className="inspector-tarjeta">
      <div className="inspector-fila"><span>{t("Fases")}</span>
        <span className="abp-secuencia-tramo">
          <select className="inspector-selector" value={a} aria-label={t("Desde la fase")} onChange={(e) => { const v = Number(e.target.value); setDesde(v); if (hasta < v) setHasta(v); }}>
            {jugada.fases.map((f, i) => <option key={f.id} value={i}>{i + 1}. {nombreDeFase(f, i)}</option>)}
          </select>
          <i aria-hidden="true">→</i>
          <select className="inspector-selector" value={b} aria-label={t("Hasta la fase")} onChange={(e) => setHasta(Number(e.target.value))}>
            {jugada.fases.map((f, i) => i < a ? null : <option key={f.id} value={i}>{i + 1}. {nombreDeFase(f, i)}</option>)}
          </select>
        </span>
      </div>
      <label className="inspector-fila"><span>{t("Nombre")}</span>
        <input className="abp-campo" value={nombre} maxLength={60} placeholder={t("Pared por fuera, salida de tres…")} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="inspector-fila abp-acciones">
        <button type="button" onClick={guardar}>{elegidas.length ? tf("Guardar con los {n} elegidos", { n: elegidas.length }) : t("Guardar secuencia")}</button>
      </div>
    </div>
    {secuencias.length > 0 && <ul className="abp-secuencias">
      {secuencias.map((s) => <li key={s.id}>
        <div><b>{s.nombre}</b><small>{tf("{n} jugadores · {f} fases · {lado}", { n: s.papeles.length, f: s.fases.length, lado: lado(s) })}</small></div>
        <span className="abp-secuencia-botones">
          <button type="button" onClick={() => soltar(s, false)} title={t("Detrás de la fase actual, por la misma banda")}>{t("Soltar")}</button>
          <button type="button" onClick={() => soltar(s, true)} title={t("Detrás de la fase actual, por la otra banda")}>{t("En espejo")}</button>
          <button type="button" className="peligro" aria-label={tf("Quitar {nombre}", { nombre: s.nombre })} title={t("Quitar")}
            onClick={() => setSecuencias((actuales) => actuales.filter((x) => x.id !== s.id))}><Trash size={13} /></button>
        </span>
      </li>)}
    </ul>}
    <p className="inspector-pie">{t("Una secuencia es el movimiento sin los nombres: al soltarla, las fichas más cercanas de cada equipo hacen cada papel, en fases nuevas detrás de la actual. Con un grupo elegido, se guarda solo ese grupo.")}</p>
  </section>;
}
