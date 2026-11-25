import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createBotWSkyDome,
  createBotWTerrainMaterial,
  createBotWGrassMaterial,
  createGhibliFoliageMaterial,
  createBotWWaterMaterial,
  createBotWRockMaterial,
} from '../shaders/BotWShaders.js';
import { createWildflowerTexture } from '../shaders/ZeldaShaders.js';
import { createWoodPlankTexture, createZonaiRuneTexture } from '../utils/ToonMaterials.js';

function smoothRockGeo(rx, ry, rz, detail = 3) {
  let geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const n =
      Math.sin(x * 1.8 + y * 1.4) * 0.42 +
      Math.cos(z * 2.1 - x * 1.2) * 0.35 +
      Math.sin((x + z) * 3.2) * 0.18;
    const d = 1.0 + n * 0.15;
    pos.setXYZ(i, x * rx * d, y * ry * d, z * rz * d);
  }
  geo = mergeVertices(geo, 1e-3);
  geo.computeVertexNormals();
  return geo;
}

function alpinePeakGeo(radius, height, seed = 0) {
  // Radial grid mesh -> organic concave foothills + secondary shoulders + craggy BotW ridges (zero straight cone lines!)
  const segs = 44;
  const geo = new THREE.PlaneGeometry(radius * 2.2, radius * 2.2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rNorm = Math.hypot(x, z) / (radius * 1.08);
    if (rNorm >= 1.0) {
      pos.setY(i, -6.0);
      continue;
    }

    // Concave mountain profile (sweeping gentle foothills rising to steep craggy summit)
    const baseEnvelope = Math.pow(1.0 - rNorm, 1.65);

    // Secondary asymmetric shoulder peak + rugged ridged gullies
    const shDist = Math.hypot(x - radius * 0.34 * Math.cos(seed), z - radius * 0.28 * Math.sin(seed)) / (radius * 0.72);
    const shoulder = shDist < 1.0 ? Math.pow(1.0 - shDist, 1.8) * 0.52 : 0.0;

    const ridge1 = 1.0 - Math.abs(Math.sin(x * 0.048 + z * 0.036 + seed));
    const ridge2 = 1.0 - Math.abs(Math.cos(x * 0.082 - z * 0.074 - seed * 1.4));
    const crags = (ridge1 * 0.65 + ridge2 * 0.35) * (1.0 - rNorm) * 0.34;

    const y = (Math.max(baseEnvelope, shoulder) + crags) * height - 4.0;
    pos.setY(i, y);
  }

  geo.computeVertexNormals();
  return geo;
}

export class HyruleWorld {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.isSoftware = !!options.isSoftware;
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.waterLevel = -0.35;
    this.walkSurfaces = []; // Bridges & stone dais surfaces: { x, z, rx, rz, archFn }
    this.colliders = []; // Cylindrical trunks/columns/boulders: { x, z, r }

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.48, 0.62, -0.62).normalize() },
      uSunColor: { value: new THREE.Color('#fff5dd') },
      uSkyAmbient: { value: new THREE.Color('#7eb4e2') },
      uHorizonColor: { value: new THREE.Color('#cdebfa') },
      uSunGlowColor: { value: new THREE.Color('#ffe1a8') },
      uFogStrength: { value: 0.0046 },
      uPlayerPos: { value: new THREE.Vector3() },
      uSlashWave: { value: new THREE.Vector4(0, 0, 0, 0) },
    };

    this._setupLighting();
    this._buildSky();
    this._buildTerrainAndLake();
    this._buildDistantMountainsAndSkyIslands();
    this._buildHylianWoodenBridge();
    this._buildTempleOfTimeRuins();
    this._buildGoldenGinkgoSanctuary();
    this._buildLushMeadowGrassAndFlowers();
    this._buildAtmosphericMotes();
  }

  // Winding Hyrule Flagstone Road centerline x(z)
  getRoadX(z) {
    return Math.sin(z * 0.055) * 9.5 + Math.sin(z * 0.022 + 0.8) * 6.0;
  }

  // Continuous C2 smooth Breath-of-the-Wild valley heightfield
  getTerrainHeight(x, z) {
    // Broad rolling Hyrule hills
    let h =
      Math.sin(x * 0.024) * Math.cos(z * 0.024) * 3.4 +
      Math.sin(x * 0.052 + 0.9) * Math.sin(z * 0.048) * 1.45 +
      Math.cos((x + z) * 0.031) * 0.95 +
      2.1;

    // Awakening Wildflower Overlook Hill around (0, 28)
    const dStart = Math.hypot(x - this.getRoadX(28), z - 28);
    if (dStart < 18) {
      const t = Math.cos((dStart / 18) * Math.PI * 0.5);
      h = THREE.MathUtils.lerp(h, 4.35, t * t * 0.88);
    }

    // Winding Mirror Lake valley channel passing through (0, -4)
    const lakeCurveZ = -4.0 + Math.sin(x * 0.045) * 5.5;
    const lakeWidth = 10.5 + Math.cos(x * 0.06) * 3.8;
    // Narrow waist right at x = 0 where the Wooden Bridge crosses!
    const bridgeNarrow = 1.0 - Math.exp(-(x * x) / 95.0) * 0.35;
    const effWidth = lakeWidth * bridgeNarrow;
    const dLake = Math.abs(z - lakeCurveZ);
    if (Math.abs(x) < 46 && dLake < effWidth + 9.0) {
      const sideFade = 1.0 - THREE.MathUtils.smoothstep(Math.abs(x), 30, 46);
      const depthT = Math.max(0, 1.0 - dLake / (effWidth + 6.0));
      h -= depthT * depthT * 4.8 * sideFade;
    }

    // Golden Ginkgo Sanctuary Hill around (24, -34)
    const dSanct = Math.hypot(x - 24, z + 34);
    if (dSanct < 19) {
      const t = Math.cos((dSanct / 19) * Math.PI * 0.5);
      h = THREE.MathUtils.lerp(h, 5.8, t * t * 0.88);
    }

    // Gentle outer rolling foothills (never blocking the vast BotW sky & distant peaks!)
    const r = Math.hypot(x, z);
    if (r > 95) {
      const t = Math.min(1.0, (r - 95) / 85);
      // Keep northern vista (-Z) gently open toward Dueling Peaks while framing East/West softly
      const dirMod = 0.65 + 0.35 * Math.sin(Math.atan2(x, z) * 2.0);
      h += t * t * 6.5 * dirMod;
    }

    return h;
  }

  getWalkHeight(x, z) {
    let best = Math.max(this.getTerrainHeight(x, z), this.waterLevel - 0.35);
    for (const s of this.walkSurfaces) {
      if (Math.abs(x - s.x) <= s.rx && Math.abs(z - s.z) <= s.rz) {
        const sy = s.heightAt(x, z);
        if (sy > best) best = sy;
      }
    }
    return best;
  }

  resolveCollisions(pos, radius = 0.38) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      const minD = c.r + radius;
      if (d < minD) {
        pos.x = c.x + (dx / d) * minD;
        pos.z = c.z + (dz / d) * minD;
      }
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -145, 145);
    pos.z = THREE.MathUtils.clamp(pos.z, -145, 145);
  }

  _setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xaadBFF, 0x628650, 0.78);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5de, 1.95);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 220;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  _buildSky() {
    this.skyDome = createBotWSkyDome(this.sharedUniforms);
    this.scene.add(this.skyDome);
  }

  _buildTerrainAndLake() {
    const size = 360;
    const segs = 256;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, this.getTerrainHeight(vx, vz));
    }
    geo.computeVertexNormals();

    this.terrainMat = createBotWTerrainMaterial(this.sharedUniforms);
    const terrain = new THREE.Mesh(geo, this.terrainMat);
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);

    // Mirror Lake Water Plane spanning the winding lake valley
    const waterGeo = new THREE.PlaneGeometry(115, 48, 64, 32);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterMat = createBotWWaterMaterial(this.sharedUniforms);
    const waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    waterMesh.position.set(0, this.waterLevel, -4);
    this.worldGroup.add(waterMesh);
  }

  _buildDistantMountainsAndSkyIslands() {
    // Distant Breath-of-the-Wild Dueling Peaks & Snow-Crowned Horizon Mountains
    const makePeakMat = (baseHex, snowCap = false) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: this.sharedUniforms.uSunDir,
          uHorizonColor: this.sharedUniforms.uHorizonColor,
          uSunGlowColor: this.sharedUniforms.uSunGlowColor,
          uBaseColor: { value: new THREE.Color(baseHex) },
          uSnow: { value: snowCap ? 1.0 : 0.0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vLocalY;
          void main() {
            vLocalY = position.y;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uSunDir;
          uniform vec3 uHorizonColor;
          uniform vec3 uSunGlowColor;
          uniform vec3 uBaseColor;
          uniform float uSnow;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vLocalY;

          void main() {
            vec3 N = normalize(vWorldNormal);
            float ndl = smoothstep(-0.05, 0.25, dot(N, normalize(uSunDir)));
            vec3 rock = mix(uBaseColor * 0.65, uBaseColor * 1.15, ndl);
            if (uSnow > 0.5) {
              float snowMask = smoothstep(28.0, 48.0, vWorldPos.y + N.y * 12.0);
              vec3 snowCol = mix(pow(vec3(0.74, 0.85, 0.96), vec3(2.2)), vec3(0.95, 0.97, 1.0), ndl);
              rock = mix(rock, snowCol, snowMask);
            }
            vec3 viewVec = vWorldPos - cameraPosition;
            float dist = length(viewVec);
            float sunAlign = max(0.0001, dot(normalize(viewVec), normalize(uSunDir)));
            vec3 haze = mix(uHorizonColor, uSunGlowColor, pow(sunAlign, 4.0) * 0.6);
            vec3 col = mix(rock, haze, clamp(1.0 - exp(-dist * 0.0038), 0.0, 0.86));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      });
      return mat;
    };

    const peakMat = makePeakMat('#4f79a4', false);
    const snowPeakMat = makePeakMat('#5682ae', true);

    const peaks = [
      // Iconic Split Dueling Peaks on the North Horizon (-Z), leaving broad cerulean sky above!
      { x: -32, z: -345, r: 58, h: 92, snow: false, seed: 0.4 },
      { x: 34, z: -345, r: 62, h: 98, snow: false, seed: 2.1 },
      // Snow-Crowned Mount Lanayru & Hebra Summits
      { x: 210, z: -325, r: 95, h: 128, snow: true, seed: 1.2 },
      { x: -215, z: -315, r: 90, h: 118, snow: true, seed: 3.4 },
      { x: -310, z: -60, r: 88, h: 96, snow: false, seed: 0.9 },
      { x: 315, z: -40, r: 92, h: 106, snow: true, seed: 2.7 },
      { x: 155, z: 325, r: 95, h: 96, snow: false, seed: 1.8 },
      { x: -165, z: 320, r: 92, h: 90, snow: false, seed: 4.1 },
    ];

    peaks.forEach((p) => {
      const m = new THREE.Mesh(
        alpinePeakGeo(p.r, p.h, p.seed),
        p.snow ? snowPeakMat : peakMat
      );
      m.position.set(p.x, -4, p.z);
      this.worldGroup.add(m);
    });

    // Distant Poetic Floating Sky Archipelagos in the Clouds!
    const skyRockMat = makePeakMat('#b2ad9c', false);
    [
      { x: -62, y: 78, z: -185, r: 8.5 },
      { x: -46, y: 84, z: -195, r: 4.8 },
      { x: 76, y: 74, z: -168, r: 7.2 },
    ].forEach((isl) => {
      const rock = new THREE.Mesh(smoothRockGeo(isl.r, isl.r * 0.58, isl.r, 2), skyRockMat);
      rock.position.set(isl.x, isl.y, isl.z);
      this.worldGroup.add(rock);
    });
  }

  _buildHylianWoodenBridge() {
    // Gently arched wooden plank bridge spanning Mirror Lake along the road around z = -4
    const bx = this.getRoadX(-4);
    const woodMat = new THREE.MeshStandardMaterial({
      map: createWoodPlankTexture(),
      roughness: 0.85,
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6b482b, roughness: 0.86 });

    const bridgeLen = 16.0;
    const zStart = -12.0;
    const numPlanks = 28;

    const archHeight = (z) => {
      const u = (z - (zStart + bridgeLen * 0.5)) / (bridgeLen * 0.5);
      const clamped = THREE.MathUtils.clamp(u, -1, 1);
      return 0.52 + (1.0 - clamped * clamped) * 0.95;
    };

    for (let i = 0; i < numPlanks; i++) {
      const pz = zStart + (i + 0.5) * (bridgeLen / numPlanks);
      const py = archHeight(pz);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.48), woodMat);
      plank.position.set(bx, py, pz);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.worldGroup.add(plank);
    }

    // Timber Railing Posts + Continuous Curved Top & Mid Handrail Beams!
    [-1.55, 1.55].forEach((ox) => {
      const railPtsTop = [];
      const railPtsMid = [];
      for (let i = 0; i <= 6; i++) {
        const pz = zStart + i * (bridgeLen / 6);
        const py = archHeight(pz);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 1.15, 10), postMat);
        post.position.set(bx + ox, py + 0.52, pz);
        post.castShadow = true;
        this.worldGroup.add(post);

        railPtsTop.push(new THREE.Vector3(bx + ox, py + 1.02, pz));
        railPtsMid.push(new THREE.Vector3(bx + ox, py + 0.56, pz));
      }
      const topRail = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPtsTop), 24, 0.055, 8, false),
        postMat
      );
      topRail.castShadow = true;
      const midRail = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPtsMid), 24, 0.04, 8, false),
        postMat
      );
      this.worldGroup.add(topRail, midRail);
    });

    this.walkSurfaces.push({
      x: bx,
      z: zStart + bridgeLen * 0.5,
      rx: 1.65,
      rz: bridgeLen * 0.5 + 0.4,
      heightAt: (_x, z) => archHeight(z) + 0.06,
    });
  }

  _buildTempleOfTimeRuins() {
    // Mossy Carved Limestone Gothic Archways & Boulders using Painterly BotW Rock Shader!
    const ruinStoneMat = createBotWRockMaterial(this.sharedUniforms, [0.76, 0.73, 0.65]);
    const boulderMat = createBotWRockMaterial(this.sharedUniforms, [0.62, 0.61, 0.57]);

    const baseX = -15.5;
    const baseZ = 12.5;

    // Sculpted Gothic Ruin Archway
    const buildGothicArch = (ax, az, rotY, scale = 1.0) => {
      const ay = this.getTerrainHeight(ax, az);
      const g = new THREE.Group();
      g.position.set(ax, ay, az);
      g.rotation.y = rotY;

      [-1.85 * scale, 1.85 * scale].forEach((px) => {
        const pier = new THREE.Mesh(
          new THREE.CylinderGeometry(0.40 * scale, 0.46 * scale, 4.6 * scale, 16),
          ruinStoneMat
        );
        pier.position.set(px, 2.2 * scale, 0);
        pier.castShadow = true;
        pier.receiveShadow = true;
        g.add(pier);

        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(1.08 * scale, 0.30 * scale, 1.08 * scale),
          ruinStoneMat
        );
        cap.position.set(px, 4.55 * scale, 0);
        g.add(cap);

        this.colliders.push({
          x: ax + Math.cos(rotY) * px,
          z: az - Math.sin(rotY) * px,
          r: 0.52 * scale,
        });
      });

      // Pointed Gothic Arch Ring
      const archCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.85 * scale, 4.6 * scale, 0),
        new THREE.Vector3(-1.1 * scale, 6.0 * scale, 0),
        new THREE.Vector3(0, 6.65 * scale, 0),
        new THREE.Vector3(1.1 * scale, 6.0 * scale, 0),
        new THREE.Vector3(1.85 * scale, 4.6 * scale, 0),
      ]);
      const archMesh = new THREE.Mesh(
        new THREE.TubeGeometry(archCurve, 28, 0.34 * scale, 10, false),
        ruinStoneMat
      );
      archMesh.castShadow = true;
      g.add(archMesh);

      this.worldGroup.add(g);
    };

    buildGothicArch(baseX, baseZ, 0.38, 1.0);
    buildGothicArch(baseX - 6.2, baseZ - 5.0, 0.38, 0.86);

    // Smooth Natural Mossy Limestone Boulders around Lakeshore & Meadow Hills
    const rocks = [
      [8.2, 22.0, 1.25, 0.72, 1.05],
      [-9.5, 23.5, 1.05, 0.62, 0.92],
      [14.5, -9.5, 2.0, 1.15, 1.75],
      [-18.5, -8.2, 1.85, 1.05, 1.55],
      [8.8, -16.5, 1.35, 0.82, 1.15],
      [-12.2, 15.8, 1.45, 0.88, 1.22],
    ];
    rocks.forEach(([rx, rz, sx, sy, sz]) => {
      const ry = this.getTerrainHeight(rx, rz);
      const rMesh = new THREE.Mesh(smoothRockGeo(sx, sy, sz, 3), boulderMat);
      rMesh.position.set(rx, ry + sy * 0.32, rz);
      rMesh.castShadow = true;
      rMesh.receiveShadow = true;
      this.worldGroup.add(rMesh);

      this.colliders.push({ x: rx, z: rz, r: Math.max(sx, sz) * 0.76 });
    });
  }

  _buildGoldenGinkgoSanctuary() {
    // Ancient Carved Zonai/Sheikah Circular Stone Dais on the North-East Hill (24, -34)
    const sx = 24;
    const sz = -34;
    const sy = this.getTerrainHeight(sx, sz);

    const runeMat = new THREE.MeshStandardMaterial({
      map: createZonaiRuneTexture('#54ffd4', '#394c4a'),
      roughness: 0.75,
    });
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.0, 0.65, 32), runeMat);
    dais.position.set(sx, sy + 0.2, sz);
    dais.receiveShadow = true;
    this.worldGroup.add(dais);

    // Luminous Floating Sacred Ring
    this.sacredRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.65, 0.065, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x6effdc })
    );
    this.sacredRing.position.set(sx, sy + 2.6, sz);
    this.worldGroup.add(this.sacredRing);

    this.walkSurfaces.push({
      x: sx,
      z: sz,
      rx: 4.6,
      rz: 4.6,
      heightAt: () => sy + 0.52,
    });
  }

  async loadGhibliTrees() {
    const base = import.meta.env.BASE_URL || './';
    let foliageGeo = null;

    const binRes = await fetch(`${base}models/ghibli_foliage.bin?v=43`).catch(() => null);
    const ct = binRes?.headers?.get('content-type') || '';
    if (binRes && binRes.ok && !ct.includes('text/html')) {
      const buf = await binRes.arrayBuffer();
      if (buf.byteLength >= 16) {
        const dv = new DataView(buf);
        const outV = dv.getUint32(0, true);
        const idxLen = dv.getUint32(4, true);
        const expectedBytes = 8 + outV * 6 + ((outV * 3 + 1) & ~1) + idxLen * 2;
        if (outV > 0 && outV < 200000 && expectedBytes === buf.byteLength) {
          let off = 8;
          const posI16 = new Int16Array(buf, off, outV * 3);
          off += posI16.byteLength;
          const normI8 = new Int8Array(buf, off, outV * 3);
          off += (normI8.byteLength + 1) & ~1;
          const idxU16 = new Uint16Array(buf, off, idxLen);

          const posF32 = new Float32Array(outV * 3);
          const normF32 = new Float32Array(outV * 3);
          for (let i = 0; i < outV * 3; i++) {
            posF32[i] = posI16[i] / 4096.0;
            normF32[i] = normI8[i] / 127.0;
          }

          foliageGeo = new THREE.BufferGeometry();
          foliageGeo.setAttribute('position', new THREE.BufferAttribute(posF32, 3));
          foliageGeo.setAttribute('normal', new THREE.BufferAttribute(normF32, 3));
          foliageGeo.setIndex(new THREE.BufferAttribute(idxU16.slice(), 1));
          foliageGeo.computeBoundingSphere();
        }
      }
    }

    if (!foliageGeo) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(`${base}draco/`);
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      const gltf = await loader.loadAsync(`${base}models/trees.glb`);
      dracoLoader.dispose();
      gltf.scene.traverse((c) => {
        if (c.isMesh && !foliageGeo) foliageGeo = c.geometry.clone();
      });
      if (!foliageGeo) return;
      foliageGeo.center();
      // Decimate connected leaf clumps (stride=4) to keep 60-120fps while preserving sculpted normals
      const posAttr = foliageGeo.attributes.position;
      const normAttr = foliageGeo.attributes.normal;
      const indices = foliageGeo.index.array;
      const vCount = posAttr.count;
      const parent = new Int32Array(vCount);
      for (let i = 0; i < vCount; i++) parent[i] = i;
      const find = (x) => {
        let r = x;
        while (parent[r] !== r) r = parent[r];
        let c = x;
        while (c !== r) {
          const n = parent[c];
          parent[c] = r;
          c = n;
        }
        return r;
      };
      for (let i = 0; i < indices.length; i += 3) {
        const ra = find(indices[i]);
        const rb = find(indices[i + 1]);
        const rc = find(indices[i + 2]);
        if (ra !== rb) parent[rb] = ra;
        const rab = find(ra);
        if (rab !== rc) parent[rc] = rab;
      }
      const compId = new Int32Array(vCount).fill(-1);
      let numComps = 0;
      for (let v = 0; v < vCount; v++) {
        const r = find(v);
        if (compId[r] === -1) compId[r] = numComps++;
        compId[v] = compId[r];
      }
      const stride = 4;
      const clumpScale = 1.44;
      const cx = new Float32Array(numComps);
      const cy = new Float32Array(numComps);
      const cz = new Float32Array(numComps);
      const cnt = new Int32Array(numComps);
      for (let v = 0; v < vCount; v++) {
        const cid = compId[v];
        if (cid % stride !== 0) continue;
        cx[cid] += posAttr.getX(v);
        cy[cid] += posAttr.getY(v);
        cz[cid] += posAttr.getZ(v);
        cnt[cid]++;
      }
      for (let c = 0; c < numComps; c++) {
        if (cnt[c] > 0) {
          cx[c] /= cnt[c];
          cy[c] /= cnt[c];
          cz[c] /= cnt[c];
        }
      }
      const remap = new Int32Array(vCount).fill(-1);
      const newPos = [];
      const newNorm = [];
      let outV = 0;
      for (let v = 0; v < vCount; v++) {
        const cid = compId[v];
        if (cid % stride !== 0) continue;
        remap[v] = outV++;
        newPos.push(
          cx[cid] + (posAttr.getX(v) - cx[cid]) * clumpScale,
          cy[cid] + (posAttr.getY(v) - cy[cid]) * clumpScale,
          cz[cid] + (posAttr.getZ(v) - cz[cid]) * clumpScale
        );
        newNorm.push(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v));
      }
      const newIdx = [];
      for (let i = 0; i < indices.length; i += 3) {
        const na = remap[indices[i]];
        if (na !== -1) newIdx.push(na, remap[indices[i + 1]], remap[indices[i + 2]]);
      }
      const decGeo = new THREE.BufferGeometry();
      decGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
      decGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
      decGeo.setIndex(newIdx);
      decGeo.computeBoundingSphere();
      foliageGeo.dispose();
      foliageGeo = decGeo;
    }

    // Three curated Studio Ghibli / BotW Watercolor Foliage Palettes!
    const oakMat = createGhibliFoliageMaterial(this.sharedUniforms, [
      '#84cf5a',
      '#51a84b',
      '#317849',
      '#1e4f40',
    ]);
    const birchMat = createGhibliFoliageMaterial(this.sharedUniforms, [
      '#a4df66',
      '#6cbd52',
      '#428c4e',
      '#285c45',
    ]);
    const ginkgoMat = createGhibliFoliageMaterial(this.sharedUniforms, [
      '#ffe875',
      '#f6bd3a',
      '#d48324',
      '#99511b',
    ]);

    const barkMat = new THREE.MeshStandardMaterial({ color: 0x61442e, roughness: 0.92 });
    const whiteBarkMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c5, roughness: 0.88 });

    const treeSpecs = [
      // Framing Awakening Meadow & Ruins
      { x: -8.5, z: 24.5, s: 1.05, kind: 'oak' },
      { x: 10.5, z: 20.0, s: 0.95, kind: 'birch' },
      { x: -19.5, z: 18.5, s: 1.25, kind: 'oak' },
      { x: -22.0, z: 6.5, s: 1.1, kind: 'oak' },
      // Mirror Lake Shores
      { x: 15.5, z: 4.5, s: 1.15, kind: 'birch' },
      { x: -14.5, z: -14.5, s: 1.2, kind: 'oak' },
      { x: 18.0, z: -15.5, s: 1.05, kind: 'oak' },
      // Golden Ginkgo Sanctuary Grove!
      { x: 18.5, z: -31.5, s: 1.35, kind: 'ginkgo' },
      { x: 29.5, z: -32.0, s: 1.45, kind: 'ginkgo' },
      { x: 24.5, z: -41.5, s: 1.28, kind: 'ginkgo' },
      // Scenic Valley & Hillside Groves
      { x: -34, z: 32, s: 1.3, kind: 'oak' },
      { x: 32, z: 28, s: 1.2, kind: 'birch' },
      { x: -42, z: -8, s: 1.35, kind: 'oak' },
      { x: 44, z: -6, s: 1.25, kind: 'oak' },
      { x: -26, z: -42, s: 1.3, kind: 'birch' },
      { x: -8, z: -48, s: 1.15, kind: 'ginkgo' },
      { x: 46, z: -44, s: 1.35, kind: 'oak' },
      { x: -55, z: 18, s: 1.4, kind: 'oak' },
      { x: 56, z: 14, s: 1.3, kind: 'birch' },
      { x: 6, z: 48, s: 1.25, kind: 'oak' },
    ];

    const buckets = { oak: [], birch: [], ginkgo: [] };

    treeSpecs.forEach((t, idx) => {
      const ty = this.getTerrainHeight(t.x, t.z);
      const s = t.s;

      // Sculpted Gnarled Trunk + Flaring Roots + Upper Boughs
      const lean = Math.sin(idx * 2.3) * 0.28 * s;
      const trunkCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.15, 0),
        new THREE.Vector3(lean * 0.35, 1.3 * s, 0.08 * s),
        new THREE.Vector3(lean * 0.85, 2.7 * s, -0.06 * s),
        new THREE.Vector3(lean, 3.8 * s, 0),
      ]);
      const trunkGeo = new THREE.TubeGeometry(trunkCurve, 14, 0.28 * s, 10, false);
      const tp = trunkGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const y = tp.getY(i);
        const flare =
          y < 0.7 * s
            ? 1.55 - (y / (0.7 * s)) * 0.55
            : 1.0 - (y / (4.2 * s)) * 0.45;
        tp.setX(i, tp.getX(i) * flare);
        tp.setZ(i, tp.getZ(i) * flare);
      }
      trunkGeo.computeVertexNormals();
      const trunk = new THREE.Mesh(
        trunkGeo,
        t.kind === 'birch' ? whiteBarkMat : barkMat
      );
      trunk.position.set(t.x, ty, t.z);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      this.worldGroup.add(trunk);

      this.colliders.push({ x: t.x, z: t.z, r: 0.38 * s });

      // Single full 5m sculpted Ghibli foliage crown per tree + lightweight canopy shadow proxy
      buckets[t.kind].push({
        x: t.x + lean,
        y: ty + 4.25 * s,
        z: t.z,
        sx: 0.96 * s,
        sy: 0.90 * s,
        sz: 0.96 * s,
        ry: idx * 1.9,
      });
    });

    const shadowProxyGeo = new THREE.IcosahedronGeometry(1.85, 1);
    const shadowProxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const allCrowns = [...buckets.oak, ...buckets.birch, ...buckets.ginkgo];
    const shadowInst = new THREE.InstancedMesh(shadowProxyGeo, shadowProxyMat, allCrowns.length);
    shadowInst.castShadow = true;
    shadowInst.frustumCulled = false;
    {
      const dummy = new THREE.Object3D();
      allCrowns.forEach((item, i) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.scale.set(item.sx, item.sy * 0.85, item.sz);
        dummy.updateMatrix();
        shadowInst.setMatrixAt(i, dummy.matrix);
      });
      shadowInst.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(shadowInst);
    }

    const buildFoliageInstances = (list, mat) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(foliageGeo, mat, list.length);
      inst.castShadow = false;
      inst.frustumCulled = false;
      const dummy = new THREE.Object3D();
      list.forEach((item, i) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.ry, 0);
        dummy.scale.set(item.sx, item.sy, item.sz);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(inst);
    };

    buildFoliageInstances(buckets.oak, oakMat);
    buildFoliageInstances(buckets.birch, birchMat);
    buildFoliageInstances(buckets.ginkgo, ginkgoMat);
  }

  _buildLushMeadowGrassAndFlowers() {
    // 4-Blade Fanned Organic Meadow Tuft (= 120,000–220,000 lush curved grass blades!)
    const count = this.isSoftware ? 28000 : 55000;

    const makeSingleBlade = (ox, oz, rotY, lean, hScale, wScale) => {
      const g = new THREE.PlaneGeometry(0.062 * wScale, 0.52 * hScale, 1, 3);
      g.translate(0, 0.26 * hScale, 0);
      const bp = g.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const y = bp.getY(i);
        const t = THREE.MathUtils.clamp(y / (0.52 * hScale), 0, 1);
        bp.setX(i, bp.getX(i) * (1.0 - Math.pow(t, 1.35) * 0.92));
        bp.setZ(i, t * t * lean);
      }
      g.rotateY(rotY);
      g.translate(ox, 0, oz);
      return g;
    };

    const tuftGeo = mergeGeometries([
      makeSingleBlade(0.0, 0.0, 0.0, 0.14, 1.0, 1.05),
      makeSingleBlade(0.11, 0.06, 1.15, 0.16, 0.88, 0.95),
      makeSingleBlade(-0.10, 0.08, 2.35, 0.15, 0.94, 1.0),
      makeSingleBlade(0.03, -0.11, 4.10, 0.13, 0.82, 0.92),
    ]);
    tuftGeo.computeVertexNormals();

    this.grassMat = createBotWGrassMaterial(this.sharedUniforms);
    const grassInst = new THREE.InstancedMesh(tuftGeo, this.grassMat, count);
    grassInst.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let placed = 0;
    let attempts = 0;

    while (placed < count && attempts < count * 3) {
      attempts++;
      let gx, gz;
      // Concentrate 75% in a lush 95m×95m scenic valley carpet, 25% across outer hills!
      if (placed < count * 0.75) {
        gx = (Math.random() - 0.5) * 95;
        gz = (Math.random() - 0.5) * 95;
      } else {
        gx = (Math.random() - 0.5) * 195;
        gz = (Math.random() - 0.5) * 195;
      }

      const gy = this.getTerrainHeight(gx, gz);
      if (gy < this.waterLevel + 0.30 || gy > 9.5) continue;

      // Leave cobblestone center strip organically clear with soft feathered edges!
      const rx = this.getRoadX(gz);
      if (Math.abs(gx - rx) < 1.35 + Math.random() * 0.65) continue;

      // Leave stone sanctuary dais clear
      if (Math.hypot(gx - 24, gz + 34) < 4.5) continue;

      dummy.position.set(gx, gy - 0.02, gz);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      const sc = 0.78 + Math.random() * 0.56;
      dummy.scale.set(sc, sc * (0.80 + Math.random() * 0.42), sc);
      dummy.updateMatrix();
      grassInst.setMatrixAt(placed, dummy.matrix);

      const v = 0.90 + Math.random() * 0.22;
      col.setRGB(v, v * (0.98 + Math.random() * 0.05), v * 0.92);
      grassInst.setColorAt(placed, col);
      placed++;
    }
    grassInst.count = placed;
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    this.worldGroup.add(grassInst);

    // 2,400 Delicate 5-Petal Painted Wildflowers (Silent Princesses, Sundelions, & Daisies)
    const flowerCount = 2400;
    const flGeo = new THREE.PlaneGeometry(0.19, 0.19);
    flGeo.rotateX(-Math.PI * 0.36);
    flGeo.translate(0, 0.38, 0);
    const flMat = new THREE.MeshBasicMaterial({
      map: createWildflowerTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
    const flInst = new THREE.InstancedMesh(flGeo, flMat, flowerCount);
    flInst.frustumCulled = false;

    const palette = [
      new THREE.Color('#d8f5ff'), // Silent Princess luminous ice-blue
      new THREE.Color('#fffbe0'), // Hyrule cream daisy
      new THREE.Color('#ffd84f'), // Golden Sundelion
      new THREE.Color('#ffc4d6'), // Soft wild rose
    ];

    let fp = 0;
    for (let i = 0; i < flowerCount * 4 && fp < flowerCount; i++) {
      const fx = (Math.random() - 0.5) * 130;
      const fz = (Math.random() - 0.5) * 130;
      const fy = this.getTerrainHeight(fx, fz);
      if (fy < this.waterLevel + 0.55 || fy > 8.5) continue;
      if (Math.abs(fx - this.getRoadX(fz)) < 1.8) continue;

      dummy.position.set(fx, fy, fz);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.22,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.22
      );
      dummy.scale.setScalar(0.68 + Math.random() * 0.55);
      dummy.updateMatrix();
      flInst.setMatrixAt(fp, dummy.matrix);
      flInst.setColorAt(fp, palette[fp % palette.length]);
      fp++;
    }
    flInst.count = fp;
    flInst.instanceMatrix.needsUpdate = true;
    if (flInst.instanceColor) flInst.instanceColor.needsUpdate = true;
    this.worldGroup.add(flInst);
  }

  _buildAtmosphericMotes() {
    // Drifting Sunlit Dandelion / Spirit Motes!
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0.0, 'rgba(255, 252, 232, 1.0)');
    g.addColorStop(0.45, 'rgba(255, 244, 198, 0.55)');
    g.addColorStop(1.0, 'rgba(255, 244, 198, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const moteTex = new THREE.CanvasTexture(c);

    const count = 420;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 130;
      pos[i * 3 + 1] = 0.6 + Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: moteTex,
        color: 0xfff8d8,
        size: 0.24,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      })
    );
    this.worldGroup.add(this.motes);
  }

  setMoodPreset(preset) {
    const u = this.sharedUniforms;
    const skyU = this.skyDome.material.uniforms;

    if (preset === 'dawn') {
      u.uSunDir.value.set(0.75, 0.24, -0.62).normalize();
      u.uSunColor.value.set('#ffdfb8');
      u.uSkyAmbient.value.set('#86a8d6');
      u.uHorizonColor.value.set('#ffdec9');
      u.uSunGlowColor.value.set('#ffb478');
      u.uFogStrength.value = 0.0034;
      skyU.uZenithColor.value.set('#3062b8');
      skyU.uMidSkyColor.value.set('#84b2e8');
      skyU.uCloudLit.value.set('#fff3e2');
      skyU.uCloudShade.value.set('#a8b6d9');
      skyU.uNightStars.value = 0.0;
      this.sunLight.color.set('#ffdcb2');
      this.sunLight.intensity = 1.75;
      this.hemiLight.intensity = 0.72;
    } else if (preset === 'day') {
      u.uSunDir.value.set(0.45, 0.65, -0.60).normalize();
      u.uSunColor.value.set('#fff7e4');
      u.uSkyAmbient.value.set('#7eb8ea');
      u.uHorizonColor.value.set('#c4ebff');
      u.uSunGlowColor.value.set('#ffe5b0');
      u.uFogStrength.value = 0.0026;
      skyU.uZenithColor.value.set('#1a66d1');
      skyU.uMidSkyColor.value.set('#57b2f2');
      skyU.uCloudLit.value.set('#ffffff');
      skyU.uCloudShade.value.set('#b6d4f0');
      skyU.uNightStars.value = 0.0;
      this.sunLight.color.set('#fff5de');
      this.sunLight.intensity = 1.95;
      this.hemiLight.intensity = 0.78;
    } else if (preset === 'sunset') {
      u.uSunDir.value.set(-0.62, 0.19, -0.76).normalize();
      u.uSunColor.value.set('#ffb673');
      u.uSkyAmbient.value.set('#7a82b5');
      u.uHorizonColor.value.set('#f7a97e');
      u.uSunGlowColor.value.set('#ff884d');
      u.uFogStrength.value = 0.0034;
      skyU.uZenithColor.value.set('#284585');
      skyU.uMidSkyColor.value.set('#8f709c');
      skyU.uCloudLit.value.set('#ffd6a6');
      skyU.uCloudShade.value.set('#776591');
      skyU.uNightStars.value = 0.15;
      this.sunLight.color.set('#ffae66');
      this.sunLight.intensity = 1.65;
      this.hemiLight.intensity = 0.68;
    } else if (preset === 'night') {
      u.uSunDir.value.set(-0.38, 0.58, -0.72).normalize();
      u.uSunColor.value.set('#8cb8f2');
      u.uSkyAmbient.value.set('#314b78');
      u.uHorizonColor.value.set('#1c3359');
      u.uSunGlowColor.value.set('#6da4e8');
      u.uFogStrength.value = 0.0032;
      skyU.uZenithColor.value.set('#071126');
      skyU.uMidSkyColor.value.set('#112447');
      skyU.uCloudLit.value.set('#4c6894');
      skyU.uCloudShade.value.set('#1c2d4d');
      skyU.uNightStars.value = 1.0;
      this.sunLight.color.set('#8fbaf5');
      this.sunLight.intensity = 1.05;
      this.hemiLight.intensity = 0.52;
    }
  }

  triggerGrassWave(x, z, radius = 2.6, strength = 0.85) {
    this.sharedUniforms.uSlashWave.value.set(x, z, radius, strength);
  }

  update(dt, playerPos) {
    this.sharedUniforms.uTime.value += dt;
    this.sharedUniforms.uPlayerPos.value.copy(playerPos);
    const sw = this.sharedUniforms.uSlashWave.value;
    if (sw.w > 0.001) {
      sw.z += dt * 2.4;
      sw.w = Math.max(0, sw.w - dt * 2.1);
    }
    this.skyDome.position.copy(playerPos);

    // Keep shadow frustum tightly centered on Champion Dengdeng for razor-sharp shadows!
    const sDir = this.sharedUniforms.uSunDir.value;
    this.sunLight.position.set(
      playerPos.x + sDir.x * 65,
      playerPos.y + sDir.y * 65,
      playerPos.z + sDir.z * 65
    );
    this.sunLight.target.position.copy(playerPos);

    if (this.sacredRing) {
      this.sacredRing.rotation.y += dt * 0.75;
      this.sacredRing.position.y += Math.sin(this.sharedUniforms.uTime.value * 2.0) * 0.002;
    }

    if (this.motes) {
      const arr = this.motes.geometry.attributes.position.array;
      const t = this.sharedUniforms.uTime.value;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += Math.sin(t * 0.7 + i) * dt * 0.35;
        arr[i + 1] += Math.cos(t * 0.5 + i * 0.5) * dt * 0.18;
        arr[i + 2] += dt * 0.22;
        if (arr[i + 2] > playerPos.z + 65) arr[i + 2] = playerPos.z - 65;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }
  }
}
