import assert from "node:assert/strict";
import test from "node:test";
import {
  agregarAnotacion, agregarFase, anotacionCerca, cambiarAnotacion, copiaDeAnotacion, desplazarAnotacion, extremosDe, fijarCarrera, jugadaValida,
  lineaDeBloque, normalizarCuaderno, quitarFicha, sistemaDePartido, sombraDeBloque,
} from "../lib/abp.ts";
import { area, aPolilinea, contornoHolgado, envolvente, ordenarEnLinea, recortarLinea, simplificar } from "../lib/geometria.ts";
import { medidasDeEquipo, superioridades } from "../lib/medidas.ts";

const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;
const partido = () => sistemaDePartido("433", "442", "nuestro", "salida");
const ida = (j) => JSON.parse(JSON.stringify(j));

test("geometría: envolvente, contorno, orden de una línea, simplificar y área", () => {
  const cuadrado = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }, { x: 5, z: 5 }];
  assert.equal(envolvente(cuadrado).length, 4);
  assert.equal(area(envolvente(cuadrado)), 100);
  // El contorno holgado queda fuera de todos los puntos y a `margen` de la envolvente.
  const contorno = contornoHolgado(cuadrado, 2);
  for (const q of contorno) assert.ok(aPolilinea(q, [...envolvente(cuadrado), envolvente(cuadrado)[0]]) > 1.9);
  assert.ok(area(contorno) > 100);
  // Uno o dos puntos también tienen contorno: un círculo y una cápsula.
  assert.ok(contornoHolgado([{ x: 0, z: 0 }], 1).length > 8);
  assert.ok(area(contornoHolgado([{ x: 0, z: 0 }, { x: 10, z: 0 }], 1)) > 20);
  // Una línea defensiva se lee de banda a banda; un carril, de atrás adelante.
  assert.deepEqual(ordenarEnLinea([{ x: -30, z: 20 }, { x: -31, z: -20 }, { x: -32, z: 5 }]).map((p) => p.z), [-20, 5, 20]);
  assert.deepEqual(ordenarEnLinea([{ x: 10, z: 30 }, { x: -20, z: 31 }, { x: 0, z: 29 }]).map((p) => p.x), [-20, 0, 10]);
  // Una recta con ruido se queda en sus dos puntas.
  const recta = Array.from({ length: 50 }, (_, k) => ({ x: k, z: (k % 2) * 0.05 }));
  assert.equal(simplificar(recta, 0.12).length, 2);
  // Recortar no hace desaparecer una línea corta.
  const corta = recortarLinea([{ x: 0, z: 0 }, { x: 1, z: 0 }], 5, 5);
  assert.ok(corta[1].x - corta[0].x > 0.1);
});

test("una flecha pegada a dos fichas va con ellas, también al moverse en la fase", () => {
  let j = partido();
  const desde = "L4", hasta = "L9";
  j = agregarAnotacion(j, 0, { id: "f1", tipo: "flecha", a: j.fases[0].pos[desde], b: j.fases[0].pos[hasta], color: "#ffffff", estilo: "continua", desde, hasta });
  j = fijarCarrera(j, 0, hasta, { x: 30, z: 5 });
  const flecha = j.fases[0].anotaciones[0];
  assert.ok(cerca(extremosDe(flecha, j.fases[0], 1).b, { x: 30, z: 5 }));
  assert.ok(cerca(extremosDe(flecha, j.fases[0], 0).a, j.fases[0].pos[desde]));
  // Despegarla la deja donde está; moverla también la despega.
  const suelta = cambiarAnotacion(j, 0, "f1", { soltar: true }).fases[0].anotaciones[0];
  assert.equal(suelta.desde, undefined);
  assert.ok(cerca(suelta.a, j.fases[0].pos[desde]));
  const movida = desplazarAnotacion(j, 0, "f1", 2, 0).fases[0].anotaciones[0];
  assert.equal(movida.hasta, undefined);
  assert.ok(cerca(movida.a, { x: j.fases[0].pos[desde].x + 2, z: j.fases[0].pos[desde].z }));
  // Al quitar la ficha, la flecha se queda donde estaba ella.
  const sin = quitarFicha(j, hasta).fases[0].anotaciones[0];
  assert.equal(sin.hasta, undefined);
  assert.equal(sin.desde, desde);
  assert.ok(cerca(sin.b, j.fases[0].pos[hasta]));
});

test("el bloque pasa por sus jugadores, sombrea hacia su portería y se pierde con el último", () => {
  let j = partido();
  const linea = ["L2", "L3", "L4", "L5"];
  j = agregarAnotacion(j, 0, { id: "b1", tipo: "bloque", fichas: linea, color: "#f3b64c", relleno: "atras" });
  const fase = j.fases[0], bloque = fase.anotaciones[0];
  const puntos = lineaDeBloque(bloque, fase, 0);
  assert.equal(puntos.length, 4);
  // De banda a banda.
  for (let i = 1; i < puntos.length; i += 1) assert.ok(puntos[i].z >= puntos[i - 1].z);
  // Los nuestros defienden la portería de la izquierda: la sombra llega a x = −52,5.
  const sombra = sombraDeBloque(bloque, j, fase, 0);
  assert.ok(sombra.some((p) => p.x === -52.5));
  assert.ok(sombraDeBloque({ ...bloque, relleno: "cerrado" }, j, fase, 0).length > 8);
  assert.equal(sombraDeBloque({ ...bloque, relleno: "linea" }, j, fase, 0).length, 0);
  // Se toca por su línea.
  const medio = { x: (puntos[1].x + puntos[2].x) / 2, z: (puntos[1].z + puntos[2].z) / 2 };
  assert.equal(anotacionCerca(fase, medio), "b1");
  // Oculto, no se toca.
  assert.equal(anotacionCerca(fase, medio, 1.2, ["zonas"]), null);
  let k = j;
  for (const id of linea) k = quitarFicha(k, id);
  assert.equal(k.fases[0].anotaciones.length, 0);
});

test("las marcas del campo pasan a la fase siguiente; las acciones de la fase, no", () => {
  let j = partido();
  const pos = j.fases[0].pos;
  j = agregarAnotacion(j, 0, { id: "z", tipo: "rect", a: { x: 0, z: 0 }, b: { x: 10, z: 10 }, color: "#ffffff", estilo: "translucida" });
  j = agregarAnotacion(j, 0, { id: "l", tipo: "flecha", a: { x: 0, z: -30 }, b: { x: 0, z: 30 }, color: "#ffffff", estilo: "linea" });
  j = agregarAnotacion(j, 0, { id: "m", tipo: "medida", a: pos.L4, b: pos.L5, color: "#ffffff", desde: "L4", hasta: "L5" });
  j = agregarAnotacion(j, 0, { id: "b", tipo: "bloque", fichas: ["L4", "L5"], color: "#ffffff", relleno: "linea" });
  j = agregarAnotacion(j, 0, { id: "p", tipo: "flecha", a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, color: "#ffffff", estilo: "continua" });
  j = agregarAnotacion(j, 0, { id: "t", tipo: "texto", a: { x: 0, z: 0 }, texto: "Hola", color: "#ffffff" });
  j = agregarAnotacion(j, 0, { id: "s", tipo: "trazo", puntos: [{ x: 0, z: 0 }, { x: 5, z: 5 }], color: "#ffffff" });
  const siguiente = agregarFase(j, 0, "Fase 2").fases[1];
  assert.deepEqual(siguiente.anotaciones.map((a) => a.tipo).sort(), ["bloque", "flecha", "medida", "rect"]);
  // Con el mismo id (es la misma marca), y la medida sigue pegada a sus jugadores.
  assert.deepEqual(siguiente.anotaciones.map((a) => a.id).sort(), ["b", "l", "m", "z"]);
  assert.equal(siguiente.anotaciones.find((a) => a.tipo === "medida").desde, "L4");
});

test("copiar una anotación: la copia va suelta y un poco al lado; un bloque se queda igual", () => {
  let j = partido();
  j = agregarAnotacion(j, 0, { id: "f", tipo: "flecha", a: j.fases[0].pos.L4, b: { x: 0, z: 0 }, color: "#ffffff", estilo: "continua", desde: "L4" });
  const copia = copiaDeAnotacion(j.fases[0].anotaciones[0], j.fases[0], 1.5, 1.5);
  assert.notEqual(copia.id, "f");
  assert.equal(copia.desde, undefined);
  assert.ok(cerca(copia.b, { x: 1.5, z: 1.5 }));
  const trazo = copiaDeAnotacion({ id: "s", tipo: "trazo", puntos: [{ x: 0, z: 0 }, { x: 5, z: 5 }], color: "#ffffff" }, j.fases[0], 1, 0);
  assert.ok(cerca(trazo.puntos[1], { x: 6, z: 5 }));
});

test("lo guardado con las anotaciones nuevas se abre igual y lo raro se descarta", () => {
  let j = partido();
  j = { ...j, ambiente: { ...j.ambiente, ocultas: ["flechas", "nada"] } };
  j = agregarAnotacion(j, 0, { id: "f", tipo: "flecha", a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, color: "#ffffff", estilo: "punteada", extremo: "barra", grosor: "grueso", curva: 4, desde: "L4" });
  j = agregarAnotacion(j, 0, { id: "b", tipo: "bloque", fichas: ["L4", "L5"], color: "#ffffff", relleno: "cerrado" });
  j = agregarAnotacion(j, 0, { id: "m", tipo: "medida", a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, color: "#ffffff" });
  j = agregarAnotacion(j, 0, { id: "s", tipo: "trazo", puntos: [{ x: 0, z: 0 }, { x: 5, z: 5 }], color: "#ffffff", grosor: "fino", punta: true });
  // Lo que no se entiende: un bloque vacío, un trazo de un punto y una flecha con un estilo inventado.
  j = agregarAnotacion(j, 0, { id: "x", tipo: "bloque", fichas: [], color: "#ffffff", relleno: "atras" });
  j = agregarAnotacion(j, 0, { id: "y", tipo: "trazo", puntos: [{ x: 0, z: 0 }], color: "#ffffff" });
  j = agregarAnotacion(j, 0, { id: "w", tipo: "flecha", a: { x: 0, z: 0 }, b: { x: 1, z: 0 }, color: "#ffffff", estilo: "garabato", extremo: "??", curva: 99 });
  const leida = jugadaValida(ida(j));
  assert.deepEqual(leida.ambiente.ocultas, ["flechas"]);
  const [f, b, m, s, w] = leida.fases[0].anotaciones;
  assert.equal(leida.fases[0].anotaciones.length, 5);
  assert.deepEqual([f.estilo, f.extremo, f.grosor, f.curva, f.desde], ["punteada", "barra", "grueso", 4, "L4"]);
  assert.deepEqual([b.tipo, b.fichas, b.relleno], ["bloque", ["L4", "L5"], "cerrado"]);
  assert.equal(m.tipo, "medida");
  assert.deepEqual([s.grosor, s.punta], ["fino", true]);
  assert.deepEqual([w.estilo, w.extremo, w.curva], ["continua", undefined, 20]);
  // Y el cuaderno entero sigue abriéndose.
  assert.ok(normalizarCuaderno({ version: 1, activa: j.id, jugadas: [ida(j)] }));
});

test("la fase en metros: anchura, profundidad, línea defensiva y superioridades", () => {
  const j = partido();
  const fase = j.fases[0];
  const nuestras = medidasDeEquipo(j, fase, "local"), suyas = medidasDeEquipo(j, fase, "rival");
  assert.equal(nuestras.jugadores, 10);
  assert.equal(suyas.jugadores, 10);
  assert.ok(nuestras.anchura > 30 && nuestras.anchura <= 68);
  assert.ok(nuestras.profundidad > 10 && nuestras.profundidad < 105);
  assert.ok(nuestras.area > 0);
  // La línea defensiva se mide desde la propia portería: la de un equipo no depende del lado en que ataca.
  const L = fase.pos[nuestras.extremos.atras], R = fase.pos[suyas.extremos.atras];
  assert.ok(Math.abs(nuestras.lineaDefensiva - (L.x + 52.5)) < 1e-6);
  assert.ok(Math.abs(suyas.lineaDefensiva - (52.5 - R.x)) < 1e-6);
  const { tercios, carriles } = superioridades(j, fase);
  assert.equal(tercios.reduce((s, z) => s + z.local, 0), 10);
  assert.equal(carriles.reduce((s, z) => s + z.rival, 0), 10);
  // Sin dos jugadores de campo no hay medidas.
  let solo = j;
  for (const f of j.fichas.filter((x) => x.equipo === "rival" && x.dorsal !== "1" && x.id !== "R9")) solo = quitarFicha(solo, f.id);
  assert.equal(medidasDeEquipo(solo, solo.fases[0], "rival"), null);
});
