import assert from "node:assert/strict";
import test from "node:test";
import { sitioDelValor } from "../lib/radar.ts";

/**
 * Las píldoras de los valores del radar no se pueden tocar.
 *
 * Existe porque al poner píldora a TODOS los percentiles —antes los bajos iban
 * sueltos— salió a la luz un choque que el diseño anterior evitaba por
 * accidente: los valores bajos se apilan en el anillo pegado al agujero
 * central, y ahí el arco por porción es mínimo. Un número suelto cabía; una
 * píldora, no. La cuenta que lo arregla no se ve en el navegador hasta que
 * alguien carga las tres plataformas a la vez en una pantalla pequeña.
 */

/* Lo que dibuja PizzaRadar, con sus mismas constantes. */
const radarDe = (size, nMetricas) => {
  const densidad = nMetricas > 18 ? 2 : nMetricas > 10 ? 1 : 0;
  const fuente = Math.max(9, size * [0.019, 0.016, 0.0135][densidad]);
  const alto = fuente * 1.55;
  return {
    radioInterior: size * 0.085,
    radioExterior: size * [0.31, 0.27, 0.25][densidad],
    anguloPorPorcion: (Math.PI * 2) / nMetricas,
    /* Arial 800: un dígito ronda 0.6 em. Dos cifras es el caso corriente. */
    anchoPildora: Math.max(alto, fuente * 0.6 * 2 + fuente * 0.62),
    altoPildora: alto,
  };
};

const radioDePorcion = (radar, size, densidad, pct) => Math.max(
  radar.radioInterior + 8,
  radar.radioExterior * Math.max(0.08, pct / 100),
);

/** Arco que ocupa una porción a ese radio. Si es menor que la píldora, chocan. */
const arcoDisponible = (radar, radio) => radio * radar.anguloPorPorcion;

const TAMANOS = [420, 500, 600, 680];
const CUANTAS = [6, 10, 12, 14, 18, 20, 25];

test("ninguna píldora choca con su vecina, en ningún tamaño ni densidad", () => {
  const choques = [];
  for (const size of TAMANOS) {
    for (const n of CUANTAS) {
      const radar = radarDe(size, n);
      for (const pct of [0, 1, 8, 25, 50, 75, 99, 100]) {
        const { radio, apretada } = sitioDelValor({
          ...radar,
          radioDePorcion: radioDePorcion(radar, size, 0, pct),
        });
        if (apretada) continue; // el radar no da para más; se avisa aparte
        if (arcoDisponible(radar, radio) < radar.anchoPildora) {
          choques.push(`${size}px · ${n} métricas · p${pct}: arco ${arcoDisponible(radar, radio).toFixed(1)} < píldora ${radar.anchoPildora.toFixed(1)}`);
        }
      }
    }
  }
  assert.deepEqual(choques, [], `Píldoras que se tocan:\n${choques.join("\n")}`);
});

test("el caso que rompía: 25 métricas en el lienzo más chico", () => {
  const radar = radarDe(420, 25);
  const bajo = sitioDelValor({ ...radar, radioDePorcion: radioDePorcion(radar, 420, 2, 4) });
  /* Sin empujarla se habría quedado en radioInterior + 18, donde no cabe. */
  assert.ok(bajo.empujada, "debería haberse empujado hacia afuera");
  assert.ok(bajo.radio > radar.radioInterior + 18, "sigue en el anillo estrecho");
  assert.ok(arcoDisponible(radar, bajo.radio) >= radar.anchoPildora, "sigue chocando");
  assert.ok(!bajo.apretada, "no debería quedarse sin sitio");
});

test("ninguna píldora se sale del radar ni se mete en el agujero central", () => {
  for (const size of TAMANOS) {
    for (const n of CUANTAS) {
      const radar = radarDe(size, n);
      for (const pct of [0, 50, 100]) {
        const { radio } = sitioDelValor({ ...radar, radioDePorcion: radioDePorcion(radar, size, 0, pct) });
        assert.ok(radio >= radar.radioInterior, `${size}/${n}/p${pct}: dentro del agujero`);
        assert.ok(radio + radar.altoPildora / 2 <= radar.radioExterior + 1, `${size}/${n}/p${pct}: se sale del radar`);
      }
    }
  }
});

test("con pocas métricas nada se mueve de donde estaba", () => {
  /* El arreglo no debe cambiar los radares corrientes: con 14 métricas hay
     arco de sobra y la píldora se queda donde siempre. */
  const radar = radarDe(680, 14);
  for (const pct of [4, 50, 92]) {
    const rp = radioDePorcion(radar, 680, 1, pct);
    const { radio, empujada } = sitioDelValor({ ...radar, radioDePorcion: rp });
    assert.equal(empujada, false, `p${pct} se movió sin necesidad`);
    assert.equal(radio, Math.max(radar.radioInterior + 18, rp - 18));
  }
});
