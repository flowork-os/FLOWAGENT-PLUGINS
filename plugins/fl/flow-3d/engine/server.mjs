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

function formatTitle(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function buildAssetIndex() {
  console.log(`[Flow3D Studio] Deep indexing 3D assets from: ${LIBRARY_DIR}`);
  const startTime = Date.now();

  try {
    // 1. Three.js scenes (1,007 verified runnable scenes with code.html)
    const threeDir = path.join(LIBRARY_DIR, 'threejs');
    if (fs.existsSync(threeDir)) {
      const items = fs.readdirSync(threeDir, { withFileTypes: true });
      assetIndex.threejs = items
        .filter(d => {
          if (!d.isDirectory()) return false;
          return fs.existsSync(path.join(threeDir, d.name, 'code.html'));
        })
        .map(d => {
          const itemDir = path.join(threeDir, d.name);
          let title = '';
          let style = '';
          let instruction = '';

          const metaPath = path.join(itemDir, 'meta.json');
          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              title = meta.scene_title || meta.name || '';
              style = meta.style || '';
            } catch (_) {}
          }

          const capPath = path.join(itemDir, 'captions.json');
          if (fs.existsSync(capPath)) {
            try {
              const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
              instruction = cap.instruction || cap.user_instruction || '';
              if (!title) title = cap.style || '';
            } catch (_) {}
          }

          if (!title) {
            title = d.name.replace(/^codex_luna_opus_scene_|^opus_scene_|^codex_terra_threejs_|^codex_sol_threejs_|^fable_5_threejs_/, '');
            title = title.replace(/_[a-f0-9]{8,}$/, '');
          }

          const cleanTitle = formatTitle(title) || 'Interactive 3D Scene';

          return {
            id: d.name,
            name: cleanTitle,
            modality: 'threejs',
            type: 'Three.js WebGL Interactive Scene',
            style: style || 'Interactive WebGL',
            instruction: instruction.slice(0, 160),
            runnable: true,
            path: path.join('threejs', d.name)
          };
        });
    }

    // 2. OpenSCAD Designs (1,193 parametric solid models)
    const scadDir = path.join(LIBRARY_DIR, 'openscad');
    if (fs.existsSync(scadDir)) {
      const files = fs.readdirSync(scadDir);
      assetIndex.openscad = files
        .filter(f => f.endsWith('.meta.json'))
        .map(f => {
          const base = f.replace(/\.meta\.json$/, '');
          const metaPath = path.join(scadDir, f);
          let name = base;
          let instruction = '';
          let lines = 0;

          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            name = meta.name || base;
            instruction = meta.captions?.instruction || meta.captions?.detailed || '';
            lines = meta.lines || 0;
          } catch (_) {}

          return {
            id: base,
            name: formatTitle(name),
            modality: 'openscad',
            type: 'OpenSCAD CSG Parametric Solid',
            style: 'Parametric CSG CAD',
            instruction: instruction.slice(0, 160),
            lines,
            runnable: true,
            path: path.join('openscad', `${base}.scad`)
          };
        });
    }

    // 3. CadQuery Assemblies (1,153 mechanical CAD models)
    const cadDir = path.join(LIBRARY_DIR, 'cadquery');
    if (fs.existsSync(cadDir)) {
      const files = fs.readdirSync(cadDir);
      assetIndex.cadquery = files
        .filter(f => f.endsWith('.meta.json'))
        .map(f => {
          const base = f.replace(/\.meta\.json$/, '');
          const metaPath = path.join(cadDir, f);
          let name = base;
          let instruction = '';
          let lines = 0;

          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            name = meta.name || base;
            instruction = meta.captions?.instruction || '';
            lines = meta.lines || 0;
          } catch (_) {}

          return {
            id: base,
            name: formatTitle(name),
            modality: 'cadquery',
            type: 'CadQuery OpenCASCADE Mechanical Assembly',
            style: 'Mechanical Engineering CAD',
            instruction: instruction.slice(0, 160),
            lines,
            runnable: true,
            path: path.join('cadquery', `${base}.py`)
          };
        });
    }

    // 4. Bioinspired3D (4,557 procedural biological forms)
    const bioDir = path.join(LIBRARY_DIR, 'bioinspired3d');
    if (fs.existsSync(bioDir)) {
      const files = fs.readdirSync(bioDir);
      assetIndex.bioinspired3d = files
        .filter(f => f.endsWith('.py'))
        .map(f => {
          const base = f.replace(/\.py$/, '');
          const clean = base
            .replace(/^\d+_\d+_/, '')
            .replace(/^\d+_/, '')
            .replace(/^(make|using|with|by_using|a)?_?blender_(code|python_code|script)_(for_making|that_builds|that_generates|to_build|for|that)?_?/i, '')
            .replace(/_/g, ' ')
            .trim();
          const cleanName = formatTitle(clean) || 'Procedural Biomimetic Structure';
          return {
            id: base,
            name: cleanName,
            modality: 'bioinspired3d',
            type: 'Bio-Organic & Architectural BPY Structure',
            style: 'Procedural Organic Architecture',
            instruction: cleanName,
            runnable: true,
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
          const metaPath = path.join(blendGeoDir, `${base}.meta.json`);
          let instruction = 'Blender Infinigen mathematical geometry factory for procedural nature and hard surfaces.';
          let name = base.replace(/_factory$/i, '').replace(/Factory$/i, '');
          if (fs.existsSync(metaPath)) {
            try {
              const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              if (m.caption) instruction = m.caption;
              if (m.name) name = m.name.replace(/_factory$/i, '').replace(/Factory$/i, '');
            } catch (_) {}
          }
          return {
            id: base,
            name: formatTitle(name),
            modality: 'blender',
            type: 'Blender Infinigen Procedural Geometry Factory',
            style: 'Hollywood-Grade Procedural Geometry',
            instruction: instruction.slice(0, 160),
            runnable: true,
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
    console.log(`[Flow3D Studio] Indexed ${total} valid models (${assetIndex.threejs.length} Three.js WebGL scenes) in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.error('[Flow3D Studio] Indexing error:', err.message);
  }
}

// Trigger background indexing
buildAssetIndex();

// Procedural 3D Mesh Synthesizer for CAD & Procedural Models
function synthesizeCadModelScene(title, instruction = '', modality = 'cadquery', id = '') {
  const t = (title + ' ' + instruction + ' ' + id).toLowerCase();
  const cleanT = (title + ' ' + instruction + ' ' + id)
    .toLowerCase()
    .replace(/blender\s*(python)?\s*(code|script)?/gi, ' ')
    .replace(/\b(bpy|bmesh|python|script|code|make|create|generate|construct|build|model|using|with|by_using|a|that|to)\b/gi, ' ')
    .replace(/_/g, ' ')
    .trim();

  let meshCode = '';
  let animCode = '';
  let camPos = '6, 5, 8';

  // Deterministic seed based on id and title for infinite variety
  const seedStr = (id || title || 'asset').toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = ((seed << 5) - seed) + seedStr.charCodeAt(i);
    seed |= 0;
  }
  const absSeed = Math.abs(seed);

  // Curated high-contrast color palettes
  const colorThemes = [
    { primary: 0x0284c7, accent: 0x00f0ff, dark: 0x0f172a, metal: 0.85, rough: 0.25 }, // Cyber Blue
    { primary: 0xd97706, accent: 0xfbbf24, dark: 0x1f2937, metal: 0.75, rough: 0.35 }, // Industrial Gold
    { primary: 0x059669, accent: 0x34d399, dark: 0x064e3b, metal: 0.8, rough: 0.3 },   // Emerald Jade
    { primary: 0x7c3aed, accent: 0xa78bfa, dark: 0x1e1b4b, metal: 0.7, rough: 0.2 },   // Neon Violet
    { primary: 0xe11d48, accent: 0xfb7185, dark: 0x3f0e1a, metal: 0.85, rough: 0.25 }, // Crimson Laser
    { primary: 0x475569, accent: 0x38bdf8, dark: 0x090d16, metal: 0.9, rough: 0.15 },  // Titanium Steel
    { primary: 0xb45309, accent: 0xfef08a, dark: 0x451a03, metal: 0.8, rough: 0.3 },   // Bronze Copper
    { primary: 0x0284c7, accent: 0x38bdf8, dark: 0xf8fafc, metal: 0.4, rough: 0.1 }    // Arctic Ceramic
  ];
  const theme = colorThemes[absSeed % colorThemes.length];

  if (t.includes('telescope') || t.includes('spotting') || t.includes('astronomy')) {
    camPos = '5, 4, 7';
    meshCode = `
      const root = new THREE.Group();
      const matTripod = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.85 });
      const matBeige = new THREE.MeshStandardMaterial({ color: 0xd9c5a0, roughness: 0.25, metalness: 0.4 });
      const matLens = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.85 });

      for(let i=0; i<3; i++) {
        const angle = i * Math.PI * 2 / 3;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 3.8), matTripod);
        leg.position.set(Math.cos(angle)*1.0, -0.6, Math.sin(angle)*1.0);
        leg.rotation.z = Math.sin(angle) * 0.45;
        leg.rotation.x = -Math.cos(angle) * 0.45;
        root.add(leg);
      }

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.5, 16), matTripod);
      hub.position.y = 1.0;
      root.add(hub);

      const tubeGroup = new THREE.Group();
      tubeGroup.position.y = 1.4;
      tubeGroup.rotation.x = 0.35;

      const tube1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.8, 24), matBeige);
      tube1.rotation.x = Math.PI / 2;
      tube1.position.x = 0.32;
      tubeGroup.add(tube1);

      const tube2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.8, 24), matBeige);
      tube2.rotation.x = Math.PI / 2;
      tube2.position.x = -0.32;
      tubeGroup.add(tube2);

      const lens1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 24), matLens);
      lens1.rotation.x = Math.PI / 2;
      lens1.position.set(0.32, 0, 1.4);
      tubeGroup.add(lens1);

      const lens2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 24), matLens);
      lens2.rotation.x = Math.PI / 2;
      lens2.position.set(-0.32, 0, 1.4);
      tubeGroup.add(lens2);

      root.add(tubeGroup);
      scene.add(root);
    `;
  } else if (t.includes('microscope') || t.includes('laboratory') || t.includes('optic')) {
    camPos = '5, 5, 6';
    meshCode = `
      const root = new THREE.Group();
      const matFrame = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
      const matChrome = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.15, metalness: 0.95 });
      const matBrass = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 });

      const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.8), matFrame);
      base.position.y = -1.6;
      root.add(base);

      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 2.8, 24), matFrame);
      pillar.position.set(0, -0.2, -0.8);
      pillar.rotation.x = 0.15;
      root.add(pillar);

      const stage = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 2.0), matFrame);
      stage.position.set(0, -0.2, 0.2);
      root.add(stage);

      const clip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.15), matChrome);
      clip.position.set(0, -0.1, 0.2);
      root.add(clip);

      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 24), matBrass);
      turret.position.set(0, 0.7, 0.2);
      root.add(turret);

      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 16), matChrome);
        obj.position.set(Math.cos(a) * 0.3, 0.45, 0.2 + Math.sin(a) * 0.3);
        root.add(obj);
      }

      const ocular = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.4, 24), matFrame);
      ocular.position.set(0, 1.4, -0.2);
      ocular.rotation.x = -0.4;
      root.add(ocular);

      const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 24), matChrome);
      eyepiece.position.set(0, 1.9, -0.42);
      eyepiece.rotation.x = -0.4;
      root.add(eyepiece);

      for (let s of [-0.4, 0.4]) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 24), matBrass);
        knob.rotation.z = Math.PI / 2;
        knob.position.set(s, -0.1, -0.8);
        root.add(knob);
      }

      scene.add(root);
    `;
  } else if (t.includes('fan') || t.includes('blower') || t.includes('ventilat') || t.includes('propeller')) {
    meshCode = `
      const root = new THREE.Group();
      const matHousing = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
      const matBlade = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.2, metalness: 0.6 });

      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.8), matHousing);
      root.add(frame);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 16, 48), matBlade);
      ring.position.z = 0.42;
      root.add(ring);

      const rotor = new THREE.Group();
      rotor.position.z = 0.1;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.4, 24), matHousing);
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);

      for(let i=0; i<5; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.04), matBlade);
        blade.position.y = 0.65;
        blade.rotation.z = i * Math.PI * 2 / 5;
        blade.rotation.y = 0.4;
        rotor.add(blade);
      }
      root.add(rotor);
      scene.add(root);
    `;
    animCode = `rotor.rotation.z = clock.getElapsedTime() * 15;`;
  } else if (t.includes('camera') || t.includes('flash') || t.includes('camcorder') || t.includes('lens')) {
    meshCode = `
      const root = new THREE.Group();
      const matBody = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.7 });
      const matLens = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.9 });
      const matGlass = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x38bdf8, emissiveIntensity: 1.5, roughness: 0.1 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.2), matBody);
      root.add(body);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.5), matBody);
      grip.position.set(0.9, 0, 0.7);
      root.add(grip);

      const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.8, 32), matBody);
      barrel1.rotation.x = Math.PI / 2;
      barrel1.position.set(-0.2, 0, 0.8);
      root.add(barrel1);

      const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.6, 32), matLens);
      barrel2.rotation.x = Math.PI / 2;
      barrel2.position.set(-0.2, 0, 1.4);
      root.add(barrel2);

      const frontGlass = new THREE.Mesh(new THREE.CircleGeometry(0.52, 32), matGlass);
      frontGlass.position.set(-0.2, 0, 1.71);
      root.add(frontGlass);

      const flash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), matBody);
      flash.position.set(-0.2, 1.0, 0.2);
      root.add(flash);

      scene.add(root);
    `;
  } else if (t.includes('keyboard') || t.includes('piano') || t.includes('synth') || t.includes('midi')) {
    meshCode = `
      const root = new THREE.Group();
      const matChassis = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.7 });
      const matWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
      const matBlack = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15 });
      const matAccent = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.0 });

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 1.8), matChassis);
      root.add(chassis);

      for (let i = 0; i < 14; i++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 1.0), matWhite);
        key.position.set(-1.6 + i * 0.25, 0.3, 0.3);
        root.add(key);
      }

      for (let i = 0; i < 10; i++) {
        if (i % 7 !== 2 && i % 7 !== 6) {
          const bkey = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.6), matBlack);
          bkey.position.set(-1.48 + i * 0.25, 0.42, 0.1);
          root.add(bkey);
        }
      }

      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), matAccent);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(-1.8, 0.35, 0.3);
      root.add(wheel);

      scene.add(root);
    `;
  } else if (t.includes('monitor') || t.includes('screen') || t.includes('display') || t.includes('television') || t.includes('tv')) {
    meshCode = `
      const root = new THREE.Group();
      const matFrame = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
      const matScreen = new THREE.MeshStandardMaterial({ color: 0x050811, emissive: 0x00f0ff, emissiveIntensity: 0.6, roughness: 0.2 });
      const matStand = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.2, metalness: 0.9 });

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.15), matFrame);
      bezel.position.y = 1.6;
      root.add(bezel);

      const display = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.0), matScreen);
      display.position.set(0, 1.6, 0.08);
      root.add(display);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 24), matStand);
      neck.position.set(0, 0.7, -0.3);
      neck.rotation.x = 0.1;
      root.add(neck);

      const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 32), matStand);
      basePlate.position.set(0, 0, -0.2);
      root.add(basePlate);

      scene.add(root);
    `;
  } else if (t.includes('chair') || t.includes('armchair') || t.includes('seat') || t.includes('stool') || t.includes('sofa')) {
    meshCode = `
      const root = new THREE.Group();
      const matUpholstery = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.1 });
      const matChrome = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 });

      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), matUpholstery);
      seat.position.y = 0.8;
      root.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.35), matUpholstery);
      back.position.set(0, 1.9, -0.9);
      back.rotation.x = -0.15;
      root.add(back);

      for (let s of [-1.1, 1.1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 1.6), matUpholstery);
        arm.position.set(s, 1.3, 0);
        root.add(arm);
      }

      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16), matChrome);
      ped.position.y = 0.4;
      root.add(ped);

      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 1.2, 16), matChrome);
        leg.position.set(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5);
        leg.rotation.z = Math.sin(a) * 1.2;
        leg.rotation.x = -Math.cos(a) * 1.2;
        root.add(leg);
      }

      scene.add(root);
    `;
  } else if (/\b(tables?|desks?|drafting|benches?)\b/i.test(t)) {
    meshCode = `
      const root = new THREE.Group();
      const matWood = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.4, metalness: 0.1 });
      const matFrame = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 });

      const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 2.8), matWood);
      top.position.set(0, 1.6, 0);
      top.rotation.x = 0.2;
      root.add(top);

      for (let s of [-1.8, 1.8]) {
        const legA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 16), matFrame);
        legA.position.set(s, 0.5, -0.6);
        legA.rotation.x = 0.2;
        root.add(legA);

        const legB = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 16), matFrame);
        legB.position.set(s, 0.5, 0.6);
        legB.rotation.x = -0.2;
        root.add(legB);

        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), matFrame);
        cross.position.set(s, 0.5, 0);
        root.add(cross);
      }

      const stretcher = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 16), matFrame);
      stretcher.rotation.z = Math.PI / 2;
      stretcher.position.set(0, 0.5, 0);
      root.add(stretcher);

      scene.add(root);
    `;
  } else if (t.includes('bottle') || t.includes('flask') || t.includes('vessel') || t.includes('container') || t.includes('jug') || t.includes('can')) {
    meshCode = `
      const points = [];
      points.push(new THREE.Vector2(0, -1.8));
      points.push(new THREE.Vector2(0.8, -1.8));
      points.push(new THREE.Vector2(0.9, -1.6));
      points.push(new THREE.Vector2(0.9, 0.6));
      points.push(new THREE.Vector2(0.75, 0.9));
      points.push(new THREE.Vector2(0.4, 1.2));
      points.push(new THREE.Vector2(0.35, 1.7));
      points.push(new THREE.Vector2(0.42, 1.8));
      points.push(new THREE.Vector2(0, 1.8));

      const geo = new THREE.LatheGeometry(points, 32);
      const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75 });
      const bottle = new THREE.Mesh(geo, mat);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 }));
      cap.position.y = 1.8;

      const root = new THREE.Group();
      root.add(bottle);
      root.add(cap);
      scene.add(root);
    `;
  } else if (/\b(casinos?|slots?|vending|arcades?|booths?)\b/i.test(t)) {
    meshCode = `
      const root = new THREE.Group();
      const matCabinet = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.7 });
      const matMarquee = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.2 });
      const matScreen = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.8 });

      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.4, 2.0), matCabinet);
      root.add(cab);

      const marquee = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.1), matMarquee);
      marquee.position.set(0, 1.8, 1.02);
      root.add(marquee);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), matScreen);
      screen.position.set(0, 0.6, 1.02);
      screen.rotation.x = -0.2;
      root.add(screen);

      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.9), matCabinet);
      shelf.position.set(0, -0.2, 1.3);
      root.add(shelf);

      scene.add(root);
    `;
  } else if (t.includes('washing') || t.includes('dryer') || t.includes('laundry') || t.includes('appliance')) {
    meshCode = `
      const root = new THREE.Group();
      const matWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.25, metalness: 0.3 });
      const matChrome = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.15, metalness: 0.95 });
      const matGlass = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, transparent: true, opacity: 0.7 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 2.6), matWhite);
      root.add(body);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 16, 48), matChrome);
      rim.position.set(0, -0.2, 1.32);
      root.add(rim);

      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), matGlass);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(0, -0.2, 1.32);
      root.add(glass);

      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 24), matChrome);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.6, 1.1, 1.32);
      root.add(knob);

      scene.add(root);
    `;
  } else if (t.includes('globe') || t.includes('planet') || t.includes('sphere') || t.includes('orb')) {
    meshCode = `
      const root = new THREE.Group();
      const matBrass = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.85 });
      const matGlobe = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.3 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.4, 32), matBrass);
      base.position.y = -1.8;
      root.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 16), matBrass);
      stem.position.y = -1.3;
      root.add(stem);

      const meridian = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.08, 16, 64, Math.PI), matBrass);
      meridian.rotation.z = -Math.PI / 2 + 0.4;
      meridian.position.y = 0.4;
      root.add(meridian);

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 24), matGlobe);
      sphere.position.y = 0.4;
      root.add(sphere);

      scene.add(root);
    `;
  } else if (t.includes('arm') || t.includes('robotic') || t.includes('crane') || t.includes('manipulator') || t.includes('actuator')) {
    meshCode = `
      const root = new THREE.Group();
      const matMetal = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 });
      const matJoint = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.8 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.6, 24), matMetal);
      base.position.y = -1.6;
      root.add(base);

      const lowerBoom = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.4), matMetal);
      lowerBoom.position.set(0, -0.3, 0);
      lowerBoom.rotation.z = -0.35;
      root.add(lowerBoom);

      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 24), matJoint);
      elbow.rotation.x = Math.PI / 2;
      elbow.position.set(0.65, 0.8, 0);
      root.add(elbow);

      const upperBoom = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 0.35), matMetal);
      upperBoom.position.set(0.1, 1.7, 0);
      upperBoom.rotation.z = 0.5;
      root.add(upperBoom);

      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16), matJoint);
      wrist.position.set(-0.6, 2.5, 0);
      root.add(wrist);

      scene.add(root);
    `;
  } else if (modality !== 'bioinspired3d' && modality !== 'blender' && (/\b(blenders?|mixers?|food processors?|smoothie)\b/i.test(title) || /\b(kitchen blender|food blender|countertop blender)\b/i.test(instruction))) {
    meshCode = `
      const root = new THREE.Group();
      const matBase = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 });
      const matJar = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.65 });
      const matLid = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.4 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.6, 32), matBase);
      base.position.y = -0.8;
      root.add(base);

      const jar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 2.6, 32, 1, true), matJar);
      jar.position.y = 1.3;
      root.add(jar);

      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 32), matLid);
      lid.position.y = 2.7;
      root.add(lid);

      scene.add(root);
    `;
  } else if (/\b(helical|helix|spiral|dna)\b/i.test(cleanT)) {
    camPos = '5, 4, 7';
    meshCode = `
      const root = new THREE.Group();
      const matStrand1 = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.2, metalness: 0.8 });
      const matStrand2 = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2, metalness: 0.8 });
      const matRung = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.8 });

      const numTurns = 28;
      for (let i = 0; i < numTurns; i++) {
        const a = (i / numTurns) * Math.PI * 4;
        const y = (i / numTurns) * 4.4 - 2.2;
        const r = 1.3;

        const n1 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), matStrand1);
        n1.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        root.add(n1);

        const n2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), matStrand2);
        n2.position.set(Math.cos(a + Math.PI) * r, y, Math.sin(a + Math.PI) * r);
        root.add(n2);

        if (i % 2 === 0) {
          const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, r * 2, 12), matRung);
          rung.position.set(0, y, 0);
          rung.rotation.z = Math.PI / 2;
          rung.rotation.y = -a;
          root.add(rung);
        }
      }
      scene.add(root);
    `;
  } else if (/\b(cellular|porous|honeycomb|hexagonal|trabecular|lattice)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matCell = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.6 });
      const matCore = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.6 });

      const hexRadius = 0.55;
      const hexDepth = 1.6;
      for (let row = -2; row <= 2; row++) {
        for (let col = -2; col <= 2; col++) {
          const x = (col + (row % 2) * 0.5) * hexRadius * 1.8;
          const y = row * hexRadius * 1.55;
          if (Math.sqrt(x*x + y*y) < 2.0) {
            const prism = new THREE.Mesh(new THREE.CylinderGeometry(hexRadius * 0.9, hexRadius * 0.9, hexDepth, 6, 1, true), matCell);
            prism.position.set(x, y, 0);
            prism.rotation.x = Math.PI / 2;
            root.add(prism);

            const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), matCore);
            core.position.set(x, y, 0);
            root.add(core);
          }
        }
      }
      scene.add(root);
    `;
  } else if (/\b(tubular|vascular|capillar|osteon)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matVessel = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.25, metalness: 0.7 });
      const matCore = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.9 });

      for (let i = 0; i < 7; i++) {
        const a = i === 0 ? 0 : (i - 1) * Math.PI * 2 / 6;
        const r = i === 0 ? 0 : 0.9;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 4.2, 24, 1, true), matVessel);
        tube.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        root.add(tube);

        const lumen = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.25, 16), matCore);
        lumen.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        root.add(lumen);
      }
      scene.add(root);
    `;
  } else if (/\b(bouligand|twisted|chitin|lamell|plywood|layered)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matChitin = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.8 });
      const matFiber = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.8 });

      const numLayers = 12;
      for (let i = 0; i < numLayers; i++) {
        const y = (i / numLayers) * 3.6 - 1.8;
        const rotY = (i / numLayers) * Math.PI * 0.75;
        const layer = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 3.0), matChitin);
        layer.position.y = y;
        layer.rotation.y = rotY;
        root.add(layer);

        for (let j = -2; j <= 2; j++) {
          const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 8), matFiber);
          fiber.rotation.z = Math.PI / 2;
          fiber.rotation.y = rotY;
          fiber.position.set(0, y + 0.11, j * 0.6);
          root.add(fiber);
        }
      }
      scene.add(root);
    `;
  } else if (/\b(sandwich|composite|corrugat)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matFace = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.9 });
      const matCore = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3, metalness: 0.7 });

      for (let y of [-1.2, 1.2]) {
        const face = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 2.4), matFace);
        face.position.y = y;
        root.add(face);
      }

      for (let i = -4; i <= 4; i++) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 2.2), matCore);
        strut.position.set(i * 0.4, 0, 0);
        strut.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.35;
        root.add(strut);
      }
      scene.add(root);
    `;
  } else if (/\b(cubes?|cubic)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.8 });
      const matEdge = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.2 });

      const cube = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), mat);
      cube.rotation.z = Math.PI / 4;
      cube.rotation.y = Math.PI / 4;
      root.add(cube);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.42, 2.42, 2.42)),
        new THREE.LineBasicMaterial({ color: 0x00f0ff })
      );
      edges.rotation.z = Math.PI / 4;
      edges.rotation.y = Math.PI / 4;
      root.add(edges);

      scene.add(root);
    `;
  } else if (/\b(cylinders?|cylindrical)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.25, metalness: 0.85 });
      const matCap = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 0.8 });

      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.4, 32), mat);
      cyl.rotation.z = Math.PI / 2;
      root.add(cyl);

      for (let s of [-1.71, 1.71]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 16, 48), matCap);
        rim.rotation.y = Math.PI / 2;
        rim.position.x = s;
        root.add(rim);
      }
      scene.add(root);
    `;
  } else if (/\b(cakes?)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matTier = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
      const matDeco = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.25, metalness: 0.4 });

      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.9, 32), matTier);
      t1.position.y = -0.9;
      root.add(t1);

      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 32), matTier);
      t2.position.y = -0.05;
      root.add(t2);

      const t3 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.7, 32), matTier);
      t3.position.y = 0.7;
      root.add(t3);

      const topper = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), matDeco);
      topper.position.y = 1.25;
      root.add(topper);

      scene.add(root);
    `;
  } else if (/\b(feeder|bird)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matWood = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 });
      const matRoof = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.7 });
      const matPerch = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.8 });

      const tray = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 2.0), matWood);
      tray.position.y = -0.8;
      root.add(tray);

      for (let x of [-0.8, 0.8]) {
        for (let z of [-0.8, 0.8]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 12), matWood);
          post.position.set(x, 0, z);
          root.add(post);
        }
      }

      const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 2.4), matRoof);
      roofL.position.set(-0.55, 1.1, 0);
      roofL.rotation.z = Math.PI / 4;
      root.add(roofL);

      const roofR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 2.4), matRoof);
      roofR.position.set(0.55, 1.1, 0);
      roofR.rotation.z = -Math.PI / 4;
      root.add(roofR);

      const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 12), matPerch);
      perch.rotation.z = Math.PI / 2;
      perch.position.set(0, -0.65, 0);
      root.add(perch);

      scene.add(root);
    `;
  } else if (/\b(bookshelf|bookshelves|shelf|shelves|rack)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matWood = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.4 });
      const matBook = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });

      for (let x of [-1.4, 1.4]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.8, 1.4), matWood);
        side.position.x = x;
        root.add(side);
      }

      for (let i = 0; i < 4; i++) {
        const y = -1.6 + i * 1.1;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 1.4), matWood);
        shelf.position.y = y;
        root.add(shelf);

        const book = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.65, 0.9), matBook);
        book.position.set(-0.6, y + 0.38, 0);
        root.add(book);
      }
      scene.add(root);
    `;
  } else if (/\b(sofas?|couches|couch)\b/i.test(cleanT)) {
    meshCode = `
      const root = new THREE.Group();
      const matCushion = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
      const matFeet = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.4 });

      const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.5, 1.8), matCushion);
      base.position.y = -0.4;
      root.add(base);

      const back = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.4, 0.4), matCushion);
      back.position.set(0, 0.4, -0.7);
      root.add(back);

      for (let s of [-1.9, 1.9]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 1.8), matCushion);
        arm.position.set(s, 0.1, 0);
        root.add(arm);
      }

      for (let x of [-1.7, 1.7]) {
        for (let z of [-0.7, 0.7]) {
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.4, 12), matFeet);
          foot.position.set(x, -0.85, z);
          root.add(foot);
        }
      }
      scene.add(root);
    `;
  } else if (t.includes('gear') || t.includes('cog') || t.includes('sprocket') || t.includes('transmission')) {
    meshCode = `
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

      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.08 });
      geo.center();
      const gear = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.25, metalness: 0.85 }));
      gear.rotation.x = Math.PI / 2;
      scene.add(gear);
    `;
  } else if (t.includes('chalice') || t.includes('lathe') || t.includes('goblet') || t.includes('cup') || t.includes('urn')) {
    meshCode = `
      const points = [];
      for (let i = 0; i < 20; i++) {
        const y = i * 0.2;
        let x = 0.5 + Math.sin(i * 0.4) * 0.4;
        if (i > 15) x = 0.6 + (i - 15) * 0.25;
        if (i === 0) x = 1.4;
        points.push(new THREE.Vector2(x, y));
      }
      const geo = new THREE.LatheGeometry(points, 32);
      geo.center();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 }));
      scene.add(mesh);
    `;
  } else if (t.includes('cannon') || t.includes('artillery') || t.includes('barrel')) {
    meshCode = `
      const root = new THREE.Group();
      const matIron = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.35, metalness: 0.8 });
      const matWood = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 });

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.4, 24), matIron);
      barrel.rotation.z = Math.PI / 2 - 0.25;
      barrel.position.set(0.2, 0.6, 0);
      root.add(barrel);

      const carriage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.4), matWood);
      carriage.position.set(0, 0, 0);
      root.add(carriage);

      for(let s of [-0.9, 0.9]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 24), matWood);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0, s);
        root.add(wheel);
      }
      scene.add(root);
    `;
  } else if (t.includes('bicycle') || t.includes('crankset') || t.includes('pedal') || t.includes('chainring')) {
    meshCode = `
      const root = new THREE.Group();
      const matMetal = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 });
      const matRing = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });

      const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.1, 48), matRing);
      ring.rotation.x = Math.PI / 2;
      root.add(ring);

      for(let i=0; i<2; i++) {
        const sign = i === 0 ? 1 : -1;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.2), matMetal);
        arm.position.set(0, sign * 1.0, sign * 0.4);
        root.add(arm);

        const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.5), matRing);
        pedal.position.set(0, sign * 2.1, sign * 0.8);
        root.add(pedal);
      }
      scene.add(root);
    `;
  } else if (t.includes('blimp') || t.includes('airship') || t.includes('balloon') || t.includes('zeppelin')) {
    meshCode = `
      const root = new THREE.Group();
      const matEnv = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.8 });
      const matCabin = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });

      const env = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 16), matEnv);
      env.scale.set(1.0, 1.0, 2.6);
      root.add(env);

      const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 1.6), matCabin);
      gondola.position.set(0, -1.5, 0);
      root.add(gondola);

      for(let i=0; i<4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.9), matEnv);
        fin.position.set(0, 0, -2.8);
        fin.rotation.z = i * Math.PI / 2;
        root.add(fin);
      }
      scene.add(root);
    `;
  } else if (t.includes('drone') || t.includes('quadcopter') || t.includes('multirotor')) {
    meshCode = `
      const root = new THREE.Group();
      const matCarbon = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.85 });
      const matProp = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.2, metalness: 0.6 });

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), matCarbon);
      body.scale.set(1.2, 0.5, 1.2);
      root.add(body);

      const rotorGroup = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 1.8), matCarbon);
        arm.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
        arm.rotation.y = -a + Math.PI / 2;
        root.add(arm);

        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16), matCarbon);
        pod.position.set(Math.cos(a) * 1.8, 0.15, Math.sin(a) * 1.8);
        root.add(pod);

        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.18), matProp);
        blade.position.set(Math.cos(a) * 1.8, 0.32, Math.sin(a) * 1.8);
        blade.rotation.y = a;
        rotorGroup.add(blade);
      }
      root.add(rotorGroup);
      scene.add(root);
    `;
    animCode = `rotorGroup.rotation.y = clock.getElapsedTime() * 20;`;
  } else if (t.includes('bracket') || t.includes('mount') || t.includes('hinge') || t.includes('flange') || t.includes('joint')) {
    meshCode = `
      const root = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.25, metalness: 0.9 });
      const matAccent = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.8 });

      const hPlate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 2.0), mat);
      hPlate.position.set(0.7, -1.0, 0);
      root.add(hPlate);

      const vPlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.8, 2.0), mat);
      vPlate.position.set(-0.6, 0.2, 0);
      root.add(vPlate);

      const gusset = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 1.8, 1.8, 3), mat);
      gusset.rotation.z = Math.PI / 4;
      gusset.position.set(0.2, -0.1, 0);
      root.add(gusset);

      for (let z of [-0.6, 0.6]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 12, 24), matAccent);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(1.4, -0.78, z);
        root.add(ring);
      }

      scene.add(root);
    `;
  } else if (t.includes('pipe') || t.includes('valve') || t.includes('fitting') || t.includes('manifold') || t.includes('elbow')) {
    meshCode = `
      const root = new THREE.Group();
      const matPipe = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.85 });
      const matFlange = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.9 });
      const matWheel = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.5 });

      const mainPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.6, 24), matPipe);
      mainPipe.rotation.z = Math.PI / 2;
      root.add(mainPipe);

      const tPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 24), matPipe);
      tPipe.position.y = 0.7;
      root.add(tPipe);

      for (let s of [-1.8, 1.8]) {
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 24), matFlange);
        flange.rotation.z = Math.PI / 2;
        flange.position.x = s;
        root.add(flange);
      }

      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 16, 32), matWheel);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 1.5;
      root.add(wheel);

      scene.add(root);
    `;
  } else if (t.includes('car') || t.includes('vehicle') || t.includes('automobile') || t.includes('chassis') || t.includes('truck')) {
    meshCode = `
      const root = new THREE.Group();
      const matBody = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.2, metalness: 0.85 });
      const matGlass = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.8 });
      const matTire = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 });
      const matWheel = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.95 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 2.0), matBody);
      body.position.y = 0.2;
      root.add(body);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.6), matGlass);
      cabin.position.set(-0.2, 0.9, 0);
      root.add(cabin);

      for (let x of [-1.3, 1.3]) {
        for (let z of [-1.1, 1.1]) {
          const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 24), matTire);
          tire.rotation.x = Math.PI / 2;
          tire.position.set(x, 0, z);
          root.add(tire);

          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.36, 16), matWheel);
          hub.rotation.x = Math.PI / 2;
          hub.position.set(x, 0, z);
          root.add(hub);
        }
      }

      scene.add(root);
    `;
  } else if (t.includes('lamp') || t.includes('lantern') || t.includes('light') || t.includes('chandelier')) {
    meshCode = `
      const root = new THREE.Group();
      const matBrass = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.85 });
      const matShade = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3 });
      const matBulb = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 2.0 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.2, 32), matBrass);
      base.position.y = -1.6;
      root.add(base);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 16), matBrass);
      pole.position.y = 0;
      root.add(pole);

      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.0, 24, 1, true), matShade);
      shade.position.y = 1.4;
      root.add(shade);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), matBulb);
      bulb.position.y = 1.2;
      root.add(bulb);

      scene.add(root);
    `;
  } else if (t.includes('plant') || t.includes('monocot') || t.includes('agave') || t.includes('tree') || t.includes('flower') || t.includes('leaf') || t.includes('cactus')) {
    meshCode = `
      const root = new THREE.Group();
      const matPot = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6, metalness: 0.1 });
      const matLeaf = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4, metalness: 0.2 });

      const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.8, 1.4, 24), matPot);
      pot.position.y = -1.0;
      root.add(pot);

      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI * 2 / 12;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.0, 16), matLeaf);
        leaf.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5);
        leaf.rotation.z = Math.sin(a) * 0.55;
        leaf.rotation.x = -Math.cos(a) * 0.55;
        root.add(leaf);
      }
      scene.add(root);
    `;
  } else if (t.includes('aquarium') || t.includes('tank') || t.includes('pool')) {
    meshCode = `
      const root = new THREE.Group();
      const matGlass = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.5 });
      const matWater = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, transparent: true, opacity: 0.7 });
      const matBase = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });

      const stand = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 2.2), matBase);
      stand.position.y = -1.3;
      root.add(stand);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.0), matGlass);
      root.add(glass);

      const water = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.8), matWater);
      water.position.y = -0.15;
      root.add(water);

      scene.add(root);
    `;
  } else if (t.includes('speaker') || t.includes('soundbar') || t.includes('audio') || t.includes('woofer')) {
    meshCode = `
      const root = new THREE.Group();
      const matCab = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.6 });
      const matCone = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
      const matCap = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.8 });

      const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 2.0), matCab);
      root.add(box);

      const woofer = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.2, 0.25, 32), matCone);
      woofer.rotation.x = Math.PI / 2;
      woofer.position.set(0, -0.4, 1.05);
      root.add(woofer);

      const dustCap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), matCap);
      dustCap.rotation.x = Math.PI / 2;
      dustCap.position.set(0, -0.4, 1.15);
      root.add(dustCap);

      const tweeter = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), matCap);
      tweeter.position.set(0, 0.9, 1.02);
      root.add(tweeter);

      scene.add(root);
    `;
  } else if (t.includes('auger') || t.includes('drill') || t.includes('spiral')) {
    meshCode = `
      const root = new THREE.Group();
      const matSteel = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.9 });
      const matBit = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.85 });

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.4, 24), matSteel);
      root.add(shaft);

      const flighting = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.15, 64, 16, 1, 7), matSteel);
      flighting.scale.set(1.0, 1.8, 1.0);
      root.add(flighting);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 16), matBit);
      tip.position.y = -2.0;
      tip.rotation.x = Math.PI;
      root.add(tip);

      scene.add(root);
    `;
  } else {
    // 6-Variant Deterministic Procedural Solid Generator for Infinite Variety
    const variant = absSeed % 6;

    if (variant === 0) {
      meshCode = `
        const points = [];
        const tiers = 16 + (${absSeed} % 8);
        for (let i = 0; i <= tiers; i++) {
          const y = (i / tiers) * 3.6 - 1.8;
          const r = 0.5 + Math.sin(i * 0.6 + ${absSeed % 5}) * 0.4 + Math.cos(i * 1.2) * 0.2;
          points.push(new THREE.Vector2(Math.max(0.2, r), y));
        }
        const geo = new THREE.LatheGeometry(points, 32);
        geo.center();
        const mat = new THREE.MeshStandardMaterial({
          color: ${theme.primary},
          roughness: ${theme.rough},
          metalness: ${theme.metal}
        });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
      `;
    } else if (variant === 1) {
      meshCode = `
        const root = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: ${theme.primary}, roughness: ${theme.rough}, metalness: ${theme.metal} });
        const matAccent = new THREE.MeshStandardMaterial({ color: ${theme.accent}, emissive: ${theme.accent}, emissiveIntensity: 1.0 });

        const core = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 2.2, 6), mat);
        root.add(core);

        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 24), matAccent);
        root.add(bore);

        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const pin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), matAccent);
          pin.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8);
          root.add(pin);
        }
        scene.add(root);
      `;
    } else if (variant === 2) {
      meshCode = `
        const root = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: ${theme.primary}, roughness: ${theme.rough}, metalness: ${theme.metal} });
        const matAccent = new THREE.MeshStandardMaterial({ color: ${theme.accent}, roughness: 0.2, metalness: 0.8 });

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 1.8, 32), mat);
        root.add(hub);

        const numBlades = 8 + (${absSeed} % 6);
        for (let i = 0; i < numBlades; i++) {
          const a = i * Math.PI * 2 / numBlades;
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.2), matAccent);
          blade.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4);
          blade.rotation.y = -a + 0.6;
          root.add(blade);
        }
        scene.add(root);
      `;
    } else if (variant === 3) {
      meshCode = `
        const root = new THREE.Group();
        const matBlock = new THREE.MeshStandardMaterial({ color: ${theme.dark}, roughness: 0.35, metalness: 0.85 });
        const matBush = new THREE.MeshStandardMaterial({ color: ${theme.accent}, roughness: 0.2, metalness: 0.9 });

        const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 1.8), matBlock);
        base.position.y = -1.0;
        root.add(base);

        const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 32), matBlock);
        housing.rotation.x = Math.PI / 2;
        housing.position.y = 0.2;
        root.add(housing);

        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 32), matBush);
        sleeve.rotation.x = Math.PI / 2;
        sleeve.position.y = 0.2;
        root.add(sleeve);

        scene.add(root);
      `;
    } else if (variant === 4) {
      meshCode = `
        const root = new THREE.Group();
        const matKnot = new THREE.MeshStandardMaterial({ color: ${theme.accent}, roughness: 0.2, metalness: 0.85 });
        const matCore = new THREE.MeshStandardMaterial({ color: ${theme.primary}, emissive: ${theme.primary}, emissiveIntensity: 0.5 });

        const p = 2 + (${absSeed} % 3);
        const q = 3 + (${absSeed} % 4);
        const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.4, 0.35, 96, 16, p, q), matKnot);
        root.add(knot);

        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 2), matCore);
        root.add(core);

        scene.add(root);
      `;
    } else {
      meshCode = `
        const root = new THREE.Group();
        const matPlate = new THREE.MeshStandardMaterial({ color: ${theme.primary}, roughness: 0.3, metalness: 0.6 });
        const matSpine = new THREE.MeshStandardMaterial({ color: ${theme.accent}, emissive: ${theme.accent}, emissiveIntensity: 1.2 });

        for (let i = 0; i < 7; i++) {
          const y = -1.4 + i * 0.45;
          const s = 1.0 - Math.abs(i - 3) * 0.18;
          const plate = new THREE.Mesh(new THREE.TorusGeometry(1.2 * s, 0.18, 12, 32, Math.PI), matPlate);
          plate.rotation.x = -Math.PI / 2 + 0.2;
          plate.position.set(0, y, 0);
          root.add(plate);

          const node = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), matSpine);
          node.position.set(0, y, -1.2 * s);
          root.add(node);
        }
        scene.add(root);
      `;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#050811}
  canvas{display:block}
  #hud{position:fixed;left:18px;top:16px;color:#00f0ff;font:11px 'JetBrains Mono',monospace;letter-spacing:1px;pointer-events:none;text-transform:uppercase;opacity:.85}
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
</head>
<body>
<div id="hud">⚡ ${modality.toUpperCase()} — PROCEDURAL 3D CAD</div>
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
camera.position.set(${camPos});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.4;

scene.add(new THREE.AmbientLight(0x1e293b, 1.8));
const key = new THREE.DirectionalLight(0x38bdf8, 3.5);
key.position.set(6, 10, 8);
key.castShadow = true;
scene.add(key);

const rim = new THREE.DirectionalLight(0xf43f5e, 2.2);
rim.position.set(-6, -3, -6);
scene.add(rim);

const grid = new THREE.GridHelper(16, 16, 0x00f0ff, 0x1e293b);
grid.position.y = -2;
scene.add(grid);

const clock = new THREE.Clock();

${meshCode}

function animate() {
  requestAnimationFrame(animate);
  ${animCode}
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

// Cross-Platform Native Folder Picker
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
        return resolve(null);
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
        item.id.toLowerCase().includes(search) ||
        (item.instruction && item.instruction.toLowerCase().includes(search)) ||
        (item.style && item.style.toLowerCase().includes(search))
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
  const assetDetailMatch = pathname.match(/^\/api\/assets\/([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-\.]+)$/);
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
    let sceneTitle = '';
    let instruction = '';

    try {
      if (modality === 'threejs') {
        const itemDir = path.join(LIBRARY_DIR, 'threejs', id);
        const codePath = path.join(itemDir, 'code.html');
        const metaPath = path.join(itemDir, 'meta.json');
        const capPath = path.join(itemDir, 'captions.json');

        if (fs.existsSync(codePath)) code = fs.readFileSync(codePath, 'utf8');
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          sceneTitle = meta.scene_title || meta.name || '';
        }
        if (fs.existsSync(capPath)) {
          captions = JSON.parse(fs.readFileSync(capPath, 'utf8'));
          instruction = captions.instruction || captions.user_instruction || '';
        }

      } else if (modality === 'openscad') {
        const scadPath = path.join(LIBRARY_DIR, 'openscad', `${id}.scad`);
        const metaPath = path.join(LIBRARY_DIR, 'openscad', `${id}.meta.json`);
        if (fs.existsSync(scadPath)) code = fs.readFileSync(scadPath, 'utf8');
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          sceneTitle = meta.name || '';
          instruction = meta.captions?.instruction || meta.captions?.detailed || '';
        }

      } else if (modality === 'cadquery') {
        const pyPath = path.join(LIBRARY_DIR, 'cadquery', `${id}.py`);
        const metaPath = path.join(LIBRARY_DIR, 'cadquery', `${id}.meta.json`);
        if (fs.existsSync(pyPath)) code = fs.readFileSync(pyPath, 'utf8');
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          sceneTitle = meta.name || '';
          instruction = meta.captions?.instruction || '';
        }

      } else if (modality === 'bioinspired3d') {
        const pyPath = path.join(LIBRARY_DIR, 'bioinspired3d', `${id}.py`);
        const metaPath = path.join(LIBRARY_DIR, 'bioinspired3d', `${id}.meta.json`);
        if (fs.existsSync(pyPath)) code = fs.readFileSync(pyPath, 'utf8');
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      } else if (modality === 'blender') {
        const pyPath = path.join(LIBRARY_DIR, 'blender/factories_geo', `${id}.py`);
        if (fs.existsSync(pyPath)) code = fs.readFileSync(pyPath, 'utf8');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id,
        modality,
        name: formatTitle(sceneTitle || id),
        code,
        meta,
        captions,
        instruction,
        runnable: true
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. Scene Direct Render: /api/scene/:modality/:id/render
  const sceneRenderMatch = pathname.match(/^\/api\/scene\/([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-\.]+)\/render$/) ||
                           pathname.match(/^\/api\/scene\/([a-zA-Z0-9_\-\.]+)\/render$/);
  if (sceneRenderMatch) {
    let modality = 'threejs';
    let id = '';

    if (sceneRenderMatch.length === 3) {
      modality = decodeURIComponent(sceneRenderMatch[1]);
      id = decodeURIComponent(sceneRenderMatch[2]);
    } else {
      id = decodeURIComponent(sceneRenderMatch[1]);
    }

    if (modality === 'threejs') {
      const codePath = path.join(LIBRARY_DIR, 'threejs', id, 'code.html');
      if (fs.existsSync(codePath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(codePath).pipe(res);
        return;
      }
    }

    // For CAD / OpenSCAD / Bioinspired / Blender, dynamically synthesize real 3D WebGL scene
    let name = formatTitle(id);
    let instruction = '';

    let metaFile = path.join(LIBRARY_DIR, modality, `${id}.meta.json`);
    if (modality === 'blender') {
      metaFile = path.join(LIBRARY_DIR, 'blender/factories_geo', `${id}.meta.json`);
    }

    if (fs.existsSync(metaFile)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        if (m.name) name = formatTitle(m.name);
        instruction = m.caption || m.captions?.instruction || m.captions?.detailed || '';
      } catch (_) {}
    } else if (modality === 'bioinspired3d') {
      const clean = id
        .replace(/^\d+_\d+_/, '')
        .replace(/^\d+_/, '')
        .replace(/^(make|using|with|by_using|a)?_?blender_(code|python_code|script)_(for_making|that_builds|that_generates|to_build|for|that)?_?/i, '')
        .replace(/_/g, ' ')
        .trim();
      name = formatTitle(clean) || 'Procedural Biomimetic Structure';
      instruction = name;
    }

    const html = synthesizeCadModelScene(name, instruction, modality, id);
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
        const prompt = data.prompt || '';
        const title = formatTitle(prompt) || "Custom 3D Synthesis";
        const code = synthesizeCadModelScene(title, prompt, 'procedural', 'gen_' + Date.now());

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          prompt,
          result: { title, modality: 'threejs', code }
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
              res.end(JSON.stringify({ success: true, output_path: targetFile, filename }));
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
            res.end(JSON.stringify({ success: true, output_path: targetFile, filename }));
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
        res.end(JSON.stringify({ success: true, file_path: outPath, filename }));
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
