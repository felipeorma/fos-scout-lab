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
  assert.ok(cerca(nueva.fases[1].pases[0].hasta, { x: 47, z: 3 }));
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

test("el tiempo de la jugada entera cae en la fase que toca, con la pausa de cada pose", () => {
  const jugada = plantilla("corner_der");
  const [f0] = jugada.fases;
  const largo = f0.pausa + f0.duracion;
  assert.deepEqual(instanteEn(jugada, 0), { fase: 0, t: 0 });
  // Durante la pausa la pose está quieta.
  assert.deepEqual(instanteEn(jugada, f0.pausa * 0.5), { fase: 0, t: 0 });
  const mitad = instanteEn(jugada, largo + f0.pausa + f0.duracion / 2);
  assert.equal(mitad.fase, 1);
  assert.ok(Math.abs(mitad.t - 0.5) < 1e-9);
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

test("un sistema de partido: once contra once, dorsales sin repetir y cada equipo en su campo", async () => {
  const { sistemaDePartido, FORMACIONES, nombreDeFormacion } = await import("../lib/abp.ts");
  assert.ok(FORMACIONES.includes("433") && FORMACIONES.includes("4231"));
  assert.equal(nombreDeFormacion("4231"), "4-2-3-1");
  for (const [a, b] of [["433", "442"], ["352", "4231"], ["541", "343"]]) {
    const j = sistemaDePartido(a, b, "nuestro", "salida");
    const locales = j.fichas.filter((f) => f.equipo === "local"), rivales = j.fichas.filter((f) => f.equipo === "rival");
    assert.equal(locales.length, 11, a);
    assert.equal(rivales.length, 11, b);
    assert.equal(new Set(locales.map((f) => f.dorsal)).size, 11, `${a}: dorsales repetidos`);
    assert.equal(new Set(j.fichas.map((f) => f.id)).size, 22, "ids repetidos");
    const pos = j.fases[0].pos;
    const porteroLocal = locales.find((f) => f.rol === "POR"), porteroRival = rivales.find((f) => f.rol === "POR");
    assert.ok(pos[porteroLocal.id].x < -48, "nuestro portero en nuestra portería");
    assert.ok(pos[porteroRival.id].x > 48, "el suyo en la suya");
    for (const p of Object.values(pos)) assert.ok(Math.abs(p.x) <= 52.5 && Math.abs(p.z) <= 34);
    // Con el balón nuestro, sale de nuestro portero.
    assert.ok(j.fases[0].balon.x < -45);
    assert.equal(j.categoria, "salida");
  }
  const suyo = sistemaDePartido("433", "442", "suyo", "presion");
  assert.ok(suyo.fases[0].balon.x > 45, "con el balón suyo, sale de su portero");
});

test("el rondo trae su cuadrado y se encuadra en el círculo central", () => {
  const rondo = plantilla("rondo");
  assert.equal(rondo.categoria, "entrenamiento");
  assert.equal(rondo.ambiente.encuadre, "centro");
  assert.ok(rondo.fases.every((f) => f.anotaciones.some((a) => a.tipo === "rect")));
  assert.notEqual(rondo.fases[0].anotaciones[0].id, rondo.fases[1].anotaciones[0].id);
});

test("lo guardado antes de las categorías se abre con noche, estadio y su categoría de siempre", () => {
  const vieja = JSON.parse(JSON.stringify(cuadernoInicial()));
  for (const j of vieja.jugadas) {
    delete j.categoria; delete j.ambiente; delete j.actualizada;
    for (const f of j.fases) delete f.nota;
  }
  vieja.jugadas[0].fases[0].anotaciones.push({ id: "f1", tipo: "flecha", a: { x: 0, z: 0 }, b: { x: 5, z: 5 }, color: "#ffffff" });
  const abierta = normalizarCuaderno(vieja).jugadas[0];
  assert.equal(abierta.categoria, "abp");
  // Se hizo en 3D antes de que hubiera tablero 2D: se abre en 3D.
  assert.deepEqual(abierta.ambiente, {
    superficie: "noche", estadio: true, zonas: "ninguna", encuadre: "campo", dimension: "3d", orientacion: "horizontal", fichas: "dorsal", suavizado: "suave", estelas: true,
  });
  assert.equal(abierta.fases[0].nota, "");
  assert.equal(abierta.fases[0].anotaciones[0].estilo, "continua");
});

test("cambiar el trazo de una flecha no le pone el relleno de una zona", async () => {
  const { cambiarAnotacion, agregarAnotacion } = await import("../lib/abp.ts");
  const base = plantilla("libre");
  const con = agregarAnotacion(base, 0, { id: "f", tipo: "flecha", a: { x: 0, z: 0 }, b: { x: 5, z: 0 }, color: "#ffffff", estilo: "continua" });
  const ondulada = cambiarAnotacion(con, 0, "f", { estiloFlecha: "ondulada" });
  assert.equal(ondulada.fases[0].anotaciones[0].estilo, "ondulada");
  const zona = agregarAnotacion(base, 0, { id: "z", tipo: "zona", a: { x: 0, z: 0 }, b: { x: 5, z: 5 }, color: "#ffffff", estilo: "translucida" });
  assert.equal(cambiarAnotacion(zona, 0, "z", { estilo: "rayas" }).fases[0].anotaciones[0].estilo, "rayas");
});

test("posar: en la segunda fase, mover una ficha crea su carrera desde la anterior", async () => {
  const { posar, posarBalon, carreraDe } = await import("../lib/abp.ts");
  const jugada = plantilla("corner_der");
  // L2 no corre en la fase 1: al moverla en la fase 2, la carrera aparece en la 1.
  assert.equal(carreraDe(jugada.fases[1], "L2"), undefined);
  const destino = { x: 20, z: -14 };
  const nueva = posar(jugada, 2, "L2", destino);
  assert.ok(cerca(carreraDe(nueva.fases[1], "L2").hasta, destino));
  assert.ok(cerca(nueva.fases[2].pos.L2, destino));
  // En la primera fase no hay fase anterior: solo se coloca.
  const primera = posar(jugada, 0, "L2", destino);
  assert.ok(cerca(primera.fases[0].pos.L2, destino));
  assert.equal(carreraDe(primera.fases[0], "L2"), undefined);
  // El balón: moverlo en una pose es el envío desde la anterior.
  const conBalon = posarBalon(jugada, 1, { x: 45, z: 5 });
  assert.ok(cerca(conBalon.fases[0].pases.at(-1).hasta, { x: 45, z: 5 }));
  assert.ok(cerca(conBalon.fases[1].balon, { x: 45, z: 5 }));
});

test("el suavizado: coseno por defecto, lineal si se pide", async () => {
  const { suavizar } = await import("../lib/abp.ts");
  assert.equal(suavizar(0), 0);
  assert.equal(suavizar(1), 1);
  assert.ok(Math.abs(suavizar(0.5) - 0.5) < 1e-9);
  assert.ok(suavizar(0.1) < 0.1, "arranca despacio");
  assert.equal(suavizar(0.3, true), 0.3);
});

test("la cámara del 2D: encaja el encuadre, ida y vuelta de coordenadas y viaje suave", async () => {
  const { camaraDeCaja, transformacion, interpolarCamara, abreviar } = await import("../lib/tablero.ts");
  const caja = { x0: -52.5, x1: 52.5, z0: -34, z1: 34 };
  for (const orientacion of ["horizontal", "vertical"]) {
    const cam = camaraDeCaja(caja, 1200, 700, orientacion);
    const tr = transformacion(cam, 1200, 700, orientacion);
    // Las cuatro esquinas del campo caben en la pantalla.
    for (const [x, z] of [[-52.5, -34], [52.5, 34], [-52.5, 34], [52.5, -34]]) {
      const p = tr.aPantalla({ x, z });
      assert.ok(p.x >= 0 && p.x <= 1200 && p.y >= 0 && p.y <= 700, `${orientacion} ${x},${z}`);
      const vuelta = tr.aCampo(p.x, p.y);
      assert.ok(cerca(vuelta, { x, z }, 1e-6));
    }
    // En vertical se ataca hacia arriba: su portería queda más arriba que la nuestra.
    if (orientacion === "vertical") assert.ok(tr.aPantalla({ x: 50, z: 0 }).y < tr.aPantalla({ x: -50, z: 0 }).y);
  }
  const a = { x: -40, z: 0, w: 30 }, b = { x: 40, z: 0, w: 30 };
  const inicio = interpolarCamara(a, b, 0);
  assert.ok(Math.abs(inicio.x - a.x) < 1e-9 && Math.abs(inicio.w - a.w) < 1e-9);
  const fin = interpolarCamara(a, b, 1);
  assert.ok(Math.abs(fin.x - 40) < 1e-6 && Math.abs(fin.w - 30) < 1e-6);
  // En un viaje largo se aleja a mitad de camino: así se ve de dónde viene y a dónde va.
  assert.ok(interpolarCamara(a, b, 0.5).w > 30);
  // Solo zoom: sin desplazarse.
  const z = interpolarCamara({ x: 0, z: 0, w: 100 }, { x: 0, z: 0, w: 25 }, 0.5);
  assert.ok(Math.abs(z.w - 50) < 1e-9);
  assert.equal(abreviar("Primer palo"), "PP");
  assert.equal(abreviar("DFC"), "DFC");
  assert.equal(abreviar("Lanzador"), "LAN");
});

test("mover una fase: cambia de puesto con la de al lado y en los extremos no hace nada", async () => {
  const { moverFase } = await import("../lib/abp.ts");
  const jugada = plantilla("corner_der");
  const ids = jugada.fases.map((f) => f.id);
  assert.ok(ids.length >= 3);
  assert.deepEqual(moverFase(jugada, 1, 1).fases.map((f) => f.id), [ids[0], ids[2], ids[1], ...ids.slice(3)]);
  assert.deepEqual(moverFase(jugada, 1, -1).fases.map((f) => f.id), [ids[1], ids[0], ...ids.slice(2)]);
  assert.equal(moverFase(jugada, 0, -1), jugada);
  assert.equal(moverFase(jugada, ids.length - 1, 1), jugada);
});

test("el foco: una zona que apaga lo de fuera se guarda y se vuelve a abrir como foco", () => {
  const cuaderno = cuadernoInicial();
  const jugada = cuaderno.jugadas[0];
  jugada.fases[0].anotaciones.push({ id: "foco", tipo: "rect", a: { x: 0, z: -10 }, b: { x: 30, z: 10 }, color: "#f3b64c", estilo: "foco" });
  const vuelta = normalizarCuaderno(JSON.parse(JSON.stringify(cuaderno)));
  assert.equal(vuelta.jugadas[0].fases[0].anotaciones.find((a) => a.id === "foco").estilo, "foco");
});

test("el material: en fila cada X metros, en slalom a los dos lados, y pasa a la fase siguiente", async () => {
  const { filaDeMaterial, agregarMaterial, moverMaterial, quitarMaterial, materialCerca } = await import("../lib/abp.ts");
  const fila = filaDeMaterial("pica", { x: 0, z: 0 }, { x: 10, z: 0 }, 2, false, "#ffff00");
  assert.equal(fila.length, 6);
  assert.ok(fila.every((m, k) => cerca(m.p, { x: 2 * k, z: 0 }) && m.giro === 0));
  const slalom = filaDeMaterial("pica", { x: 0, z: 0 }, { x: 0, z: 9 }, 3, true, "#ffff00");
  assert.equal(slalom.length, 4);
  assert.ok(slalom.every((m) => m.giro === 90));
  assert.ok(slalom[0].p.x * slalom[1].p.x < 0, "en slalom se alterna de lado");
  // Un clic sin arrastrar: una sola pieza.
  assert.equal(filaDeMaterial("cono", { x: 5, z: 5 }, { x: 5.1, z: 5 }, 2, false, "#ff0000").length, 1);
  let jugada = plantilla("libre");
  jugada = agregarMaterial(jugada, 0, fila);
  assert.equal(materialCerca(jugada.fases[0], { x: 4.2, z: 0.3 }), fila[2].id);
  assert.equal(materialCerca(jugada.fases[0], { x: 4, z: 6 }), null);
  jugada = moverMaterial(jugada, 0, fila[0].id, { x: -3, z: 1 });
  assert.ok(cerca(jugada.fases[0].material[0].p, { x: -3, z: 1 }));
  jugada = agregarFase(jugada, 0, "Fase 2");
  assert.equal(jugada.fases[1].material.length, 6, "la fase nueva empieza con el mismo material");
  jugada = quitarMaterial(jugada, 1, fila[1].id);
  assert.equal(jugada.fases[1].material.length, 5);
  assert.equal(jugada.fases[0].material.length, 6, "quitarlo en una fase no lo quita de la anterior");
});

test("material y equipaciones se guardan y se vuelven a abrir; lo guardado antes, liso y sin material", async () => {
  const { agregarMaterial, cambiarEquipacion, equipacionDe } = await import("../lib/abp.ts");
  const cuaderno = cuadernoInicial();
  let jugada = cuaderno.jugadas[0];
  jugada = agregarMaterial(jugada, 0, [{ id: "m1", tipo: "escalera", p: { x: 1, z: 2 }, giro: 450, color: "#f6c12d" }]);
  jugada = cambiarEquipacion(jugada, "rival", { patron: "rayas", secundario: "#000000", ribete: true });
  const vuelta = normalizarCuaderno(JSON.parse(JSON.stringify({ ...cuaderno, jugadas: [jugada] }))).jugadas[0];
  assert.deepEqual(vuelta.fases[0].material[0].p, { x: 1, z: 2 });
  assert.equal(vuelta.fases[0].material[0].giro, 90);
  assert.deepEqual(equipacionDe(vuelta, "rival"), { patron: "rayas", secundario: "#000000", ribete: true, dorsal: "auto" });
  assert.equal(equipacionDe(vuelta, "local").patron, "liso");
  // Basura y datos viejos: sin material raro y con la equipación lisa.
  const sucio = JSON.parse(JSON.stringify({ ...cuaderno, jugadas: [{ ...jugada, equipaciones: { local: { patron: "lunares" } } }] }));
  sucio.jugadas[0].fases[0].material.push({ id: "x", tipo: "trampolin", p: { x: 0, z: 0 } });
  const limpio = normalizarCuaderno(sucio).jugadas[0];
  assert.equal(limpio.fases[0].material.length, 1);
  assert.equal(equipacionDe(limpio, "local").patron, "liso");
  // El rondo de serie trae sus cuatro setas en todas las fases.
  const rondo = plantilla("rondo");
  assert.ok(rondo.fases.every((f) => f.material.length === 4));
});
