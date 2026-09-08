/**
 * El color del candidato, elegido CONTRA el del objetivo.
 *
 * Estaba fijo en #e95b3f mientras el objetivo tomaba el acento del cliente.
 * Con Cavalry eso daba #cd2b2b contra #e95b3f: diez grados de tono, o sea el
 * mismo rojo dos veces. En un radar donde lo único que se compara son dos
 * áreas superpuestas, eso no es un detalle estético: no se distingue quién es
 * quién.
 *
 * Se prefiere el azul cuando queda lejos —rojo contra azul es además el par
 * que mejor aguanta el daltonismo— y si no, el tono más alejado que haya. Con
 * el verde de Maldonado el azul se queda a 70 grados, así que ahí sale el
 * naranja, a 125.
 */
const CANDIDATOS = ["#1f5fd6", "#f97316", "#9e07ae", "#43a8a0"] as const;
const AZUL = CANDIDATOS[0];

function tonoDe(hex: string) {
  const limpio = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

function distanciaDeTono(a: string, b: string) {
  const d = Math.abs(tonoDe(a) - tonoDe(b));
  return Math.min(d, 360 - d);
}

export function colorContrastante(colorObjetivo: string) {
  if (distanciaDeTono(colorObjetivo, AZUL) >= 120) return AZUL;
  return [...CANDIDATOS].sort((x, y) => distanciaDeTono(colorObjetivo, y) - distanciaDeTono(colorObjetivo, x))[0];
}
