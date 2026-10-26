"use client";

import { createContext, useContext } from "react";
import type { Jugada } from "@/lib/abp";

/**
 * Un sistema que llega al estudio desde fuera: de un enlace que se reproduce
 * (se abre para mirarlo) o de otra página de la app, como El partido (se abre
 * para trabajarlo). `jugada` null: el enlace venía roto.
 */
export type Entrante = { jugada: Jugada | null; soloVer: boolean; origen: "enlace" | "partido" | "fotograma" };

/** Abre un sistema en el estudio táctico desde cualquier página (El partido o un fotograma). Fuera de la app, null. */
export const ContextoAbrirEnPizarra = createContext<((jugada: Jugada, origen?: "partido" | "fotograma") => void) | null>(null);
export const useAbrirEnPizarra = () => useContext(ContextoAbrirEnPizarra);
