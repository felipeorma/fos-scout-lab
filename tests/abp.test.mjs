import assert from "node:assert/strict";
import test from "node:test";
import {
  TIPOS_ABP, agregarFase, agregarFicha, anotacionCerca, balonEn, balonFinal, cuadernoInicial, duplicarFase, fichaCerca, fijarCarrera,
  fijarPase, instanteEn, moverFicha, normalizarCuaderno, plantilla, posFinal, posicionEn, quitarFase, quitarFicha,
} from "../lib/abp.ts";

const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;

test("cada plantilla es continua: una fase empieza donde acaba la anterior", () => {
  for (const { id } of TIPOS_ABP) {
    const jugada = plantilla(id);
    assert.ok(jugada.fases.length >= 1, id);
    for (let k = 1; k < jugada.fases.length; k += 1) {
      for (const ficha of jugada.fichas) {
        assert.ok(cerca(jugada.fases[k].pos[ficha.id], posFinal(jugada.fases[k - 1], ficha.id)), `${id}: ${ficha.id} salta en la fase ${k + 1}`);
      }
      assert.ok(cerca(jugada.fases[k].balon, balonFinal(jugada.fases[k - 1])), `${id}: el balón salta en la fase ${k + 1}`);
    }
    // Las carreras de la plantilla son de fichas que existen.
    const ids = new Set(jugada.fichas.map((f) => f.id));
    for (const fase of jugada.fases) for (const c of fase.carreras) assert.ok(ids.has(c.fichaId), `${id}: carrera de ${c.fichaId}`);
  }
});

test("el córner izquierdo es el derecho en espejo", () => {
  const der = plantilla("corner_der"), izq = plantilla("corner_izq");
  assert.equal(der.fichas.length, izq.fichas.length);
  for (const ficha of der.fichas) {
    const a = der.fases[0].pos[ficha.id], b = izq.fases[0].pos[ficha.id];
    assert.ok(cerca(a, { x: b.x, z: -b.z }), ficha.id);
  }
});

test("una carrera lleva la ficha de su sitio al destino y el balón vuela en parábola", () => {
  const jugada = plantilla("corner_der");
  const fase = jugada.fases[1];
  const carrera = fase.carreras[0];
  assert.ok(cerca(posicionEn(fase, carrera.fichaId, 0), fase.pos[carrera.fichaId]));
  assert.ok(cerca(posicionEn(fase, carrera.fichaId, 1), carrera.hasta));
  assert.equal(balonEn(fase, 0).y, 0);
  assert.equal(balonEn(fase, 1).y, 0);
  assert.ok(balonEn(fase, 0.5).y > 2, "un pase aéreo sube");
  assert.equal(balonEn(plantilla("salida").fases[1], 0.5).y, 0, "un pase raso va por el suelo");
});

test("mover el final de una carrera arrastra el arranque de la fase siguiente", () => {
  const jugada = plantilla("corner_der");
  const id = jugada.fases[1].carreras.find((c) => c.fichaId === "L4").fichaId;
  const destino = { x: 49, z: 2 };
  const nueva = fijarCarrera(jugada, 1, id, destino);
  assert.ok(cerca(nueva.fases[2].pos[id], destino));
  // Y si en la fase siguiente ya se había separado a mano, se respeta.
  const separada = moverFicha(jugada, 2, id, { x: 30, z: 0 });
  const otra = fijarCarrera(separada, 1, id, destino);
  assert.ok(cerca(otra.fases[2].pos[id], { x: 30, z: 0 }));
});

test("mover una ficha sin carrera la mueve también en las fases siguientes", () => {
  const jugada = plantilla("corner_der");
  const nueva = moverFicha(jugada, 0, "L2", { x: 10, z: -20 });
  for (const fase of nueva.fases) assert.ok(cerca(fase.pos.L2, { x: 10, z: -20 }));
});

test("el pase sustituye al anterior y mover su destino mueve el balón de la fase siguiente", () => {
  const jugada = plantilla("corner_der");
  const nueva = fijarPase(jugada, 1, { x: 47, z: 3 }, "aereo");
  assert.ok(cerca(nueva.fases[1].pase.hasta, { x: 47, z: 3 }));
  assert.ok(cerca(nueva.fases[2].balon, { x: 47, z: 3 }));
});

test("fichas: el dorsal libre, en todas las fases, y al quitarla se van sus carreras", () => {
  const jugada = plantilla("corner_der");
  const [con, id] = agregarFicha(jugada, "local", { x: 0, z: 0 });
  const ficha = con.fichas.find((f) => f.id === id);
  assert.equal(ficha.dorsal, "1", "el 1 local está libre en la plantilla");
  for (const fase of con.fases) assert.ok(fase.pos[id]);
  const sin = quitarFicha(jugada, "L4");
  assert.ok(sin.fases.every((f) => !f.pos.L4 && f.carreras.every((c) => c.fichaId !== "L4")));
});

test("fases: añadir arranca del final, duplicar copia, la última no se quita", () => {
  const jugada = plantilla("falta_frontal");
  const con = agregarFase(jugada, 0, "Nueva");
  assert.equal(con.fases.length, jugada.fases.length + 1);
  assert.ok(cerca(con.fases[1].pos.L11, posFinal(jugada.fases[0], "L11")));
  assert.equal(con.fases[1].carreras.length, 0);
  const copia = duplicarFase(jugada, 1, "Copia");
  assert.deepEqual(copia.fases[2].carreras, jugada.fases[1].carreras);
  assert.notEqual(copia.fases[2].id, jugada.fases[1].id);
  const libre = plantilla("libre");
  assert.equal(quitarFase(libre, 0).fases.length, 1);
});

test("el tiempo de la jugada entera cae en la fase que toca", () => {
  const jugada = plantilla("corner_der");
  assert.deepEqual(instanteEn(jugada, 0), { fase: 0, t: 0 });
  assert.deepEqual(instanteEn(jugada, 4.5), { fase: 1, t: 0.5 });
  assert.deepEqual(instanteEn(jugada, 999), { fase: 2, t: 1 });
});

test("lo que hay bajo el puntero: la ficha más cercana y la última anotación", () => {
  const fase = plantilla("corner_der").fases[0];
  assert.equal(fichaCerca(fase, { x: 51.5, z: 0.4 }), "R1");
  assert.equal(fichaCerca(fase, { x: 0, z: 30 }), null);
  const conAnotaciones = {
    ...fase,
    anotaciones: [
      { id: "z", tipo: "zona", a: { x: 0, z: 0 }, b: { x: 10, z: 10 }, color: "#ffffff", estilo: "translucida" },
      { id: "f", tipo: "flecha", a: { x: 0, z: 5 }, b: { x: 10, z: 5 }, color: "#ffffff" },
    ],
  };
  assert.equal(anotacionCerca(conAnotaciones, { x: 5, z: 5.3 }), "f");
  assert.equal(anotacionCerca(conAnotaciones, { x: 5, z: 2 }), "z");
  assert.equal(anotacionCerca(conAnotaciones, { x: 30, z: 30 }), null);
});

test("lo guardado se comprueba: lo que no se entiende se descarta", () => {
  assert.equal(normalizarCuaderno(null), null);
  assert.equal(normalizarCuaderno({ version: 2, jugadas: [] }), null);
  const bueno = cuadernoInicial();
  const ida = JSON.parse(JSON.stringify(bueno));
  assert.deepEqual(normalizarCuaderno(ida), bueno);
  // Una ficha sin sitio en una fase hereda el final de la anterior; una carrera de una ficha que no existe se va.
  const roto = JSON.parse(JSON.stringify(bueno));
  delete roto.jugadas[0].fases[1].pos.L4;
  roto.jugadas[0].fases[1].carreras.push({ fichaId: "nadie", hasta: { x: 0, z: 0 }, curva: 0 });
  roto.jugadas[0].colores.rival = "rojo";
  const arreglado = normalizarCuaderno(roto);
  assert.ok(cerca(arreglado.jugadas[0].fases[1].pos.L4, posFinal(arreglado.jugadas[0].fases[0], "L4")));
  assert.ok(arreglado.jugadas[0].fases[1].carreras.every((c) => c.fichaId !== "nadie"));
  assert.equal(arreglado.jugadas[0].colores.rival, "#e8e8ed");
  assert.equal(arreglado.activa, bueno.activa);
});
