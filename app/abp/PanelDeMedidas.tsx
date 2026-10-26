"use client";

import { nuevoId, type Anotacion, type Equipo, type Fase, type Jugada } from "@/lib/abp";
import { esPortero, medidasDeEquipo, superioridades, type MedidasDeEquipo, type Zona } from "@/lib/medidas";
import { t, type Lang } from "@/lib/i18n";

/**
 * La fase en metros: lo que mide cada equipo al empezar la fase y quién tiene
 * más gente en cada tercio y en cada carril. Con un botón, las medidas se
 * dibujan en el campo pegadas a los jugadores que las marcan, así que al
 * reproducir se ve cómo cambian.
 */
export function PanelDeMedidas({ jugada, fase, colores, idioma, metros, onDibujar }: {
  jugada: Jugada;
  idioma: Lang;
  fase: Fase;
  colores: Record<Equipo, string>;
  metros: (m: number) => string;
  onDibujar: (anotaciones: Anotacion[]) => void;
}) {
  const nuestras = medidasDeEquipo(jugada, fase, "local"), suyas = medidasDeEquipo(jugada, fase, "rival");
  const { tercios, carriles } = superioridades(jugada, fase);
  const entero = (n: number) => Math.round(n).toLocaleString(idioma === "en" ? "en-GB" : "es-ES");
  const filas: Array<{ nombre: string; valor: (m: MedidasDeEquipo) => string; ayuda: string }> = [
    { nombre: t("Anchura"), valor: (m) => metros(m.anchura), ayuda: t("De banda a banda, entre sus dos jugadores más abiertos.") },
    { nombre: t("Profundidad"), valor: (m) => metros(m.profundidad), ayuda: t("Del jugador de campo más retrasado al más adelantado.") },
    { nombre: t("Área"), valor: (m) => `${entero(m.area)} m²`, ayuda: t("La superficie que encierran sus jugadores de campo.") },
    { nombre: t("Línea defensiva"), valor: (m) => metros(m.lineaDefensiva), ayuda: t("De su portería a su jugador de campo más retrasado.") },
  ];

  /** Las medidas de un equipo, en su color y pegadas a quienes las marcan, y su bloque alrededor. */
  function dibujar(m: MedidasDeEquipo) {
    const color = colores[m.equipo];
    const campo = jugada.fichas.filter((f) => f.equipo === m.equipo && !esPortero(f.rol) && fase.pos[f.id]).map((f) => f.id);
    const medida = (desde: string, hasta: string): Anotacion =>
      ({ id: nuevoId("a"), tipo: "medida", a: fase.pos[desde], b: fase.pos[hasta], color, desde, hasta });
    onDibujar([
      { id: nuevoId("a"), tipo: "bloque", fichas: campo, color, relleno: "cerrado" },
      medida(m.extremos.izquierda, m.extremos.derecha),
      medida(m.extremos.atras, m.extremos.delante),
    ]);
  }

  return <section className="inspector-grupo">
    <h3 className="inspector-titulo">{t("La fase en metros")}<small>{t("al empezar")}</small></h3>
    <div className="inspector-tarjeta abp-medidas">
      <table>
        <thead>
          <tr>
            <th scope="col"><span className="abp-solo-lector">{t("Medida")}</span></th>
            <th scope="col"><i style={{ background: colores.local }} />{t("Nosotros")}</th>
            <th scope="col"><i style={{ background: colores.rival }} />{t("Ellos")}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => <tr key={f.nombre} title={f.ayuda}>
            <th scope="row">{f.nombre}</th>
            <td>{nuestras ? f.valor(nuestras) : "—"}</td>
            <td>{suyas ? f.valor(suyas) : "—"}</td>
          </tr>)}
        </tbody>
      </table>
      <div className="abp-medidas-acciones">
        <button type="button" disabled={!nuestras} onClick={() => nuestras && dibujar(nuestras)}>{t("Dibujar las nuestras")}</button>
        <button type="button" disabled={!suyas} onClick={() => suyas && dibujar(suyas)}>{t("Dibujar las suyas")}</button>
      </div>
    </div>
    <div className="inspector-tarjeta abp-medidas abp-superioridades">
      <TablaDeZonas titulo={t("Por tercios")} zonas={tercios} colores={colores} />
      <TablaDeZonas titulo={t("Por carriles")} zonas={carriles} colores={colores} />
    </div>
    <p className="inspector-pie">{t("Sin porteros. Los tercios y los carriles, vistos desde nuestro equipo; en verde, donde tenemos uno o más de más.")}</p>
  </section>;
}

function TablaDeZonas({ titulo, zonas, colores }: { titulo: string; zonas: Zona[]; colores: Record<Equipo, string> }) {
  return <table>
    <thead>
      <tr>
        <th scope="col">{titulo}</th>
        <th scope="col"><i style={{ background: colores.local }} /><span className="abp-solo-lector">{t("Nosotros")}</span></th>
        <th scope="col"><i style={{ background: colores.rival }} /><span className="abp-solo-lector">{t("Ellos")}</span></th>
      </tr>
    </thead>
    <tbody>
      {zonas.map((z) => {
        const diferencia = z.local - z.rival;
        return <tr key={z.id} data-ventaja={diferencia > 0 ? "nuestra" : diferencia < 0 ? "suya" : "igual"}>
          <th scope="row">{t(z.nombre)}</th>
          <td>{z.local}</td>
          <td>{z.rival}</td>
        </tr>;
      })}
    </tbody>
  </table>;
}
