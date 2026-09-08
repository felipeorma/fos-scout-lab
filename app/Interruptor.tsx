"use client";

/**
 * Interruptor de dos posiciones, del tipo que usa iOS.
 *
 * La interfaz tenía pares de botones —ES/EN, claro/oscuro— donde el activo se
 * distinguía por un fondo algo más claro. Con dos opciones y una sola
 * respuesta posible, un interruptor dice mejor lo que pasa: se ve el estado
 * sin leer, y el pulgar que se desliza deja claro que es lo uno o lo otro.
 *
 * Lleva las dos etiquetas dentro cuando se le dan, porque un interruptor
 * pelado no dice qué enciende. Y es un `button` con `role="switch"`, no un
 * checkbox disfrazado: así el teclado y el lector de pantalla lo entienden sin
 * ayuda.
 */
export function Interruptor({ activo, onCambio, etiquetaApagado, etiquetaEncendido, titulo }: {
  /** `true` es la posición derecha, la de `etiquetaEncendido`. */
  activo: boolean;
  onCambio: (activo: boolean) => void;
  etiquetaApagado?: string;
  etiquetaEncendido?: string;
  /** Para lectores de pantalla, cuando no hay etiquetas visibles. */
  titulo: string;
}) {
  return <button
    type="button"
    role="switch"
    aria-checked={activo}
    aria-label={titulo}
    title={titulo}
    className={`interruptor${activo ? " on" : ""}`}
    onClick={() => onCambio(!activo)}
  >
    {etiquetaApagado && <span className="interruptor-lado">{etiquetaApagado}</span>}
    <span className="interruptor-pista" aria-hidden="true"><i /></span>
    {etiquetaEncendido && <span className="interruptor-lado">{etiquetaEncendido}</span>}
  </button>;
}
