import assert from "node:assert/strict";
import test from "node:test";
import { profileFromTmApi } from "../lib/transfermarkt.ts";

/**
 * La ficha reconstruida desde la API de Transfermarkt.
 *
 * Desde septiembre de 2026 la web pide verificación humana y el HTML ya no se
 * puede leer. La API que alimenta a la propia web sigue abierta, pero reparte
 * los datos en cuatro piezas y con otros formatos: la altura en metros, las
 * fechas en ISO y la nacionalidad escondida en la selección, que ahí dentro es
 * un club. Esto fija la traducción a los campos de la ficha.
 */

const RESPUESTA = {
  player: {
    name: "Lionel Messi",
    portraitUrl: "https://img.a.transfermarkt.technology/portrait/big/28003-1771694720.jpg",
    lifeDates: { age: 39, dateOfBirth: "1987-06-24" },
    birthPlaceDetails: { placeOfBirth: "Rosario" },
    attributes: {
      height: 1.7,
      preferredFoot: { name: "left" },
      position: { name: "Right Winger" },
      contractUntil: "2028-12-31",
      consultantAgency: { name: "Relatives" },
    },
    marketValueDetails: {
      current: { compact: { prefix: "€", content: "15.00", suffix: "M" }, determined: "2026-06-02" },
    },
  },
  club: { name: "Inter Miami CF", crestUrl: "https://img.a.transfermarkt.technology/wappen/big/69261.png" },
  competition: { name: "Major League Soccer", logoUrl: "https://img.a.transfermarkt.technology/logo/medium/mls1.png" },
  nationalTeam: { name: "Argentina" },
  shirtNumber: 10,
  joined: "2023-07-15",
};

const URL_FICHA = "https://www.transfermarkt.es/lionel-messi/profil/spieler/28003";

test("la ficha se rellena con lo que trae la API", () => {
  const perfil = profileFromTmApi(RESPUESTA, URL_FICHA);
  assert.equal(perfil.name, "Lionel Messi");
  assert.equal(perfil.number, "10");
  assert.equal(perfil.club, "Inter Miami CF");
  assert.equal(perfil.league, "Major League Soccer");
  assert.equal(perfil.birthPlace, "Rosario");
  assert.equal(perfil.age, "39");
  assert.equal(perfil.position, "Right Winger");
  assert.equal(perfil.agent, "Relatives");
  assert.equal(perfil.contract, "2028-12-31");
  assert.equal(perfil.joined, "2023-07-15");
  assert.equal(perfil.sourceUrl, URL_FICHA);
});

test("la altura pasa de metros decimales al formato de la ficha", () => {
  assert.equal(profileFromTmApi(RESPUESTA, URL_FICHA).height, "1,70 m");
  const sinAltura = { ...RESPUESTA, player: { ...RESPUESTA.player, attributes: { ...RESPUESTA.player.attributes, height: 0 } } };
  assert.equal(profileFromTmApi(sinAltura, URL_FICHA).height, "", "sin dato no se inventa un 0,00 m");
});

test("el valor de mercado se arma con las tres partes que da la API", () => {
  assert.equal(profileFromTmApi(RESPUESTA, URL_FICHA).marketValue, "€15.00M");
});

test("la nacionalidad sale de la selección, que la API trata como un club", () => {
  const perfil = profileFromTmApi(RESPUESTA, URL_FICHA);
  assert.equal(perfil.citizenship, "Argentina");
  assert.equal(perfil.nationalTeam, "Argentina");
  const sinSeleccion = { ...RESPUESTA, nationalTeam: null };
  assert.equal(profileFromTmApi(sinSeleccion, URL_FICHA).citizenship, "", "sin selección se deja vacío para que se escriba a mano");
});

test("la foto y los escudos llegan listos para el reporte", () => {
  const perfil = profileFromTmApi(RESPUESTA, URL_FICHA);
  assert.match(perfil.playerImage, /^https:\/\/img\.a\.transfermarkt\.technology\/portrait\/big\//);
  assert.match(perfil.clubLogo, /wappen/);
  assert.match(perfil.leagueLogo, /logo/);
});

test("una respuesta vacía no rompe la ficha", () => {
  const perfil = profileFromTmApi({}, URL_FICHA);
  assert.equal(perfil.name, "");
  assert.equal(perfil.height, "");
  assert.equal(perfil.marketValue, "");
  assert.equal(perfil.sourceUrl, URL_FICHA);
});
