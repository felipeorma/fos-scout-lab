import assert from "node:assert/strict";
import test from "node:test";
import {
  aCSV, aXML, cambiarMomento, claveDeVideo, codificacionValida, codificacionVacia, deCSV, deXML, marcar, quitarMomento, reloj,
} from "../lib/codificacion.ts";

test("cada marca guarda un clip de 8 s antes y 5 después, sin salirse del vídeo", () => {
  let c = codificacionVacia();
  ({ codificacion: c } = marcar(c, "c1", 100));
  ({ codificacion: c } = marcar(c, "c2", 3));
  ({ codificacion: c } = marcar(c, "c3", 5398, 5400));
  assert.deepEqual(c.momentos.map((m) => [m.t, m.inicio, m.fin]), [[3, 0, 8], [100, 92, 105], [5398, 5390, 5400]]);
  c = cambiarMomento(c, c.momentos[1].id, { nota: "Robo de Rodri" });
  assert.equal(c.momentos[1].nota, "Robo de Rodri");
  c = quitarMomento(c, c.momentos[0].id);
  assert.equal(c.momentos.length, 2);
  assert.equal(reloj(3725), "1:02:05");
  assert.equal(reloj(65.9), "1:05");
  assert.equal(claveDeVideo("partido.mp4", 123), "fos-scout-lab:codificacion:partido.mp4|123");
});

test("CSV de ida y vuelta, con comas y comillas en las notas", () => {
  let c = codificacionVacia();
  ({ codificacion: c } = marcar(c, "c3", 60));
  c = cambiarMomento(c, c.momentos[0].id, { nota: 'Tiro de "Pedri", al palo' });
  const csv = aCSV(c);
  assert.ok(csv.startsWith("codigo,inicio,fin,instante,nota"));
  const { codificacion, nuevos } = deCSV(codificacionVacia(), csv);
  assert.equal(nuevos, 1);
  assert.deepEqual(codificacion.momentos.map((m) => [m.inicio, m.fin, m.t, m.nota]), [[52, 65, 60, 'Tiro de "Pedri", al palo']]);
  assert.equal(codificacion.codigos.find((x) => x.id === codificacion.momentos[0].codigo).nombre, "Ocasión a favor");
  // Con punto y coma y decimales con coma, como lo exporta una hoja en español; y un código que no existía.
  const otro = deCSV(codificacionVacia(), "Código;Inicio;Fin;Nota\nContraataque;10,5;22,5;rápido\n");
  assert.equal(otro.nuevos, 1);
  assert.equal(otro.codificacion.codigos.at(-1).nombre, "Contraataque");
  assert.equal(otro.codificacion.momentos[0].inicio, 10.5);
  // Importar dos veces lo mismo no duplica.
  assert.equal(deCSV(codificacion, csv).nuevos, 0);
});

test("XML con la forma de Sportscode, de ida y vuelta y con sus colores", () => {
  let c = codificacionVacia();
  ({ codificacion: c } = marcar(c, "c1", 30));
  ({ codificacion: c } = marcar(c, "c4", 75));
  c = cambiarMomento(c, c.momentos[1].id, { nota: "Error <grave> & caro" });
  const xml = aXML(c);
  assert.match(xml, /<instance><ID>1<\/ID><start>22\.00<\/start><end>35\.00<\/end><code>Recuperación<\/code><\/instance>/);
  assert.match(xml, /<text>Error &lt;grave&gt; &amp; caro<\/text>/);
  const leido = deXML(codificacionVacia(), xml);
  assert.equal(leido.nuevos, 2);
  assert.equal(leido.codificacion.momentos[1].nota, "Error <grave> & caro");
  // Un XML de otra herramienta, con un código nuevo y su color de fila.
  const ajeno = `<file><ALL_INSTANCES><instance><ID>7</ID><start>100</start><end>112</end><code>Pressing trigger</code><label><group>Player</group><text>8</text></label></instance></ALL_INSTANCES>
    <ROWS><row><code>Pressing trigger</code><R>65535</R><G>0</G><B>0</B></row></ROWS></file>`;
  const r = deXML(codificacionVacia(), ajeno);
  assert.equal(r.nuevos, 1);
  const codigo = r.codificacion.codigos.at(-1);
  assert.deepEqual([codigo.nombre, codigo.color, codigo.tecla], ["Pressing trigger", "#ff0000", ""]);
  assert.equal(r.codificacion.momentos[0].nota, "8");
});

test("lo guardado roto vuelve sano", () => {
  assert.equal(codificacionValida(null).codigos.length, 10);
  const c = codificacionValida({ antes: 99, codigos: [{ id: "a", nombre: "Uno", color: "rojo" }], momentos: [{ id: "x", codigo: "a", t: 10 }, { id: "y", codigo: "nadie", t: 3 }] });
  assert.equal(c.antes, 30);
  assert.equal(c.codigos[0].color, "#f5f5f7");
  assert.deepEqual(c.momentos.map((m) => [m.id, m.inicio, m.fin]), [["x", 2, 15]]);
});
