"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { equipacionDe, type Jugada } from "@/lib/abp";
import { BIBLIOTECA, TEMAS, sistemaDeBiblioteca } from "@/lib/biblioteca";
import { t, tf, type Lang } from "@/lib/i18n";
import type { Opciones } from "./abp/motor";
import { Tablero2D } from "./abp/tablero2d";

/**
 * La biblioteca: sistemas ya dibujados, por temas, con la pregunta que
 * contesta cada uno. Abrir uno guarda una copia en «Tus sistemas», para
 * mirarlo moverse y cambiarlo a gusto sin tocar el original.
 */
export function Biblioteca({ idioma, opciones, onAbrir }: {
  idioma: Lang;
  /** Los colores y la letra del estudio, para que las fotos se vean como el tablero. */
  opciones: Opciones;
  onAbrir: (jugada: Jugada) => void;
}) {
  const fotografoRef = useRef<HTMLDivElement>(null);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const sistemas = useMemo(() => BIBLIOTECA.map((sistema) => ({ sistema, jugada: sistemaDeBiblioteca(sistema, idioma) })), [idioma]);

  // Una foto de cada sistema, en la fase del medio: ahí ya se ve la idea.
  useEffect(() => {
    const caja = fotografoRef.current;
    if (!caja || !caja.clientWidth) return;
    const fotografo = new Tablero2D(caja);
    try {
      const nuevas: Record<string, string> = {};
      for (const { sistema, jugada } of sistemas) {
        const fase = Math.min(jugada.fases.length - 1, Math.floor(jugada.fases.length / 2));
        const equipaciones = { local: equipacionDe(jugada, "local"), rival: equipacionDe(jugada, "rival") };
        fotografo.montar(jugada, fase, { ...opciones, ambiente: jugada.ambiente, equipaciones, nombres: false }, null, null);
        fotografo.vista("tactica", jugada.ambiente.encuadre, null, true);
        nuevas[sistema.id] = fotografo.capturar("image/jpeg", 0.75);
      }
      setFotos(nuevas);
    } finally {
      fotografo.destruir();
    }
  }, [sistemas, opciones]);

  return <div className="biblioteca">
    {TEMAS.map((tema) => {
      const lista = sistemas.filter(({ sistema }) => sistema.tema === tema.id);
      if (!lista.length) return null;
      return <section key={tema.id} className="biblioteca-tema">
        <header>
          <h3>{tema.nombre[idioma]}<small>{tf(lista.length === 1 ? "{n} sistema" : "{n} sistemas", { n: lista.length })}</small></h3>
          <p>{tema.descripcion[idioma]}</p>
        </header>
        <div className="biblioteca-tarjetas">
          {lista.map(({ sistema, jugada }) => <button key={sistema.id} type="button" className="biblioteca-tarjeta"
            onClick={() => onAbrir(sistemaDeBiblioteca(sistema, idioma))} aria-label={tf("Abrir «{nombre}»", { nombre: sistema.titulo[idioma] })}>
            <span className="biblioteca-foto">
              {/* Una foto del lienzo en data:, nada que optimizar con next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {fotos[sistema.id] && <img src={fotos[sistema.id]} alt="" />}
              <span className="biblioteca-chip">{tema.nombre[idioma]}</span>
            </span>
            <span className="biblioteca-texto">
              <b>{sistema.titulo[idioma]}</b>
              <span>{sistema.pregunta[idioma]}</span>
              <small>{tf(jugada.fases.length === 1 ? "{n} fase" : "{n} fases", { n: jugada.fases.length })} →</small>
            </span>
          </button>)}
        </div>
      </section>;
    })}
    <p className="biblioteca-pie">{t("Al abrir un sistema se guarda una copia en «Tus sistemas»: puedes cambiarlo sin perder el original.")}</p>
    {/* Donde se hacen las fotos, fuera de la vista. */}
    <div className="abp-fotografo" ref={fotografoRef} data-orientacion="horizontal" aria-hidden="true" />
  </div>;
}
