# FOS Scout Lab

Aplicación web personal para crear reportes de scouting a partir de archivos
Excel y consolidar entre una y tres bases con ponderaciones estadísticas.

La plataforma abre con una landing retrofuturista de scouting intelligence,
con accesos directos al creador de reportes y al consolidador de datos.

## Prerequisites

- Node.js `>=22.13.0`

## Uso local

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

Abre `http://localhost:3000` y entra a **Reportes**:

- **Reportes:** comienza eligiendo una base o combinando dos o más archivos;
  la combinación recibe un nombre temporal y después continúa directamente con
  jugador, Transfermarkt, imágenes y diseño.
- **Similitud:** usa la base activa para filtrar el listado completo por nombre,
  edad, minutos, un pasaporte principal o secundario y posición, y ordenar los jugadores más parecidos al
  perfil objetivo.

Las posiciones Wyscout se convierten en roles legibles —por ejemplo, `RWF` en
`Wingers`— sin perder el código original. Si una celda contiene varias
posiciones separadas por coma, la primera se considera principal y las demás se
muestran como segunda, tercera o sucesivas. El filtro por rol revisa todas las
posiciones del jugador, incluidas las secundarias.

## Similitud de jugadores

La primera versión crea un vector contextual local con los percentiles de las
métricas disponibles, calcula semejanza coseno y distancia normalizada, y añade
contexto de edad y posición. El resultado muestra la cobertura de datos y separa
la coincidencia estadística de la contextual para que el ranking sea explicable.

La comparación seleccionada se puede descargar como PNG o insertar directamente
como un bloque editable en la Página 2 del reporte. Esta arquitectura permite
incorporar después embeddings de vídeo, redes de pases, Transformers o Graph
Neural Networks cuando existan modelos y fuentes multimodales reales.

La comparación métrica a métrica sigue el mismo orden por categorías que el
radar —primero finalización, después creación, pase, defensa y físico— y cada
fila lleva un filete del color de su grupo, así que los bloques se distinguen
sin ocupar más alto de hoja.

La lámina de similitud comparte automáticamente la paleta activa del reporte e
incluye un radar superpuesto P0–P100, comparación métrica a métrica, firma de
Felipe y el nombre/logo del club destinatario. Cada uno de los dos jugadores
acepta su propio enlace de Transfermarkt para extraer foto, escudo, club, valor
de mercado y datos biográficos; la foto y el escudo también se pueden descargar
por separado.

El jugador objetivo se selecciona en dos pasos: primero el club y después el
jugador. Ambos selectores están ordenados alfabéticamente.

Antes de exportar la comparación se puede asignar un color independiente a cada
jugador mediante colores predefinidos o un selector personalizado. Los colores
se aplican al radar, las fichas, las barras de percentiles y el PNG final.

## Editor visual de páginas

Las páginas 2 y 3 del reporte incluyen un editor local con:

- el mismo sistema visual de la Página 01: paleta, tipografías, encabezados,
  numeración, formato de página y pie editorial (sin banda de título, para
  aprovechar el alto de la hoja);
- un tema compartido: cualquier cambio de paleta se aplica automáticamente a
  Ficha, Visuales y Observaciones;
- bloques nuevos que nacen a media hoja (6 de 12 columnas), no en tiras
  estrechas, y con los dos tiradores separados —el de alto abajo a la
  izquierda, el de ancho y alto en la esquina— para que ninguno tape al otro
  en bloques angostos;
- tamaño de letra por bloque, de 11 a 42 px, desde el panel;
- una rejilla editorial de 12 columnas: los anchos se eligen por fracciones
  (1/4, 1/3, 1/2, 2/3, 3/4, completo) o arrastrando, y siempre encajan en la
  rejilla, con guías visibles mientras se arrastra o se redimensiona;
- plantillas de una columna, mitades, destacado y mosaico de tercios;
- bloques de imagen y texto que se pueden agregar, eliminar y reordenar;
- comentarios independientes debajo o al lado de cualquier imagen cargada;
- arrastre de bloques y controles alternativos para moverlos;
- ancho y alto ajustables desde el panel o arrastrando la esquina; el ancho encaja en columnas y el alto en pasos de 10 px para conservar márgenes y alineación;
- temas de color y colores personalizados;
- tipografías, tamaño, color, negrita, cursiva y alineación para los textos;
- guardado automático del diseño en el navegador e impresión de la página activa.

Los Excel se procesan completamente en el navegador. No se suben a un servidor.

## Flujo del reporte

1. **Elegir la fuente:** usar un Excel individual o combinar dos o más Excel de
   ligas o temporadas. La combinación se activa automáticamente en el informe.
2. **Seleccionar jugador:** elegir primero el equipo y después el jugador.
   Ambos listados se muestran en orden alfabético.
3. **Completar perfil:** pegar la URL de Transfermarkt.
   La aplicación extrae dorsal, datos biográficos, valor de mercado, club, liga,
   escudo, logo de competición y retrato transparente. Los tres recursos visuales
   también se pueden reemplazar pegando un link directo o cargando archivos PNG,
   WEBP o JPG desde el ordenador. La vista previa y el informe se actualizan al
   aplicar cada fuente.
   La foto del jugador puede procesarse con IA para eliminar el fondo. Si el
   servidor local de rembg está corriendo (`npm run bg:server`), se usa el
   modelo BiRefNet portrait, de máxima calidad; si no, la app cae
   automáticamente al modelo `medium` de `@imgly/background-removal` en el
   navegador, con refinado de máscara para no recortar de más al jugador.
   Instalación del servidor (una sola vez):
   `python3.11 -m venv ~/.rembg-venv && ~/.rembg-venv/bin/pip install "rembg[cpu,cli]" fastapi uvicorn python-multipart`.
4. **Diseñar reporte:** revisar la ficha imprimible inspirada en
   `Radar Jordhy Thompson v2`, y editar las páginas de visuales y observaciones.
   La etiqueta “Base analizada” y el nombre de la liga o temporada también son
   editables desde el panel de datos.

Los datos extraídos y las personalizaciones del perfil se guardan localmente por
jugador en el navegador. Transfermarkt solo se consulta cuando el usuario pega
una URL y presiona el botón de extracción.

## Plataformas por API (StatsBomb / SkillCorner)

Además de los Excel de Wyscout, la app puede cargar temporadas completas desde
las APIs de StatsBomb y SkillCorner con el botón **Conectar API** (tercera
tarjeta del paso 01, o desde el panel de datos con un informe abierto).

- Los datos llegan a través del mismo servidor local del recorte de fondos
  (`npm run bg:server`, puerto 7001). Las credenciales viven **solo en esta
  máquina**: nunca se suben al repositorio ni viajan al navegador de terceros.
- **Enlace automático con SkillCorner:** al cargar cualquier base (Excel de
  Wyscout o StatsBomb por API), si hay credenciales de SkillCorner la app
  ofrece cruzar los datos físicos. Propone la competición más probable (por
  nombre, acrónimo tipo "CPL" y temporada del archivo), cruza los jugadores por
  nombre, club y edad, e informa cuántos quedaron enlazados. Las métricas
  físicas entran al radar como **porciones verdes ligeramente salidas del
  círculo**, para distinguir la fuente sin alterar el diseño del resto.
- Credenciales, en orden de prioridad: variables de entorno (`SB_USERNAME` /
  `SB_PASSWORD` para StatsBomb, `SKILLCORNER_USERNAME` / `SKILLCORNER_PASSWORD`
  para SkillCorner), **Llavero de macOS** (cifrado, recomendado) o el archivo
  `~/.fos-scouting/credentials.json`.

  Guardarlas en el Llavero (una sola vez, formato `usuario:contraseña`):

  ```bash
  security add-generic-password -U -s fos-scouting -a statsbomb -w 'usuario:contraseña'
  ```

  ```bash
  security add-generic-password -U -s fos-scouting -a skillcorner -w 'usuario:contraseña'
  ```

  Formato del archivo JSON (alternativa sin cifrar):

  ```json
  {
    "statsbomb": { "username": "...", "password": "..." },
    "skillcorner": { "username": "...", "password": "..." }
  }
  ```

- **La base siempre es Wyscout o StatsBomb.** SkillCorner no puede usarse como
  base: solo se añade encima como capa de *game intelligence* y físico, y nunca
  impone la identidad del jugador (club, posición y edad salen de la base, así
  que un club renombrado se muestra con su nombre vigente).
- Al mezclar plataformas el mismo jugador se consolida por nombre —incluye
  nombres abreviados tipo "T. Campbell" y variantes con segundo nombre, que se
  resuelven por fecha de nacimiento— exigiendo siempre club compatible. Los
  clubes se comparan tolerando las diferencias de escritura entre plataformas
  ("Vancouver FC" ≡ "Vancouver Football Club", "FC Supra" ≡ "FC Supra du
  Québec") y los rebrandings conocidos, sin confundir clubes distintos de una
  misma ciudad ("Inter Toronto FC" ≠ "Toronto FC").
- Minutos, partidos, goles y asistencias **no se duplican** entre proveedores
  que describen la misma temporada: se suman dentro de cada plataforma y se
  toma el máximo entre plataformas.
- Los listados de competiciones salen ordenados alfabéticamente por liga y, en
  cada liga, por temporada ascendente, en ambas plataformas.
- Los conjuntos de métricas por posición siguen la hoja de perfiles de la
  dirección de scouting: StatsBomb aporta el bloque técnico-táctico (OBV,
  progresiones, duelos, xG/xA de juego abierto…) y SkillCorner el de
  inteligencia de juego y físico (desmarques P30, retención bajo presión,
  recuperación directa en duelo, PSV-99…). Los volúmenes de SkillCorner se
  normalizan a 30 minutos de posesión efectiva (`campo / minutes_tip * 30`) y
  las métricas donde menos es mejor ("Superado en duelo %", "Reacción a sprint
  post-giro") se invierten al calcular el percentil.
- Las métricas salen **ordenadas por categoría** (finalización → creación →
  pase → defensa → portero → físico), así que cada color ocupa un solo arco
  continuo del radar en vez de repartirse por todo el círculo. Al colorear
  "Por plataforma" el radar reordena por fuente y mantiene la misma lectura
  por bloques. El desglose bajo el radar ajusta sus columnas al número de
  categorías con datos (5 bloques → 3 arriba y 2 centradas abajo; 6 → 3 y 3).
- Las métricas de SkillCorner se escriben **sin acrónimos** (velocidad punta en
  vez de PSV-99, distancia a alta velocidad en vez de HSR, reacción al sprint
  tras giro en vez de COD) y sin arrastrar el sufijo P30: esa normalización —30
  minutos con balón del equipo— se explica una sola vez en el pie del informe.
  "Dificultad de pase" invierte el xPass crudo, de modo que un percentil alto
  significa que el jugador intenta pases más difíciles, no más seguros.
- Los extremos tienen **dos cohortes**, como en la hoja de perfiles:
  *Extremos* (asociativo: amplitud, opciones en banda, pases a desmarques,
  retención bajo presión) y *Extremos directos* (ruptura al espacio,
  conducciones largas, centros al área, PSV-99 y reacción al sprint). Ambas
  comparan contra el mismo grupo de referencia —los extremos de la base—, así
  que solo cambia la lente de métricas, no la población.
- Las métricas de API llevan sufijo `(SB)` o `(SC)` y el radar suma el toggle
  **Color del radar**: "Por grupo" (bloques tácticos) o "Por plataforma"
  (naranja Wyscout, carmesí StatsBomb, verde SkillCorner).
- En la versión publicada (GitHub Pages) el navegador consulta
  `http://127.0.0.1:7001` directamente, así que basta con tener el servidor
  local corriendo en el equipo desde el que se abre la web.

## Lecturas escritas por Claude

Tres textos del informe se pueden redactar con IA, siempre sobre los números
reales que ya calcula la app —nunca plantillas guardadas—:

- **Lectura rápida** (Página 01): 2-3 frases, 55 palabras como máximo.
- **Informe extendido** (Páginas de visuales): unas 200 palabras en tres
  bloques —perfil, fortalezas y a revisar— dentro del bloque de texto elegido.
- **Opinión de la comparación** (Página 02): unas 110 palabras sobre el jugador
  objetivo frente al comparado, cerrando con una recomendación.

Cada texto cae en el mismo campo editable de siempre, así que se puede corregir
antes de exportar y se guarda con el informe.

Los botones de IA vienen **apagados de fábrica**: el informe se abre limpio y la
lectura rápida se edita con un clic, como siempre. Se encienden con el
interruptor **Textos con IA** del panel, que recuerda la elección entre
sesiones. Aunque el texto lo escriba la IA, sigue siendo editable; y ni los
botones ni sus avisos se imprimen o exportan nunca.

La petición viaja por el servidor local (`npm run bg:server`): **la clave de
Anthropic nunca llega al navegador ni al bundle publicado**. Se guarda una sola
vez en el Llavero:

```bash
security add-generic-password -U -s fos-scouting -a anthropic -w 'sk-ant-...'
```

También sirve la variable de entorno `ANTHROPIC_API_KEY`. Los textos cortos usan
`claude-sonnet-5` y los largos `claude-opus-5`; se pueden cambiar con
`FOS_AI_MODEL_QUICK` y `FOS_AI_MODEL_LONG`.

El prompt fija las reglas de estilo del departamento: lenguaje de scout, solo los
números entregados, sin la palabra "cohorte", sin mencionar vídeo y sin aludir a
que se revisaron otros jugadores.

## Página de contexto

Una hoja propia que sitúa al jugador dentro de su equipo y de la liga, con el
lenguaje visual de SkillCorner —lienzo oscuro y su verde— sobre la tipografía
del informe. Tres bloques:

- **Dónde destaca y dónde no**: sus métricas por encima del percentil 75 y por
  debajo del 25, con el color de la plataforma de origen.
- **El puesto de su equipo** en cada una de esas métricas, frente al resto de
  clubes de la base. Un percentil alto en un equipo que va último significa
  algo distinto que en uno que va primero.
- **Su lugar en la distribución**: un *swarm* por cada métrica del perfil —no
  una muestra— con toda la población de su posición como puntos, sus
  compañeros de club en ámbar, la mediana marcada y él resaltado en el color
  de la plataforma de origen. Un percentil no dice si el P80 está en un
  pelotón apretado o destacado; la distribución sí. Junto a ellos, un
  cuadrante que cruza volumen contra eficacia.
- **Embudo de la ruptura a la espalda** (si la competición trae game
  intelligence de SkillCorner): hechas → peligrosas → buscadas → recibidas →
  remate en 10 s, con la mediana del equipo marcada. Separa lo que hace el
  jugador de lo que su equipo hace con él.

La hoja se adapta a lo que haya: con Wyscout sola muestra sus métricas, y va
sumando las de StatsBomb y SkillCorner conforme estén disponibles. Se exporta
como una página más desde el diálogo de impresión.

## Football Blueprints

Sección **Explorar → Football Blueprints** (necesita el puente). Muestra los
blueprints de [opengoalapp/football-blueprints](https://github.com/opengoalapp/football-blueprints)
—ideas de análisis escritas como prompts— construidos con nuestros datos. El
primero es el flujo de posesión.

- **Mapa conceptual de la liga:** la liga, sus conferencias (la MLS en Este y
  Oeste, 15 y 15; las demás ligas en un solo grupo) y debajo una cancha animada
  por equipo. Al tocar un equipo pasa a ser el **equipo destacado**, en grande y
  con sus números frente a la media de la liga.
- **Reel para LinkedIn:** un video vertical de 24 s (1080 × 1920, 30 fps) con
  título, el mapa de la liga, el equipo destacado a mitad de video y los
  créditos. Termina como empieza, así se repite en bucle. Título y subtítulo se
  editan en la página; también hay portada en PNG y vista previa en vivo.
- **Formato:** MP4 en H.264 (Chrome y Safari en el Mac), codificado cuadro a
  cuadro con WebCodecs y `mp4-muxer`, así que sale a 30 fps exactos aunque
  dibujar treinta canchas lleve más de un treintavo de segundo. Si el navegador
  no tiene H.264 sale en VP9 dentro del MP4, y sin WebCodecs (Firefox) se graba
  en tiempo real en WebM.
- La primera vez que se abre la MLS, el puente baja los eventos de todos sus
  partidos (unos minutos); después sale de la caché.

## Dos temporadas en la ficha

Por defecto cada jugador se mide con su **temporada actual y la anterior**, si
existen: en abril, con cinco jornadas jugadas, la temporada en curso sola dice
muy poco.

- **Carga:** "Cargar todas las ligas" y "Añadir una competición" traen también
  la temporada anterior de cada liga. Se apaga con el interruptor *Incluir la
  temporada anterior* de Base activa. Con Wyscout, sube los dos Excel a la vez
  con el año en el nombre (`CPL 2025.xlsx`, `CPL 2026.xlsx`).
- **Ficha y radar:** la franja enseña la temporada actual y, debajo, la anterior
  (partidos, minutos, goles y asistencias de cada una, con su liga y club). El
  radar y el índice salen de las dos juntas, ponderadas por minutos, y la
  cohorte también junta las dos temporadas de cada par.
- **Panel lateral → Temporada anterior:** dice qué temporada entra en el radar y
  permite medir solo con la actual (jugador y cohorte se recalculan con esa
  temporada). Si el jugador no tiene temporada anterior en la base, recomienda
  la de su liga y la añade con un clic.
- **Fichajes entre ligas:** el mismo nombre con la misma fecha de nacimiento se
  junta aunque cambie de liga y de club (USL 2025 → CPL 2026). El mismo nombre
  con distinta fecha en un mismo proveedor son dos personas.
- Los minutos, partidos y goles toman el máximo entre proveedores dentro de una
  temporada y se suman entre temporadas.

## Flujo de posesión

Sección **Explorar → Flujo de posesión** (necesita el puente, `npm run bg:server`).
Dibuja por dónde mueve el balón cada equipo en su temporada como un mapa de
viento, dos equipos lado a lado: las rutas que más usa son corrientes gruesas
y brillantes, las zonas que casi no pisa quedan en calma y las partículas van
más rápido donde el balón va más rápido. La idea es el blueprint
[possession flow](https://github.com/opengoalapp/football-blueprints/tree/main/possession-flow)
de opengoalapp.

- **Datos:** eventos de StatsBomb de todos los partidos de la liga
  (`/api/statsbomb/possession-flow`). Solo los pases y conducciones del equipo
  con el balón, sin saques de esquina ni de centro. La primera vez el puente
  baja los eventos de cada partido (unos minutos para la CPL); quedan en
  `~/.fos-scouting/sb-events-cache` y el resultado de la liga se guarda un día
  (tres si la temporada está cerrada).
- **Rejilla:** cada tramo se reparte por una rejilla de 60 × 40 celdas y 16
  direcciones a lo largo de su recorrido, así que un pase largo suma un poco
  en cada celda que cruza y no inunda la de salida.
- **Sin maraña:** en cada zona se dibuja la dirección dominante, y una segunda
  solo si el reparto es parejo; las direcciones nunca se promedian. Qué cuenta
  como ruta se decide contra todos los equipos de la liga, así que el grosor
  significa lo mismo en las dos canchas.
- **Velocidad:** distancia entre tiempo del balón en cada zona, pausas
  incluidas, coloreada por su posición en la liga para que las diferencias se
  vean.
- **Controles:** Detalle (cuánto flujo secundario se ve), Ancho del canal y
  Estela. Al pasar el cursor por la cancha se lee la zona.
- **El promedio de cada equipo:** debajo de cada cancha y en una tabla de toda
  la liga —balón por partido, % hacia delante y hacia atrás, reparto por carril
  y velocidad del balón en salida, medio campo y último tercio—, siempre contra
  la media de la liga.
- **Notebook:** `notebooks/flujo_posesion.ipynb` hace el mismo cálculo fuera de
  la app, en Jupyter o VS Code: la tabla de promedios (también en CSV), el mapa
  de todos los equipos en una imagen y una animación GIF de dos equipos. Lee las
  credenciales del Llavero (o de las variables de entorno) y, si no las
  encuentra, las pide con un campo oculto; nunca se escriben en el notebook.
  Comparte la caché de eventos con el puente.

## Métricas del radar a medida

La página 01 trae un panel **Métricas del radar** que lista todo lo que la base
cargada permite dibujar, agrupado por categoría y con su color. Se marcan y
desmarcan una a una, y se pueden añadir métricas de otros perfiles —el
percentil se sigue calculando siempre contra los jugadores de la misma posición
en la base cargada—. La elección se recuerda por perfil entre sesiones y se
deshace con "Volver al set del perfil".

## Tamaño de hoja automático

Antes de imprimir se mide el alto natural de cada página —con la altura
liberada y sin el pie empujado al fondo— y, si todas caben, la exportación
sale en **Carta** en vez de Legal. Una comparación sin comentario del scout
dejaba así un cuarto de hoja en blanco al final.

## Exportación que siempre entra en la hoja

Antes de imprimir, cada página se mide contra el área Legal. Si sobra
contenido, la hoja se reduce con una **escala uniforme** en vez de rechazar la
exportación: solo se compensa el alto, nunca el ancho, para que nada se
re-maquete —el radar mantiene su tamaño— y al ser un único escalado ninguna
proporción cambia ni puede quedar nada solapado. Solo se avisa si ni siquiera
reduciendo al 55 % cabe el contenido.

## Nombres de club

Cada export escribe los clubes a su manera: con FC y sin FC, con espacios de
más, con acento y sin acento, o con el nombre largo ("Vancouver Football Club"
frente a "Vancouver FC"). Al combinar bases esas variantes se agrupan en una
sola entrada del desplegable de equipos.

La etiqueta visible sale de la base (Wyscout o StatsBomb), nunca de SkillCorner,
que puede arrastrar el nombre anterior a un rebranding. Entre variantes de la
base gana la más frecuente; a igualdad, la más completa, y después la acentuada
—"Atlético Ottawa", no "Atletico".

Clubes distintos de una misma ciudad no se confunden: "Inter Toronto FC" y
"Toronto FC" siguen separados, porque la palabra distintiva va primero.

## Reglas para combinar bases

- no existe un límite fijo de archivos; la combinación requiere al menos dos;
- cada jugador se identifica con la clave normalizada `nombre + edad + club`
  para consolidar duplicados sin mezclar homónimos;
- partidos, minutos, goles y asistencias: suma entre temporadas de una misma
  plataforma, máximo entre plataformas que describen la misma temporada;
- métricas totales: promedio entre los archivos cargados;
- métricas por 90: promedio ponderado por minutos;
- porcentajes: ponderados por intentos cuando se puede inferir el denominador,
  o por minutos como respaldo;
- equipo y edad: valor del año más reciente o del último archivo cargado.

El resultado consolidado no genera una descarga intermedia: se convierte
automáticamente en la fuente de datos activa del módulo **Reportes**, abre el
creador y deja disponibles los selectores alfabéticos de equipo y jugador.
