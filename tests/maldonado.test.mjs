import assert from "node:assert/strict";
import test from "node:test";

import {
  FORMACION_41212,
  LIGAS_MALDONADO,
  RATINGS_RESPALDO,
  armarOnce,
  claveMemoriaArchivo,
  compararFotos,
  construirFoto,
  detectarLiga,
  detectarLigaConMemoria,
  factoresDeLiga,
  indiceAjustado,
  ligasSinRating,
  mesActual,
  normalizarNombreArchivo,
  puestoMaldonado,
  ratingOpta,
  ratingsDesdeOpta,
} from "../lib/maldonado.ts";

// ---------------------------------------------------------------------------
// Detección de liga
// ---------------------------------------------------------------------------

test("reconoce las seis ligas del encargo con nombres de archivo distintos", () => {
  const casos = [
    ["Primera Division Uruguay 2026.xlsx", "uruguay-primera"],
    ["Uruguay - Primera División 2025-26.xlsx", "uruguay-primera"],
    ["URUGUAY_PRIMERA.xlsx", "uruguay-primera"],
    ["Segunda Division Uruguay 2026.xlsx", "uruguay-segunda"],
    ["uruguay segunda division profesional.xlsx", "uruguay-segunda"],
    ["Primera B Metropolitana.xlsx", "argentina-metropolitana"],
    ["Argentina - Primera B Metropolitana 2026.xlsx", "argentina-metropolitana"],
    ["metropolitana_wyscout.xlsx", "argentina-metropolitana"],
    ["Argentina - Primera Nacional.xlsx", "argentina-nacional"],
    ["Primera Nacional Argentina 2026.xlsx", "argentina-nacional"],
    ["Argentina Primera Division 2026.xlsx", "argentina-primera"],
    ["Primera División Argentina.xlsx", "argentina-primera"],
    ["Reserva Argentina 2026.xlsx", "argentina-reserva"],
    ["argentina_reservas_agosto.xlsx", "argentina-reserva"],
  ];
  for (const [archivo, esperada] of casos) {
    assert.equal(detectarLiga(archivo), esperada, `${archivo} se detectó mal`);
  }
});

test("la nacional y la reserva se resuelven antes que la primera argentina", () => {
  // Ambas contienen "argentina" y podrían caer en el cajón equivocado si el
  // orden de las reglas cambiara.
  assert.equal(detectarLiga("Argentina Primera Nacional 2026.xlsx"), "argentina-nacional");
  assert.equal(detectarLiga("Reserva Primera Argentina.xlsx"), "argentina-reserva");
  assert.equal(detectarLiga("Argentina Primera B 2026.xlsx"), "argentina-metropolitana");
});

test("uruguay manda sobre las palabras que también usa Argentina", () => {
  assert.equal(detectarLiga("Uruguay Primera Division Nacional.xlsx"), "uruguay-primera");
  assert.equal(detectarLiga("Segunda Division Uruguay - Nacional.xlsx"), "uruguay-segunda");
});

test("normaliza acentos, mayúsculas, guiones y extensión", () => {
  assert.equal(normalizarNombreArchivo("Primera División Argentina.xlsx"), "primera division argentina");
  assert.equal(normalizarNombreArchivo("ARGENTINA_-_Primera-Nacional.CSV"), "argentina primera nacional");
  assert.equal(normalizarNombreArchivo(""), "");
});

test("un archivo que no es de las seis ligas no se fuerza a ninguna", () => {
  for (const archivo of [
    "StatsBomb · Canadian Premier League 2026",
    "Brasileirao 2026.xlsx",
    "export.xlsx",
    "",
  ]) {
    assert.equal(detectarLiga(archivo), null, `${archivo} no debería reconocerse`);
  }
});

test("la elección manual se recuerda aunque cambien los números del nombre", () => {
  const memoria = { [claveMemoriaArchivo("liga uruguaya julio 2026.xlsx")]: "uruguay-primera" };
  assert.equal(detectarLigaConMemoria("liga uruguaya julio 2026.xlsx", memoria), "uruguay-primera");
  // El mes siguiente llega con otra fecha en el nombre y debe seguir valiendo.
  assert.equal(detectarLigaConMemoria("liga uruguaya agosto 2026.xlsx", memoria), "uruguay-primera");
  assert.equal(detectarLigaConMemoria("otra base.xlsx", memoria), null);
});

test("la detección automática pisa a la memoria, no al revés", () => {
  const memoria = { [claveMemoriaArchivo("Reserva Argentina.xlsx")]: "uruguay-primera" };
  assert.equal(detectarLigaConMemoria("Reserva Argentina.xlsx", memoria), "argentina-reserva");
});

test("una liga guardada con un id inexistente se ignora", () => {
  const memoria = { [claveMemoriaArchivo("base rara.xlsx")]: "liga-que-no-existe" };
  assert.equal(detectarLigaConMemoria("base rara.xlsx", memoria), null);
});

// ---------------------------------------------------------------------------
// Descuento por nivel de liga
// ---------------------------------------------------------------------------

const OPTA_FALSO = [
  { leagueName: "Liga Profesional Argentina", countryName: "Argentina", seasonAverageRating: 81.37 },
  { leagueName: "Uruguay Liga AUF", countryName: "Uruguay", seasonAverageRating: 77.01 },
  { leagueName: "Argentina Primera Nacional", countryName: "Argentina", seasonAverageRating: 74.64 },
  // El feed real trae "Segunda División" tres veces, en países distintos.
  { leagueName: "Segunda División", countryName: "España", seasonAverageRating: 88.0 },
  { leagueName: "Segunda División", countryName: "Uruguay", seasonAverageRating: 64.13 },
  { leagueName: "Argentina Primera B (Metropolitana)", countryName: "Argentina", seasonAverageRating: 58.92 },
];

test("el rating se busca por liga Y país: 'Segunda División' está repetida en el feed", () => {
  const uruguaySegunda = LIGAS_MALDONADO.find((liga) => liga.id === "uruguay-segunda");
  assert.equal(ratingOpta(OPTA_FALSO, uruguaySegunda), 64.13);
});

test("una liga que Opta no publica devuelve null, nunca un número inventado", () => {
  const reserva = LIGAS_MALDONADO.find((liga) => liga.id === "argentina-reserva");
  assert.equal(reserva.opta, null);
  assert.equal(ratingOpta(OPTA_FALSO, reserva), null);
  const ratings = ratingsDesdeOpta(OPTA_FALSO);
  assert.equal(ratings["argentina-reserva"], null);
  assert.deepEqual(ligasSinRating(ratings, ["argentina-primera", "argentina-reserva"]), ["argentina-reserva"]);
});

test("el respaldo fechado coincide con los nombres de liga del feed", () => {
  const ratings = ratingsDesdeOpta(OPTA_FALSO);
  for (const [id, valor] of Object.entries(RATINGS_RESPALDO)) {
    assert.ok(Number.isFinite(ratings[id]), `${id} no se encontró en el feed`);
    // El respaldo es una copia fechada del feed, no otro criterio: el orden
    // relativo tiene que ser el mismo.
    assert.ok(Math.abs(ratings[id] - valor) < 1, `${id} se alejó del feed (${ratings[id]} vs ${valor})`);
  }
});

test("el factor de liga es relativo a la mejor liga presente, no a todas", () => {
  const ratings = ratingsDesdeOpta(OPTA_FALSO);
  const factores = factoresDeLiga(ratings, ["uruguay-segunda", "argentina-metropolitana"]);
  // Con esas dos cargadas, la referencia es Uruguay Segunda, no Primera Argentina.
  assert.equal(factores["uruguay-segunda"], 1);
  assert.ok(factores["argentina-metropolitana"] < 1);
  assert.ok(Math.abs(factores["argentina-metropolitana"] - 58.92 / 64.13) < 1e-9);
});

test("el descuento baja el índice de la liga más débil y respeta el de la mejor", () => {
  const ratings = ratingsDesdeOpta(OPTA_FALSO);
  const factores = factoresDeLiga(ratings, ["argentina-primera", "argentina-metropolitana"]);
  assert.equal(indiceAjustado(80, factores["argentina-primera"]), 80);
  assert.equal(indiceAjustado(80, factores["argentina-metropolitana"]), Math.round(80 * (58.92 / 81.37)));
  // Sin factor conocido el índice se deja tal cual: la interfaz avisa aparte.
  assert.equal(indiceAjustado(80, undefined), 80);
});

// ---------------------------------------------------------------------------
// Once ideal
// ---------------------------------------------------------------------------

function ficha(indice, puesto, puntuacion, extra = {}) {
  return {
    indice,
    jugador: extra.jugador ?? `Jugador ${indice}`,
    equipo: extra.equipo ?? "Club",
    edad: extra.edad ?? 24,
    minutos: extra.minutos ?? 1800,
    perfil: puesto,
    puesto,
    puntuacion,
    ajustada: extra.ajustada ?? puntuacion,
    liga: extra.liga ?? "",
    destacadas: extra.destacadas ?? [],
    fila: indice,
  };
}

test("la formación es 4-1-2-1-2 con arquero: once huecos", () => {
  assert.equal(FORMACION_41212.length, 11);
  const nombres = FORMACION_41212.map((puesto) => puesto.nombre);
  assert.equal(nombres.filter((n) => n === "Delantero").length, 2);
  assert.equal(nombres.filter((n) => n.startsWith("Defensor Central")).length, 2);
  assert.ok(nombres.includes("Arquero"));
  assert.ok(nombres.includes("Contensión"));
  assert.ok(nombres.includes("Enganche"));
  assert.equal(nombres.filter((n) => n.startsWith("Interior")).length, 2);
  assert.equal(nombres.filter((n) => n.startsWith("Lateral")).length, 2);
});

test("cada hueco trae hasta tres candidatos ordenados por índice", () => {
  const fichas = [
    ficha(1, "Arquero", 70), ficha(2, "Arquero", 80), ficha(3, "Arquero", 60), ficha(4, "Arquero", 55),
  ];
  const once = armarOnce(fichas);
  const arqueros = once.find((hueco) => hueco.puesto.id === "ARQ").candidatos;
  assert.equal(arqueros.length, 3);
  assert.deepEqual(arqueros.map((f) => f.puntuacion), [80, 70, 60]);
});

test("los dos centrales no repiten jugador y se reparten el grupo por turnos", () => {
  const fichas = [
    ficha(1, "Defensor Central Izquierdo", 90),
    ficha(2, "Defensor Central", 85),
    ficha(3, "Defensor Central Derecho", 80),
    ficha(4, "Defensor Central Izquierdo", 75),
    ficha(5, "Defensor Central", 70),
    ficha(6, "Defensor Central Derecho", 65),
  ];
  const once = armarOnce(fichas);
  const izquierdo = once.find((hueco) => hueco.puesto.id === "DFI").candidatos;
  const derecho = once.find((hueco) => hueco.puesto.id === "DFD").candidatos;
  assert.deepEqual(izquierdo.map((f) => f.puntuacion), [90, 80, 70]);
  assert.deepEqual(derecho.map((f) => f.puntuacion), [85, 75, 65]);
  const repetidos = izquierdo.filter((f) => derecho.some((otro) => otro.indice === f.indice));
  assert.deepEqual(repetidos, [], "un jugador aparece en los dos centrales");
});

test("los dos delanteros tampoco se pisan", () => {
  const fichas = [90, 85, 80, 75, 70, 65].map((puntos, i) => ficha(i + 1, "Delantero", puntos));
  const once = armarOnce(fichas);
  const uno = once.find((hueco) => hueco.puesto.id === "DL1").candidatos;
  const dos = once.find((hueco) => hueco.puesto.id === "DL2").candidatos;
  assert.equal(uno[0].puntuacion, 90);
  assert.equal(dos[0].puntuacion, 85);
  assert.equal(new Set([...uno, ...dos].map((f) => f.indice)).size, 6);
});

test("un hueco sin jugadores en la base queda vacío en vez de rellenarse con otro puesto", () => {
  const once = armarOnce([ficha(1, "Delantero", 90)]);
  assert.equal(once.find((hueco) => hueco.puesto.id === "ARQ").candidatos.length, 0);
  assert.equal(once.find((hueco) => hueco.puesto.id === "DL1").candidatos.length, 1);
});

test("el combinado ordena por el índice ajustado, no por el bruto", () => {
  const fichas = [
    ficha(1, "Enganche", 80, { ajustada: 55, jugador: "Metropolitana" }),
    ficha(2, "Enganche", 70, { ajustada: 70, jugador: "Primera" }),
  ];
  assert.equal(armarOnce(fichas, 3, false).find((h) => h.puesto.id === "ENG").candidatos[0].jugador, "Metropolitana");
  assert.equal(armarOnce(fichas, 3, true).find((h) => h.puesto.id === "ENG").candidatos[0].jugador, "Primera");
});

test("el mapa de posiciones sigue traduciendo los códigos de las plataformas", () => {
  assert.equal(puestoMaldonado("LCB"), "Defensor Central Izquierdo");
  assert.equal(puestoMaldonado("RDMF, RCMF"), "Contensión");
  assert.equal(puestoMaldonado("ST"), "Delantero");
  assert.equal(puestoMaldonado(""), "");
});

// ---------------------------------------------------------------------------
// Fotos mensuales y variación
// ---------------------------------------------------------------------------

function foto(mes, jugadores) {
  return {
    version: 1,
    mes,
    liga: "uruguay-primera",
    ligaNombre: "Primera División Uruguay",
    generado: `${mes}-01T00:00:00.000Z`,
    minutosMin: 500,
    jugadores,
  };
}

const jugador = (nombre, indice, club = "Club A") => ({
  nombre, club, puesto: "Enganche", edad: 22, minutos: 1500, indice, destacadas: [],
});

test("la foto guarda todo lo que identifica al jugador, sin depender de la base", () => {
  const salida = construirFoto({
    mes: "2026-08",
    liga: "uruguay-primera",
    ligaNombre: "Primera División Uruguay",
    minutosMin: 500,
    fichas: [ficha(1, "Enganche", 70, { jugador: "Ana Pérez", destacadas: [{ label: "xG", percentile: 93 }] })],
  });
  assert.equal(salida.version, 1);
  assert.equal(salida.mes, "2026-08");
  assert.equal(salida.ligaNombre, "Primera División Uruguay");
  const [primero] = salida.jugadores;
  assert.deepEqual(Object.keys(primero).sort(), ["club", "destacadas", "edad", "indice", "minutos", "nombre", "puesto"]);
  assert.equal(primero.nombre, "Ana Pérez");
  assert.deepEqual(primero.destacadas, [{ metrica: "xG", percentil: 93 }]);
});

test("la foto ordena por índice y sobrevive a un viaje por JSON", () => {
  const salida = construirFoto({
    mes: "2026-08", liga: "uruguay-primera", ligaNombre: "Primera División Uruguay", minutosMin: 500,
    fichas: [ficha(1, "Enganche", 55), ficha(2, "Delantero", 88), ficha(3, "Arquero", 70)],
  });
  assert.deepEqual(salida.jugadores.map((j) => j.indice), [88, 70, 55]);
  assert.deepEqual(JSON.parse(JSON.stringify(salida)), salida);
});

test("la comparación separa quién sube, quién baja y quién es nuevo", () => {
  const anterior = foto("2026-07", [jugador("Ana Pérez", 55), jugador("Luis Gómez", 70), jugador("Marta Ruiz", 80)]);
  const actual = foto("2026-08", [jugador("Ana Pérez", 72), jugador("Luis Gómez", 69), jugador("Nuevo Chico", 66)]);
  const diff = compararFotos(anterior, actual);
  assert.deepEqual(diff.suben.map((v) => [v.nombre, v.delta]), [["Ana Pérez", 17]]);
  assert.deepEqual(diff.bajan, []);
  assert.equal(diff.estables, 1, "Luis Gómez movió 1 punto: es ruido, no una señal");
  assert.deepEqual(diff.nuevos.map((j) => j.nombre), ["Nuevo Chico"]);
  assert.deepEqual(diff.salen.map((j) => j.nombre), ["Marta Ruiz"]);
});

test("una caída por debajo del umbral también se reporta", () => {
  const anterior = foto("2026-07", [jugador("Ana Pérez", 80)]);
  const actual = foto("2026-08", [jugador("Ana Pérez", 61)]);
  const diff = compararFotos(anterior, actual);
  assert.deepEqual(diff.bajan.map((v) => [v.nombre, v.delta]), [["Ana Pérez", -19]]);
});

test("un cambio de club no convierte al jugador en un fichaje nuevo", () => {
  const anterior = foto("2026-07", [jugador("Ana Pérez", 60, "Club A")]);
  const actual = foto("2026-08", [jugador("Ana Pérez", 75, "Club B")]);
  const diff = compararFotos(anterior, actual);
  assert.deepEqual(diff.nuevos, []);
  assert.equal(diff.suben[0].delta, 15);
  assert.equal(diff.suben[0].club, "Club B");
});

test("el cruce tolera acentos y mayúsculas distintas entre exports", () => {
  const anterior = foto("2026-07", [jugador("ANA PEREZ", 60)]);
  const actual = foto("2026-08", [jugador("Ana Pérez", 78)]);
  assert.deepEqual(compararFotos(anterior, actual).nuevos, []);
});

test("dos homónimos se desempatan por club y no se cruzan al azar", () => {
  const anterior = foto("2026-07", [jugador("Juan Silva", 40, "Club A"), jugador("Juan Silva", 80, "Club B")]);
  const actual = foto("2026-08", [jugador("Juan Silva", 85, "Club B"), jugador("Juan Silva", 50, "Club A")]);
  const diff = compararFotos(anterior, actual);
  assert.deepEqual(diff.nuevos, []);
  const porClub = Object.fromEntries([...diff.suben, ...diff.bajan].map((v) => [v.club, v.delta]));
  assert.equal(porClub["Club A"], 10);
  assert.equal(porClub["Club B"], 5);
});

test("el mes se escribe AAAA-MM", () => {
  assert.equal(mesActual(new Date(2026, 0, 9)), "2026-01");
  assert.equal(mesActual(new Date(2026, 11, 31)), "2026-12");
  assert.match(mesActual(), /^\d{4}-\d{2}$/);
});
