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
  edad, minutos, pasaporte y posición, y ordenar los jugadores más parecidos al
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
  numeración, formato de página y pie editorial;
- un tema compartido: cualquier cambio de paleta se aplica automáticamente a
  Ficha, Visuales y Observaciones;
- plantillas de una, dos o tres columnas;
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
   La foto del jugador puede procesarse con `@imgly/background-removal@1.4.5`
   para eliminar el fondo mediante IA directamente en el navegador.
4. **Diseñar reporte:** revisar la ficha imprimible inspirada en
   `Radar Jordhy Thompson v2`, y editar las páginas de visuales y observaciones.
   La etiqueta “Base analizada” y el nombre de la liga o temporada también son
   editables desde el panel de datos.

Los datos extraídos y las personalizaciones del perfil se guardan localmente por
jugador en el navegador. Transfermarkt solo se consulta cuando el usuario pega
una URL y presiona el botón de extracción.

## Reglas para combinar bases

- no existe un límite fijo de archivos; la combinación requiere al menos dos;
- cada jugador se identifica con la clave normalizada `nombre + edad + club`
  para consolidar duplicados sin mezclar homónimos;
- partidos y minutos: suma;
- métricas totales: promedio entre los archivos cargados;
- métricas por 90: promedio ponderado por minutos;
- porcentajes: ponderados por intentos cuando se puede inferir el denominador,
  o por minutos como respaldo;
- equipo y edad: valor del año más reciente o del último archivo cargado.

El resultado consolidado no genera una descarga intermedia: se convierte
automáticamente en la fuente de datos activa del módulo **Reportes**, abre el
creador y deja disponibles los selectores alfabéticos de equipo y jugador.
