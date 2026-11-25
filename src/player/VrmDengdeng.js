import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import { createHylianShieldTexture } from '../utils/ToonMaterials.js';

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

    const chestBone =
      this.vrm.humanoid.getRawBoneNode('upperChest') ||
      this.vrm.humanoid.getRawBoneNode('chest') ||
      this.vrm.humanoid.getRawBoneNode('spine');

    if (chestBone) {
      const gearMount = new THREE.Group();
      // Mount cleanly on mid-back (-Z in VRM 1.0) just below shoulder-length hair tips!
      gearMount.position.set(0, -0.055, -0.125);
      gearMount.rotation.y = Math.PI;

      const indigoMat = new THREE.MeshStandardMaterial({ color: 0x2a356e, roughness: 0.65 });
      const royalPurpleMat = new THREE.MeshStandardMaterial({ color: 0x4b429e, roughness: 0.5 });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xefd070,
        metalness: 0.45,
        roughness: 0.35,
      });

      // Master Sword Scabbard & Winged Hilt slung diagonally over right shoulder
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

      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, 0.19, 12),
        new THREE.MeshStandardMaterial({ color: 0x2c6e58, roughness: 0.7 })
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

      swordRig.add(scabbard, goldChape, grip, crossGuard, gem, pommel);
      gearMount.add(swordRig);

      // Curved Convex Hylian Shield on Back
      const shieldGeo = new THREE.BoxGeometry(0.28, 0.36, 0.02, 10, 10, 1);
      const sp = shieldGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const sx = sp.getX(i);
        const sy = sp.getY(i);
        if (sy < 0) sp.setX(i, sx * (1.0 - Math.pow(Math.max(0, -sy / 0.18), 1.8) * 0.56));
        sp.setZ(i, sp.getZ(i) + sx * sx * 0.85);
      }
      shieldGeo.computeVertexNormals();
      const shieldMesh = new THREE.Mesh(
        shieldGeo,
        new THREE.MeshStandardMaterial({
          map: createHylianShieldTexture(),
          roughness: 0.45,
          metalness: 0.15,
        })
      );
      shieldMesh.position.set(0.0, -0.03, 0.038);
      shieldMesh.castShadow = true;
      gearMount.add(shieldMesh);

      chestBone.add(gearMount);
    }

    // Subtle Glowing Turquoise-Gold Zonai Rings on Right Forearm!
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

  update(dt, locomotion, cameraPos) {
    if (!this.ready || !this.vrm) return;

    // Choose skeletal animation clip based on movement state
    if (!locomotion.grounded) {
      if (locomotion.velY > 1.2 && this.actions.JumpUp) {
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

    // Natural eye blinking
    this.blinkTimer -= dt;
    if (this.vrm.expressionManager) {
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
      if (dist < 3.6 && toCam.clone().normalize().dot(forward) > 0.35) {
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

    this.mixer.update(dt);
    this.vrm.update(dt);
  }
}
