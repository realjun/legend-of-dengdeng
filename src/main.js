import * as THREE from 'three';

import { HyruleWorld } from './world/HyruleWorld.js';
import { VrmDengdeng } from './player/VrmDengdeng.js';
import { SoundEngine } from './audio/SoundEngine.js';

class HyruleExplorationApp {
  constructor() {
    this.canvas = document.getElementById('hyrule-canvas');
    this.loadingVeil = document.getElementById('loading-veil');
    this.loadingFill = document.getElementById('loading-fill');
    this.loadingLabel = document.getElementById('loading-label');
    this.whisperEl = document.getElementById('region-whisper');
    this.whisperEn = document.getElementById('whisper-en');
    this.whisperZh = document.getElementById('whisper-zh');
    this.walkHint = document.getElementById('walk-hint');

    this.ready = false;
    this.sound = new SoundEngine();

    // Direct Hardware-Antialiased WebGL Renderer (100% compatible across macOS Metal, Windows D3D11, & Linux!)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    const initW = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1280);
    const initH = Math.max(240, window.innerHeight || document.documentElement.clientHeight || 720);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(initW, initH);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, initW / initH, 0.12, 800);

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '' : '';
    const isSoftware = /swiftshader|llvmpipe|software/i.test(gpuName);

    // World & Character
    this.paused = false;
    this.world = new HyruleWorld(this.scene, { isSoftware });
    this.dengdeng = new VrmDengdeng(this.scene);

    // Spawn at Scenic Awakening Overlook along the Flagstone Trail
    const startZ = 21.5;
    const startX = this.world.getRoadX(startZ);
    const startY = this.world.getWalkHeight(startX, startZ);

    this.playerPos = new THREE.Vector3(startX, startY, startZ);
    this.charYaw = Math.PI + 0.06; // Facing North (-Z) toward Mirror Lake, Bridge & Dueling Peaks
    this.velXZ = new THREE.Vector2(0, 0);
    this.velY = 0;
    this.grounded = true;
    this.stepAccum = 0;

    // Smooth Damped Orbit Camera State
    this.camTargetYaw = 0.06;
    this.camTargetPitch = 0.14;
    this.camTargetDist = 3.35;

    this.camYaw = this.camTargetYaw;
    this.camPitch = this.camTargetPitch;
    this.camDist = this.camTargetDist;
    this.camFocus = new THREE.Vector3(startX, startY + 1.28, startZ);

    // Input State
    this.keys = new Set();
    this.simInput = null;
    this.isDragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.hasMovedOnce = false;

    // Region Discovery Tracking
    this.currentRegion = '';
    this.whisperTimer = null;

    this._bindEvents();
    this.lastTime = performance.now();
  }

  async init() {
    try {
      this._setLoadingProgress(0.08, '正在绘染吉卜力森林与海拉鲁山谷…');
      await this.world.loadGhibliTrees();

      await this.dengdeng.load((p, stepLabel) => {
        this._setLoadingProgress(0.14 + p * 0.84, stepLabel || '正在唤醒英杰登登…');
      });

      this._setLoadingProgress(1.0, '欢迎来到海拉鲁原野');

      this.world.setMoodPreset('day');
      this.dengdeng.root.position.copy(this.playerPos);
      this.dengdeng.root.rotation.y = this.charYaw;
      this.dengdeng.resetSpringBones();

      // Warm up initial pose before unveiling
      this.world.update(0.016, this.playerPos);
      this._updateCamera(1.0);
      this.dengdeng.update(0.016, { speed: 0, grounded: true, velY: 0 }, this.camera.position);
      this.renderer.render(this.scene, this.camera);

      this.ready = true;
      this.loadingVeil.classList.add('fade-out');
      this._showRegionWhisper('HYRULE FIELD', '海拉鲁原野 · 静谧镜湖');

      this.lastTime = performance.now();
      this._animate();
    } catch (err) {
      console.error('Failed to initialize Hyrule world:', err);
      if (this.loadingLabel) {
        this.loadingLabel.textContent = `加载出错：${err.message || err}`;
      }
    }
  }

  _setLoadingProgress(ratio, label) {
    if (this.loadingFill) {
      this.loadingFill.style.width = `${Math.round(THREE.MathUtils.clamp(ratio, 0.05, 1) * 100)}%`;
    }
    if (label && this.loadingLabel) {
      this.loadingLabel.textContent = label;
    }
  }

  _showRegionWhisper(en, zh) {
    if (!this.whisperEl) return;
    this.whisperEn.textContent = en;
    this.whisperZh.textContent = zh;
    this.whisperEl.classList.remove('hidden');
    if (this.whisperTimer) clearTimeout(this.whisperTimer);
    this.whisperTimer = setTimeout(() => {
      this.whisperEl.classList.add('hidden');
    }, 4200);
  }

  _bindEvents() {
    const syncSize = () => {
      const w = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1280);
      const h = Math.max(240, window.innerHeight || document.documentElement.clientHeight || 720);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', syncSize);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(syncSize).observe(document.documentElement);
    }

    const unlockAudio = () => this.sound.init();

    window.addEventListener('keydown', (e) => {
      unlockAudio();
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.isDragging = false;
    });

    // Smooth Click-Drag & Touch Orbit on Canvas
    this.canvas.addEventListener('pointerdown', (e) => {
      unlockAudio();
      this.isDragging = true;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;

      this.camTargetYaw -= dx * 0.0055;
      this.camTargetPitch = THREE.MathUtils.clamp(
        this.camTargetPitch + dy * 0.0042,
        -0.16,
        0.82
      );
    });

    window.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      this.canvas.releasePointerCapture?.(e.pointerId);
    });

    // Scroll Wheel Zoom (from 0.90m Portrait Close-up to 7.8m Sweeping Vista)
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camTargetDist = THREE.MathUtils.clamp(
          this.camTargetDist + e.deltaY * 0.0028,
          0.90,
          7.8
        );
      },
      { passive: false }
    );

    // Top-Right Atmosphere & Framing Buttons
    document.querySelectorAll('[data-mood]').forEach((btn) => {
      btn.addEventListener('click', () => {
        unlockAudio();
        const mood = btn.getAttribute('data-mood');
        this.setMood(mood);
      });
    });

    const btnPortrait = document.getElementById('btn-portrait');
    if (btnPortrait) {
      btnPortrait.addEventListener('click', () => {
        unlockAudio();
        // Orbit smoothly in front of Dengdeng's face with soft 3/4 portrait angle!
        this.camTargetYaw = this._wrapAngle(this.charYaw + 0.24);
        this.camTargetPitch = 0.05;
        this.camTargetDist = 1.28;
      });
    }

    const btnVista = document.getElementById('btn-vista');
    if (btnVista) {
      btnVista.addEventListener('click', () => {
        unlockAudio();
        this.camTargetYaw = this._wrapAngle(this.charYaw - Math.PI + 0.08);
        this.camTargetPitch = 0.15;
        this.camTargetDist = 3.55;
      });
    }
  }

  setMood(mood) {
    this.world.setMoodPreset(mood);
    document.querySelectorAll('[data-mood]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mood') === mood);
    });
  }

  _wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  _lerpAngle(curr, target, alpha) {
    const diff = this._wrapAngle(target - curr);
    return curr + diff * alpha;
  }

  _updateLocomotion(dt) {
    // Optional keyboard arrow camera orbit support
    if (this.keys.has('ArrowLeft')) this.camTargetYaw += dt * 1.65;
    if (this.keys.has('ArrowRight')) this.camTargetYaw -= dt * 1.65;
    if (this.keys.has('ArrowUp')) {
      this.camTargetPitch = THREE.MathUtils.clamp(this.camTargetPitch + dt * 1.1, -0.16, 0.82);
    }
    if (this.keys.has('ArrowDown')) {
      this.camTargetPitch = THREE.MathUtils.clamp(this.camTargetPitch - dt * 1.1, -0.16, 0.82);
    }

    let fwd = 0;
    let right = 0;
    if (this.keys.has('KeyW')) fwd += 1;
    if (this.keys.has('KeyS')) fwd -= 1;
    if (this.keys.has('KeyD')) right += 1;
    if (this.keys.has('KeyA')) right -= 1;

    let sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let jumpPressed = this.keys.has('Space');

    if (this.simInput) {
      fwd = this.simInput.forward ?? fwd;
      right = this.simInput.right ?? right;
      sprinting = this.simInput.sprint ?? sprinting;
      jumpPressed = this.simInput.jump ?? jumpPressed;
    }

    // Movement vector relative to camera horizontal look direction
    const camFwdX = -Math.sin(this.camYaw);
    const camFwdZ = -Math.cos(this.camYaw);
    const camRightX = Math.cos(this.camYaw);
    const camRightZ = -Math.sin(this.camYaw);

    let moveX = camFwdX * fwd + camRightX * right;
    let moveZ = camFwdZ * fwd + camRightZ * right;
    const mag = Math.hypot(moveX, moveZ);

    const maxSpeed = sprinting ? 5.5 : 2.25;
    let targetVx = 0;
    let targetVz = 0;

    if (mag > 0.01) {
      moveX /= mag;
      moveZ /= mag;
      targetVx = moveX * maxSpeed;
      targetVz = moveZ * maxSpeed;

      const desiredYaw = Math.atan2(moveX, moveZ);
      this.charYaw = this._lerpAngle(this.charYaw, desiredYaw, Math.min(1, dt * 10.5));

      // Subtle gentle camera follow when walking laterally without dragging mouse
      if (!this.isDragging && Math.abs(right) > 0.2 && fwd >= 0) {
        this.camTargetYaw -= right * dt * 0.42;
      }

      if (!this.hasMovedOnce) {
        this.hasMovedOnce = true;
        setTimeout(() => this.walkHint?.classList.add('dimmed'), 3500);
      }
    }

    const accel = mag > 0.01 ? 9.5 : 11.5;
    this.velXZ.x = THREE.MathUtils.lerp(this.velXZ.x, targetVx, Math.min(1, dt * accel));
    this.velXZ.y = THREE.MathUtils.lerp(this.velXZ.y, targetVz, Math.min(1, dt * accel));

    this.playerPos.x += this.velXZ.x * dt;
    this.playerPos.z += this.velXZ.y * dt;
    this.world.resolveCollisions(this.playerPos, 0.38);

    const groundY = this.world.getWalkHeight(this.playerPos.x, this.playerPos.z);

    if (this.grounded && jumpPressed) {
      this.velY = 6.2;
      this.grounded = false;
      this.sound.footstep('grass');
    }

    if (!this.grounded) {
      this.velY -= 16.5 * dt;
      this.playerPos.y += this.velY * dt;
      if (this.playerPos.y <= groundY) {
        this.playerPos.y = groundY;
        this.velY = 0;
        this.grounded = true;
        this.sound.footstep(this._detectSurface());
      }
    } else {
      // Smooth terrain & arched wooden bridge following
      this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, groundY, Math.min(1, dt * 22));
    }

    const speed = this.velXZ.length();

    // Soft organic footstep cadence
    if (this.grounded && speed > 0.35) {
      this.stepAccum += speed * dt;
      const stride = speed > 3.8 ? 1.85 : 1.32;
      if (this.stepAccum >= stride) {
        this.stepAccum = 0;
        this.sound.footstep(this._detectSurface());
      }
    } else {
      this.stepAccum = 0.8;
    }

    this.dengdeng.root.position.copy(this.playerPos);
    this.dengdeng.root.rotation.y = this.charYaw;

    this._checkLandmarkDiscovery();

    return {
      speed,
      grounded: this.grounded,
      velY: this.velY,
    };
  }

  _detectSurface() {
    const bx = this.world.getRoadX(-4);
    if (Math.abs(this.playerPos.x - bx) < 1.65 && Math.abs(this.playerPos.z + 4) < 8.4) {
      return 'wood';
    }
    const rx = this.world.getRoadX(this.playerPos.z);
    if (Math.abs(this.playerPos.x - rx) < 1.8) {
      return 'stone';
    }
    return 'grass';
  }

  _checkLandmarkDiscovery() {
    const x = this.playerPos.x;
    const z = this.playerPos.z;
    let region = '';
    let en = '';
    let zh = '';

    if (Math.hypot(x - 24, z + 34) < 14) {
      region = 'ginkgo';
      en = 'GOLDEN GINKGO SANCTUARY';
      zh = '黄金银杏圣坛';
    } else if (Math.abs(x - this.world.getRoadX(-4)) < 4.2 && Math.abs(z + 4) < 8.5) {
      region = 'bridge';
      en = 'MIRROR LAKE BRIDGE';
      zh = '静谧镜湖 · 古木拱桥';
    } else if (Math.hypot(x + 15.5, z - 12.5) < 11.5) {
      region = 'ruins';
      en = 'TEMPLE OF TIME RUINS';
      zh = '时光神殿遗迹';
    }

    if (region && region !== this.currentRegion) {
      this.currentRegion = region;
      this._showRegionWhisper(en, zh);
      this.sound.discoveryFanfare();
    }
  }

  _updateCamera(dt) {
    const smooth = Math.min(1, dt * 10.0);
    this.camYaw = this._lerpAngle(this.camYaw, this.camTargetYaw, smooth);
    this.camPitch = THREE.MathUtils.lerp(this.camPitch, this.camTargetPitch, smooth);
    this.camDist = THREE.MathUtils.lerp(this.camDist, this.camTargetDist, smooth);

    // Raise focus smoothly from upper-torso (1.24m) at vista distance to face/eyes (1.41m) in close-up portrait!
    const closeT = 1.0 - THREE.MathUtils.smoothstep(this.camDist, 1.05, 2.6);
    const focusHeight = THREE.MathUtils.lerp(1.24, 1.41, closeT);

    const desiredFocus = new THREE.Vector3(
      this.playerPos.x,
      this.playerPos.y + focusHeight,
      this.playerPos.z
    );
    this.camFocus.lerp(desiredFocus, Math.min(1, dt * 16.0));

    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    const cx = this.camFocus.x + Math.sin(this.camYaw) * cosP * this.camDist;
    let cy = this.camFocus.y + sinP * this.camDist;
    const cz = this.camFocus.z + Math.cos(this.camYaw) * cosP * this.camDist;

    // Prevent camera from dipping underneath terrain or water
    const minGroundY =
      Math.max(this.world.getTerrainHeight(cx, cz), this.world.waterLevel) + 0.36;
    if (cy < minGroundY) cy = minGroundY;

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.camFocus);
  }

  setCameraView({ yaw, pitch, dist, immediate = false } = {}) {
    if (yaw !== undefined) this.camTargetYaw = yaw;
    if (pitch !== undefined) this.camTargetPitch = pitch;
    if (dist !== undefined) this.camTargetDist = dist;
    if (immediate) {
      this.camYaw = this.camTargetYaw;
      this.camPitch = this.camTargetPitch;
      this.camDist = this.camTargetDist;
      const closeT = 1.0 - THREE.MathUtils.smoothstep(this.camDist, 1.05, 2.6);
      const focusHeight = THREE.MathUtils.lerp(1.24, 1.41, closeT);
      this.camFocus.set(this.playerPos.x, this.playerPos.y + focusHeight, this.playerPos.z);
      this._updateCamera(1.0);
    }
  }

  teleport(x, z, charYaw = this.charYaw) {
    this.playerPos.set(x, this.world.getWalkHeight(x, z), z);
    this.velXZ.set(0, 0);
    this.velY = 0;
    this.grounded = true;
    this.charYaw = charYaw;
    this.dengdeng.root.position.copy(this.playerPos);
    this.dengdeng.root.rotation.y = this.charYaw;
    this.dengdeng.resetSpringBones();
    this._updateCamera(1.0);
  }

  stepSimulation(dt = 1 / 30) {
    const locomotion = this._updateLocomotion(dt);
    this._updateCamera(dt);
    this.world.update(dt, this.playerPos);
    this.dengdeng.update(dt, locomotion, this.camera.position);
    this.sound.updateAmbient(dt, 'field');
  }

  renderFrame() {
    this.renderer.render(this.scene, this.camera);
    this.renderer.getContext().finish();
  }

  stepFrame(dt = 1 / 30) {
    this.stepSimulation(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (this.paused) return;

    this.stepFrame(dt);
  }
}

const app = new HyruleExplorationApp();
window.__hyruleApp = app;
app.init();
