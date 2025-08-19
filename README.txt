DXF → GLB • Proyecto OFFLINE (UI original + vistas + secciones)
===============================================================

Qué hace:
- Mantiene tu UI original (sin botón extra de rotación).
- Detiene la rotación automática al tocar/usar el visor.
- Añade "Vistas" (Superior, Frontal, Derecha, Isométrica).
- Añade "Sección": cambia a un visor avanzado Three.js con planos de corte (X/Y/Z) y slider de posición.

Cómo preparar (una sola vez, con Internet):
- Windows: ejecutar get_libs.bat
- macOS/Linux:
    chmod +x get_libs.sh
    ./get_libs.sh

Luego, sin Internet:
- Abre index.html
- Carga DXF → Genera GLB → Se previsualiza en el visor.
- Para seccionar, activa "Sección", ajusta eje y slider, y "Volver visor" para regresar.

Versiones fijas para offline:
- @google/model-viewer 3.5.0
- three.js 0.179.1
