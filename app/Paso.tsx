"use client";

import { t } from "@/lib/i18n";

/**
 * El rótulo de una etapa dentro de una pantalla.
 *
 * Las pantallas tenían sus bloques en el orden en que se fueron escribiendo,
 * todos del mismo peso visual y sin decir cuál va primero. Quien llega nuevo
 * no sabe si empezar por los filtros o por el jugador, y quien vuelve tampoco
 * lo recuerda.
 *
 * Es solo un rótulo, a propósito: dividir cada pantalla en pasos que se
 * bloquean unos a otros haría lento el uso diario, donde casi siempre se
 * vuelve a tocar el paso 2 sin pasar por el 1. Numerar sin obligar da el orden
 * de lectura sin quitar la libertad de saltar.
 */
export function Paso({ numero, children }: { numero: number; children: string }) {
  return <p className="paso-rotulo">
    <b>{t("Paso")} {numero}</b>
    {t(children)}
  </p>;
}
