import assert from "node:assert/strict";
import test from "node:test";
import { separarImagenes, unirImagenes } from "../lib/almacen.ts";

/**
 * Las imágenes grandes salen del JSON y vuelven a su sitio. Lo que toca al
 * navegador (localStorage, IndexedDB) se prueba en la app; aquí la parte pura.
 */
const grande = `data:image/png;base64,${"A".repeat(5000)}`;
const pequena = "data:image/png;base64,AAAA";

test("las imágenes grandes salen como referencia y vuelven intactas", () => {
  const perfil = { name: "Sean Young", playerImage: grande, clubLogo: pequena, otros: [{ foto: grande }] };
  const { valor, imagenes } = separarImagenes("fos-transfermarkt:sean young", perfil);
  assert.equal(imagenes.size, 2);
  assert.equal(valor.playerImage, "idb:fos-transfermarkt:sean young#playerImage");
  assert.equal(valor.clubLogo, pequena, "lo pequeño se queda en el JSON");
  assert.equal(valor.otros[0].foto, "idb:fos-transfermarkt:sean young#otros[0].foto");
  assert.ok(JSON.stringify(valor).length < 400, "el JSON queda pequeño");
  assert.deepEqual(unirImagenes(valor, imagenes), perfil);
});

test("una referencia sin imagen en memoria queda vacía, no rota", () => {
  assert.deepEqual(unirImagenes({ playerImage: "idb:no-existe#playerImage", name: "X" }, new Map()), { playerImage: "", name: "X" });
});
