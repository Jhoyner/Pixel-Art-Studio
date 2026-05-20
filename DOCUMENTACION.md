# Documentación Técnica — Pixel Art Studio

> **Versión:** 1.0  
> **Propósito:** Guía de aprendizaje para desarrolladores que quieren entender cómo manipular el DOM y la Canvas API de forma profesional.

---

## Sección 1: Arquitectura del proyecto

### 1.1 Separación de responsabilidades

El proyecto sigue el paradigma de **separación de concerns** (SoC), donde cada tecnología cumple un rol específico y no se mezcla con las demás:

| Tecnología | Archivo          | Rol                                                                                     |
|------------|------------------|-----------------------------------------------------------------------------------------|
| **HTML**   | `index.html`     | Define la **estructura** del documento: etiquetas semánticas, jerarquía de elementos, atributos `data-*` para la interacción con JS. No contiene estilo ni lógica. |
| **CSS**    | `src/style.css`  | Define la **presentación visual**: layout (Flexbox/Grid), colores, tipografía, animaciones, diseño responsive. No contiene estructura ni lógica de negocio. |
| **JS**     | `src/script.js`  | Define el **comportamiento**: manipulación del DOM, Canvas API, gestión de estado, eventos. No contiene marcado HTML ni estilos CSS. |

**Ventajas de esta separación:**

- **Mantenibilidad**: cada capa puede modificarse sin afectar a las otras.
- **Legibilidad**: un desarrollador encuentra rápidamente dónde está cada parte.
- **Escalabilidad**: se pueden agregar herramientas sin reestructurar todo.

### 1.2 Flujo de datos

```
Usuario (ratón/teclado)
       │
       ▼
Event Listener (script.js)
       │
       ▼
gridPos(e) → coord (x, y)     ← Conversión matemática de coordenadas
       │
       ▼
paint(x, y, color)             ← Modifica la matriz grid[][]
  o
floodFill(x, y, color)         ← Algoritmo DFS iterativo
       │
       ▼
render()                       ← Vuelca grid[][] al <canvas>
       │
       ▼
Canvas API (ctx.fillRect, etc.) → Píxeles en pantalla
```

### 1.3 Estructura de archivos

```
Pixel Art Studio/
├── index.html          ← Punto de entrada. Carga CSS en <head> y JS al final del <body>.
├── assets/
│   └── icon.svg        ← Favicon con paleta de píxeles estilizada.
├── src/
│   ├── script.js       ← Lógica envuelta en IIFE para aislamiento del scope global.
│   └── style.css       ← Reset, layout, componentes y media queries.
├── README.md           ← Visión general del proyecto.
└── DOCUMENTACION.md    ← Esta guía técnica.
```

---

## Sección 2: Guía de uso

### 2.1 Selector de color

El selector de color es un `<input type="color">` nativo del navegador, que internamente usa un `ColorWell` (círculo cromático o paleta del sistema operativo). Al seleccionar un color:

1. El valor hexadecimal (ej. `#ff4444`) se actualiza en el input.
2. El evento `input` dispara la actualización del `.color-swatch` (cuadro visual).
3. Si se hace clic en un slot de la paleta, ese color se asigna al input y al swatch.

**Para guardar un color en la paleta rápida:**

1. Selecciona un color con el selector.
2. Haz clic en **"Guardar color"**.
3. El color se almacena en el primer slot vacío de la paleta (o sobrescribe el último si está llena).
4. La paleta se persiste automáticamente en `localStorage`.

### 2.2 Herramienta de borrador

El borrador **no usa un color blanco**, sino que establece la celda a `null` (transparente):

```js
const color = currentTool === 'eraser' ? null : colorPicker.value;
```

Esto garantiza que al exportar PNG, las áreas borradas sean transparentes, no blancas.

**Modo de uso:**

- Haz clic en el botón del borrador (o presiona `E`).
- Arrastra sobre las celdas que deseas borrar.

### 2.3 Bote de pintura (flood fill)

El bote de pintura implementa un algoritmo de **relleno por inundación 4-direccional** (DFS iterativo). Al hacer clic en una celda:

1. Lee el color actual de esa celda (`target`).
2. Si `target` es igual al color de relleno, no hace nada.
3. Recorre todas las celdas adyacentes (arriba, abajo, izquierda, derecha) que tengan el mismo `target` y las reemplaza con el nuevo color.

**Importante:** el bote de pintura solo se activa con `mousedown`, no con `mousemove`, ya que no tendría sentido rellenar cada celda por la que pasa el ratón.

### 2.4 Exportación a PNG

La función `exportPNG()` crea un **canvas fuera de pantalla** (off-screen) de 320×320 px (escala 10×). Solo dibuja las celdas con color; las celdas vacías quedan transparentes. Luego:

1. Convierte el canvas a una URL de datos (`toDataURL('image/png')`).
2. Crea un elemento `<a>` temporal con `download="pixel-art.png"`.
3. Simula un clic en el enlace para iniciar la descarga.

No se dibuja el fondo damero ni las líneas de cuadrícula en la exportación.

### 2.5 Atajos de teclado

| Tecla | Herramienta           |
|-------|-----------------------|
| `B`   | Pincel (Brush)        |
| `E`   | Borrador (Eraser)     |
| `G`   | Bote de pintura (Fill)|

Los atajos se ignoran si el foco está en un `<input>` para no interferir con otros campos.

---

## Sección 3: Seguridad y optimización

### 3.1 Validación del color (seguridad)

El selector de color (`<input type="color">`) es un control nativo del navegador que:

- Solo permite seleccionar colores a través de su interfaz visual (paleta del SO).
- Siempre devuelve un string en formato hexadecimal de 7 caracteres (`#RRGGBB`).
- No es posible inyectar código o valores no válidos a través de él.

**En el código JS:**

```js
const color = currentTool === 'eraser' ? null : colorPicker.value;
```

Cuando la herramienta es borrador, se fuerza `null` (independientemente del valor del picker). Esto evita que un cambio accidental de color mientras se está en modo borrador pinte sobre el lienzo.

### 3.2 Validación de coordenadas (seguridad)

La función `paint(x, y, color)` valida que las coordenadas estén dentro del rango:

```js
if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
```

Esto previene accesos fuera del array `grid[][]` aunque `gridPos()` devuelva coordenadas inválidas (lo cual no debería ocurrir gracias al clamping, pero es una capa adicional de defensa).

### 3.3 Protección contra corrupción de datos

La paleta se guarda en `localStorage` como JSON. Al cargarla:

```js
try {
  palette = raw ? JSON.parse(raw) : [...DEFAULT_PALETTE];
} catch (_) {
  palette = [...DEFAULT_PALETTE];
}
```

Si `localStorage` contiene datos corruptos (manipulación manual, corrupción, versión antigua), `JSON.parse()` lanza un error que es capturado por el `catch`, restaurando la paleta por defecto.

### 3.4 Optimización del renderizado

**Uso de `clearRect()` antes de renderizar:**

```js
ctx.clearRect(0, 0, CANVAS, CANVAS);
```

Se limpia todo el canvas antes de redibujar para evitar **efectos de acumulación** (ghosting) de frames anteriores. Sin esta limpieza, las pinceladas se superpondrían a las anteriores indefinidamente.

**Por qué NO se optimiza con dirty rectangles:**

En una cuadrícula de 32×32 (1024 celdas), el renderizado completo es extremadamente rápido (< 1 ms). Implementar una optimización de "rectángulos sucios" (solo redibujar las celdas modificadas) agregaría complejidad innecesaria sin beneficio perceptible. Si la cuadrícula creciera a 512×512 o más, esta optimización sería necesaria.

### 3.5 Exportación — Limpieza del canvas off-screen

Al exportar, se crea un **canvas off-screen** (no visible) que se descarta tras la descarga:

```js
const off = document.createElement('canvas');
// ... dibujar, descargar ...
// off queda fuera de ámbito y el garbage collector lo libera
```

**Por qué es seguro:** el canvas off-screen no está conectado al DOM, no tiene eventos, no consume memoria de GPU visible, y se libera automáticamente al salir de la función. No es necesario llamar a ningún método de limpieza.

### 3.6 Manejo de errores en localStorage

Tanto `savePalette()` como `loadPalette()` usan `try/catch` porque `localStorage` puede fallar en varios escenarios:

- **Almacenamiento lleno** (quota exceeded): el navegador lanza una excepción.
- **Modo incógnito/privado**: algunos navegadores limitan o deshabilitan localStorage.
- **Manipulación manual del usuario**: el usuario puede borrar o modificar los datos.

En cualquier fallo, la aplicación sigue funcionando con la paleta por defecto.

### 3.7 Aislamiento del ámbito global (IIFE)

Todo el código JS está envuelto en una **IIFE** (Immediately Invoked Function Expression):

```js
;(function () {
  'use strict';
  // ... todo el código ...
})();
```

Beneficios:

- Ninguna variable o función `var`/`function` escapa al ámbito global.
- `'use strict'` convierte errores silenciosos en excepciones (ej. asignación a variable no declarada).
- El punto y coma inicial (`;`) protege contra archivos previos no finalizados correctamente.

---

## Referencias

- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MDN: <input type="color">](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/color)
- [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN: IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
- [Flood fill algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Flood_fill)
