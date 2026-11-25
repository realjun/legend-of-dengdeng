import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import { createHylianShieldTexture } from '../utils/ToonMaterials.js';

// Reusable scratch math objects (zero per-frame GC churn)
const _vX = new THREE.Vector3();
const _vY = new THREE.Vector3();
const _vZ = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _qNormRoot = new THREE.Quaternion();
const _qParentWorld = new THREE.Quaternion();
const _qTargetChar = new THREE.Quaternion();
const _qTargetLocal = new THREE.Quaternion();
const _euler = new THREE.Euler();

function leftArmCharQuat(armDir, dorsalHint, out = new THREE.Quaternion()) {
  _vX.set(armDir[0], armDir[1], armDir[2]).normalize();
  _vY.set(dorsalHint[0], dorsalHint[1], dorsalHint[2]);
  _vY.addScaledVector(_vX, -_vY.dot(_vX)).normalize();
  _vZ.crossVectors(_vX, _vY).normalize();
  _mat4.makeBasis(_vX, _vY, _vZ);
  return out.setFromRotationMatrix(_mat4);
}

function rightArmCharQuat(armDir, bladeOrThumbHint, out = new THREE.Quaternion()) {
  _vX.set(-armDir[0], -armDir[1], -armDir[2]).normalize();
  _vZ.set(bladeOrThumbHint[0], bladeOrThumbHint[1], bladeOrThumbHint[2]);
  _vZ.addScaledVector(_vX, -_vZ.dot(_vX)).normalize();
  _vY.crossVectors(_vZ, _vX).normalize();
  _mat4.makeBasis(_vX, _vY, _vZ);
  return out.setFromRotationMatrix(_mat4);
}

function lerpVec3Arr(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function smoothStep01(t) {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function createMasterSwordBladeGeometry() {
  // Tapered diamond-beveled Master Sword blade along +Y (y = 0.14 .. 0.88)
  // Sharp edges along +-X, raised central ridge along +-Z so sunlight glints crisply!
  const sections = [
    { y: 0.14, hw: 0.026, ht: 0.0085 },
    { y: 0.22, hw: 0.021, ht: 0.0072 },
    { y: 0.56, hw: 0.022, ht: 0.0068 },
    { y: 0.77, hw: 0.017, ht: 0.0052 },
    { y: 0.89, hw: 0.0, ht: 0.0 },
  ];

  const pos = [];
  const pushTri = (a, b, c) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  for (let i = 0; i < sections.length - 1; i++) {
    const s0 = sections[i];
    const s1 = sections[i + 1];

    const r0 = [s0.hw, s0.y, 0];
    const l0 = [-s0.hw, s0.y, 0];
    const f0 = [0, s0.y, s0.ht];
    const b0 = [0, s0.y, -s0.ht];

    if (s1.hw === 0) {
      const tip = [0, s1.y, 0];
      pushTri(f0, r0, tip);
      pushTri(l0, f0, tip);
      pushTri(r0, b0, tip);
      pushTri(b0, l0, tip);
    } else {
      const r1 = [s1.hw, s1.y, 0];
      const l1 = [-s1.hw, s1.y, 0];
      const f1 = [0, s1.y, s1.ht];
      const b1 = [0, s1.y, -s1.ht];

      // 4 diamond bevel quads
      pushTri(f0, r0, r1);
      pushTri(f0, r1, f1);

      pushTri(l0, f0, f1);
      pushTri(l0, f1, l1);

      pushTri(r0, b0, b1);
      pushTri(r0, b1, r1);

      pushTri(b0, l0, l1);
      pushTri(b0, l1, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildCurvedHylianShieldGeometry() {
  const shieldGeo = new THREE.BoxGeometry(0.29, 0.37, 0.02, 10, 10, 1);
  const sp = shieldGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const sx = sp.getX(i);
    const sy = sp.getY(i);
    if (sy < 0) sp.setX(i, sx * (1.0 - Math.pow(Math.max(0, -sy / 0.185), 1.8) * 0.56));
    sp.setZ(i, sp.getZ(i) + sx * sx * 0.85);
  }
  shieldGeo.computeVertexNormals();
  return shieldGeo;
}

function createStarlightGliderTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Deep royal twilight-sakura gradient across wing span
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#303b82');
  grad.addColorStop(0.55, '#59429c');
  grad.addColorStop(1.0, '#c96f9d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Golden filigree border & wing ribs
  ctx.strokeStyle = '#ffe588';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.strokeStyle = 'rgba(255, 236, 162, 0.55)';
  ctx.lineWidth = 3;
  for (const rx of [128, 256, 384]) {
    ctx.beginPath();
    ctx.moveTo(256, 18);
    ctx.lineTo(rx, 244);
    ctx.stroke();
  }

  // Radiant 8-point Starlight Crest in center
  ctx.fillStyle = '#fff09c';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 44 : 16;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const px = 256 + Math.cos(a) * r;
    const py = 122 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Twin Cat-Paw Emblems (Sage-Green Broccoli on Left, Apricot-Cream Jelly on Right!)
  const drawPaw = (cx, cy, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 15, 0, Math.PI * 2);
    ctx.fill();
    for (const [ox, oy] of [
      [-15, -10],
      [-5, -16],
      [5, -16],
      [15, -10],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, 6.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawPaw(122, 128, '#9fd98b');
  drawPaw(390, 128, '#f5a95b');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class VrmDengdeng {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.vrm = null;
    this.mixer = null;
    this.actions = {};
    this.currentActionName = '';

    this.blinkTimer = 3.2;
    this.lookTarget = new THREE.Object3D();
    this.scene.add(this.lookTarget);

    // Dual-mount weapon, shield & Starlight Paraglider references
    this.sheathedHiltGroup = null;
    this.backShieldMesh = null;
    this.handSwordGroup = null;
    this.armShieldGroup = null;
    this.swordBladeMat = null;
    this.shieldWardMat = null;
    this.bladeBaseMarker = new THREE.Object3D();
    this.bladeTipMarker = new THREE.Object3D();
    this.shieldFaceMarker = new THREE.Object3D();
    this.gliderGroup = null;
    this.gliderStreamers = [];
    this.gliding = false;
    this.gliderBlend = 0;
    this.gliderRoll = 0;

    // Hylian Shield-Surfing State (`海利亚盾牌滑草冲浪`)
    this.surfShieldGroup = null;
    this.shieldSurfing = false;
    this.surfBlend = 0;
    this.surfFlipTimer = 0;

    // Martial Arts Combat State
    this.swordDrawn = false;
    this.shieldDrawn = false;
    this.shieldHolding = false;
    this.shieldBlend = 0;
    this.stanceBlend = 0;
    this.sheatheTimer = 0;

    this.combatState = 'none'; // 'none' | 'slash1' | 'slash2' | 'slash3' | 'spin_charge' | 'spin_attack' | 'jump_slash' | 'shield_parry'
    this.combatTime = 0;
    this.combatDuration = 0;
    this.comboStep = 0;
    this.comboResetTimer = 0;
    this.queuedSlash = false;
    this.chargeTime = 0;
    this.chargeReadyEmitted = false;
    this.parryImpactEmitted = false;
    this.slashWaveEmitted = false;
    this.jumpSlamLanded = false;
    this.visualSpinYaw = 0;

    // Event queue consumed by main.js for audio, shockwaves & camera micro-impulses
    this.pendingEvents = [];

    this.ready = false;
  }

  async load(onProgress) {
    const base = import.meta.env.BASE_URL || './';
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    if (onProgress) onProgress(0.06, '正在读取英杰登登模型清单…');
    const manifestRes = await fetch(`${base}models/dengdeng_manifest.json?v=43`, {
      cache: 'no-cache',
    });
    if (!manifestRes.ok) {
      throw new Error(`无法读取模型清单 (${manifestRes.status})`);
    }
    const manifest = await manifestRes.json();
    const fullBytes = new Uint8Array(manifest.totalBytes);
    const totalChunks = manifest.chunks.length;
    const parts = new Array(totalChunks);
    let doneCount = 0;

    // Fetch 768 KB chunks in clean batches of 3 (never saturating HTTP/1.1 6-socket tunnel limits!)
    let cursor = 0;
    const fetchChunkWithRetry = async (chunkInfo) => {
      const url = `${base}${chunkInfo.url.replace(/^\/+/, '')}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          if (ab.byteLength !== chunkInfo.byteLength) {
            throw new Error(`分片长度不匹配 (${ab.byteLength}/${chunkInfo.byteLength})`);
          }
          return new Uint8Array(ab);
        } catch (err) {
          if (attempt === 1) throw new Error(`模型分片加载失败: ${err.message}`);
        }
      }
    };

    const workers = Array.from({ length: Math.min(3, totalChunks) }, async () => {
      while (cursor < totalChunks) {
        const idx = cursor++;
        parts[idx] = await fetchChunkWithRetry(manifest.chunks[idx]);
        doneCount++;
        if (onProgress) {
          onProgress(
            0.08 + (doneCount / totalChunks) * 0.64,
            `正在载入英杰登登模型 (${doneCount}/${totalChunks})…`
          );
        }
      }
    });
    await Promise.all(workers);

    let offset = 0;
    for (const part of parts) {
      fullBytes.set(part, offset);
      offset += part.byteLength;
    }

    if (onProgress) onProgress(0.76, '正在构建 3D 五官、发丝物理与英杰服材质…');
    const gltf = await loader.parseAsync(fullBytes.buffer, `${base}models/`);

    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);

    vrm.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
      }
    });

    if (vrm.lookAt) {
      const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      lookAtProxy.name = 'lookAtQuaternionProxy';
      vrm.scene.add(lookAtProxy);
      vrm.lookAt.target = this.lookTarget;
    }

    if (vrm.expressionManager) {
      vrm.expressionManager.setValue('relaxed', 0.22);
      vrm.expressionManager.setValue('happy', 0.12);
    }

    this.vrm = vrm;
    this.vrm.scene.rotation.y = 0;
    this.root.add(this.vrm.scene);

    this._attachHylianChampionGear();

    if (onProgress) onProgress(0.86, '正在载入 60fps 真人骨骼动作…');
    this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    const clipNames = ['Idle', 'Walk', 'Run', 'JumpUp', 'Floating'];
    for (let i = 0; i < clipNames.length; i++) {
      const name = clipNames[i];
      const animGltf = await loader.loadAsync(`${base}animations/${name}.vrma`);
      const vrmAnim = animGltf.userData.vrmAnimations?.[0];
      if (vrmAnim) {
        const clip = createVRMAnimationClip(vrmAnim, this.vrm);
        const action = this.mixer.clipAction(clip);
        if (name === 'JumpUp') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        this.actions[name] = action;
      }
      if (onProgress) {
        onProgress(0.86 + ((i + 1) / clipNames.length) * 0.12, `正在载入真人骨骼动作 (${i + 1}/5)…`);
      }
    }

    if (onProgress) onProgress(1.0, '欢迎来到海拉鲁原野');
    this.playAction('Idle', 0.01);
    this.ready = true;
  }

  _attachHylianChampionGear() {
    if (!this.vrm?.humanoid) return;

    const indigoMat = new THREE.MeshStandardMaterial({ color: 0x2a356e, roughness: 0.62 });
    const royalPurpleMat = new THREE.MeshStandardMaterial({
      color: 0x4b429e,
      roughness: 0.45,
      metalness: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xefd070,
      metalness: 0.55,
      roughness: 0.30,
    });
    const gripGreenMat = new THREE.MeshStandardMaterial({ color: 0x286e58, roughness: 0.68 });
    const leatherStrapMat = new THREE.MeshStandardMaterial({ color: 0x56321b, roughness: 0.78 });
    const shieldTex = createHylianShieldTexture();
    const shieldFrontMat = new THREE.MeshStandardMaterial({
      map: shieldTex,
      roughness: 0.42,
      metalness: 0.18,
    });

    // 1. Back Scabbard & Sheathed Gear on UpperChest
    const chestBone =
      this.vrm.humanoid.getRawBoneNode('upperChest') ||
      this.vrm.humanoid.getRawBoneNode('chest') ||
      this.vrm.humanoid.getRawBoneNode('spine');

    if (chestBone) {
      const gearMount = new THREE.Group();
      // Mount cleanly on mid-back (-Z in VRM 1.0) just below shoulder-length hair tips!
      gearMount.position.set(0, -0.055, -0.125);
      gearMount.rotation.y = Math.PI;

      // Master Sword Scabbard (always stays slung diagonally across the back!)
      const swordRig = new THREE.Group();
      swordRig.rotation.z = -0.50;
      swordRig.position.set(0.02, 0.05, 0.012);

      const scabbard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.023, 0.016, 0.74, 12),
        indigoMat
      );
      scabbard.scale.set(1, 1, 0.48);
      scabbard.position.y = -0.14;
      scabbard.castShadow = true;

      const goldChape = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.03, 0.026), goldMat);
      goldChape.position.y = 0.12;

      const goldTip = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.065, 8), goldMat);
      goldTip.scale.set(1, 1, 0.5);
      goldTip.rotation.x = Math.PI;
      goldTip.position.y = -0.52;

      swordRig.add(scabbard, goldChape, goldTip);

      // Hilt protruding from scabbard (hidden whenever Master Sword is drawn into rightHand!)
      this.sheathedHiltGroup = new THREE.Group();
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, 0.19, 12),
        gripGreenMat
      );
      grip.position.y = 0.35;

      const crossGuard = new THREE.Mesh(
        new THREE.BoxGeometry(0.165, 0.032, 0.032),
        royalPurpleMat
      );
      crossGuard.position.y = 0.25;

      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.017, 0), goldMat);
      gem.position.set(0, 0.25, 0.02);

      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 1), goldMat);
      pommel.position.y = 0.45;

      this.sheathedHiltGroup.add(grip, crossGuard, gem, pommel);
      swordRig.add(this.sheathedHiltGroup);
      gearMount.add(swordRig);

      // Curved Convex Hylian Shield on Back (hidden whenever raised onto left forearm!)
      this.backShieldMesh = new THREE.Mesh(buildCurvedHylianShieldGeometry(), shieldFrontMat);
      this.backShieldMesh.position.set(0.0, -0.03, 0.038);
      this.backShieldMesh.castShadow = true;
      gearMount.add(this.backShieldMesh);

      chestBone.add(gearMount);
    }

    // 2. Drawn Master Sword in Right Hand (`J_Bip_R_Hand`)
    const rHand = this.vrm.humanoid.getRawBoneNode('rightHand');
    if (rHand) {
      this.handSwordGroup = new THREE.Group();
      // Palm grip center in rightHand local space (-X fingers, -Y palm, +Z thumb)
      this.handSwordGroup.position.set(-0.044, -0.026, 0.0);

      const swordModel = new THREE.Group();
      // Align +Y sword blade along +Z (thumb side) with natural 15-deg forward martial wrist cant
      swordModel.rotation.set(Math.PI / 2, -0.26, 0, 'XYZ');

      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.020, 1), goldMat);
      pommel.position.y = -0.105;

      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0135, 0.0125, 0.175, 12),
        gripGreenMat
      );
      grip.position.y = -0.01;

      const gripSpacer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.014, 12),
        goldMat
      );
      gripSpacer.position.y = 0.065;

      // Sculpted Winged Master Sword Crossguard
      const guardCenter = new THREE.Mesh(
        new THREE.BoxGeometry(0.072, 0.036, 0.034),
        royalPurpleMat
      );
      guardCenter.position.y = 0.092;

      const wingGeo = new THREE.BoxGeometry(0.078, 0.024, 0.026);
      const wingL = new THREE.Mesh(wingGeo, royalPurpleMat);
      wingL.position.set(-0.058, 0.108, 0);
      wingL.rotation.z = -0.38;
      const wingR = new THREE.Mesh(wingGeo, royalPurpleMat);
      wingR.position.set(0.058, 0.108, 0);
      wingR.rotation.z = 0.38;

      const guardGemF = new THREE.Mesh(new THREE.OctahedronGeometry(0.015, 0), goldMat);
      guardGemF.position.set(0, 0.094, 0.019);
      const guardGemB = guardGemF.clone();
      guardGemB.position.set(0, 0.094, -0.019);

      // Ricasso collar + Golden Triforce etching
      const ricasso = new THREE.Mesh(
        new THREE.BoxGeometry(0.048, 0.046, 0.016),
        royalPurpleMat
      );
      ricasso.position.y = 0.126;

      this.swordBladeMat = new THREE.MeshStandardMaterial({
        color: 0xeef7ff,
        metalness: 0.78,
        roughness: 0.18,
        emissive: new THREE.Color(0x4ad4ff),
        emissiveIntensity: 0.16,
      });
      const bladeMesh = new THREE.Mesh(createMasterSwordBladeGeometry(), this.swordBladeMat);
      bladeMesh.castShadow = true;

      const triforceInlay = new THREE.Mesh(
        new THREE.ConeGeometry(0.011, 0.016, 3),
        goldMat
      );
      triforceInlay.rotation.x = Math.PI / 2;
      triforceInlay.position.set(0, 0.18, 0.0085);

      this.bladeBaseMarker.position.set(0, 0.15, 0);
      this.bladeTipMarker.position.set(0, 0.90, 0);

      swordModel.add(
        pommel,
        grip,
        gripSpacer,
        guardCenter,
        wingL,
        wingR,
        guardGemF,
        guardGemB,
        ricasso,
        bladeMesh,
        triforceInlay,
        this.bladeBaseMarker,
        this.bladeTipMarker
      );
      this.handSwordGroup.add(swordModel);
      this.handSwordGroup.visible = false;
      rHand.add(this.handSwordGroup);
    }

    // 3. Forearm-Strapped Hylian Shield on Left Forearm (`J_Bip_L_LowerArm`)
    const lForearm = this.vrm.humanoid.getRawBoneNode('leftLowerArm');
    if (lForearm) {
      this.armShieldGroup = new THREE.Group();
      this.armShieldGroup.position.set(0.125, 0.046, -0.012);

      // Exact right-handed basis: Shield +Z (front) -> Arm +Y (dorsal), Shield +Y (Triforce top) -> Arm +Z (thumb)
      const shieldBasis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 1, 0)
      );
      const shieldHolder = new THREE.Group();
      shieldHolder.quaternion.setFromRotationMatrix(shieldBasis);

      const armShieldMesh = new THREE.Mesh(buildCurvedHylianShieldGeometry(), shieldFrontMat);
      armShieldMesh.castShadow = true;

      // Leather forearm straps on the inner concave side of the shield
      const strap1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.044, 0.007, 8, 18, Math.PI * 1.15),
        leatherStrapMat
      );
      strap1.rotation.set(0, Math.PI / 2, Math.PI / 2);
      strap1.position.set(-0.045, 0.01, -0.012);
      const strap2 = strap1.clone();
      strap2.position.set(0.055, 0.01, -0.012);

      // Subtle Breath-of-the-Wild Hylian Guard Ward shimmer in front of shield face
      this.shieldWardMat = new THREE.MeshBasicMaterial({
        color: 0x72ecff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const wardRing = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.21, 6), this.shieldWardMat);
      wardRing.position.set(0, 0.01, 0.036);

      this.shieldFaceMarker.position.set(0, 0.01, 0.06);

      shieldHolder.add(armShieldMesh, strap1, strap2, wardRing, this.shieldFaceMarker);
      this.armShieldGroup.add(shieldHolder);
      this.armShieldGroup.visible = false;
      lForearm.add(this.armShieldGroup);
    }

    // 4. Subtle Glowing Turquoise-Gold Zonai Rings on Right Forearm!
    const rForearm = this.vrm.humanoid.getRawBoneNode('rightLowerArm');
    if (rForearm) {
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x4effcc });
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.004, 8, 24), ringMat);
      r1.rotation.z = Math.PI / 2;
      r1.position.set(-0.08, 0, 0);
      const r2 = r1.clone();
      r2.position.set(-0.14, 0, 0);
      rForearm.add(r1, r2);
    }

    // 5. Overhead Starlight & Twin-Paw Wing-Glider (`星羽滑翔翼`)
    this.gliderGroup = new THREE.Group();
    // Handlebar center sits right at raised hands (y = 1.72, z = 0.14 in character space)
    this.gliderGroup.position.set(0, 1.72, 0.14);

    const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 10), goldMat);
    handleBar.rotation.z = Math.PI / 2;
    this.gliderGroup.add(handleBar);

    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.30, 8), goldMat);
      strut.position.set(sx * 0.24, 0.14, -0.02);
      strut.rotation.z = -sx * 0.12;
      this.gliderGroup.add(strut);
    }

    // Cambered Swept-Wing Sail Geometry
    const sailGeo = new THREE.PlaneGeometry(2.24, 0.94, 22, 8);
    sailGeo.rotateX(-Math.PI / 2);
    const sp = sailGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      const nx = Math.abs(x) / 1.12;
      const archY = Math.cos(nx * Math.PI * 0.48) * 0.14;
      const sweepZ = -nx * nx * 0.28;
      sp.setY(i, archY + (z > 0 ? -0.02 : 0.02));
      sp.setZ(i, z + sweepZ);
    }
    sailGeo.computeVertexNormals();

    const sailMat = new THREE.MeshStandardMaterial({
      map: createStarlightGliderTexture(),
      emissive: new THREE.Color(0x523c8f),
      emissiveIntensity: 0.32,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const sailMesh = new THREE.Mesh(sailGeo, sailMat);
    sailMesh.position.set(0, 0.27, -0.04);
    sailMesh.castShadow = true;

    const leadingSpar = new THREE.Mesh(
      new THREE.TorusGeometry(1.14, 0.016, 8, 28, Math.PI * 0.92),
      goldMat
    );
    leadingSpar.rotation.x = Math.PI * 0.44;
    leadingSpar.rotation.z = Math.PI * 0.04;
    leadingSpar.position.set(0, 0.22, -0.62);

    this.gliderStreamers = [];
    const streamerMat = new THREE.MeshBasicMaterial({
      color: 0x8ef7ff,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    });
    for (const sx of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.85, 1, 6), streamerMat);
      st.rotation.x = Math.PI / 2;
      st.position.set(sx * 1.04, 0.26, -0.74);
      this.gliderGroup.add(st);
      this.gliderStreamers.push({ mesh: st, sx });
    }

    this.gliderGroup.add(sailMesh, leadingSpar);
    this.gliderGroup.visible = false;
    this.vrm.scene.add(this.gliderGroup);

    // 6. Underfoot Hylian Surfboard Shield (`海利亚滑草盾`) mounted on root along travel heading
    this.surfShieldGroup = new THREE.Group();
    this.surfShieldGroup.position.set(0, 0.036, 0.02);
    const surfMesh = new THREE.Mesh(buildCurvedHylianShieldGeometry(), shieldFrontMat);
    surfMesh.rotation.x = Math.PI / 2 - 0.12;
    surfMesh.scale.set(1.22, 1.32, 1.15);
    surfMesh.castShadow = true;
    this.surfShieldGroup.add(surfMesh);
    this.surfShieldGroup.visible = false;
    this.root.add(this.surfShieldGroup);
  }

  setGliding(active, roll = 0) {
    if (active && !this.gliding) {
      if (this.shieldSurfing) this.setShieldSurfing(false);
      this.swordDrawn = false;
      this.shieldDrawn = false;
      this.shieldHolding = false;
      this.combatState = 'none';
      this._syncEquipmentVisibility();
      this.pendingEvents.push({ type: 'glider_open' });
    }
    this.gliding = active;
    this.gliderRoll = roll;
  }

  setShieldSurfing(active) {
    if (active && !this.shieldSurfing) {
      if (this.gliding) this.setGliding(false);
      this.swordDrawn = false;
      this.shieldDrawn = false;
      this.shieldHolding = false;
      this.combatState = 'none';
      this.shieldSurfing = true;
      this._syncEquipmentVisibility();
      this.pendingEvents.push({ type: 'surf_start' });
      return;
    }
    if (!active && this.shieldSurfing) {
      this.shieldSurfing = false;
      this.surfFlipTimer = 0;
      this._syncEquipmentVisibility();
    }
  }

  triggerSurfKickflip() {
    if (!this.shieldSurfing) return;
    this.surfFlipTimer = 0.48;
  }

  _syncEquipmentVisibility() {
    if (this.handSwordGroup) this.handSwordGroup.visible = this.swordDrawn;
    if (this.sheathedHiltGroup) this.sheathedHiltGroup.visible = !this.swordDrawn;
    if (this.armShieldGroup) this.armShieldGroup.visible = this.shieldDrawn && !this.shieldSurfing;
    if (this.backShieldMesh) this.backShieldMesh.visible = !this.shieldDrawn && !this.shieldSurfing;
    if (this.surfShieldGroup) this.surfShieldGroup.visible = this.shieldSurfing;
  }

  _drawWeapons({ withShield = false } = {}) {
    const newlyDrawnSword = !this.swordDrawn;
    this.swordDrawn = true;
    if (withShield) this.shieldDrawn = true;
    this.sheatheTimer = 5.5;
    this._syncEquipmentVisibility();
    if (newlyDrawnSword) {
      this.pendingEvents.push({ type: 'sword_draw' });
    }
  }

  sheatheAll() {
    if (!this.swordDrawn && !this.shieldDrawn) return;
    if (this.combatState !== 'none') return;
    this.swordDrawn = false;
    this.shieldDrawn = false;
    this.shieldHolding = false;
    this.sheatheTimer = 0;
    this._syncEquipmentVisibility();
    this.pendingEvents.push({ type: 'sheathe' });
  }

  toggleSheathe() {
    if (this.combatState !== 'none') return;
    if (this.swordDrawn || this.shieldDrawn) {
      this.sheatheAll();
    } else {
      this._drawWeapons({ withShield: true });
    }
  }

  // --- Public Martial Arts Combat Triggers ---

  triggerSwordSlash(grounded = true) {
    if (this.gliding) {
      this.setGliding(false);
    }
    if (this.shieldSurfing) {
      this.setShieldSurfing(false);
    }
    this._drawWeapons({ withShield: this.shieldDrawn || this.shieldHolding });

    // Aerial Helm-Splitter Jump Slash!
    if (!grounded) {
      if (this.combatState !== 'jump_slash') {
        this.combatState = 'jump_slash';
        this.combatTime = 0;
        this.combatDuration = 0.72;
        this.jumpSlamLanded = false;
        this.visualSpinYaw = 0;
        this.pendingEvents.push({ type: 'sword_swing', combo: 2 });
      }
      return;
    }

    // Buffer next combo hit if currently mid-slash
    if (this.combatState === 'slash1' || this.combatState === 'slash2') {
      if (this.combatTime > 0.11) {
        this.queuedSlash = true;
      }
      return;
    }

    if (
      this.combatState === 'slash3' ||
      this.combatState === 'spin_attack' ||
      this.combatState === 'shield_parry'
    ) {
      return;
    }

    if (this.comboResetTimer > 0 && this.comboStep > 0 && this.comboStep < 3) {
      this._startComboStep(this.comboStep + 1);
    } else {
      this._startComboStep(1);
    }
  }

  _startComboStep(step) {
    this.comboStep = step;
    this.queuedSlash = false;
    this.slashWaveEmitted = false;
    this.visualSpinYaw = 0;
    this.combatTime = 0;

    if (step === 1) {
      this.combatState = 'slash1';
      this.combatDuration = 0.42;
      this.comboResetTimer = 0.85;
      this.pendingEvents.push({ type: 'sword_swing', combo: 0 });
    } else if (step === 2) {
      this.combatState = 'slash2';
      this.combatDuration = 0.42;
      this.comboResetTimer = 0.90;
      this.pendingEvents.push({ type: 'sword_swing', combo: 1 });
    } else {
      this.combatState = 'slash3';
      this.combatDuration = 0.62;
      this.comboResetTimer = 0;
      this.comboStep = 0;
      this.pendingEvents.push({ type: 'sword_swing', combo: 2 });
    }
  }

  startSpinCharge(grounded = true) {
    if (!grounded) return;
    if (this.combatState === 'spin_charge') return;
    if (this.combatState === 'spin_attack' || this.combatState === 'jump_slash') return;
    this._drawWeapons({ withShield: this.shieldDrawn });
    this.combatState = 'spin_charge';
    this.combatTime = 0;
    this.chargeTime = 0;
    this.chargeReadyEmitted = false;
    this.visualSpinYaw = 0;
  }

  releaseSpinCharge(grounded = true) {
    if (this.combatState !== 'spin_charge') return;
    if (this.chargeTime >= 0.36) {
      this.combatState = 'spin_attack';
      this.combatTime = 0;
      this.combatDuration = 0.66;
      this.slashWaveEmitted = false;
      this.visualSpinYaw = 0;
      this.pendingEvents.push({ type: 'spin_release' });
    } else {
      this.combatState = 'none';
      this.triggerSwordSlash(grounded);
    }
    this.chargeTime = 0;
  }

  setShieldGuard(active) {
    if (active && !this.shieldHolding) {
      this._drawWeapons({ withShield: true });
      this.pendingEvents.push({ type: 'shield_raise' });
    }
    this.shieldHolding = active;
    if (active) {
      this.sheatheTimer = 5.5;
    }
  }

  triggerShieldParry(grounded = true) {
    if (!grounded && this.combatState === 'jump_slash') return;
    if (this.combatState === 'shield_parry' && this.combatTime < 0.30) return;

    this._drawWeapons({ withShield: true });
    this.combatState = 'shield_parry';
    this.combatTime = 0;
    this.combatDuration = 0.45;
    this.parryImpactEmitted = false;
    this.queuedSlash = false;
    this.visualSpinYaw = 0;
  }

  consumeEvents() {
    if (this.pendingEvents.length === 0) return [];
    const out = this.pendingEvents.slice();
    this.pendingEvents.length = 0;
    return out;
  }

  getBladeWorldSegment(outBase, outTip) {
    if (!this.swordDrawn || !this.handSwordGroup) return false;
    this.bladeBaseMarker.getWorldPosition(outBase);
    this.bladeTipMarker.getWorldPosition(outTip);
    return true;
  }

  getShieldWorldCenter(outPos) {
    if (!this.shieldDrawn || !this.armShieldGroup) return false;
    this.shieldFaceMarker.getWorldPosition(outPos);
    return true;
  }

  getCombatLocomotionModifiers() {
    // Returns root-motion forward lunge speed, movement speed multiplier, and blade trail state
    let lungeSpeed = 0;
    let moveMultiplier = 1.0;
    let lockFacingToCamera = false;
    let trailActive = false;
    let trailGolden = 0.0;
    let airDownwardBoost = 0;

    if (this.shieldHolding && this.combatState === 'none') {
      moveMultiplier = 0.62;
      lockFacingToCamera = true;
    }

    switch (this.combatState) {
      case 'slash1': {
        moveMultiplier = 0.18;
        if (this.combatTime >= 0.08 && this.combatTime <= 0.24) lungeSpeed = 3.2;
        trailActive = this.combatTime >= 0.07 && this.combatTime <= 0.31;
        break;
      }
      case 'slash2': {
        moveMultiplier = 0.18;
        if (this.combatTime >= 0.07 && this.combatTime <= 0.24) lungeSpeed = 3.4;
        trailActive = this.combatTime >= 0.06 && this.combatTime <= 0.31;
        break;
      }
      case 'slash3': {
        moveMultiplier = 0.15;
        if (this.combatTime >= 0.14 && this.combatTime <= 0.38) lungeSpeed = 4.9;
        trailActive = this.combatTime >= 0.09 && this.combatTime <= 0.46;
        trailGolden = 0.65;
        break;
      }
      case 'spin_charge': {
        moveMultiplier = 0.30;
        lockFacingToCamera = true;
        break;
      }
      case 'spin_attack': {
        moveMultiplier = 0.45;
        lungeSpeed = this.combatTime < 0.25 ? 1.8 : 0;
        trailActive = this.combatTime >= 0.02 && this.combatTime <= 0.54;
        trailGolden = 1.0;
        break;
      }
      case 'jump_slash': {
        moveMultiplier = 0.35;
        if (!this.jumpSlamLanded && this.combatTime > 0.13) {
          airDownwardBoost = 11.5;
        }
        trailActive = this.combatTime >= 0.08 && (!this.jumpSlamLanded || this.combatTime < 0.32);
        trailGolden = 0.75;
        break;
      }
      case 'shield_parry': {
        moveMultiplier = 0.15;
        if (this.combatTime >= 0.06 && this.combatTime <= 0.18) lungeSpeed = 1.6;
        lockFacingToCamera = true;
        break;
      }
      default:
        break;
    }

    return {
      lungeSpeed,
      moveMultiplier,
      lockFacingToCamera,
      trailActive,
      trailGolden,
      airDownwardBoost,
      inCombat: this.combatState !== 'none' || this.shieldHolding,
    };
  }

  resetSpringBones() {
    this.vrm?.springBoneManager?.reset();
  }

  playAction(name, fadeDuration = 0.24) {
    if (!this.actions[name] || this.currentActionName === name) return;
    const next = this.actions[name];
    const prev = this.actions[this.currentActionName];

    next.reset();
    next.play();
    if (prev) {
      prev.crossFadeTo(next, fadeDuration, false);
    }
    this.currentActionName = name;
  }

  _advanceCombatTimers(dt, locomotion) {
    if (this.comboResetTimer > 0 && this.combatState === 'none') {
      this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
      if (this.comboResetTimer === 0) this.comboStep = 0;
    }

    // Auto-sheathe peacefully after 5.5s out of combat
    if (this.combatState === 'none' && !this.shieldHolding && (this.swordDrawn || this.shieldDrawn)) {
      this.sheatheTimer -= dt;
      if (this.sheatheTimer <= 0) {
        this.sheatheAll();
      }
    } else if (this.combatState !== 'none' || this.shieldHolding) {
      this.sheatheTimer = 5.5;
    }

    this.shieldBlend = THREE.MathUtils.lerp(
      this.shieldBlend,
      this.shieldHolding ? 1.0 : 0.0,
      Math.min(1, dt * 15)
    );

    const wantStance = this.swordDrawn || this.shieldDrawn || this.combatState !== 'none';
    this.stanceBlend = THREE.MathUtils.lerp(
      this.stanceBlend,
      wantStance ? 1.0 : 0.0,
      Math.min(1, dt * 12)
    );

    if (this.combatState === 'none') {
      this.visualSpinYaw = THREE.MathUtils.lerp(this.visualSpinYaw, 0, Math.min(1, dt * 16));
      this._updateWeaponGlow(dt);
      return;
    }

    this.combatTime += dt;

    if (this.combatState === 'spin_charge') {
      this.chargeTime += dt;
      if (this.chargeTime >= 0.38 && !this.chargeReadyEmitted) {
        this.chargeReadyEmitted = true;
        this.pendingEvents.push({ type: 'charge_ready' });
      }
      this._updateWeaponGlow(dt);
      return;
    }

    // Mid-slash grass wave emissions
    if (
      (this.combatState === 'slash1' || this.combatState === 'slash2') &&
      !this.slashWaveEmitted &&
      this.combatTime >= 0.14
    ) {
      this.slashWaveEmitted = true;
      this.pendingEvents.push({ type: 'slash_wave', radius: 2.35, strength: 0.72 });
    } else if (this.combatState === 'slash3' && !this.slashWaveEmitted && this.combatTime >= 0.24) {
      this.slashWaveEmitted = true;
      this.pendingEvents.push({ type: 'slash_wave', radius: 3.1, strength: 1.05, finisher: true });
    } else if (
      this.combatState === 'spin_attack' &&
      !this.slashWaveEmitted &&
      this.combatTime >= 0.10
    ) {
      this.slashWaveEmitted = true;
      this.pendingEvents.push({ type: 'spin_wave', radius: 4.1, strength: 1.35 });
    } else if (
      this.combatState === 'shield_parry' &&
      !this.parryImpactEmitted &&
      this.combatTime >= 0.10
    ) {
      this.parryImpactEmitted = true;
      this.pendingEvents.push({ type: 'parry_impact' });
    }

    // Jump Slash touchdown detection
    if (this.combatState === 'jump_slash') {
      if (!this.jumpSlamLanded && locomotion.grounded && this.combatTime > 0.08) {
        this.jumpSlamLanded = true;
        this.combatTime = 0;
        this.combatDuration = 0.28;
        this.pendingEvents.push({ type: 'jump_slam' });
      } else if (this.jumpSlamLanded && this.combatTime >= this.combatDuration) {
        this.combatState = 'none';
      }
      this._updateWeaponGlow(dt);
      return;
    }

    // Chain buffered combo strike seamlessly during active follow-through window!
    if (
      this.queuedSlash &&
      (this.combatState === 'slash1' || this.combatState === 'slash2') &&
      this.combatTime >= 0.27
    ) {
      this._startComboStep(this.comboStep + 1);
      this._updateWeaponGlow(dt);
      return;
    }

    // Visual 360 / 720 martial arts spin yaw on vrm.scene
    if (this.combatState === 'slash3') {
      const sp = smoothStep01(this.combatTime / 0.34);
      this.visualSpinYaw = sp * Math.PI * 2;
      if (this.combatTime >= this.combatDuration) {
        this.visualSpinYaw = 0;
      }
    } else if (this.combatState === 'spin_attack') {
      const sp = 1 - Math.pow(1 - Math.min(1, this.combatTime / 0.54), 2.3);
      this.visualSpinYaw = sp * Math.PI * 4;
      if (this.combatTime >= this.combatDuration) {
        this.visualSpinYaw = 0;
      }
    } else {
      this.visualSpinYaw = 0;
    }

    if (this.combatTime >= this.combatDuration) {
      this.combatState = 'none';
      this.visualSpinYaw = 0;
    }

    this._updateWeaponGlow(dt);
  }

  _updateWeaponGlow(dt) {
    if (this.swordBladeMat) {
      let targetGlow = 0.16;
      if (this.combatState === 'spin_charge') {
        const pulse = 0.5 + 0.5 * Math.sin(this.chargeTime * 18.0);
        targetGlow = this.chargeReadyEmitted ? 0.95 + pulse * 0.55 : 0.35 + this.chargeTime * 0.9;
        this.swordBladeMat.emissive.setHex(this.chargeReadyEmitted ? 0xffdf6b : 0x52dcff);
      } else if (this.combatState === 'spin_attack' || this.combatState === 'slash3') {
        targetGlow = 0.95;
        this.swordBladeMat.emissive.setHex(0x88f0ff);
      } else if (this.combatState !== 'none') {
        targetGlow = 0.52;
        this.swordBladeMat.emissive.setHex(0x52dcff);
      } else {
        this.swordBladeMat.emissive.setHex(0x4ad4ff);
      }
      this.swordBladeMat.emissiveIntensity = THREE.MathUtils.lerp(
        this.swordBladeMat.emissiveIntensity,
        targetGlow,
        Math.min(1, dt * 14)
      );
    }

    if (this.shieldWardMat) {
      let wardOpacity = 0;
      if (this.combatState === 'shield_parry') {
        wardOpacity = Math.max(0, 1 - this.combatTime / 0.32) * 0.85;
        this.shieldWardMat.color.setHex(0xffe98a);
      } else if (this.shieldHolding) {
        wardOpacity = 0.22 + 0.06 * Math.sin(performance.now() * 0.006);
        this.shieldWardMat.color.setHex(0x72ecff);
      }
      this.shieldWardMat.opacity = wardOpacity;
    }
  }

  _blendBoneCharQuat(boneName, targetCharQuat, weight) {
    if (weight <= 0.001 || !this.vrm?.humanoid) return;
    const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone || !bone.parent) return;

    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_qParentWorld);

    _qTargetLocal.copy(_qNormRoot).multiply(targetCharQuat);
    _qParentWorld.invert();
    _qTargetLocal.premultiply(_qParentWorld);

    bone.quaternion.slerp(_qTargetLocal, THREE.MathUtils.clamp(weight, 0, 1));
    bone.updateMatrixWorld(false);
  }

  _blendBoneAdditiveEuler(boneName, rx, ry, rz, weight) {
    if (weight <= 0.001 || !this.vrm?.humanoid) return;
    const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) return;
    _euler.set(rx * weight, ry * weight, rz * weight, 'YXZ');
    _qTargetChar.setFromEuler(_euler);
    bone.quaternion.multiply(_qTargetChar);
    bone.updateMatrixWorld(false);
  }

  _curlHandFingers(side, gripWeight) {
    if (gripWeight <= 0.01 || !this.vrm?.humanoid) return;
    const sign = side === 'right' ? 1 : -1;
    const fingers = ['Index', 'Middle', 'Ring', 'Little'];
    const joints = ['Proximal', 'Intermediate', 'Distal'];
    for (const f of fingers) {
      for (const j of joints) {
        const node = this.vrm.humanoid.getNormalizedBoneNode(`${side}${f}${j}`);
        if (!node) continue;
        _euler.set(0, 0, sign * 1.18, 'XYZ');
        _qTargetLocal.setFromEuler(_euler);
        node.quaternion.slerp(_qTargetLocal, gripWeight);
      }
    }
    const thumbP = this.vrm.humanoid.getNormalizedBoneNode(`${side}ThumbProximal`);
    if (thumbP) {
      _euler.set(0.35, -sign * 0.55, sign * 0.45, 'XYZ');
      _qTargetLocal.setFromEuler(_euler);
      thumbP.quaternion.slerp(_qTargetLocal, gripWeight);
    }
  }

  _applyMartialArtsPose(locomotion) {
    if (!this.vrm?.humanoid) return;
    if (
      this.stanceBlend <= 0.002 &&
      this.combatState === 'none' &&
      this.gliderBlend <= 0.002 &&
      this.surfBlend <= 0.002
    ) {
      this.vrm.scene.rotation.y = 0;
      return;
    }

    const flipAngle =
      this.surfFlipTimer > 0 ? (1 - this.surfFlipTimer / 0.48) * Math.PI * 2 : 0;
    this.vrm.scene.rotation.y =
      this.combatState !== 'none' ? this.visualSpinYaw : 0.96 * this.surfBlend + flipAngle;

    const normRoot = this.vrm.humanoid.normalizedHumanBonesRoot;
    if (normRoot) {
      normRoot.updateWorldMatrix(true, false);
      normRoot.getWorldQuaternion(_qNormRoot);
    } else {
      _qNormRoot.identity();
    }

    // Default Ready Stance vectors in Character Space (+X Left, -X Right, +Y Up, +Z Forward)
    let torsoLeanX = 0.05 * this.shieldBlend;
    let torsoTwistY = -0.22 * this.shieldBlend;
    let torsoTiltZ = 0;
    let hipsSinkY = -0.03 * this.shieldBlend;

    // Right arm (Master Sword): relaxed low-right guard ready poise
    let rWeight = this.swordDrawn ? Math.max(this.stanceBlend * 0.82, this.shieldBlend * 0.92) : 0;
    let rUDir = [-0.62, -0.72, 0.26];
    let rLDir = [-0.26, -0.35, 0.90];
    let rBlade = [-0.14, 0.42, 0.89];

    // Left arm (Hylian Shield / Martial Counter-Balance)
    let lWeight = this.shieldDrawn
      ? Math.max(this.stanceBlend * 0.55, this.shieldBlend)
      : 0;
    let lUDir = lerpVec3Arr([0.48, -0.82, 0.25], [0.56, -0.64, 0.52], this.shieldBlend);
    let lLDir = lerpVec3Arr([0.15, -0.58, 0.80], [-0.88, 0.24, 0.41], this.shieldBlend);
    let lDorsal = lerpVec3Arr([0.78, 0.12, 0.61], [0.14, 0.05, 0.99], this.shieldBlend);

    // Override with active Martial Arts Combat Choreography!
    const t = this.combatTime;

    if (this.combatState === 'slash1') {
      // Slash 1: Right-Shoulder High Windup -> Crisp Diagonal Down-Left Cut!
      rWeight = 1.0;
      lWeight = Math.max(lWeight, 0.88);
      if (t < 0.11) {
        const p = smoothStep01(t / 0.11);
        torsoTwistY = THREE.MathUtils.lerp(torsoTwistY, -0.46, p);
        torsoLeanX = THREE.MathUtils.lerp(torsoLeanX, -0.06, p);
        hipsSinkY = -0.05 * p;
        rUDir = lerpVec3Arr(rUDir, [-0.58, 0.48, 0.22], p);
        rLDir = lerpVec3Arr(rLDir, [-0.15, 0.84, 0.52], p);
        rBlade = lerpVec3Arr(rBlade, [-0.42, 0.82, -0.38], p);
      } else if (t < 0.27) {
        const p = smoothStep01((t - 0.11) / 0.16);
        torsoTwistY = THREE.MathUtils.lerp(-0.46, 0.52, p);
        torsoLeanX = THREE.MathUtils.lerp(-0.06, 0.22, p);
        torsoTiltZ = THREE.MathUtils.lerp(0, 0.08, p);
        hipsSinkY = -0.07;
        rUDir = lerpVec3Arr([-0.58, 0.48, 0.22], [0.36, -0.28, 0.89], p);
        rLDir = lerpVec3Arr([-0.15, 0.84, 0.52], [0.76, -0.38, 0.52], p);
        rBlade = lerpVec3Arr([-0.42, 0.82, -0.38], [0.88, -0.36, 0.30], p);
      } else {
        const p = smoothStep01((t - 0.27) / Math.max(0.01, this.combatDuration - 0.27));
        torsoTwistY = THREE.MathUtils.lerp(0.52, 0.14, p);
        torsoLeanX = THREE.MathUtils.lerp(0.22, 0.06, p);
        hipsSinkY = THREE.MathUtils.lerp(-0.07, -0.02, p);
        rUDir = lerpVec3Arr([0.36, -0.28, 0.89], rUDir, p * 0.75);
        rLDir = lerpVec3Arr([0.76, -0.38, 0.52], rLDir, p * 0.75);
        rBlade = lerpVec3Arr([0.88, -0.36, 0.30], rBlade, p * 0.75);
      }
      // Left arm swept cleanly back-left behind the hip so shield never touches the blade arc!
      lUDir = [0.74, -0.52, -0.42];
      lLDir = [0.78, -0.44, -0.44];
      lDorsal = [0.62, 0.42, -0.66];
    } else if (this.combatState === 'slash2') {
      // Slash 2: Coiled Left-Low -> Wide Rising Backhand Sweep to High-Right!
      rWeight = 1.0;
      lWeight = Math.max(lWeight, 0.88);
      if (t < 0.09) {
        const p = smoothStep01(t / 0.09);
        torsoTwistY = THREE.MathUtils.lerp(0.35, 0.50, p);
        torsoLeanX = 0.16;
        hipsSinkY = -0.06;
        rUDir = [0.40, -0.32, 0.86];
        rLDir = [0.78, -0.36, 0.50];
        rBlade = [0.86, -0.38, 0.32];
      } else if (t < 0.26) {
        const p = smoothStep01((t - 0.09) / 0.17);
        torsoTwistY = THREE.MathUtils.lerp(0.50, -0.56, p);
        torsoLeanX = THREE.MathUtils.lerp(0.16, 0.08, p);
        torsoTiltZ = THREE.MathUtils.lerp(0.06, -0.08, p);
        hipsSinkY = -0.06;
        rUDir = lerpVec3Arr([0.40, -0.32, 0.86], [-0.82, 0.22, 0.52], p);
        rLDir = lerpVec3Arr([0.78, -0.36, 0.50], [-0.88, 0.36, 0.30], p);
        rBlade = lerpVec3Arr([0.86, -0.38, 0.32], [-0.86, 0.44, -0.24], p);
      } else {
        const p = smoothStep01((t - 0.26) / Math.max(0.01, this.combatDuration - 0.26));
        torsoTwistY = THREE.MathUtils.lerp(-0.56, -0.10, p);
        torsoLeanX = THREE.MathUtils.lerp(0.08, 0.04, p);
        hipsSinkY = THREE.MathUtils.lerp(-0.06, -0.02, p);
        rUDir = lerpVec3Arr([-0.82, 0.22, 0.52], rUDir, p * 0.8);
        rLDir = lerpVec3Arr([-0.88, 0.36, 0.30], rLDir, p * 0.8);
        rBlade = lerpVec3Arr([-0.86, 0.44, -0.24], rBlade, p * 0.8);
      }
      lUDir = [0.74, -0.50, 0.44];
      lLDir = [0.46, -0.24, 0.85];
      lDorsal = [0.78, 0.12, 0.61];
    } else if (this.combatState === 'slash3') {
      // Slash 3 Finisher: 360 Martial Pivot -> Heroic Overhead-Forward Cleaving Slam!
      rWeight = 1.0;
      lWeight = Math.max(lWeight, 0.92);
      if (t < 0.20) {
        const p = smoothStep01(t / 0.20);
        torsoTwistY = THREE.MathUtils.lerp(-0.35, -0.25, p);
        torsoLeanX = THREE.MathUtils.lerp(0.08, -0.12, p);
        hipsSinkY = -0.07;
        rUDir = lerpVec3Arr([-0.75, 0.20, 0.62], [-0.32, 0.78, 0.52], p);
        rLDir = lerpVec3Arr([-0.70, 0.35, 0.62], [-0.10, 0.88, 0.46], p);
        rBlade = lerpVec3Arr([-0.75, 0.52, -0.38], [-0.12, 0.78, -0.60], p);
      } else if (t < 0.38) {
        const p = smoothStep01((t - 0.20) / 0.18);
        torsoTwistY = THREE.MathUtils.lerp(-0.25, 0.42, p);
        torsoLeanX = THREE.MathUtils.lerp(-0.12, 0.34, p);
        hipsSinkY = -0.10;
        rUDir = lerpVec3Arr([-0.32, 0.78, 0.52], [0.06, -0.26, 0.96], p);
        rLDir = lerpVec3Arr([-0.10, 0.88, 0.46], [0.14, -0.48, 0.86], p);
        rBlade = lerpVec3Arr([-0.12, 0.78, -0.60], [0.12, -0.36, 0.92], p);
      } else {
        const p = smoothStep01((t - 0.38) / Math.max(0.01, this.combatDuration - 0.38));
        torsoTwistY = THREE.MathUtils.lerp(0.42, 0.0, p);
        torsoLeanX = THREE.MathUtils.lerp(0.34, 0.04, p);
        hipsSinkY = THREE.MathUtils.lerp(-0.10, 0.0, p);
        rUDir = lerpVec3Arr([0.06, -0.26, 0.96], rUDir, p);
        rLDir = lerpVec3Arr([0.14, -0.48, 0.86], rLDir, p);
        rBlade = lerpVec3Arr([0.12, -0.36, 0.92], rBlade, p);
      }
      lUDir = [0.76, -0.42, -0.48];
      lLDir = [0.72, -0.24, 0.65];
      lDorsal = [0.82, 0.18, 0.54];
    } else if (this.combatState === 'spin_charge') {
      // Iconic Link Coiled Hip Sword-Charge Stance!
      const p = smoothStep01(Math.min(1, t / 0.22));
      rWeight = 1.0;
      lWeight = 0.95;
      torsoTwistY = -0.62 * p;
      torsoLeanX = 0.20 * p;
      hipsSinkY = -0.09 * p;
      rUDir = lerpVec3Arr(rUDir, [-0.66, -0.50, -0.55], p);
      rLDir = lerpVec3Arr(rLDir, [-0.42, -0.16, -0.89], p);
      rBlade = lerpVec3Arr(rBlade, [-0.52, 0.06, -0.85], p);
      lUDir = lerpVec3Arr(lUDir, [0.52, -0.38, 0.76], p);
      lLDir = lerpVec3Arr(lLDir, [-0.28, 0.22, 0.93], p);
      lDorsal = [0.32, 0.08, 0.94];
    } else if (this.combatState === 'spin_attack') {
      // 360/720 Hurricane Spin Attack — Outstretched horizontal blade cleave!
      rWeight = 1.0;
      lWeight = 0.95;
      const outro = t > 0.48 ? smoothStep01((t - 0.48) / (this.combatDuration - 0.48)) : 0;
      torsoTwistY = THREE.MathUtils.lerp(0.32, 0.0, outro);
      torsoLeanX = THREE.MathUtils.lerp(0.18, 0.04, outro);
      hipsSinkY = THREE.MathUtils.lerp(-0.08, 0.0, outro);
      rUDir = lerpVec3Arr([-0.86, -0.06, 0.50], rUDir, outro);
      rLDir = lerpVec3Arr([-0.74, -0.04, 0.67], rLDir, outro);
      rBlade = lerpVec3Arr([-0.82, 0.02, 0.57], rBlade, outro);
      lUDir = [0.78, -0.36, -0.50];
      lLDir = [0.74, -0.18, 0.64];
      lDorsal = [0.82, 0.16, 0.55];
    } else if (this.combatState === 'jump_slash') {
      // Aerial Overhead Helm-Splitter -> Ground Impact Follow-Through
      rWeight = 1.0;
      lWeight = 0.9;
      if (!this.jumpSlamLanded) {
        const p = smoothStep01((t - 0.06) / 0.18);
        torsoLeanX = THREE.MathUtils.lerp(-0.14, 0.32, p);
        torsoTwistY = THREE.MathUtils.lerp(-0.18, 0.24, p);
        rUDir = lerpVec3Arr([-0.26, 0.78, 0.56], [0.04, -0.32, 0.94], p);
        rLDir = lerpVec3Arr([-0.08, 0.88, 0.46], [0.08, -0.60, 0.79], p);
        rBlade = lerpVec3Arr([-0.06, 0.85, -0.52], [0.06, -0.54, 0.84], p);
      } else {
        const p = smoothStep01(t / this.combatDuration);
        torsoLeanX = THREE.MathUtils.lerp(0.38, 0.05, p);
        torsoTwistY = THREE.MathUtils.lerp(0.24, 0.0, p);
        hipsSinkY = THREE.MathUtils.lerp(-0.13, 0.0, p);
        rUDir = lerpVec3Arr([0.04, -0.38, 0.92], rUDir, p);
        rLDir = lerpVec3Arr([0.08, -0.65, 0.75], rLDir, p);
        rBlade = lerpVec3Arr([0.06, -0.58, 0.81], rBlade, p);
      }
      lUDir = [0.72, -0.38, -0.56];
      lLDir = [0.68, -0.22, 0.69];
      lDorsal = [0.80, 0.16, 0.58];
    } else if (this.combatState === 'shield_parry') {
      // Breath-of-the-Wild Perfect Shield Parry: Inward Coil -> Crisp Forward-Outward Shield Bash!
      lWeight = 1.0;
      rWeight = this.swordDrawn ? 0.92 : 0.6;
      if (t < 0.09) {
        const p = smoothStep01(t / 0.09);
        torsoTwistY = THREE.MathUtils.lerp(-0.18, 0.30, p);
        torsoLeanX = 0.08;
        hipsSinkY = -0.05;
        lUDir = lerpVec3Arr([0.56, -0.64, 0.52], [0.26, -0.50, 0.82], p);
        lLDir = lerpVec3Arr([-0.88, 0.24, 0.41], [-0.92, 0.18, 0.34], p);
        lDorsal = [0.18, 0.06, 0.98];
      } else if (t < 0.24) {
        const p = smoothStep01((t - 0.09) / 0.15);
        torsoTwistY = THREE.MathUtils.lerp(0.30, -0.44, p);
        torsoLeanX = THREE.MathUtils.lerp(0.08, 0.18, p);
        hipsSinkY = -0.06;
        lUDir = lerpVec3Arr([0.26, -0.50, 0.82], [0.68, -0.18, 0.71], p);
        lLDir = lerpVec3Arr([-0.92, 0.18, 0.34], [-0.42, 0.26, 0.87], p);
        lDorsal = lerpVec3Arr([0.18, 0.06, 0.98], [0.36, 0.08, 0.93], p);
      } else {
        const p = smoothStep01((t - 0.24) / Math.max(0.01, this.combatDuration - 0.24));
        const endShield = this.shieldHolding ? 1.0 : 0.35;
        torsoTwistY = THREE.MathUtils.lerp(-0.44, -0.22 * endShield, p);
        torsoLeanX = THREE.MathUtils.lerp(0.18, 0.05 * endShield, p);
        hipsSinkY = THREE.MathUtils.lerp(-0.06, -0.03 * endShield, p);
        const restUDir = lerpVec3Arr([0.48, -0.82, 0.25], [0.56, -0.64, 0.52], endShield);
        const restLDir = lerpVec3Arr([0.15, -0.58, 0.80], [-0.88, 0.24, 0.41], endShield);
        lUDir = lerpVec3Arr([0.68, -0.18, 0.71], restUDir, p);
        lLDir = lerpVec3Arr([-0.42, 0.26, 0.87], restLDir, p);
        lDorsal = lerpVec3Arr([0.36, 0.08, 0.93], [0.14, 0.05, 0.99], p);
      }
      // Keep right sword arm poised back at hip out of shield sweep
      rUDir = [-0.68, -0.62, -0.38];
      rLDir = [-0.42, -0.35, 0.84];
      rBlade = [-0.25, 0.35, 0.90];
    } else if (this.gliderBlend > 0.01 && this.combatState === 'none') {
      // Overhead Starlight Wing-Glider Two-Handed Handlebar Grip!
      rWeight = Math.max(rWeight, this.gliderBlend);
      lWeight = Math.max(lWeight, this.gliderBlend);
      torsoLeanX = 0.12 * this.gliderBlend;
      torsoTiltZ = this.gliderRoll * 0.45 * this.gliderBlend;
      rUDir = lerpVec3Arr(rUDir, [-0.30, 0.90, 0.31], this.gliderBlend);
      rLDir = lerpVec3Arr(rLDir, [-0.10, 0.95, 0.29], this.gliderBlend);
      rBlade = lerpVec3Arr(rBlade, [0.0, -0.29, 0.96], this.gliderBlend);
      lUDir = lerpVec3Arr(lUDir, [0.30, 0.90, 0.31], this.gliderBlend);
      lLDir = lerpVec3Arr(lLDir, [0.10, 0.95, 0.29], this.gliderBlend);
      lDorsal = lerpVec3Arr(lDorsal, [0.0, -0.29, 0.96], this.gliderBlend);
    } else if (this.surfBlend > 0.01 && this.combatState === 'none') {
      // Iconic Hylian Shield-Surfer Sideways Balance Stance!
      rWeight = Math.max(rWeight, this.surfBlend * 0.92);
      lWeight = Math.max(lWeight, this.surfBlend * 0.92);
      hipsSinkY = -0.10 * this.surfBlend;
      torsoLeanX = 0.08 * this.surfBlend;
      torsoTwistY = 0.28 * this.surfBlend;
      // Left arm reaching forward along nose of shield, right arm trailing for balance
      lUDir = lerpVec3Arr(lUDir, [0.78, 0.06, 0.62], this.surfBlend);
      lLDir = lerpVec3Arr(lLDir, [0.88, 0.14, 0.45], this.surfBlend);
      lDorsal = lerpVec3Arr(lDorsal, [0.12, 0.95, -0.28], this.surfBlend);
      rUDir = lerpVec3Arr(rUDir, [-0.80, 0.12, -0.58], this.surfBlend);
      rLDir = lerpVec3Arr(rLDir, [-0.88, 0.22, -0.42], this.surfBlend);
      rBlade = lerpVec3Arr(rBlade, [-0.35, 0.90, 0.25], this.surfBlend);
    }

    // 1. Martial Stance Crouch & Shield-Surfer Knee Flex
    const hipsNode = this.vrm.humanoid.getNormalizedBoneNode('hips');
    if (hipsNode && Math.abs(hipsSinkY) > 0.001) {
      hipsNode.position.y += hipsSinkY * 0.42;
      hipsNode.updateMatrixWorld(false);
    }

    if (
      this.surfBlend > 0.02 ||
      (locomotion.grounded && locomotion.speed < 0.8 && Math.abs(hipsSinkY) > 0.02)
    ) {
      const stanceAmt = Math.max(this.surfBlend, Math.min(1, Math.abs(hipsSinkY) / 0.08));
      this._blendBoneAdditiveEuler('leftUpperLeg', 0.30, 0.16, 0.08, stanceAmt);
      this._blendBoneAdditiveEuler('leftLowerLeg', -0.52, 0, 0, stanceAmt);
      this._blendBoneAdditiveEuler('rightUpperLeg', -0.20, -0.18, -0.08, stanceAmt);
      this._blendBoneAdditiveEuler('rightLowerLeg', -0.42, 0, 0, stanceAmt);
    }

    // 2. Spine, Chest, UpperChest & Head Counter-Rotation (keeps eyes forward on target!)
    const torsoWeight = Math.max(rWeight, lWeight);
    this._blendBoneAdditiveEuler('spine', torsoLeanX * 0.35, torsoTwistY * 0.30, torsoTiltZ * 0.3, torsoWeight);
    this._blendBoneAdditiveEuler('chest', torsoLeanX * 0.40, torsoTwistY * 0.40, torsoTiltZ * 0.4, torsoWeight);
    this._blendBoneAdditiveEuler('upperChest', torsoLeanX * 0.25, torsoTwistY * 0.30, torsoTiltZ * 0.3, torsoWeight);
    this._blendBoneAdditiveEuler(
      'neck',
      -torsoLeanX * 0.35,
      -torsoTwistY * 0.45 - 0.46 * this.surfBlend,
      0,
      torsoWeight
    );
    this._blendBoneAdditiveEuler(
      'head',
      -torsoLeanX * 0.30,
      -torsoTwistY * 0.35 - 0.38 * this.surfBlend,
      0,
      torsoWeight
    );

    // 3. Solve Right Arm + Right Hand (Master Sword)
    if (rWeight > 0.005) {
      rightArmCharQuat(rUDir, rLDir, _qTargetChar);
      this._blendBoneCharQuat('rightUpperArm', _qTargetChar, rWeight);

      rightArmCharQuat(rLDir, rBlade, _qTargetChar);
      this._blendBoneCharQuat('rightLowerArm', _qTargetChar, rWeight);

      rightArmCharQuat(rLDir, rBlade, _qTargetChar);
      this._blendBoneCharQuat('rightHand', _qTargetChar, rWeight);

      if (this.swordDrawn || this.gliderBlend > 0.05) {
        this._curlHandFingers('right', rWeight * 0.92);
      }
    }

    // 4. Solve Left Arm + Left Hand (Hylian Shield / Martial Counter-Balance / Glider Grip)
    if (lWeight > 0.005) {
      leftArmCharQuat(lUDir, lDorsal, _qTargetChar);
      this._blendBoneCharQuat('leftUpperArm', _qTargetChar, lWeight);

      leftArmCharQuat(lLDir, lDorsal, _qTargetChar);
      this._blendBoneCharQuat('leftLowerArm', _qTargetChar, lWeight);

      leftArmCharQuat(lLDir, lDorsal, _qTargetChar);
      this._blendBoneCharQuat('leftHand', _qTargetChar, lWeight);

      if (this.shieldDrawn || this.gliderBlend > 0.05) {
        this._curlHandFingers('left', lWeight * 0.85);
      }
    }
  }

  update(dt, locomotion, cameraPos) {
    if (!this.ready || !this.vrm) return;

    this.gliderBlend = THREE.MathUtils.lerp(
      this.gliderBlend,
      this.gliding ? 1.0 : 0.0,
      Math.min(1, dt * 14.0)
    );
    this.surfBlend = THREE.MathUtils.lerp(
      this.surfBlend,
      this.shieldSurfing ? 1.0 : 0.0,
      Math.min(1, dt * 14.0)
    );
    if (this.surfFlipTimer > 0) {
      this.surfFlipTimer = Math.max(0, this.surfFlipTimer - dt);
    }
    if (this.surfShieldGroup && this.surfShieldGroup.visible) {
      const flipSpin =
        this.surfFlipTimer > 0 ? (1 - this.surfFlipTimer / 0.48) * Math.PI * 2 : 0;
      this.surfShieldGroup.rotation.y = flipSpin;
    }

    if (this.gliderGroup) {
      this.gliderGroup.visible = this.gliderBlend > 0.02;
      if (this.gliderGroup.visible) {
        const s = 0.25 + 0.75 * this.gliderBlend;
        this.gliderGroup.scale.set(s, s, s);
        this.gliderGroup.rotation.z = this.gliderRoll;
        const now = performance.now() * 0.001;
        for (const st of this.gliderStreamers) {
          st.mesh.rotation.y = Math.sin(now * 9.5 + st.sx) * 0.22;
          st.mesh.rotation.z = Math.cos(now * 7.2 + st.sx) * 0.14;
        }
      }
    }

    this._advanceCombatTimers(dt, locomotion);

    // Choose base skeletal animation clip based on movement state
    if (this.shieldSurfing) {
      this.playAction('Idle', 0.18);
    } else if (!locomotion.grounded) {
      if (!this.gliding && locomotion.velY > 1.2 && this.actions.JumpUp) {
        this.playAction('JumpUp', 0.15);
      } else if (this.actions.Floating) {
        this.playAction('Floating', 0.22);
      }
    } else if (locomotion.speed > 4.2 && this.actions.Run) {
      this.playAction('Run', 0.22);
      this.actions.Run.timeScale = THREE.MathUtils.clamp(locomotion.speed / 5.4, 0.8, 1.3);
    } else if (locomotion.speed > 0.25 && this.actions.Walk) {
      this.playAction('Walk', 0.22);
      this.actions.Walk.timeScale = THREE.MathUtils.clamp(locomotion.speed / 2.2, 0.75, 1.35);
    } else {
      this.playAction('Idle', 0.28);
    }

    // Natural eye blinking & spirited martial / joyful surfing expression
    this.blinkTimer -= dt;
    if (this.vrm.expressionManager) {
      const fierce =
        this.combatState !== 'none' && this.combatState !== 'spin_charge' ? 1.0 : 0.0;
      this.vrm.expressionManager.setValue('relaxed', fierce > 0.5 ? 0.0 : 0.22);
      this.vrm.expressionManager.setValue(
        'happy',
        fierce > 0.5 ? 0.0 : this.shieldSurfing ? 0.58 : 0.12
      );
      this.vrm.expressionManager.setValue('aa', fierce * 0.22);

      if (this.blinkTimer <= 0) {
        const blinkPhase = Math.min(1, Math.sin(((-this.blinkTimer) / 0.14) * Math.PI));
        this.vrm.expressionManager.setValue('blink', Math.max(0, blinkPhase));
        if (this.blinkTimer <= -0.14) {
          this.vrm.expressionManager.setValue('blink', 0);
          this.blinkTimer = 2.8 + Math.random() * 3.4;
        }
      }
    }

    // Eye gaze: when camera zooms close in front of Dengdeng, look warmly toward camera!
    if (cameraPos) {
      const headY = this.root.position.y + 1.42;
      const toCam = new THREE.Vector3(
        cameraPos.x - this.root.position.x,
        cameraPos.y - headY,
        cameraPos.z - this.root.position.z
      );
      const dist = toCam.length();
      const forward = new THREE.Vector3(
        Math.sin(this.root.rotation.y),
        0,
        Math.cos(this.root.rotation.y)
      );
      if (dist < 3.6 && toCam.clone().normalize().dot(forward) > 0.35 && this.combatState === 'none') {
        this.lookTarget.position.lerp(cameraPos, Math.min(1, dt * 6));
      } else {
        const ahead = new THREE.Vector3(
          this.root.position.x + forward.x * 5,
          headY,
          this.root.position.z + forward.z * 5
        );
        this.lookTarget.position.lerp(ahead, Math.min(1, dt * 5));
      }
    }

    // 1. Advance 60fps base mocap on normalized bones
    this.mixer.update(dt);

    // 2. Layer Martial Arts Sword & Shield Choreography on normalized bones
    this._applyMartialArtsPose(locomotion);

    // 3. Propagate normalized bones -> raw bones, solve forearm twist & SpringBone hair/tunic physics!
    this.vrm.update(dt);
  }
}
