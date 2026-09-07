/**
 * Corrección por cobertura: encoger hacia la media lo que se apoya en poco.
 *
 * El problema aparece siempre que se ordenan jugadores medidos con distinto
 * número de métricas, y en esta plataforma pasa todo el rato: unas ligas
 * traen la capa de SkillCorner y otras no, así que en un mismo ranking hay
 * quien se puntúa con diecisiete métricas y quien lo hace con siete.
 *
 * No es que tener pocas métricas suba la nota —medido sobre las dieciséis
 * ligas, la correlación entre número de métricas e índice es de 0,1, o sea
 * ninguna—. Es que la dispersa: con siete métricas el promedio se mueve mucho
 * más que con diecisiete, y como los rankings se leen por arriba, los ruidosos
 * asoman en la cima más de lo que les toca. En porteros, los de poca cobertura
 * son el 80% de la base y ocupaban el 90% del top-20.
 *
 * La corrección es la de toda la vida para muestras pequeñas: cada valor pesa
 * según la evidencia que lo sostiene y el resto se rellena con la media del
 * grupo. Con cobertura completa casi no cambia; con media docena de métricas
 * el número se acerca a la media hasta que haya con qué separarlo de ella.
 *
 * El precio es real y conviene saberlo: el rango se comprime —en extremos, de
 * 93 puntos a 46—, así que quien enseñe el número corregido debería enseñar
 * también el crudo.
 */

/**
 * Cuántas métricas hacen falta para creerse un número tal cual.
 *
 * Con este valor, quien tiene ocho métricas queda a medio camino entre lo suyo
 * y la media del grupo; con dieciséis pesa el doble lo suyo que la media.
 */
export const METRICAS_PARA_CONFIAR = 8;

/**
 * Encoge cada valor hacia la media del conjunto según su soporte.
 *
 * `valores` y `soportes` van emparejados por posición: `soportes[i]` es de
 * cuántas métricas sale `valores[i]`. Devuelve un array del mismo largo.
 */
export function encogerHaciaLaMedia(valores: number[], soportes: number[]): number[] {
  if (!valores.length) return [];
  const media = valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
  return valores.map((valor, i) => {
    const soporte = Math.max(0, soportes[i] ?? 0);
    return (soporte * valor + METRICAS_PARA_CONFIAR * media) / (soporte + METRICAS_PARA_CONFIAR);
  });
}
