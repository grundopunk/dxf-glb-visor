#!/usr/bin/env bash
set -euo pipefail
MV="3.5.0"
THREE="0.179.1"
mkdir -p "libs/model-viewer" "libs/three/examples/jsm/controls" "libs/three/examples/jsm/exporters" "libs/three/examples/jsm/loaders"

echo "Descargando @google/model-viewer $MV ..."
curl -L -o "libs/model-viewer/model-viewer.min.js" "https://cdn.jsdelivr.net/npm/@google/model-viewer@${MV}/dist/model-viewer.min.js"

echo "Descargando three.js $THREE ..."
curl -L -o "libs/three/three.module.min.js" "https://cdn.jsdelivr.net/npm/three@${THREE}/build/three.module.min.js"
curl -L -o "libs/three/examples/jsm/controls/OrbitControls.js" "https://cdn.jsdelivr.net/npm/three@${THREE}/examples/jsm/controls/OrbitControls.js"
curl -L -o "libs/three/examples/jsm/exporters/GLTFExporter.js" "https://cdn.jsdelivr.net/npm/three@${THREE}/examples/jsm/exporters/GLTFExporter.js"
curl -L -o "libs/three/examples/jsm/loaders/GLTFLoader.js" "https://cdn.jsdelivr.net/npm/three@${THREE}/examples/jsm/loaders/GLTFLoader.js"

echo "Listo. Abre index.html sin internet."
