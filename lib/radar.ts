/**
 * Dónde se posa el número de cada porción del radar.
 *
 * El valor va dentro de una píldora oscura para que se lea sobre el color de
 * la porción. Antes la píldora solo se dibujaba cuando el número caía dentro
 * de su porción: en un percentil bajo la porción es demasiado corta para
 * contenerlo, así que esos valores salían sueltos y el mismo radar mezclaba
 * dos maneras de escribir un número —y las que se quedaban sin recuadro eran
 * justo las bajas, que así parecían de otra categoría.
 *
 * Ahora la píldora está siempre, y eso destapa lo que el diseño anterior
 * evitaba por accidente: los valores bajos se apilan todos en el mismo anillo
 * estrecho, pegado al agujero central, donde el arco disponible por porción es
 * mínimo. Un número suelto cabía; una píldora, no. Con veinticinco métricas en
 * un lienzo de 420 px hay 13,5 px de arco por porción para una píldora de 17.
 *
 * De ahí esta función: la píldora se empuja hacia afuera hasta el radio donde
 * el arco de su porción da de sí. Es la misma cuenta de siempre —arco = radio ×
 * ángulo— resuelta al revés.
 */

export type SitioDelValor = {
  /** Distancia al centro a la que se dibuja la píldora. */
  radio: number;
  /** Si hubo que empujarla hacia afuera para que no chocara con la vecina. */
  empujada: boolean;
  /** Si ni empujándola al borde cabe: el radar tiene demasiadas porciones. */
  apretada: boolean;
};

export function sitioDelValor({ radioInterior, radioExterior, radioDePorcion, anguloPorPorcion, anchoPildora, altoPildora }: {
  /** El agujero del centro. */
  radioInterior: number;
  /** Hasta dónde llega el radar. */
  radioExterior: number;
  /** Hasta dónde llega ESTA porción, que es lo que dice su percentil. */
  radioDePorcion: number;
  /** Cuánto ángulo ocupa cada porción, en radianes. */
  anguloPorPorcion: number;
  anchoPildora: number;
  altoPildora: number;
}): SitioDelValor {
  /* Lo de siempre: pegado a la punta de su porción, y nunca dentro del
     agujero central. */
  const natural = Math.max(radioInterior + 18, radioDePorcion - 18);

  /* El radio a partir del cual dos píldoras vecinas dejan de tocarse. El
     margen es un cuarto del ancho: sin él quedan pegadas y se leen como una
     sola cifra larga. */
  const holgura = anchoPildora * 1.25;
  const cabe = holgura / anguloPorPorcion;

  /* Pero no puede salirse del radar: ahí fuera están las etiquetas. */
  const tope = radioExterior - altoPildora * 0.6;
  const querido = Math.max(natural, cabe);
  const radio = Math.max(radioInterior + 18, Math.min(querido, tope));

  return { radio, empujada: querido > natural, apretada: cabe > tope };
}
