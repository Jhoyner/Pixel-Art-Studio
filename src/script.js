/* ============================================================
   Pixel Art Studio Industrial Edition — script.js
   Canvas API, herramientas, undo, grid toggle, HUD y paleta.
   ============================================================ */

;(function () {
  'use strict';

  // ======================== Configuración ========================

  let GRID = 32;
  let CELL = 15;
  const CANVAS_SIZE = 480;
  const MAX_UNDO = 30;         // Máximo de pasos de deshacer

  // ======================== Referencias DOM ========================

  const canvas      = document.getElementById('pixelCanvas');
  const ctx         = canvas.getContext('2d');
  const colorPicker = document.getElementById('colorPicker');
  const colorSwatch = document.getElementById('colorSwatch');
  const paletteEl   = document.getElementById('quickPalette');
  const saveBtn     = document.getElementById('saveColorBtn');
  const clearBtn    = document.getElementById('clearBtn');
  const exportBtn   = document.getElementById('exportBtn');
  const saveProjBtn = document.getElementById('saveProjectBtn');
  const loadProjBtn = document.getElementById('loadProjectBtn');
  const loadInput   = document.getElementById('loadFileInput');
  const indicator   = document.getElementById('toolIndicator');
  const toolBtns    = document.querySelectorAll('.tool-btn');
  const symBtns     = document.querySelectorAll('.sym-btn');
  const flipHBtn    = document.getElementById('flipHBtn');
  const flipVBtn    = document.getElementById('flipVBtn');
  const completeBtn = document.getElementById('completeHalfBtn');
  const brushSlider = document.getElementById('brushSizeSlider');
  const brushLabel  = document.getElementById('brushSizeLabel');
  const gridSelect  = document.getElementById('gridSizeSelect');
  const hudCoords   = document.getElementById('hudCoords');
  const hudSwatch   = document.getElementById('hudSwatch');
  const hudZoom     = document.getElementById('hudZoom');

  // ======================== Estado ========================

  let grid          = [];
  let currentTool   = 'brush';
  let painting      = false;
  let showGrid      = true;   // Controla el dibujado de líneas de cuadrícula
  let history       = [];     // Pila de estados para Ctrl+Z
  let symmetryH     = false;  // Simetría horizontal
  let symmetryV     = false;  // Simetría vertical
  let shadedCells   = new Set(); // Previene sombreado múltiple en un mismo trazo
  let brushSize     = 1;      // Tamaño de pincel N×N (1-5)
  const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8];
  let zoomIndex     = 0;      // Índice en ZOOM_LEVELS

  // 8 colores retro/industrial para la paleta rápida
  const QUICK_COLORS = [
    '#ff0044', '#ff8800', '#ffdd00', '#00cc66',
    '#0088ff', '#6633ff', '#ffffff', '#1a1a1a'
  ];
  // Almacén editable de la paleta (se persiste en localStorage)
  let palette = [];

  // ======================== Grid ========================

  function initGrid () {
    grid = Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }

  // ======================== Render ========================

  function render () {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const px = x * CELL, py = y * CELL;
        ctx.fillStyle = (x + y) % 2 === 0 ? '#141414' : '#1e1e1e';
        ctx.fillRect(px, py, CELL, CELL);
        if (grid[y][x] !== null) {
          ctx.fillStyle = grid[y][x];
          ctx.fillRect(px, py, CELL, CELL);
        }
      }
    }

    // Líneas de cuadrícula (se muestran/ocultan según showGrid)
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < GRID; i++) {
        const p = i * CELL;
        ctx.beginPath(); ctx.moveTo(p, 0);     ctx.lineTo(p, CANVAS_SIZE);   ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p);     ctx.lineTo(CANVAS_SIZE, p);   ctx.stroke();
      }
    }
  }

  // ======================== Coordenadas ========================

  function gridPos (e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    const x = Math.floor((e.clientX - r.left) * sx / CELL);
    const y = Math.floor((e.clientY - r.top)  * sy / CELL);
    return {
      x: Math.max(0, Math.min(GRID - 1, x)),
      y: Math.max(0, Math.min(GRID - 1, y)),
    };
  }

  function paint (x, y, color) {
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
    grid[y][x] = color;
  }

  function getMirroredPositions (x, y) {
    const positions = [{x, y}];
    if (symmetryH) positions.push({x: GRID - 1 - x, y});
    if (symmetryV) positions.push({x, y: GRID - 1 - y});
    if (symmetryH && symmetryV) positions.push({x: GRID - 1 - x, y: GRID - 1 - y});
    return positions;
  }

  function forEachCellInBrush (cx, cy, fn) {
    const off = Math.floor((brushSize - 1) / 2);
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const px = cx - off + dx, py = cy - off + dy;
        if (px >= 0 && px < GRID && py >= 0 && py < GRID) fn(px, py);
      }
    }
  }

  // ======================== Flood Fill ========================

  function floodFill (sx, sy, fill) {
    const target = grid[sy][sx];
    if (target === fill) return;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= GRID || y < 0 || y >= GRID) continue;
      if (grid[y][x] !== target) continue;
      grid[y][x] = fill;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  // ======================== Sombreado HSL ========================

  function shadeColor (hex, amount) {
    if (!hex || hex.length !== 7) return hex;
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    l = Math.max(0, Math.min(1, l + amount));
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // ======================== Exportación PNG ========================

  function exportPNG () {
    const SCALE = 10, W = GRID * SCALE;
    const off = document.createElement('canvas');
    off.width = off.height = W;
    const oc = off.getContext('2d');
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (grid[y][x] !== null) {
          oc.fillStyle = grid[y][x];
          oc.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    }
    const a = document.createElement('a');
    a.download = 'pixel-art.png';
    a.href = off.toDataURL('image/png');
    a.click();
  }

  // ======================== Guardar proyecto .json ========================

  function saveProject () {
    const data = { version: 1, gridSize: GRID, data: grid };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'pixel-proyecto.json'; a.href = url; a.click();
    URL.revokeObjectURL(url);
  }

  // ======================== Cargar proyecto .json con validación ========================

  function loadProject (file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        // Validación estricta de estructura y tipos
        if (!obj || typeof obj !== 'object') throw new Error('Estructura inválida');
        if (obj.version !== 1) throw new Error('Versión no soportada');
        const size = obj.gridSize;
        if (![16, 32, 64].includes(size)) throw new Error('Tamaño de cuadrícula no válido');
        if (!Array.isArray(obj.data) || obj.data.length !== size) throw new Error('Dimensiones incorrectas');
        for (const row of obj.data) {
          if (!Array.isArray(row) || row.length !== size) throw new Error('Fila con dimensión incorrecta');
          for (const cell of row) {
            if (cell !== null && !/^#[0-9a-f]{6}$/i.test(cell)) throw new Error('Color HEX inválido detectado');
          }
        }
        // Datos válidos — aplicar al lienzo
        history = [];
        GRID = size; CELL = CANVAS_SIZE / GRID;
        grid = obj.data;
        render();
        switchTool('brush');
      } catch (err) {
        alert('Error al cargar: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ======================== Deshacer (Undo) ========================

  /** Guarda una copia del estado actual del grid en la pila history */
  function saveSnapshot () {
    const snap = JSON.parse(JSON.stringify(grid));
    history.push(snap);
    if (history.length > MAX_UNDO) history.shift();
  }

  /** Restaura el estado anterior del grid desde la pila history */
  function undo () {
    if (history.length === 0) return;
    grid = history.pop();
    render();
  }

  // ======================== Alternar cuadrícula ========================

  function toggleGrid () {
    showGrid = !showGrid;
    render();
  }

  // ======================== Paleta ========================

  function loadPalette () {
    try {
      const raw = localStorage.getItem('pas_palette2');
      palette = raw ? JSON.parse(raw) : [...QUICK_COLORS];
    } catch (_) { palette = [...QUICK_COLORS]; }
  }

  function savePalette () {
    try { localStorage.setItem('pas_palette2', JSON.stringify(palette)); } catch (_) {}
  }

  function renderPalette () {
    paletteEl.innerHTML = '';
    palette.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'palette-slot';
      if (c) { div.style.background = c; div.dataset.color = c; div.classList.add('filled'); }
      div.addEventListener('click', () => {
        if (div.dataset.color) {
          colorPicker.value = div.dataset.color;
          colorSwatch.style.background = div.dataset.color;
          hudSwatch.style.background = div.dataset.color;
        }
      });
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = palette[i] || '#ffffff';
        picker.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(picker);
        picker.addEventListener('change', () => {
          const nc = picker.value;
          palette[i] = nc;
          div.style.background = nc;
          div.dataset.color = nc;
          div.classList.add('filled');
          savePalette();
          colorPicker.value = nc;
          colorSwatch.style.background = nc;
          hudSwatch.style.background = nc;
        });
        requestAnimationFrame(() => { picker.click(); requestAnimationFrame(() => document.body.removeChild(picker)); });
      });
      paletteEl.appendChild(div);
    });
  }

  // ======================== HUD ========================

  /** Actualiza las coordenadas del HUD según el evento del ratón */
  function updateHUD (e) {
    const { x, y } = gridPos(e);
    hudCoords.textContent = `X: ${String(x).padStart(2, '0')} | Y: ${String(y).padStart(2, '0')}`;
  }

  // ======================== Manejo de dibujo ========================

  function handleDraw (e) {
    const { x, y } = gridPos(e);
    const color = currentTool === 'eraser' ? null : colorPicker.value;

    if (currentTool === 'fill') {
      floodFill(x, y, color);
      render();
      return;
    }

    if (currentTool === 'dropper') {
      const captured = grid[y][x];
      if (captured !== null) {
        colorPicker.value = captured;
        colorSwatch.style.background = captured;
        hudSwatch.style.background = captured;
      }
      switchTool('brush');
      return;
    }

    const cursorPositions = getMirroredPositions(x, y);

    if (currentTool === 'shade') {
      for (const pos of cursorPositions) {
        forEachCellInBrush(pos.x, pos.y, (px, py) => {
          const key = `${px},${py}`;
          if (shadedCells.has(key)) return;
          shadedCells.add(key);
          if (grid[py][px] !== null) {
            grid[py][px] = shadeColor(grid[py][px], e.shiftKey ? 0.1 : -0.1);
          }
        });
      }
      render();
      return;
    }

    // Pincel / Borrador con simetría y tamaño N×N
    for (const pos of cursorPositions) {
      forEachCellInBrush(pos.x, pos.y, (px, py) => paint(px, py, color));
    }
    render();
  }

  // ======================== Eventos del ratón ========================

  // saveSnapshot al empezar a pintar (cada trazo es 1 paso de undo)
  canvas.addEventListener('mousedown', (e) => {
    painting = true;
    saveSnapshot();
    handleDraw(e);
    updateHUD(e);
  });

  canvas.addEventListener('mousemove', (e) => {
    updateHUD(e);
    if (!painting || currentTool === 'fill') return;
    handleDraw(e);
  });

  canvas.addEventListener('mouseup', () => {
    painting = false; shadedCells.clear();
  });
  canvas.addEventListener('mouseleave', () => {
    painting = false; shadedCells.clear();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ======================== Color picker ========================

  colorPicker.addEventListener('input', () => {
    colorSwatch.style.background = colorPicker.value;
    hudSwatch.style.background = colorPicker.value;
  });

  // ======================== Guardar color en paleta ========================

  saveBtn.addEventListener('click', () => {
    const idx = palette.findIndex(c => !c);
    palette[idx !== -1 ? idx : palette.length - 1] = colorPicker.value;
    renderPalette();
    savePalette();
  });

  // ======================== Cambio de herramientas ========================

  const toolNames = { brush: 'Pincel', eraser: 'Borrador', fill: 'Bote', shade: 'Sombrear', dropper: 'Cuentagotas' };

  toolBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      toolBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      indicator.textContent = toolNames[currentTool] || currentTool;
    });
  });

  function switchTool (name) {
    toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
    currentTool = name;
    indicator.textContent = toolNames[name] || name;
  }

  // ======================== Simetría ========================

  function toggleSymmetry (axis) {
    if (axis === 'H') symmetryH = !symmetryH;
    if (axis === 'V') symmetryV = !symmetryV;
    symBtns.forEach((b) => {
      const isActive = (b.dataset.axis === 'H' && symmetryH) || (b.dataset.axis === 'V' && symmetryV);
      b.classList.toggle('active', isActive);
    });
  }

  symBtns.forEach((btn) => {
    btn.addEventListener('click', () => toggleSymmetry(btn.dataset.axis));
  });

  flipHBtn.addEventListener('click', flipH);
  flipVBtn.addEventListener('click', flipV);
  completeBtn.addEventListener('click', completeHalf);

  // ======================== Volteo y Completar Mitad ========================

  function flipH () {
    saveSnapshot();
    for (let y = 0; y < GRID; y++) grid[y].reverse();
    render();
  }

  function flipV () {
    saveSnapshot();
    grid.reverse();
    render();
  }

  function completeHalf () {
    saveSnapshot();
    const mid = Math.floor(GRID / 2);
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < mid; x++)
        grid[y][GRID - 1 - x] = grid[y][x];
    render();
  }

  // ======================== Tamaño de pincel ========================

  brushSlider.addEventListener('input', () => {
    brushSize = parseInt(brushSlider.value, 10);
    brushLabel.textContent = `${brushSize}\u00D7${brushSize}`;
  });

  // ======================== Zoom con rueda directa ========================

  function applyZoom () {
    const scale = ZOOM_LEVELS[zoomIndex];
    canvas.style.transform = `scale(${scale})`;
    hudZoom.textContent = `Zoom: ${Math.round(scale * 100)}%`;
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const ni = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoomIndex + dir));
    if (ni !== zoomIndex) { zoomIndex = ni; applyZoom(); }
  }, { passive: false });

  // ======================== Atajos de teclado ========================

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    // Ctrl+Z: deshacer
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'b': switchTool('brush');  break;
      case 'e': switchTool('eraser'); break;
      case 's': switchTool('shade');   break;
      case 'i': switchTool('dropper'); break;
      case 'c':
        if (confirm('¿Borrar todo el lienzo?')) { saveSnapshot(); initGrid(); render(); }
        break;
      case 'g': toggleGrid(); break;
    }
  });

  // ======================== Limpiar ========================

  clearBtn.addEventListener('click', () => {
    saveSnapshot();
    initGrid();
    render();
  });

  // ======================== Exportar ========================

  exportBtn.addEventListener('click', exportPNG);

  // ======================== Guardar / Cargar proyecto ========================

  saveProjBtn.addEventListener('click', saveProject);
  loadProjBtn.addEventListener('click', () => loadInput.click());
  loadInput.addEventListener('change', () => {
    if (loadInput.files && loadInput.files[0]) loadProject(loadInput.files[0]);
    loadInput.value = ''; // permite recargar el mismo archivo
  });

  // ======================== Redimensionar lienzo ========================

  function resizeGrid (newSize) {
    GRID = parseInt(newSize, 10);
    CELL = CANVAS_SIZE / GRID;
    history = []; // Se descarta el historial al cambiar tamaño
    initGrid();
    render();
    switchTool('brush');
  }

  // ======================== Redimensionar (selector de tamaño) ========================

  gridSelect.addEventListener('change', () => resizeGrid(gridSelect.value));

  // ======================== Inicio ========================

  initGrid();
  render();
  loadPalette();
  renderPalette();
  colorSwatch.style.background = colorPicker.value;
  hudSwatch.style.background = colorPicker.value;

})();
