"use client";

import { createContext, useContext } from "react";
import type { Jugada } from "@/lib/abp";

/**
 * Un sistema que llega al estudio desde fuera: de un enlace que se reproduce
 * (se abre para mirarlo) o de otra página de la app, como El partido (se abre
 * para trabajarlo). `jugada` null: el enlace venía roto.
 */
export type Entrante = { jugada: Jugada | null; soloVer: boolean; origen: "enlace" | "partido" };

/** Abre un sistema en el estudio táctico desde cualquier página. Fuera de la app, null. */
export const ContextoAbrirEnPizarra = createContext<((jugada: Jugada) => void) | null>(null);
export const useAbrirEnPizarra = () => useContext(ContextoAbrirEnPizarra);
