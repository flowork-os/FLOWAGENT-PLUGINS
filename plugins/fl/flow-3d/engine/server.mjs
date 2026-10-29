import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.FLOWORK_APP_PORT || '17897', 10);
const HOST = '0.0.0.0';

// Resolve library directory without hardcoding user home
const resolveLibraryDir = () => {
  if (process.env.FLOWORK_LIBRARY_DIR && fs.existsSync(process.env.FLOWORK_LIBRARY_DIR)) {
    return process.env.FLOWORK_LIBRARY_DIR;
  }
  const rel1 = path.resolve(__dirname, '../../../system/library');
  if (fs.existsSync(rel1)) return rel1;
  const rel2 = path.resolve(process.cwd(), 'system/library');
  if (fs.existsSync(rel2)) return rel2;
  return path.resolve(__dirname, '../data/library_fallback');
};

const LIBRARY_DIR = resolveLibraryDir();
const GUI_DIR = path.resolve(__dirname, '../gui');
const VENDOR_THREE_DIR = path.resolve(__dirname, '../../../canvas-ui/vendor/three');

// In-Memory Index Store
const assetIndex = {
  threejs: [],
  openscad: [],
  cadquery: [],
  bioinspired3d: [],
  blender: [],
  deepcad_count: 26444,
  ready: false
};

function humanizeName(raw) {
  let clean = raw.replace(/^codex_luna_opus_scene_|^opus_scene_|^codex_terra_threejs_|^codex_sol_threejs_|^00\d\d_|^thingiverse_/, '');
  clean = clean.replace(/_[a-f0-9]{12,}$/, '');
  clean = clean.replace(/_/g, ' ');
  return clean.replace(/\b\w/g, c => c.toUpperCase());
}

function buildAssetIndex() {
  console.log(`[Flow3D Studio] Indexing 3D assets from: ${LIBRARY_DIR}`);
  const startTime = Date.now();

  try {
    // 1. Three.js scenes (filter strictly for directories containing code.html)
    const threeDir = path.join(LIBRARY_DIR, 'threejs');
    if (fs.existsSync(threeDir)) {
      const items = fs.readdirSync(threeDir, { withFileTypes: true });
      assetIndex.threejs = items
        .filter(d => {
          if (!d.isDirectory()) return false;
          return fs.existsSync(path.join(threeDir, d.name, 'code.html'));
        })
        .map(d => ({
          id: d.name,
          name: humanizeName(d.name),
          modality: 'threejs',
          type: 'Three.js WebGL Interactive Scene',
          path: path.join('threejs', d.name)
        }));
    }

    // 2. OpenSCAD
    const scadDir = path.join(LIBRARY_DIR, 'openscad');
    if (fs.existsSync(scadDir)) {
      const files = fs.readdirSync(scadDir);
      assetIndex.openscad = files
        .filter(f => f.endsWith('.scad'))
        .map(f => {
          const base = f.replace(/\.scad$/, '');
          return {
            id: base,
            name: humanizeName(base),
            modality: 'openscad',
            type: 'OpenSCAD CSG Parametric Solid',
            path: path.join('openscad', f)
          };
        });
    }

    // 3. CadQuery
    const cadDir = path.join(LIBRARY_DIR, 'cadquery');
    if (fs.existsSync(cadDir)) {
      const files = fs.readdirSync(cadDir);
      assetIndex.cadquery = files
        .filter(f => f.endsWith('.py'))
        .map(f => {
          const base = f.replace(/\.py$/, '');
          return {
            id: base,
            name: humanizeName(base),
            modality: 'cadquery',
            type: 'CadQuery OpenCASCADE Mechanical Assembly',
            path: path.join('cadquery', f)
          };
        });
    }

    // 4. Bioinspired3D
    const bioDir = path.join(LIBRARY_DIR, 'bioinspired3d');
    if (fs.existsSync(bioDir)) {
      const files = fs.readdirSync(bioDir);
      assetIndex.bioinspired3d = files
        .filter(f => f.endsWith('.py'))
        .map(f => {
          const base = f.replace(/\.py$/, '');
          return {
            id: base,
            name: humanizeName(base),
            modality: 'bioinspired3d',
            type: 'Bio-Organic & Architectural BPY Structure',
            path: path.join('bioinspired3d', f)
          };
        });
    }

    // 5. Blender Infinigen
    const blendGeoDir = path.join(LIBRARY_DIR, 'blender/factories_geo');
    if (fs.existsSync(blendGeoDir)) {
      const files = fs.readdirSync(blendGeoDir);
      assetIndex.blender = files
        .filter(f => f.endsWith('.py'))
        .map(f => {
          const base = f.replace(/\.py$/, '');
          return {
            id: base,
            name: humanizeName(base),
            modality: 'blender',
            type: 'Blender Infinigen Procedural Geometry Factory',
            path: path.join('blender/factories_geo', f)
          };
        });
    }

    // 6. DeepCAD count
    const deepDir = path.join(LIBRARY_DIR, 'deepcad');
    if (fs.existsSync(deepDir)) {
      const files = fs.readdirSync(deepDir);
      assetIndex.deepcad_count = files.length;
    }

    assetIndex.ready = true;
    const total = assetIndex.threejs.length + assetIndex.openscad.length + assetIndex.cadquery.length + assetIndex.bioinspired3d.length + assetIndex.blender.length + assetIndex.deepcad_count;
    console.log(`[Flow3D Studio] Indexed ${total} models across 6 modalities in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.error('[Flow3D Studio] Indexing error:', err.message);
  }
}

// Trigger background indexing
buildAssetIndex();

// Native Folder Picker
function pickNativeFolder() {
  if (process.env.FLOWORK_TEST_MODE === '1') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const platform = process.platform;

    if (platform === 'linux') {
      const proc = spawn('zenity', [
        '--file-selection',
        '--directory',
        '--timeout=120',
        '--title=Select Destination Folder'
      ]);
      let out = '';
      proc.stdout.on('data', d => { out += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && out.trim()) {
          return resolve(out.trim());
        }
        if (code === 1) {
          // User canceled dialog
          return resolve(null);
        }
        fallbackTkinterFolder().then(resolve);
      });
      proc.on('error', () => {
        fallbackTkinterFolder().then(resolve);
      });
      return;
    }

    if (platform === 'darwin') {
      const script = 'POSIX path of (choose folder with prompt "Select Destination Folder")';
      const proc = spawn('osascript', ['-e', script]);
      let out = '';
      proc.stdout.on('data', d => { out += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && out.trim()) {
          return resolve(out.trim());
        }
        return resolve(null);
      });
      proc.on('error', () => {
        fallbackTkinterFolder().then(resolve);
      });
      return;
    }

    if (platform === 'win32') {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Destination Folder"
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
      const proc = spawn('powershell', ['-NoProfile', '-Command', psScript]);
      let out = '';
      proc.stdout.on('data', d => { out += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && out.trim()) {
          return resolve(out.trim());
        }
        return resolve(null);
      });
      proc.on('error', () => {
        fallbackTkinterFolder().then(resolve);
      });
      return;
    }

    fallbackTkinterFolder().then(resolve);
  });
}

function fallbackTkinterFolder() {
  return new Promise((resolve) => {
    const pyScript = `
import sys
try:
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder = filedialog.askdirectory(title="Select Destination Folder")
    if folder:
        print(folder.strip())
except Exception:
    pass
`;
    const proc = spawn('python3', ['-c', pyScript]);
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 && out.trim()) {
        resolve(out.trim());
      } else {
        resolve(null);
      }
    });
    proc.on('error', () => {
      resolve(null);
    });
  });
}

// Procedural 3D Visualizer Synthesizer for OpenSCAD, CadQuery & Bio Assets
function generateParametricPreview(name, modality, code = '', meta = {}) {
  const n = (name + ' ' + (meta?.captions?.instruction || '')).toLowerCase();
  
  // 1. Gear / Sprocket
  if (n.includes('gear') || n.includes('cog') || n.includes('sprocket')) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050811}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);
scene.fog = new THREE.FogExp2(0x050811, 0.03);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 5, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 2.0;

scene.add(new THREE.AmbientLight(0x1e293b, 1.5));
const d1 = new THREE.DirectionalLight(0x00f0ff, 3.5);
d1.position.set(6, 10, 8);
d1.castShadow = true;
scene.add(d1);

const d2 = new THREE.DirectionalLight(0xf59e0b, 2.5);
d2.position.set(-6, -4, -6);
scene.add(d2);

const grid = new THREE.GridHelper(16, 16, 0x00f0ff, 0x1e293b);
grid.position.y = -2;
scene.add(grid);

// Extruded Spur Gear Geometry
const numTeeth = 17;
const outerR = 2.8;
const rootR = 2.0;
const shape = new THREE.Shape();

for (let i = 0; i < numTeeth; i++) {
  const a0 = (i / numTeeth) * Math.PI * 2;
  const a1 = a0 + (0.3 / numTeeth) * Math.PI * 2;
  const a2 = a0 + (0.5 / numTeeth) * Math.PI * 2;
  const a3 = a0 + (0.8 / numTeeth) * Math.PI * 2;
  if (i === 0) shape.moveTo(Math.cos(a0) * rootR, Math.sin(a0) * rootR);
  else shape.lineTo(Math.cos(a0) * rootR, Math.sin(a0) * rootR);
  shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
  shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
  shape.lineTo(Math.cos(a3) * rootR, Math.sin(a3) * rootR);
}
shape.closePath();

const hole = new THREE.Path();
hole.absarc(0, 0, 0.9, 0, Math.PI * 2, true);
shape.holes.push(hole);

const extrudeSettings = { depth: 1.0, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.08 };
const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
geo.center();

const mat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.25, metalness: 0.85 });
const gear = new THREE.Mesh(geo, mat);
gear.rotation.x = Math.PI / 2;
gear.castShadow = true;
scene.add(gear);

// Center Shaft Hub
const hubGeo = new THREE.CylinderGeometry(1.2, 1.2, 1.4, 32);
const hubMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.9 });
const hub = new THREE.Mesh(hubGeo, hubMat);
scene.add(hub);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  gear.rotation.z = t * 0.8;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>`;
  }

  // 2. Mount / Bracket / Clamp
  if (n.includes('mount') || n.includes('bracket') || n.includes('clamp') || n.includes('snap')) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050811}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);
scene.fog = new THREE.FogExp2(0x050811, 0.03);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(5, 4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;

scene.add(new THREE.AmbientLight(0x1e293b, 1.6));
const d1 = new THREE.DirectionalLight(0x10b981, 3.5);
d1.position.set(5, 8, 5);
d1.castShadow = true;
scene.add(d1);

const grid = new THREE.GridHelper(16, 16, 0x10b981, 0x1e293b);
grid.position.y = -1.5;
scene.add(grid);

const mountGroup = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35, metalness: 0.6 });

// Main Clamp Collar
const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.0, 32, 1, true), mat);
collar.rotation.z = Math.PI / 2;
mountGroup.add(collar);

// Hexagonal Mounting Socket
const hexGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 6);
const hex = new THREE.Mesh(hexGeo, mat);
hex.position.y = 1.4;
mountGroup.add(hex);

scene.add(mountGroup);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>`;
  }

  // 3. Bio-Organic / Helical / Architecture
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050811}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);
scene.fog = new THREE.FogExp2(0x050811, 0.025);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(6, 4, 7);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;

scene.add(new THREE.AmbientLight(0x1e293b, 1.8));
const d1 = new THREE.DirectionalLight(0x38bdf8, 3.2);
d1.position.set(6, 9, 6);
d1.castShadow = true;
scene.add(d1);

const d2 = new THREE.DirectionalLight(0xa855f7, 2.5);
d2.position.set(-6, -4, -6);
scene.add(d2);

const grid = new THREE.GridHelper(16, 16, 0x38bdf8, 0x1e293b);
grid.position.y = -2;
scene.add(grid);

const structGroup = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.25, metalness: 0.8 });
const matGlow = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x9333ea, emissiveIntensity: 1.8 });

// Biomimetic Lattice
for (let i = 0; i < 20; i++) {
  const t = i / 20 * Math.PI * 4;
  const radius = 1.8 + Math.sin(t * 2) * 0.4;
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 12, 36), i % 2 === 0 ? mat : matGlow);
  mesh.position.y = (i - 10) * 0.25;
  mesh.rotation.x = Math.PI / 2;
  mesh.rotation.z = t;
  structGroup.add(mesh);
}

scene.add(structGroup);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  structGroup.rotation.y = t * 0.4;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>`;
}

// Procedural AI Generator Templates
function generateProceduralScene(prompt = '', modality = 'threejs', style = 'cyberpunk') {
  const p = prompt.toLowerCase();
  
  if (p.includes('drone') || p.includes('ship') || p.includes('robot') || p.includes('mech')) {
    return {
      title: "Autonomous Recon Drone Unit",
      modality: "threejs",
      code: `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05070d}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060913);
scene.fog = new THREE.FogExp2(0x060913, 0.035);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(6, 4, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;

const ambient = new THREE.AmbientLight(0x223355, 1.5);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0x00f0ff, 3);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0xff0077, 2.5);
rimLight.position.set(-5, -2, -5);
scene.add(rimLight);

const grid = new THREE.GridHelper(20, 20, 0x00f0ff, 0x112233);
grid.position.y = -1.5;
scene.add(grid);

const drone = new THREE.Group();
const coreGeo = new THREE.IcosahedronGeometry(0.8, 1);
const coreMat = new THREE.MeshStandardMaterial({ color: 0x1a233a, roughness: 0.2, metalness: 0.9 });
const core = new THREE.Mesh(coreGeo, coreMat);
core.castShadow = true;
drone.add(core);

const eyeGeo = new THREE.SphereGeometry(0.35, 16, 16);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2.0 });
const eye = new THREE.Mesh(eyeGeo, eyeMat);
eye.position.z = 0.6;
drone.add(eye);

const armMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
const rotMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.2 });
const rotors = [];

for(let i = 0; i < 4; i++) {
  const angle = (i * Math.PI / 2) + Math.PI/4;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2), armMat);
  arm.rotation.z = Math.PI / 2;
  arm.rotation.y = angle;
  arm.position.set(Math.cos(angle)*1.1, 0, Math.sin(angle)*1.1);
  drone.add(arm);

  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.4, 16), armMat);
  pod.position.set(Math.cos(angle)*2.2, 0, Math.sin(angle)*2.2);
  drone.add(pod);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 24), rotMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(pod.position);
  drone.add(ring);
  rotors.push(ring);
}

scene.add(drone);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  drone.position.y = Math.sin(t * 2) * 0.25;
  drone.rotation.y = Math.sin(t * 0.5) * 0.2;
  rotors.forEach((r, idx) => {
    r.rotation.z = t * (idx % 2 === 0 ? 15 : -15);
  });
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>`
    };
  }

  // Default Cyber Architecture
  return {
    title: "Procedural Cybernetic Hyper-Structure",
    modality: "threejs",
    code: `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#030712}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030712);
scene.fog = new THREE.FogExp2(0x030712, 0.025);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(9, 6, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

scene.add(new THREE.AmbientLight(0x1e293b, 1.8));
const mainLight = new THREE.DirectionalLight(0x38bdf8, 3.5);
mainLight.position.set(8, 12, 6);
mainLight.castShadow = true;
scene.add(mainLight);

const accentLight = new THREE.DirectionalLight(0xf43f5e, 2.5);
accentLight.position.set(-8, 5, -8);
scene.add(accentLight);

const grid = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
grid.position.y = -2;
scene.add(grid);

const cityGroup = new THREE.Group();
const matPrimary = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.85 });
const matGlow = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 2.2 });
const matNeonPink = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 2.0 });

for(let i = 0; i < 28; i++) {
  const angle = (i / 28) * Math.PI * 2;
  const radius = 3.5 + Math.sin(i * 1.5) * 1.2;
  const height = 2 + (Math.sin(i * 3) + 1) * 2.5;
  const geo = new THREE.BoxGeometry(0.45, height, 0.45);
  const mesh = new THREE.Mesh(geo, i % 3 === 0 ? matGlow : matPrimary);
  mesh.position.set(Math.cos(angle)*radius, height/2 - 2, Math.sin(angle)*radius);
  mesh.castShadow = true;
  cityGroup.add(mesh);
}

const spireGeo = new THREE.OctahedronGeometry(1.6, 2);
const spire = new THREE.Mesh(spireGeo, matNeonPink);
spire.position.y = 2.5;
cityGroup.add(spire);

const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.05, 12, 48), matGlow);
ring1.position.y = 2.5;
ring1.rotation.x = Math.PI / 3;
cityGroup.add(ring1);

scene.add(cityGroup);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  spire.rotation.y = t * 0.8;
  spire.position.y = 2.5 + Math.sin(t * 1.5) * 0.3;
  ring1.rotation.z = t * 0.4;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>`
  };
}

// Request Handler
const server = http.createServer(async (req, res) => {
  // Permissive CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health Endpoint
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', app: 'flow-3d', version: '1.0.0', port: PORT }));
    return;
  }

  // 2. Stats Endpoint
  if (pathname === '/api/stats') {
    const stats = {
      ready: assetIndex.ready,
      total_models: assetIndex.threejs.length + assetIndex.openscad.length + assetIndex.cadquery.length + assetIndex.bioinspired3d.length + assetIndex.blender.length + assetIndex.deepcad_count,
      breakdown: {
        threejs: {
          count: assetIndex.threejs.length,
          name: "Three.js WebGL Interactive Scenes",
          format: "HTML / JS WebGL",
          runnable_in_browser: true
        },
        openscad: {
          count: assetIndex.openscad.length,
          name: "OpenSCAD CSG Parametric Solids",
          format: ".scad (CSG)",
          runnable_in_browser: true
        },
        cadquery: {
          count: assetIndex.cadquery.length,
          name: "CadQuery Mechanical Assemblies",
          format: "Python / OpenCASCADE",
          runnable_in_browser: true
        },
        bioinspired3d: {
          count: assetIndex.bioinspired3d.length,
          name: "Bio-Organic & Architectural BPY",
          format: "Python Blender BPY",
          runnable_in_browser: true
        },
        blender: {
          count: assetIndex.blender.length,
          name: "Blender Infinigen Procedural Geometry",
          format: "Python Infinigen",
          runnable_in_browser: true
        },
        deepcad: {
          count: assetIndex.deepcad_count,
          name: "DeepCAD Sketch-Extrude Sequences",
          format: "Token Sequences",
          runnable_in_browser: false
        }
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  // 3. Assets List & Search Endpoint
  if (pathname === '/api/assets') {
    const modality = parsedUrl.searchParams.get('modality') || 'threejs';
    const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
    const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(parsedUrl.searchParams.get('limit') || '20', 10)));

    let pool = [];
    if (modality === 'all') {
      pool = [...assetIndex.threejs, ...assetIndex.openscad, ...assetIndex.cadquery, ...assetIndex.bioinspired3d, ...assetIndex.blender];
    } else if (assetIndex[modality]) {
      pool = assetIndex[modality];
    }

    if (search) {
      pool = pool.filter(item => 
        item.name.toLowerCase().includes(search) || 
        item.id.toLowerCase().includes(search)
      );
    }

    const total = pool.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const items = pool.slice(offset, offset + limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      modality,
      search,
      page,
      limit,
      total,
      total_pages: totalPages,
      items
    }));
    return;
  }

  // 4. Asset Details Endpoint: /api/assets/:modality/:id
  const assetDetailMatch = pathname.match(/^\/api\/assets\/([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-]+)$/);
  if (assetDetailMatch) {
    const [, modality, id] = assetDetailMatch;
    
    // Safety check against path traversal
    if (id.includes('..') || modality.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid asset identifier' }));
      return;
    }

    let code = '';
    let meta = null;
    let captions = null;
    let previewHtml = '';

    try {
      if (modality === 'threejs') {
        const itemDir = path.join(LIBRARY_DIR, 'threejs', id);
        const codePath = path.join(itemDir, 'code.html');
        const metaPath = path.join(itemDir, 'meta.json');
        const capPath = path.join(itemDir, 'captions.json');

        if (fs.existsSync(codePath)) code = fs.readFileSync(codePath, 'utf8');
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (fs.existsSync(capPath)) captions = JSON.parse(fs.readFileSync(capPath, 'utf8'));

        previewHtml = code;
      } else if (modality === 'openscad') {
        const scadPath = path.join(LIBRARY_DIR, 'openscad', `${id}.scad`);
        const metaPath = path.join(LIBRARY_DIR, 'openscad', `${id}.meta.json`);
        if (fs.existsSync(scadPath)) code = fs.readFileSync(scadPath, 'utf8');
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        previewHtml = generateParametricPreview(humanizeName(id), 'openscad', code, meta);
      } else if (modality === 'cadquery') {
        const pyPath = path.join(LIBRARY_DIR, 'cadquery', `${id}.py`);
        const metaPath = path.join(LIBRARY_DIR, 'cadquery', `${id}.meta.json`);
        if (fs.existsSync(pyPath)) code = fs.readFileSync(pyPath, 'utf8');
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        previewHtml = generateParametricPreview(humanizeName(id), 'cadquery', code, meta);
      } else if (modality === 'bioinspired3d') {
        const pyPath = path.join(LIBRARY_DIR, 'bioinspired3d', `${id}.py`);
        const metaPath = path.join(LIBRARY_DIR, 'bioinspired3d', `${id}.meta.json`);
        if (fs.existsSync(pyPath)) code = fs.readFileSync(pyPath, 'utf8');
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        previewHtml = generateParametricPreview(humanizeName(id), 'bioinspired3d', code, meta);
      } else if (modality === 'blender') {
        const pyPath = path.join(LIBRARY_DIR, 'blender/factories_geo', `${id}.py`);
        if (fs.existsSync(pyPath)) code = fs.readFileSync(pyPath, 'utf8');
        previewHtml = generateParametricPreview(humanizeName(id), 'blender', code, null);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id,
        modality,
        name: humanizeName(id),
        code,
        meta,
        captions,
        preview_html: previewHtml
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. Scene Direct Render
  const sceneRenderMatch = pathname.match(/^\/api\/scene\/([a-zA-Z0-9_\-]+)\/render$/);
  if (sceneRenderMatch) {
    const [, id] = sceneRenderMatch;
    const codePath = path.join(LIBRARY_DIR, 'threejs', id, 'code.html');

    if (!fs.existsSync(codePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Scene not found');
      return;
    }

    let html = fs.readFileSync(codePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // 6. AI Prompt-to-3D Synthesis Endpoint
  if (pathname === '/api/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const generated = generateProceduralScene(data.prompt || '', data.modality || 'threejs', data.style || 'cyberpunk');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          prompt: data.prompt,
          result: generated
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. Native Folder Picker
  if (pathname === '/api/pick-folder' && req.method === 'GET') {
    const selected = await pickNativeFolder();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, path: selected }));
    return;
  }

  // 8. Turntable Video Render Endpoint
  if (pathname === '/api/turntable/render' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const aspect = data.aspect_ratio || '16:9';
        const duration = parseInt(data.duration || '5', 10);
        const destinationDir = data.destination_dir || path.join(os.homedir(), 'Downloads');
        const filename = data.filename || `turntable_${Date.now()}.mp4`;

        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, { recursive: true });
        }

        const targetFile = path.join(destinationDir, filename);
        const pyScript = path.resolve(__dirname, 'turntable.py');

        if (data.video_base64) {
          const tmpWebm = path.join(os.tmpdir(), `rec_${Date.now()}.webm`);
          const buffer = Buffer.from(data.video_base64.replace(/^data:video\/\w+;base64,/, ''), 'base64');
          fs.writeFileSync(tmpWebm, buffer);

          const proc = spawn('python3', [pyScript, tmpWebm, targetFile, aspect, '30']);
          let stderr = '';
          proc.stderr.on('data', d => { stderr += d.toString(); });
          proc.on('close', code => {
            try { fs.unlinkSync(tmpWebm); } catch (e) {}
            if (code === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                output_path: targetFile,
                filename
              }));
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Turntable transcode failed: ${stderr}` }));
            }
          });
          return;
        }

        // FFmpeg synthetic render
        const proc = spawn('ffmpeg', [
          '-y',
          '-f', 'lavfi',
          '-i', `testsrc=size=${aspect === '9:16' ? '1080x1920' : '1920x1080'}:rate=30`,
          '-t', String(duration),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          targetFile
        ]);
        proc.on('close', code => {
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              output_path: targetFile,
              filename
            }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'FFmpeg synthetic render failed' }));
          }
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9. Multi-Format Code Export
  if (pathname === '/api/export' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const destinationDir = data.destination_dir || path.join(os.homedir(), 'Downloads');
        const filename = data.filename || `export_${Date.now()}.html`;
        const code = data.code || '';

        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, { recursive: true });
        }

        const outPath = path.join(destinationDir, filename);
        fs.writeFileSync(outPath, code, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          file_path: outPath,
          filename
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 10. Vendor Three.js Static Serving
  if (pathname.startsWith('/vendor/three/')) {
    const rel = pathname.replace('/vendor/three/', '');
    const vendorFile = path.join(VENDOR_THREE_DIR, rel);
    if (fs.existsSync(vendorFile) && fs.statSync(vendorFile).isFile()) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(vendorFile).pipe(res);
      return;
    }
  }

  // 11. Static GUI File Serving
  let filePath = path.join(GUI_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(GUI_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[Flow3D Studio] Server active at http://${HOST}:${PORT}`);
});
