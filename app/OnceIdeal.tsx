"use client";

import { t, tf } from "@/lib/i18n";
import type { Ficha, HuecoOnce } from "@/lib/maldonado";

/**
 * El once de la mesa, dibujado a mano en SVG.
 *
 * Sin librería de campos: el dibujo son cuatro rectángulos y dos arcos, y
 * meter una dependencia nueva por eso obligaría a mantenerla, a cargarla en el
 * bundle y a pelearse con ella al exportar el PDF. El campo se dibuja con el
 * arco propio abajo y el ataque hacia arriba, que es como se lee una pizarra.
 */

const ANCHO = 300;
const ALTO = 400;
// La vista es algo mas alta que el campo: el arquero esta pegado a su linea
// de fondo y su etiqueta necesita ese margen para no quedar recortada.
const VISTA = ALTO + 18;

/** Nombre corto para el campo: el apellido es lo que se busca de un vistazo. */
export function nombreCorto(nombre: string) {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "—";
  if (partes.length === 1) return partes[0].slice(0, 14);
  const apellido = partes[partes.length - 1];
  // Un apellido corto cabe con la inicial delante; uno largo, solo.
  return apellido.length <= 10 ? `${partes[0][0]}. ${apellido}` : apellido.slice(0, 14);
}

function Campo() {
  const linea = "rgba(255,255,255,.16)";
  return <g fill="none" stroke={linea} strokeWidth={1}>
    <rect x={6} y={6} width={ANCHO - 12} height={ALTO - 12} rx={3} />
    <line x1={6} y1={ALTO / 2} x2={ANCHO - 6} y2={ALTO / 2} />
    <circle cx={ANCHO / 2} cy={ALTO / 2} r={38} />
    <circle cx={ANCHO / 2} cy={ALTO / 2} r={2} fill={linea} />
    {/* Área propia (abajo) y área rival (arriba) */}
    <rect x={ANCHO / 2 - 62} y={ALTO - 62} width={124} height={56} />
    <rect x={ANCHO / 2 - 28} y={ALTO - 28} width={56} height={22} />
    <rect x={ANCHO / 2 - 62} y={6} width={124} height={56} />
    <rect x={ANCHO / 2 - 28} y={6} width={56} height={22} />
    <path d={`M ${ANCHO / 2 - 22} ${ALTO - 62} A 26 26 0 0 1 ${ANCHO / 2 + 22} ${ALTO - 62}`} />
    <path d={`M ${ANCHO / 2 - 22} 62 A 26 26 0 0 0 ${ANCHO / 2 + 22} 62`} />
  </g>;
}

export function OnceIdeal({ once, titulo, subtitulo, escudo, usarAjustada, onSelectPlayer }: {
  once: HuecoOnce[];
  titulo: string;
  subtitulo: string;
  escudo?: string;
  /** En el combinado se ordena y se muestra el índice con descuento de liga. */
  usarAjustada: boolean;
  onSelectPlayer?: (fila: number) => void;
}) {
  const valor = (ficha: Ficha) => (usarAjustada ? ficha.ajustada : ficha.puntuacion);
  const titulares = once.filter((hueco) => hueco.candidatos.length).length;

  return <div className="once-card">
    <header className="once-head">
      <div>
        {escudo && <img src={escudo} alt="" className="once-escudo" />}
        <div>
          <h4>{titulo}</h4>
          <small>{subtitulo}</small>
        </div>
      </div>
      <b>{tf("{n}/11", { n: titulares })}</b>
    </header>

    <svg viewBox={`0 0 ${ANCHO} ${VISTA}`} className="once-campo" role="img" aria-label={t("Once ideal en 4-1-2-1-2")}>
      <defs>
        <linearGradient id="once-cesped" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e2028" />
          <stop offset="100%" stopColor="#0a161a" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={ANCHO} height={VISTA} rx={5} fill="url(#once-cesped)" />
      <Campo />
      {once.map(({ puesto, candidatos }) => {
        const x = (puesto.x / 100) * ANCHO;
        const y = (puesto.y / 100) * ALTO;
        const titular = candidatos[0];
        if (!titular) {
          return <g key={puesto.id} className="once-vacio">
            <circle cx={x} cy={y} r={13} fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.18)" strokeDasharray="3 3" />
            <text x={x} y={y + 3.5} textAnchor="middle" className="once-sigla-vacia">{puesto.sigla}</text>
            <text x={x} y={y + 26} textAnchor="middle" className="once-sin">{t("sin candidato")}</text>
          </g>;
        }
        return <g
          key={puesto.id}
          className={onSelectPlayer ? "once-slot clicable" : "once-slot"}
          onClick={() => onSelectPlayer?.(titular.fila)}
        >
          <circle cx={x} cy={y} r={13.5} fill="#0c1c22" stroke="#12c48b" strokeWidth={1.4} />
          <text x={x} y={y + 4} textAnchor="middle" className="once-indice">{valor(titular)}</text>
          <text x={x} y={y + 25} textAnchor="middle" className="once-nombre">{nombreCorto(titular.jugador)}</text>
          <text x={x} y={y + 33} textAnchor="middle" className="once-club">{titular.equipo.slice(0, 18)}</text>
        </g>;
      })}
    </svg>

    <div className="once-lista">
      <h5>{t("Candidatos por puesto")}</h5>
      <table>
        <tbody>
          {once.map(({ puesto, candidatos }) => (
            <tr key={puesto.id}>
              <th scope="row">{t(puesto.nombre)}</th>
              <td>
                {candidatos.length
                  ? candidatos.map((ficha, posicion) => (
                    <span
                      key={ficha.indice}
                      className={onSelectPlayer ? "once-cand clicable" : "once-cand"}
                      onClick={() => onSelectPlayer?.(ficha.fila)}
                    >
                      <i>{posicion + 1}</i>
                      {/* Nombre y club van en su propia caja para poder
                          recortarlos con puntos suspensivos: un nombre largo
                          no debe empujar el índice fuera de la tarjeta. */}
                      <b>{ficha.jugador}</b>
                      <em>{ficha.equipo}</em>
                      <u>{valor(ficha)}</u>
                    </span>
                  ))
                  : <span className="once-cand vacio">{t("Nadie de esta posición pasa el filtro de minutos.")}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}
