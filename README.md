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

Abre `http://localhost:3000` y usa uno de los dos módulos:

- **Reportes:** comienza eligiendo una base o combinando dos o tres archivos;
  después continúa con jugador, Transfermarkt, imágenes y diseño.
- **Combinar bases:** procesa dos o tres archivos que pueden representar ligas o
  temporadas y envía el resultado directamente al creador de informes.

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
- ancho, alto y separación ajustables;
- temas de color y colores personalizados;
- tipografías, tamaño, color, negrita, cursiva y alineación para los textos;
- guardado automático del diseño en el navegador e impresión de la página activa.

Los Excel se procesan completamente en el navegador. No se suben a un servidor.

## Flujo del reporte

1. **Elegir la fuente:** usar un Excel individual o combinar dos o tres Excel de
   ligas o temporadas. La combinación se activa automáticamente en el informe.
2. **Seleccionar jugador:** elegir primero el equipo y después el jugador.
   Ambos listados se muestran en orden alfabético.
3. **Completar perfil:** pegar la URL de Transfermarkt.
   La aplicación extrae dorsal, datos biográficos, valor de mercado, club, liga,
   escudo, logo de competición y retrato transparente. Los tres recursos visuales
   también se pueden reemplazar por archivos PNG, WEBP o JPG locales.
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

- partidos y minutos: suma;
- métricas totales: promedio entre los archivos cargados;
- métricas por 90: promedio ponderado por minutos;
- porcentajes: ponderados por intentos cuando se puede inferir el denominador,
  o por minutos como respaldo;
- equipo y edad: valor del año más reciente o del último archivo cargado.

El resultado consolidado no genera una descarga intermedia: se convierte
automáticamente en la fuente de datos activa del módulo **Reportes**, abre el
creador y deja disponibles los selectores alfabéticos de equipo y jugador.
