"use client";

import { useEffect, useMemo, useState } from "react";
import { buildPlayerReport, type DataRow } from "@/lib/scouting";
import { t, tf } from "@/lib/i18n";
import { OnceIdeal } from "./OnceIdeal";
import {
  CLAVE_CLUBES_EXCLUIDOS,
  CLAVE_ESCUDOS,
  CLAVE_LIGAS_MANUALES,
  FECHA_RATINGS_RESPALDO,
  LIGAS_MALDONADO,
  ORDEN_MALDONADO,
  RATINGS_RESPALDO,
  armarOnce,
  claveMemoriaArchivo,
  compararFotos,
  construirFoto,
  detectarLiga,
  detectarLigaConMemoria,
  factoresDeLiga,
  indiceAjustado,
  ligaPorId,
  ligasSinRating,
  mesActual,
  puestoMaldonado,
  ratingsDesdeOpta,
  type ComparacionFotos,
  type Ficha,
  type FotoMensual,
  type LigaId,
  type OptaLiga,
} from "@/lib/maldonado";
import { fetchOptaLeagueMeta, fetchSnapshot, fetchSnapshotList, saveSnapshot } from "@/lib/remoteData";

/**
 * Mesa de detección mensual.
 *
 * No es un informe de un jugador: es el paso anterior. Se cargan las ligas del
 * mes, se recorre la base entera y se levantan los perfiles cuyos números
 * llaman la atención, para pasarlos a identificación. Por eso ordena por
 * índice dentro de cada posición y marca al que destaca en algo concreto,
 * no al que es bueno en todo.
 *
 * El mapa de posiciones, la detección de liga, el once y la comparación entre
 * meses viven en lib/maldonado.ts: aquí solo se dibuja.
 */

type FichaBase = Omit<Ficha, "liga" | "ajustada">;

function numero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * localStorage se lee en un efecto y no durante el render: el servidor de Next
 * pinta este componente primero y allí no existe window; leerlo en el render
 * rompería la hidratación.
 */
function leerMapaGuardado(clave: string): Record<string, string> {
  try {
    const crudo = window.localStorage.getItem(clave);
    const valor = crudo ? JSON.parse(crudo) : {};
    return valor && typeof valor === "object" ? valor as Record<string, string> : {};
  } catch {
    return {};
  }
}

function guardarMapa(clave: string, valor: Record<string, string>) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Cuota llena o modo privado: la elección vale para esta sesión igual.
  }
}

function leerListaGuardada(clave: string): string[] {
  try {
    const crudo = window.localStorage.getItem(clave);
    const valor = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function guardarLista(clave: string, valor: string[]) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Cuota llena o modo privado: la elección vale para esta sesión igual.
  }
}

/** Un link directo de imagen sirve igual que un archivo subido: se guarda tal cual. */
function enlaceValido(valor: string) {
  return /^https?:\/\/\S+$/i.test(valor.trim());
}

/**
 * El escudo se guarda como data URI, así que viaja con el navegador y no
 * depende de ninguna URL externa. Se reescala antes: localStorage aguanta
 * unos 5 MB en total y un PNG de escudo a tamaño original se lo come.
 */
function leerEscudo(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error(t("No se pudo leer la imagen.")));
    lector.onload = () => {
      const imagen = new Image();
      imagen.onload = () => {
        const lado = 96;
        const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height, 1));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.max(1, Math.round(imagen.width * escala));
        lienzo.height = Math.max(1, Math.round(imagen.height * escala));
        const contexto = lienzo.getContext("2d");
        if (!contexto) return resolve(String(lector.result));
        contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
        resolve(lienzo.toDataURL("image/png"));
      };
      imagen.onerror = () => reject(new Error(t("No se pudo leer la imagen.")));
      imagen.src = String(lector.result);
    };
    lector.readAsDataURL(archivo);
  });
}

export function ScoutingBoard({ rows, minimumMinutes, onSelectPlayer }: {
  rows: DataRow[];
  minimumMinutes: number;
  onSelectPlayer?: (indice: number) => void;
}) {
  const [edadMax, setEdadMax] = useState(0);
  const [minutosMin, setMinutosMin] = useState(minimumMinutes);
  const [perfil, setPerfil] = useState("TODOS");
  const [soloJoven, setSoloJoven] = useState(false);
  const [ligaFiltro, setLigaFiltro] = useState("TODAS");
  const [ligasManuales, setLigasManuales] = useState<Record<string, string>>({});
  const [escudos, setEscudos] = useState<Record<string, string>>({});
  const [enlacesEscudo, setEnlacesEscudo] = useState<Record<string, string>>({});
  const [clubesExcluidos, setClubesExcluidos] = useState<string[]>([]);
  const [clubParaExcluir, setClubParaExcluir] = useState("");
  const [optaMeta, setOptaMeta] = useState<OptaLiga[] | null>(null);
  const [optaEstado, setOptaEstado] = useState<"cargando" | "vivo" | "respaldo">("cargando");
  const [vistaOnce, setVistaOnce] = useState<"liga" | "combinado">("liga");
  const [mes, setMes] = useState(mesActual());
  const [fotosPrevias, setFotosPrevias] = useState<Record<string, FotoMensual>>({});
  const [estadoFoto, setEstadoFoto] = useState("");

  useEffect(() => {
    setLigasManuales(leerMapaGuardado(CLAVE_LIGAS_MANUALES));
    setEscudos(leerMapaGuardado(CLAVE_ESCUDOS));
    setClubesExcluidos(leerListaGuardada(CLAVE_CLUBES_EXCLUIDOS));
  }, []);

  // ---- 1. Detección de liga ------------------------------------------------
  // De qué archivo salió cada jugador lo dice la columna "Data sources", que
  // escribe aggregateDatasets al combinar las bases. Es la única traza de
  // origen que sobrevive a la fusión de filas.
  const fuentes = useMemo(() => {
    const vistas = new Set<string>();
    for (const fila of rows) {
      for (const nombre of String(fila["Data sources"] ?? "").split(",")) {
        const limpio = nombre.trim();
        if (limpio) vistas.add(limpio);
      }
    }
    return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const ligaDeFuente = useMemo(() => {
    const mapa: Record<string, LigaId | ""> = {};
    for (const fuente of fuentes) mapa[fuente] = detectarLigaConMemoria(fuente, ligasManuales) ?? "";
    return mapa;
  }, [fuentes, ligasManuales]);

  const sinReconocer = fuentes.filter((fuente) => !ligaDeFuente[fuente]);

  function elegirLigaManual(fuente: string, liga: string) {
    // Se recuerda por el nombre del archivo sin fechas ni números, para que la
    // elección siga valiendo cuando el mismo archivo vuelva el mes que viene.
    const siguiente = { ...ligasManuales };
    if (liga) siguiente[claveMemoriaArchivo(fuente)] = liga;
    else delete siguiente[claveMemoriaArchivo(fuente)];
    setLigasManuales(siguiente);
    guardarMapa(CLAVE_LIGAS_MANUALES, siguiente);
  }

  // ---- 2. Fichas -----------------------------------------------------------
  // El índice es caro de calcular (recorre la cohorte entera por jugador), así
  // que se separa de lo que sí cambia seguido: liga, descuento y filtros.
  const fichasBase = useMemo(() => {
    const salida: FichaBase[] = [];
    for (let indice = 0; indice < rows.length; indice += 1) {
      const informe = buildPlayerReport(rows, indice, minutosMin, "AUTO");
      if (!informe || informe.metrics.length < 4) continue;
      const minutos = numero(rows[indice]["Minutes played"]);
      if (Number.isFinite(minutos) && minutos < minutosMin) continue;
      salida.push({
        indice,
        jugador: informe.player,
        equipo: informe.team,
        edad: numero(rows[indice].Age),
        minutos: Number.isFinite(minutos) ? minutos : 0,
        perfil: informe.cohort,
        puesto: puestoMaldonado(rows[indice].Position) || informe.cohort,
        puntuacion: informe.score,
        // Lo que llama la atención: no el que es correcto en todo, sino el que
        // sobresale en algo. Un P90 aislado es una señal de scouting.
        destacadas: informe.metrics.filter((m) => m.percentile >= 88).sort((a, b) => b.percentile - a.percentile).slice(0, 3),
        fila: indice,
      });
    }
    return salida;
  }, [rows, minutosMin]);

  // ---- 3. Ratings de liga (Opta Power Rankings) ----------------------------
  useEffect(() => {
    let montado = true;
    void fetchOptaLeagueMeta().then((meta) => {
      if (!montado) return;
      if (meta) {
        setOptaMeta(meta);
        setOptaEstado("vivo");
      } else {
        // Sin feed se usa la copia fechada del repositorio y se dice en
        // pantalla; lo que no se hace nunca es inventar un rating.
        setOptaEstado("respaldo");
      }
    });
    return () => { montado = false; };
  }, []);

  const ratings = useMemo(() => {
    if (optaMeta) return ratingsDesdeOpta(optaMeta);
    const respaldo: Record<string, number | null> = {};
    for (const liga of LIGAS_MALDONADO) respaldo[liga.id] = RATINGS_RESPALDO[liga.id] ?? null;
    return respaldo;
  }, [optaMeta]);

  const ligasClave = useMemo(() => {
    const presentes = new Set<string>();
    for (const ficha of fichasBase) {
      const liga = ligaDeFilaDe(rows[ficha.indice], ligaDeFuente);
      if (liga) presentes.add(liga);
    }
    // Se ordenan por el orden declarado de las ligas, no por el de aparición.
    return LIGAS_MALDONADO.filter((liga) => presentes.has(liga.id)).map((liga) => liga.id).join("|");
  }, [fichasBase, rows, ligaDeFuente]);
  const ligasPresentes = useMemo(() => (ligasClave ? ligasClave.split("|") : []), [ligasClave]);

  const factores = useMemo(() => factoresDeLiga(ratings, ligasPresentes), [ratings, ligasPresentes]);
  const sinRating = useMemo(() => ligasSinRating(ratings, ligasPresentes), [ratings, ligasPresentes]);

  const fichas = useMemo<Ficha[]>(() => fichasBase.map((ficha) => {
    const liga = ligaDeFilaDe(rows[ficha.indice], ligaDeFuente);
    return { ...ficha, liga, ajustada: indiceAjustado(ficha.puntuacion, factores[liga]) };
  }), [fichasBase, rows, ligaDeFuente, factores]);

  // ---- 4. Filtros ----------------------------------------------------------
  /**
   * Clubes de la carga, para el desplegable de exclusión. Sale de `fichas`
   * (antes de aplicar la propia exclusión) para que un club ya excluido siga
   * disponible y se pueda volver a considerar sin perderlo de vista.
   */
  const clubesDisponibles = useMemo(
    () => [...new Set(fichas.map((f) => f.equipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [fichas],
  );

  function excluirClub(club: string) {
    if (!club || clubesExcluidos.includes(club)) return;
    const siguiente = [...clubesExcluidos, club].sort((a, b) => a.localeCompare(b, "es"));
    setClubesExcluidos(siguiente);
    guardarLista(CLAVE_CLUBES_EXCLUIDOS, siguiente);
  }

  function reincluirClub(club: string) {
    const siguiente = clubesExcluidos.filter((c) => c !== club);
    setClubesExcluidos(siguiente);
    guardarLista(CLAVE_CLUBES_EXCLUIDOS, siguiente);
  }

  /** Todo menos el filtro de puesto: es la base del once y del contexto. */
  const elegibles = useMemo(() => {
    let lista = fichas;
    if (ligaFiltro === "SIN") lista = lista.filter((f) => !f.liga);
    else if (ligaFiltro !== "TODAS") lista = lista.filter((f) => f.liga === ligaFiltro);
    if (clubesExcluidos.length) lista = lista.filter((f) => !clubesExcluidos.includes(f.equipo));
    if (edadMax > 0) lista = lista.filter((f) => Number.isFinite(f.edad) && f.edad <= edadMax);
    if (soloJoven) lista = lista.filter((f) => Number.isFinite(f.edad) && f.edad <= 23);
    return lista;
  }, [fichas, ligaFiltro, clubesExcluidos, edadMax, soloJoven]);

  const visibles = useMemo(() => {
    const lista = perfil === "TODOS" ? elegibles : elegibles.filter((f) => f.puesto === perfil);
    return [...lista].sort((a, b) => b.puntuacion - a.puntuacion);
  }, [elegibles, perfil]);

  /**
   * Lectura de equipo. El encargo pide entender el rendimiento del club antes
   * de bajar al jugador, y con razón: un delantero con índice 70 en el peor
   * ataque de la liga no es el mismo jugador que uno con 70 en el mejor.
   *
   * Se resume cada club por la mediana del índice de su plantilla —no la
   * media, que un solo crack distorsiona— y se marca en qué destaca y en qué
   * flojea respecto al resto de la liga.
   */
  const equipos = useMemo(() => {
    const porClub = new Map<string, Ficha[]>();
    for (const ficha of elegibles) {
      if (!ficha.equipo) continue;
      porClub.set(ficha.equipo, [...(porClub.get(ficha.equipo) ?? []), ficha]);
    }
    const lista = [...porClub.entries()]
      .filter(([, plantilla]) => plantilla.length >= 6)
      .map(([club, plantilla]) => ({
        club,
        jugadores: plantilla.length,
        indice: mediana(plantilla.map((f) => f.puntuacion)),
        // Cuántos de su plantilla sobresalen en algo: mide profundidad, no una estrella.
        destacados: plantilla.filter((f) => f.destacadas.length > 0).length,
        mejor: [...plantilla].sort((a, b) => b.puntuacion - a.puntuacion)[0],
        edad: mediana(plantilla.map((f) => f.edad).filter(Number.isFinite)),
      }))
      .sort((a, b) => b.indice - a.indice);
    return lista;
  }, [elegibles]);

  const porPerfil = useMemo(() => {
    const mapa = new Map<string, Ficha[]>();
    for (const ficha of visibles) mapa.set(ficha.puesto, [...(mapa.get(ficha.puesto) ?? []), ficha]);
    return mapa;
  }, [visibles]);

  // ---- 5. Once ideal -------------------------------------------------------
  /**
   * Un once por liga y otro con todas juntas. Si la carga no trae ninguna de
   * las seis ligas reconocidas (por ejemplo, una base de otra competición), se
   * arma igual un once con toda la base: la mesa sigue sirviendo.
   */
  const gruposOnce = useMemo(() => {
    const ligasDelFiltro = ligaFiltro === "TODAS" || ligaFiltro === "SIN"
      ? ligasPresentes
      : ligasPresentes.filter((liga) => liga === ligaFiltro);
    if (!ligasDelFiltro.length) {
      return [{ id: "", nombre: t("Base cargada"), fichas: elegibles }];
    }
    return ligasDelFiltro.map((liga) => ({
      id: liga,
      nombre: ligaPorId(liga)?.nombre ?? liga,
      fichas: elegibles.filter((ficha) => ficha.liga === liga),
    }));
  }, [ligasPresentes, ligaFiltro, elegibles]);

  /**
   * En el combinado solo entran los jugadores de una liga reconocida: sin liga
   * no hay rating con el que descontar, y colarlos sin descuento equivale a
   * tratarlos como si jugaran en la mejor liga de la carga, que es justo lo
   * que el descuento existe para evitar.
   *
   * Excepción: si no se reconoció ninguna liga, el combinado usa la base
   * entera. Vale más un once sin descontar que una pantalla vacía, y la
   * cabecera dice que no hay descuento aplicado.
   */
  const fichasCombinado = useMemo(
    () => (ligasPresentes.length ? elegibles.filter((ficha) => ficha.liga) : elegibles),
    [elegibles, ligasPresentes],
  );
  const fueraDelCombinado = elegibles.length - fichasCombinado.length;
  const onceCombinado = useMemo(() => armarOnce(fichasCombinado, 3, true), [fichasCombinado]);

  // ---- 6. Fotos mensuales --------------------------------------------------
  const ligasParaFoto = useMemo(
    () => (ligasPresentes.length ? ligasPresentes : []),
    [ligasPresentes],
  );

  useEffect(() => {
    let montado = true;
    void (async () => {
      const salida: Record<string, FotoMensual> = {};
      for (const liga of ligasParaFoto) {
        const lista = await fetchSnapshotList(liga);
        // La foto anterior es la más reciente de un mes distinto al actual:
        // volver a guardar el mes en curso no debe borrar la referencia.
        const previa = lista.find((foto) => foto.mes && foto.mes < mes);
        if (!previa) continue;
        const foto = await fetchSnapshot(liga, previa.mes);
        if (foto) salida[liga] = foto;
      }
      if (montado) setFotosPrevias(salida);
    })();
    return () => { montado = false; };
  }, [ligasParaFoto, mes]);

  const comparaciones = useMemo(() => {
    const salida: Array<{ liga: string; nombre: string; previa: FotoMensual; diff: ComparacionFotos }> = [];
    for (const grupo of gruposOnce) {
      const previa = fotosPrevias[grupo.id];
      if (!grupo.id || !previa) continue;
      const actual = construirFoto({
        mes, liga: grupo.id, ligaNombre: grupo.nombre, minutosMin,
        fichas: fichas.filter((ficha) => ficha.liga === grupo.id),
      });
      salida.push({ liga: grupo.id, nombre: grupo.nombre, previa, diff: compararFotos(previa, actual) });
    }
    return salida;
  }, [gruposOnce, fotosPrevias, fichas, mes, minutosMin]);

  async function guardarFotoDelMes() {
    setEstadoFoto(t("Guardando la foto del mes…"));
    try {
      let guardadas = 0;
      for (const liga of ligasParaFoto) {
        const propias = fichas.filter((ficha) => ficha.liga === liga);
        if (!propias.length) continue;
        await saveSnapshot(construirFoto({
          mes, liga, ligaNombre: ligaPorId(liga)?.nombre ?? liga, minutosMin, fichas: propias,
        }));
        guardadas += 1;
      }
      setEstadoFoto(guardadas
        ? tf("{n} foto(s) guardadas en ~/.fos-scouting/snapshots/ · mes {m}", { n: guardadas, m: mes })
        : t("Ninguna liga reconocida en la carga: no hay nada que guardar."));
    } catch (error) {
      setEstadoFoto(error instanceof Error ? error.message : String(error));
    }
  }

  async function subirEscudo(liga: string, archivo: File | undefined) {
    if (!archivo) return;
    try {
      const dataUri = await leerEscudo(archivo);
      const siguiente = { ...escudos, [liga]: dataUri };
      setEscudos(siguiente);
      guardarMapa(CLAVE_ESCUDOS, siguiente);
    } catch (error) {
      setEstadoFoto(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Alternativa al archivo: pegar el link de la imagen (por ejemplo, un
   * resultado de Google Images). Se guarda el link tal cual, igual que el
   * logo del destinatario en el reporte: no hace falta bajarlo a data URI
   * para mostrarlo o imprimirlo.
   */
  function pegarEscudo(liga: string, valor: string) {
    setEnlacesEscudo((anterior) => ({ ...anterior, [liga]: valor }));
    const limpio = valor.trim();
    if (!enlaceValido(limpio)) return;
    const siguiente = { ...escudos, [liga]: limpio };
    setEscudos(siguiente);
    guardarMapa(CLAVE_ESCUDOS, siguiente);
  }

  const etiquetaOpta = optaEstado === "vivo"
    ? t("Ratings en vivo de Opta Power Rankings")
    : optaEstado === "cargando"
      ? t("Leyendo Opta Power Rankings…")
      : tf("Sin conexión con Opta: se usa la copia del {f}", { f: FECHA_RATINGS_RESPALDO });

  return <section className="scouting-board">
    <header>
      <div>
        <span>{t("MESA DE DETECCIÓN")}</span>
        <h2>{t("Perfiles que llaman la atención")}</h2>
        <p>{t("Recorre la base entera, ordena cada posición por índice global y marca en qué destaca cada jugador. El paso previo a identificación, no el informe.")}</p>
      </div>
      <b>{tf("{n} jugadores", { n: visibles.length })}</b>
    </header>

    <div className="board-filters">
      <label><span>{t("Liga")}</span>
        <select value={ligaFiltro} onChange={(event) => setLigaFiltro(event.target.value)}>
          <option value="TODAS">{t("Todas")}</option>
          {ligasPresentes.map((liga) => (
            <option key={liga} value={liga}>{ligaPorId(liga)?.nombre ?? liga}</option>
          ))}
          {fichas.some((ficha) => !ficha.liga) && <option value="SIN">{t("Sin liga reconocida")}</option>}
        </select>
      </label>
      <label><span>{t("Perfil")}</span>
        <select value={perfil} onChange={(event) => setPerfil(event.target.value)}>
          <option value="TODOS">{t("Todos")}</option>
          {ORDEN_MALDONADO.map((puesto) => <option key={puesto} value={puesto}>{puesto}</option>)}
        </select>
      </label>
      <label><span>{t("Mín. minutos")}</span>
        <input type="number" min="0" step="100" value={minutosMin} onChange={(event) => setMinutosMin(Number(event.target.value))} />
      </label>
      <label><span>{t("Edad máxima")}</span>
        <input type="number" min="0" max="45" value={edadMax || ""} placeholder="—" onChange={(event) => setEdadMax(Number(event.target.value))} />
      </label>
      <button type="button" className={soloJoven ? "on" : ""} onClick={() => setSoloJoven(!soloJoven)}>{t("Solo sub-23")}</button>
      <label><span>{t("Excluir club")}</span>
        <select
          value={clubParaExcluir}
          onChange={(event) => {
            excluirClub(event.target.value);
            setClubParaExcluir("");
          }}
        >
          <option value="">{t("+ Elegir club")}</option>
          {clubesDisponibles.filter((club) => !clubesExcluidos.includes(club)).map((club) => (
            <option key={club} value={club}>{club}</option>
          ))}
        </select>
      </label>
    </div>

    {clubesExcluidos.length > 0 && <div className="board-excluidos">
      <span>{t("Clubes excluidos")}</span>
      {clubesExcluidos.map((club) => (
        <button key={club} type="button" onClick={() => reincluirClub(club)} title={tf("Volver a considerar a {club}", { club })}>
          {club} <i>×</i>
        </button>
      ))}
    </div>}

    {/* ---- Ligas del mes: detección, corrección manual y escudos ---- */}
    {fuentes.length > 0 && <div className="board-ligas">
      <h3>{t("Ligas del mes")} <i>{fuentes.length}</i></h3>
      <p>{t("Cada archivo se reconoce por palabras clave de su nombre. Si alguno no se reconoce, elige su liga: la elección queda guardada para el mes siguiente aunque el archivo cambie de fecha.")}</p>
      <table>
        <thead><tr><th>{t("Archivo")}</th><th>{t("Liga")}</th><th>{t("Cómo se reconoció")}</th></tr></thead>
        <tbody>
          {fuentes.map((fuente) => {
            const automatica = detectarLiga(fuente);
            const asignada = ligaDeFuente[fuente];
            return <tr key={fuente} className={asignada ? "" : "pendiente"}>
              <td className="board-name">{fuente}</td>
              <td>
                <select value={asignada} onChange={(event) => elegirLigaManual(fuente, event.target.value)}>
                  <option value="">{t("— Elige una liga —")}</option>
                  {LIGAS_MALDONADO.map((liga) => <option key={liga.id} value={liga.id}>{liga.nombre}</option>)}
                </select>
              </td>
              <td className="board-como">
                {automatica
                  ? t("Por el nombre del archivo")
                  : asignada ? t("Elección recordada") : <b>{t("No reconocida: elígela a la izquierda")}</b>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      {sinReconocer.length > 0 && <p className="board-aviso">
        {tf("{n} archivo(s) sin liga: sus jugadores quedan fuera de los onces hasta que les asignes una.", { n: sinReconocer.length })}
      </p>}

      {ligasPresentes.length > 0 && <div className="board-escudos">
        {ligasPresentes.map((liga) => {
          const rating = ratings[liga];
          return <div key={liga} className="board-escudo">
            {escudos[liga]
              ? <img src={escudos[liga]} alt="" />
              : <span className="board-escudo-vacio">{(ligaPorId(liga)?.nombre ?? liga).slice(0, 2).toUpperCase()}</span>}
            <div>
              <b>{ligaPorId(liga)?.nombre ?? liga}</b>
              <small>{Number.isFinite(rating as number) && rating
                ? tf("Opta {r}", { r: (rating as number).toFixed(1) })
                : t("Sin rating en Opta")}</small>
            </div>
            <div className="board-escudo-acciones">
              <label className="board-escudo-subir">
                {escudos[liga] ? t("Cambiar") : t("Subir escudo")}
                <input type="file" accept="image/*" onChange={(event) => void subirEscudo(liga, event.target.files?.[0])} />
              </label>
              <input
                type="url"
                className="board-escudo-link"
                placeholder={t("o pega un link https://…")}
                value={enlacesEscudo[liga] ?? ""}
                onChange={(event) => pegarEscudo(liga, event.target.value)}
              />
              {Boolean(enlacesEscudo[liga]) && !enlaceValido(enlacesEscudo[liga]) && (
                <small className="board-escudo-link-aviso">{t("Pega un link directo http:// o https://.")}</small>
              )}
            </div>
          </div>;
        })}
      </div>}
      <p className="board-opta">{etiquetaOpta}</p>
    </div>}

    {/* ---- Once ideal ---- */}
    {elegibles.length > 0 && <div className="board-once">
      <h3>{t("Once ideal · 4-1-2-1-2")} <i>{vistaOnce === "liga" ? gruposOnce.length : 1}</i></h3>
      <p>{t("Dos o tres candidatos por puesto, ordenados por el índice de percentiles. Los centrales y los delanteros se reparten su grupo por turnos para que nadie ocupe dos huecos.")}</p>
      <div className="board-once-tabs">
        <button type="button" className={vistaOnce === "liga" ? "on" : ""} onClick={() => setVistaOnce("liga")}>{t("Un once por liga")}</button>
        <button type="button" className={vistaOnce === "combinado" ? "on" : ""} onClick={() => setVistaOnce("combinado")}>{t("Combinado con descuento")}</button>
      </div>

      {vistaOnce === "combinado" && <div className="board-descuento">
        <p>{t("El índice se descuenta por nivel de liga con el rating medio de Opta Power Rankings: la mejor liga cargada vale 1 y el resto baja en proporción. Un 70 en Primera B no es un 70 en Primera División.")}</p>
        <ul>
          {ligasPresentes.map((liga) => (
            <li key={liga}>
              <b>{ligaPorId(liga)?.nombre ?? liga}</b>
              {factores[liga]
                ? <span>{tf("×{f}", { f: factores[liga].toFixed(3) })}</span>
                : <em>{t("sin rating: entra sin descuento")}</em>}
            </li>
          ))}
        </ul>
        {sinRating.length > 0 && <p className="board-aviso">
          {tf("Opta Power Rankings no publica: {ligas}. Sus jugadores aparecen con el índice sin descontar y no son comparables con el resto.", {
            ligas: sinRating.map((liga) => ligaPorId(liga)?.nombre ?? liga).join(", "),
          })}
        </p>}
        {fueraDelCombinado > 0 && <p className="board-aviso">
          {tf("{n} jugadores quedan fuera del combinado por venir de un archivo sin liga asignada: sin liga no hay descuento posible. Asígnale su liga arriba para incluirlos.", { n: fueraDelCombinado })}
        </p>}
      </div>}

      <div className="board-onces">
        {vistaOnce === "combinado"
          ? <OnceIdeal
            once={onceCombinado}
            titulo={t("Combinado de todas las ligas")}
            subtitulo={ligasPresentes.length
              ? tf("{n} jugadores · índice descontado por liga", { n: fichasCombinado.length })
              : tf("{n} jugadores · sin liga reconocida, no hay descuento", { n: fichasCombinado.length })}
            usarAjustada
            onSelectPlayer={onSelectPlayer}
          />
          : gruposOnce.map((grupo) => (
            <OnceIdeal
              key={grupo.id || "base"}
              once={armarOnce(grupo.fichas, 3, false)}
              titulo={grupo.nombre}
              subtitulo={tf("{n} jugadores · índice sin descontar", { n: grupo.fichas.length })}
              escudo={escudos[grupo.id]}
              usarAjustada={false}
              onSelectPlayer={onSelectPlayer}
            />
          ))}
      </div>
    </div>}

    {/* ---- Foto del mes y variación ---- */}
    {ligasPresentes.length > 0 && <div className="board-fotos">
      <h3>{t("Foto del mes y variación")} <i>{comparaciones.length}</i></h3>
      <p>{t("La foto se guarda en el servidor local (~/.fos-scouting/snapshots), nunca en el repositorio: los datos de Wyscout están bajo licencia. Al cargar la base del mes siguiente se compara sola contra la anterior.")}</p>
      <div className="board-fotos-acciones">
        <label><span>{t("Mes")}</span>
          <input type="month" value={mes} onChange={(event) => setMes(event.target.value || mesActual())} />
        </label>
        <button type="button" onClick={() => void guardarFotoDelMes()}>{t("Guardar foto del mes")}</button>
        {estadoFoto && <small>{estadoFoto}</small>}
      </div>

      {!comparaciones.length && <p className="board-aviso">
        {t("Todavía no hay una foto anterior de estas ligas. Guarda la de este mes y el mes que viene aparecerá aquí quién sube y quién baja.")}
      </p>}

      {comparaciones.map(({ liga, nombre, previa, diff }) => (
        <div key={liga} className="board-variacion">
          <h4>
            {escudos[liga] && <img src={escudos[liga]} alt="" />}
            {nombre}
            <span>{tf("{a} → {b}", { a: previa.mes, b: mes })}</span>
          </h4>
          <div className="board-variacion-cols">
            <div>
              <h5>{tf("Suben ({n})", { n: diff.suben.length })}</h5>
              {diff.suben.slice(0, 8).map((v) => (
                <p key={`${v.nombre}-${v.club}`}>
                  <b>{v.nombre}</b> <em>{v.club}</em>
                  <u className="sube">{v.anterior} → {v.indice} (+{v.delta})</u>
                </p>
              ))}
              {!diff.suben.length && <p className="board-vacio">{t("Nadie sube más de 3 puntos.")}</p>}
            </div>
            <div>
              <h5>{tf("Bajan ({n})", { n: diff.bajan.length })}</h5>
              {diff.bajan.slice(0, 8).map((v) => (
                <p key={`${v.nombre}-${v.club}`}>
                  <b>{v.nombre}</b> <em>{v.club}</em>
                  <u className="baja">{v.anterior} → {v.indice} ({v.delta})</u>
                </p>
              ))}
              {!diff.bajan.length && <p className="board-vacio">{t("Nadie baja más de 3 puntos.")}</p>}
            </div>
            <div>
              <h5>{tf("Aparecen ({n})", { n: diff.nuevos.length })}</h5>
              {diff.nuevos.slice(0, 8).map((j) => (
                <p key={`${j.nombre}-${j.club}`}>
                  <b>{j.nombre}</b> <em>{j.club}</em>
                  <u className="nuevo">{j.indice}</u>
                </p>
              ))}
              {!diff.nuevos.length && <p className="board-vacio">{t("Ningún jugador nuevo respecto al mes anterior.")}</p>}
            </div>
          </div>
          <small>{tf("{e} jugadores estables (±3) · {s} ya no aparecen en la base", { e: diff.estables, s: diff.salen.length })}</small>
        </div>
      ))}
    </div>}

    {equipos.length >= 2 && <div className="board-teams">
      <h3>{t("Contexto de los equipos")} <i>{equipos.length}</i></h3>
      <p>{t("Mediana del índice de cada plantilla, no la media: un solo crack no debe levantar a un equipo entero. Un jugador destacado en un club de la parte baja tiene más mérito que el mismo número arriba.")}</p>
      <table>
        <thead><tr>
          <th>#</th><th>{t("Equipo")}</th><th>{t("Jugadores")}</th><th>{t("Edad")}</th>
          <th>{t("Índice")}</th><th>{t("Destacados")}</th><th>{t("Mejor del plantel")}</th>
        </tr></thead>
        <tbody>
          {equipos.map((equipo, posicion) => (
            <tr key={equipo.club}>
              <td>{posicion + 1}</td>
              <td className="board-name">{equipo.club}</td>
              <td>{equipo.jugadores}</td>
              <td>{equipo.edad || "—"}</td>
              <td><b>{equipo.indice}</b></td>
              <td>{equipo.destacados}</td>
              <td className="board-best">{equipo.mejor?.jugador} <u>{equipo.mejor?.puntuacion}</u></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>}

    {[...porPerfil.entries()]
      .sort((a, b) => (ORDEN_MALDONADO.indexOf(a[0]) + 99) % 199 - (ORDEN_MALDONADO.indexOf(b[0]) + 99) % 199)
      .map(([id, lista]) => (
      <div key={id} className="board-group">
        <h3>{id} <i>{lista.length}</i></h3>
        <table>
          <thead><tr>
            <th>#</th><th>{t("Jugador")}</th><th>{t("Equipo")}</th>
            <th>{t("Edad")}</th><th>{t("Min")}</th><th>{t("Índice")}</th><th>{t("Destaca en")}</th>
          </tr></thead>
          <tbody>
            {lista.slice(0, 15).map((ficha, posicion) => (
              <tr key={ficha.indice} onClick={() => onSelectPlayer?.(ficha.fila)} className={onSelectPlayer ? "clicable" : ""}>
                <td>{posicion + 1}</td>
                <td className="board-name">{ficha.jugador}</td>
                <td>{ficha.equipo}</td>
                <td>{Number.isFinite(ficha.edad) ? ficha.edad : "—"}</td>
                <td>{ficha.minutos ? Math.round(ficha.minutos) : "—"}</td>
                <td><b>{ficha.puntuacion}</b></td>
                <td className="board-flags">
                  {ficha.destacadas.length
                    ? ficha.destacadas.map((m) => <em key={m.label}>{t(m.label)} <u>P{m.percentile}</u></em>)
                    : <span>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))}

    {!visibles.length && <p className="board-empty">{t("Ningún jugador pasa esos filtros. Baja el mínimo de minutos o quita el tope de edad.")}</p>}
  </section>;
}

/** De qué liga es la fila: la primera fuente reconocida de su columna de origen. */
function ligaDeFilaDe(fila: DataRow | undefined, ligaDeFuente: Record<string, LigaId | "">): LigaId | "" {
  if (!fila) return "";
  for (const nombre of String(fila["Data sources"] ?? "").split(",")) {
    const liga = ligaDeFuente[nombre.trim()];
    if (liga) return liga;
  }
  return "";
}

function mediana(valores: number[]) {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2);
}
