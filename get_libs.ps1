$ErrorActionPreference = "Stop"
$MV = "3.5.0"
$THREE = "0.179.1"

New-Item -ItemType Directory -Force -Path "libs/model-viewer" | Out-Null
New-Item -ItemType Directory -Force -Path "libs/three/examples/jsm/controls" | Out-Null
New-Item -ItemType Directory -Force -Path "libs/three/examples/jsm/exporters" | Out-Null
New-Item -ItemType Directory -Force -Path "libs/three/examples/jsm/loaders" | Out-Null

Write-Host "Descargando @google/model-viewer $MV ..."
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@google/model-viewer@$MV/dist/model-viewer.min.js" -OutFile "libs/model-viewer/model-viewer.min.js"

Write-Host "Descargando three.js $THREE ..."
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/three@$THREE/build/three.module.min.js" -OutFile "libs/three/three.module.min.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/three@$THREE/examples/jsm/controls/OrbitControls.js" -OutFile "libs/three/examples/jsm/controls/OrbitControls.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/three@$THREE/examples/jsm/exporters/GLTFExporter.js" -OutFile "libs/three/examples/jsm/exporters/GLTFExporter.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/three@$THREE/examples/jsm/loaders/GLTFLoader.js" -OutFile "libs/three/examples/jsm/loaders/GLTFLoader.js"

Write-Host "Listo. Abre index.html sin internet."
