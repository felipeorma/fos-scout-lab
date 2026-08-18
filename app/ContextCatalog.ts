/**
 * Un gráfico por artículo de SkillCorner.
 *
 * Cada entrada declara qué columnas necesita; si la base cargada no las trae
 * —porque la liga no tiene game intelligence, o porque solo hay Wyscout— la
 * ficha simplemente no se dibuja. Así la página se adapta a lo que haya sin
 * ramas especiales por fuente.
 *
 * Los nombres de columna están verificados contra la API de SkillCorner, no
 * inferidos de los artículos: varios de los que proponen los textos no existen.
 */

export type FichaContexto = {
  id: string;
  articulo: string;
  titulo: string;
  lectura: string;
  tipo: "cuadrante" | "ranking" | "zscores" | "swarm";
  /** Columnas necesarias; si falta alguna, la ficha no se ofrece. */
  requiere: string[];
  ejeX?: string;
  ejeY?: string;
  etiquetaX?: string;
  etiquetaY?: string;
  /** Para ranking y swarm. */
  campo?: string;
  unidad?: string;
  /** Para el bloque de z-scores. */
  campos?: Array<{ columna: string; etiqueta: string }>;
};

export const CATALOGO: FichaContexto[] = [
  {
    id: "primera-linea",
    articulo: "Passing options · primera línea de presión",
    titulo: "Opciones dentro y fuera de la estructura",
    lectura: "Ofrecerse por dentro de la estructura rival es romper líneas; por fuera es circular. El cruce dice si el jugador ayuda a progresar o solo a mover el balón.",
    tipo: "cuadrante",
    requiere: ["Options inside shape P30 (SC)", "Options outside shape P30 (SC)"],
    ejeX: "Options outside shape P30 (SC)",
    ejeY: "Options inside shape P30 (SC)",
    etiquetaX: "Opciones por fuera",
    etiquetaY: "Opciones por dentro",
  },
  {
    id: "espacio-reducido",
    articulo: "Tight space retained under intense pressure",
    titulo: "Exposición contra retención",
    lectura: "Cuántas veces recibe en espacio reducido bajo presión intensa, y qué proporción retiene. Volumen alto con retención baja es un jugador al que la liga le llega.",
    tipo: "cuadrante",
    requiere: ["Receptions under pressure P30 (SC)", "Retention under pressure % (SC)"],
    ejeX: "Receptions under pressure P30 (SC)",
    ejeY: "Retention under pressure % (SC)",
    etiquetaX: "Recepciones bajo presión",
    etiquetaY: "Retención %",
  },
  {
    id: "progresion-presion",
    articulo: "Progressive actions under intense pressure",
    titulo: "Progresar con el rival encima",
    lectura: "Recepciones bajo presión intensa contra las que acaba progresando. Separa a quien juega cómodo de quien resuelve incómodo.",
    tipo: "cuadrante",
    requiere: ["Receptions under pressure P30 (SC)", "Progressive under pressure P30 (SC)"],
    ejeX: "Receptions under pressure P30 (SC)",
    ejeY: "Progressive under pressure P30 (SC)",
    etiquetaX: "Recepciones bajo presión",
    etiquetaY: "Progresiones",
  },
  {
    id: "peligro-presion",
    articulo: "Dangerous action under intense pressure",
    titulo: "Crear peligro bajo presión",
    lectura: "Lo que de verdad decide si un fichaje sigue produciendo cuando le quitan tiempo y espacio.",
    tipo: "ranking",
    requiere: ["Dangerous under pressure P30 (SC)"],
    campo: "Dangerous under pressure P30 (SC)",
  },
  {
    id: "escapar-presion",
    articulo: "Escaped pressure",
    titulo: "Escapar de la presión",
    lectura: "Salir jugando de una situación ya comprometida. Es la métrica que más distingue a un mediocentro que puede jugar entre líneas.",
    tipo: "ranking",
    requiere: ["Escaped pressure P30 (SC)"],
    campo: "Escaped pressure P30 (SC)",
  },
  {
    id: "atraer-presion",
    articulo: "Drawing pressure",
    titulo: "Atraer presión y sobrevivir a ella",
    lectura: "Atraer rivales libera a un compañero, pero solo si retiene el balón. El cruce distingue al que genera espacio del que regala posesiones.",
    tipo: "cuadrante",
    requiere: ["Drawing pressure P30 (SC)", "Drawing pressure retained % (SC)"],
    ejeX: "Drawing pressure P30 (SC)",
    ejeY: "Drawing pressure retained % (SC)",
    etiquetaX: "Presión atraída",
    etiquetaY: "Retenida %",
  },
  {
    id: "centrales-salida",
    articulo: "Game intelligence · centrales en salida",
    titulo: "Romper líneas contra precisión bajo presión",
    lectura: "Un central que rompe líneas sin precisión bajo presión es un riesgo; uno preciso que nunca rompe no progresa. El cuadrante separa ambas cosas.",
    tipo: "cuadrante",
    requiere: ["Linebreak passes P30 (SC)", "Pressured pass % (SB)"],
    ejeX: "Linebreak passes P30 (SC)",
    ejeY: "Pressured pass % (SB)",
    etiquetaX: "Pases rompe-líneas",
    etiquetaY: "Precisión bajo presión %",
  },
  {
    id: "carreras-perfil",
    articulo: "Open data 4 · carreras sin balón",
    titulo: "Perfil de carreras sin balón",
    lectura: "Sin coordenadas no hay mapa sobre el campo, pero la mezcla de tipos de carrera sí define el movimiento: romper a la espalda, abrir el campo o dar apoyo.",
    tipo: "zscores",
    requiere: ["Runs in behind P30 (SC)", "Pulling wide runs P30 (SC)", "Overlap underlap runs P30 (SC)"],
    campos: [
      { columna: "Runs in behind P30 (SC)", etiqueta: "A la espalda" },
      { columna: "Dangerous runs behind P30 (SC)", etiqueta: "Peligrosas" },
      { columna: "Pulling wide runs P30 (SC)", etiqueta: "Abriendo el campo" },
      { columna: "Overlap underlap runs P30 (SC)", etiqueta: "Overlap y underlap" },
      { columna: "Off ball runs P30 (SC)", etiqueta: "Total sin balón" },
      { columna: "Runs received P30 (SC)", etiqueta: "Recibidas" },
    ],
  },
  {
    id: "arquetipo-delantero",
    articulo: "Striker archetypes · Open data 3",
    titulo: "Arquetipo: directo, asociativo o referencia",
    lectura: "No mide cuán bueno es, sino de qué tipo. Tres índices sobre la media de su posición: ruptura y velocidad, asociación y retención, y juego aéreo con remate.",
    tipo: "zscores",
    requiere: ["Runs in behind P30 (SC)"],
    campos: [
      { columna: "Runs in behind P30 (SC)", etiqueta: "Directo · ruptura" },
      { columna: "PSV-99 (SC)", etiqueta: "Directo · velocidad" },
      { columna: "Retention under pressure % (SC)", etiqueta: "Asociativo · retención" },
      { columna: "Passes to runs P30 (SC)", etiqueta: "Asociativo · pase a desmarque" },
      { columna: "Aerial win % (SB)", etiqueta: "Referencia · juego aéreo" },
      { columna: "Touches in box (SB)", etiqueta: "Referencia · toques en área" },
    ],
  },
  {
    id: "zscores-perfil",
    articulo: "Open data 2 · comparar con z-scores",
    titulo: "Perfil en desviaciones típicas",
    lectura: "El percentil comprime los extremos: un P99 puede estar pegado al P90 o muy por encima. El z-score muestra la distancia real a la media de su posición.",
    tipo: "zscores",
    requiere: [],
    campos: [],
  },
  {
    id: "ranking-liga",
    articulo: "Open data 1 · visualización de datos",
    titulo: "Su puesto en la liga",
    lectura: "El embudo empieza aquí: una liga entera ordenada por una métrica, con el jugador situado dentro y sus compañeros de club marcados.",
    tipo: "ranking",
    requiere: [],
    campo: "",
  },
];
