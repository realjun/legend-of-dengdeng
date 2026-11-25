import * as THREE from 'three';

import { HyruleWorld } from './world/HyruleWorld.js';
import { VrmDengdeng } from './player/VrmDengdeng.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { CombatEffects } from './effects/CombatEffects.js';
import { FamilySystem } from './entities/FamilySystem.js';
import { MonsterSystem } from './entities/MonsterSystem.js';
import { ExpandedBiomes } from './world/ExpandedBiomes.js';
import { PuzzleSystem } from './world/PuzzleSystem.js';
import { SkyIslandSystem } from './world/SkyIslandSystem.js';
import { CelebrationSystem } from './effects/CelebrationSystem.js';
import { AdventureJournal } from './ui/AdventureJournal.js';
import { PolaroidCamera } from './ui/PolaroidCamera.js';
import { Minimap } from './ui/Minimap.js';
import { PlayfulActivities } from './world/PlayfulActivities.js';

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
    this.interactPrompt = document.getElementById('interact-prompt');
    this.storyToast = document.getElementById('story-toast');
    this.storySpeaker = document.getElementById('story-speaker');
    this.storyText = document.getElementById('story-text');

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

    // World, Expanded Biomes, Puzzles, Sky Island, Activities, Celebration, Family Homestead & Monsters
    this.paused = false;
    this.world = new HyruleWorld(this.scene, { isSoftware });
    this.combatEffects = new CombatEffects(this.scene);
    this.family = new FamilySystem(this.scene, this.world);
    this.monsters = new MonsterSystem(this.scene, this.world, this.combatEffects, this.sound);
    this.biomes = new ExpandedBiomes(this.scene, this.world, this.family, this.monsters);
    this.puzzles = new PuzzleSystem(
      this.scene,
      this.world,
      this.family,
      this.combatEffects,
      this.sound
    );
    this.sky = new SkyIslandSystem(
      this.scene,
      this.world,
      this.puzzles,
      this.family,
      this.combatEffects,
      this.sound
    );
    this.activities = new PlayfulActivities(
      this.scene,
      this.world,
      this.family,
      this.monsters,
      this.combatEffects,
      this.sound
    );
    this.activities.onSlalomComplete = () => {
      this.showStoryToast(
        'Broccoli & Jelly',
        '「喵呜——太帅啦登登！」五道星环完美冲线，奖励 3 条香香小鱼干！',
        5200
      );
    };
    this.celebration = new CelebrationSystem(this.scene, this.world, this.family, this.sound);
    this.puzzles.onStarCollected = (count, total, chest) => {
      if (chest.id === 'maze_chest') this.biomes._mazeChestOpened = true;
      if (count >= total) {
        setTimeout(() => {
          this.triggerGrandCelebration();
        }, 900);
      }
    };
    this.dengdeng = new VrmDengdeng(this.scene);
    this.journal = new AdventureJournal(this);
    this.polaroid = new PolaroidCamera(this);
    this.minimap = new Minimap(this);

    // Spawn at Scenic Awakening Overlook along the Flagstone Trail
    const startZ = 21.5;
    const startX = this.world.getRoadX(startZ);
    const startY = this.world.getWalkHeight(startX, startZ);

    this.playerPos = new THREE.Vector3(startX, startY, startZ);
    this.charYaw = Math.PI + 0.06; // Facing North (-Z) toward Mirror Lake, Bridge & Dueling Peaks
    this.velXZ = new THREE.Vector2(0, 0);
    this.velY = 0;
    this.grounded = true;
    this.gliding = false;
    this.shieldSurfing = false;
    this.surfWakeTimer = 0;
    this.stepAccum = 0;

    // Smooth Damped Orbit Camera State + Subtle Combat Impulse
    this.camTargetYaw = 0.06;
    this.camTargetPitch = 0.14;
    this.camTargetDist = 3.35;

    this.camYaw = this.camTargetYaw;
    this.camPitch = this.camTargetPitch;
    this.camDist = this.camTargetDist;
    this.camFocus = new THREE.Vector3(startX, startY + 1.28, startZ);
    this.camImpulse = new THREE.Vector3();

    // Input State
    this.keys = new Set();
    this.simInput = null;
    this.isDragging = false;
    this.rightMouseHeld = false;
    this.pointerTravel = 0;
    this.pointerDownTime = 0;
    this.jHoldTimer = 0;
    this.lastPointer = { x: 0, y: 0 };
    this.hasMovedOnce = false;

    this._bladeBase = new THREE.Vector3();
    this._bladeTip = new THREE.Vector3();
    this._fxPos = new THREE.Vector3();
    this._fxNormal = new THREE.Vector3();

    // Region Discovery & Story Toast Tracking
    this.currentRegion = '';
    this.whisperTimer = null;
    this.storyTimer = null;
    this.activeInteraction = null;

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
      this.family.teleportCompanionsNear(this.playerPos, this.charYaw);

      // Warm up initial pose before unveiling
      this.world.update(0.016, this.playerPos);
      this.family.update(0.016, this.playerPos, this.charYaw);
      this._updateCamera(1.0);
      this.dengdeng.update(0.016, { speed: 0, grounded: true, velY: 0 }, this.camera.position);
      this.renderer.render(this.scene, this.camera);

      this.ready = true;
      this.minimap.update();
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

  showStoryToast(speaker, text, durationMs = 4800) {
    if (!this.storyToast) return;
    this.storySpeaker.textContent = speaker;
    this.storyText.textContent = text;
    this.storyToast.classList.remove('hidden');
    if (this.storyTimer) clearTimeout(this.storyTimer);
    this.storyTimer = setTimeout(() => {
      this.storyToast.classList.add('hidden');
    }, durationMs);
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
      if (e.code === 'Space') e.preventDefault();
      const firstPress = !this.keys.has(e.code) && !e.repeat;
      this.keys.add(e.code);

      if (!this.ready || !firstPress) return;
      if (e.code === 'Escape') {
        if (this.polaroid.isOpen()) this.polaroid.closeModal();
        if (this.journal.drawerOpen) this.journal.toggleDrawer(false);
        return;
      }
      if (e.code === 'KeyP') {
        if (this.polaroid.isOpen()) this.polaroid.closeModal();
        else this.polaroid.snapPhoto();
        return;
      }
      if (e.code === 'KeyJ') {
        this.jHoldTimer = 0.001;
        this.dengdeng.triggerSwordSlash(this.grounded);
      } else if (e.code === 'KeyK') {
        this.dengdeng.setShieldGuard(true);
      } else if (e.code === 'KeyE' || e.code === 'KeyL') {
        this.dengdeng.triggerShieldParry(this.grounded);
      } else if (e.code === 'KeyR') {
        this.dengdeng.toggleSheathe();
      } else if (e.code === 'KeyF') {
        this._executeActiveInteraction();
      } else if (e.code === 'KeyM') {
        this.journal.toggleDrawer();
      } else if (e.code === 'KeyN') {
        this.minimap.toggleOrientation();
      } else if (e.code === 'KeyC') {
        this.toggleShieldSurf();
      } else if (e.code === 'Space') {
        if (!this.grounded) {
          if (this.shieldSurfing) {
            this.setShieldSurfing(false);
          }
          this.setGliding(!this.gliding);
        } else if (this.sky.getUpdraftAt(this.playerPos)) {
          this.launchIntoUpdraft();
        }
      }
    });

    if (this.interactPrompt) {
      this.interactPrompt.addEventListener('click', (e) => {
        e.stopPropagation();
        unlockAudio();
        this._executeActiveInteraction();
      });
    }

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyJ') {
        this.jHoldTimer = 0;
        this.dengdeng.releaseSpinCharge(this.grounded);
      } else if (e.code === 'KeyK') {
        if (!this.rightMouseHeld) {
          this.dengdeng.setShieldGuard(false);
        }
      }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.isDragging = false;
      this.rightMouseHeld = false;
      this.jHoldTimer = 0;
      this.dengdeng.releaseSpinCharge(this.grounded);
      this.dengdeng.setShieldGuard(false);
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Smooth Click-Drag Orbit + Quick Left-Click Sword Slash + Right-Click Hold Shield Guard
    this.canvas.addEventListener('pointerdown', (e) => {
      unlockAudio();
      if (e.button === 2) {
        this.rightMouseHeld = true;
        if (this.ready) this.dengdeng.setShieldGuard(true);
        return;
      }
      if (e.button !== 0) return;
      this.isDragging = true;
      this.pointerTravel = 0;
      this.pointerDownTime = performance.now();
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
      this.pointerTravel += Math.hypot(dx, dy);

      this.camTargetYaw -= dx * 0.0055;
      this.camTargetPitch = THREE.MathUtils.clamp(
        this.camTargetPitch + dy * 0.0042,
        -0.16,
        0.82
      );
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) {
        this.rightMouseHeld = false;
        if (!this.keys.has('KeyK')) {
          this.dengdeng.setShieldGuard(false);
        }
        return;
      }
      if (e.button === 0 && this.isDragging) {
        const elapsed = performance.now() - this.pointerDownTime;
        if (this.ready && this.pointerTravel < 7 && elapsed < 320) {
          this.dengdeng.triggerSwordSlash(this.grounded);
        }
        this.isDragging = false;
        this.canvas.releasePointerCapture?.(e.pointerId);
      }
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
        if (mood !== 'night' && this.celebration.active) {
          this.celebration.stopCelebration();
          this.journal.hideDedication();
        }
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

    const btnHome = document.getElementById('btn-home');
    if (btnHome) {
      btnHome.addEventListener('click', () => {
        unlockAudio();
        this.teleport(27.8, 23.6, 0.92);
        this.setCameraView({ yaw: -2.18, pitch: 0.14, dist: 4.1, immediate: false });
      });
    }
  }

  triggerGrandCelebration() {
    this.celebration.startCelebration(this.playerPos, (m) => this.setMood(m), this.camYaw);
    this.journal.showDedication();
    this.showStoryToast(
      '老公 & Broccoli & Jelly',
      '「登登看天上——！漫天心愿孔明灯和星夜烟花都为你点亮啦，永远快乐、永远被爱包围！」',
      6800
    );
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
    // Hold-J transition into coiled Spin Attack Charge
    if (this.keys.has('KeyJ') && this.jHoldTimer > 0) {
      this.jHoldTimer += dt;
      if (
        this.grounded &&
        this.jHoldTimer >= 0.34 &&
        (this.dengdeng.combatState === 'none' ||
          (this.dengdeng.combatState === 'slash1' && this.dengdeng.combatTime >= 0.29))
      ) {
        this.dengdeng.startSpinCharge(this.grounded);
      }
    }

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

    const combatMods = this.dengdeng.getCombatLocomotionModifiers();

    // Movement vector relative to camera horizontal look direction
    const camFwdX = -Math.sin(this.camYaw);
    const camFwdZ = -Math.cos(this.camYaw);
    const camRightX = Math.cos(this.camYaw);
    const camRightZ = -Math.sin(this.camYaw);

    let moveX = camFwdX * fwd + camRightX * right;
    let moveZ = camFwdZ * fwd + camRightZ * right;
    const mag = Math.hypot(moveX, moveZ);

    // Z-Target Camera Lock when holding Shield Guard in exploration view (enables martial strafing!)
    if (combatMods.lockFacingToCamera && this.camDist > 1.85) {
      const camForwardYaw = Math.atan2(camFwdX, camFwdZ);
      this.charYaw = this._lerpAngle(this.charYaw, camForwardYaw, Math.min(1, dt * 14.0));
    }

    const maxSpeed = this.shieldSurfing
      ? 8.2
      : this.gliding
        ? 6.8
        : (sprinting && !combatMods.inCombat ? 5.5 : 2.25) * combatMods.moveMultiplier;
    let targetVx = 0;
    let targetVz = 0;
    let glideBank = 0;

    if (mag > 0.01) {
      moveX /= mag;
      moveZ /= mag;
      targetVx = moveX * maxSpeed;
      targetVz = moveZ * maxSpeed;

      if (!(combatMods.lockFacingToCamera && this.camDist > 1.85)) {
        const turnSpeed = this.shieldSurfing
          ? 4.8
          : this.gliding
            ? 5.2
            : combatMods.inCombat
              ? 7.5
              : 10.5;
        const desiredYaw = Math.atan2(moveX, moveZ);
        const yawDiff = this._wrapAngle(desiredYaw - this.charYaw);
        glideBank = THREE.MathUtils.clamp(-yawDiff * 0.45, -0.34, 0.34);
        this.charYaw = this._lerpAngle(this.charYaw, desiredYaw, Math.min(1, dt * turnSpeed));
      }

      // Subtle gentle camera follow when walking laterally without dragging mouse
      if (!this.isDragging && !combatMods.inCombat && Math.abs(right) > 0.2 && fwd >= 0) {
        this.camTargetYaw -= right * dt * 0.42;
      }

      if (!this.hasMovedOnce) {
        this.hasMovedOnce = true;
        setTimeout(() => this.walkHint?.classList.add('dimmed'), 5000);
      }
    } else if (this.shieldSurfing) {
      // Natural forward momentum & downhill terrain slope boost while Shield-Surfing!
      const sFwdX = Math.sin(this.charYaw);
      const sFwdZ = Math.cos(this.charYaw);
      const hHere = this.world.getTerrainHeight(this.playerPos.x, this.playerPos.z);
      const hAhead = this.world.getTerrainHeight(
        this.playerPos.x + sFwdX * 1.2,
        this.playerPos.z + sFwdZ * 1.2
      );
      const slopeBoost = THREE.MathUtils.clamp((hHere - hAhead) * 6.5, -1.5, 2.8);
      const cruiseSpeed = 6.2 + slopeBoost;
      targetVx = sFwdX * cruiseSpeed;
      targetVz = sFwdZ * cruiseSpeed;
    }

    if (this.gliding) {
      this.dengdeng.gliderRoll = THREE.MathUtils.lerp(
        this.dengdeng.gliderRoll,
        glideBank,
        Math.min(1, dt * 8.0)
      );
    }

    // Add martial arts forward root-motion lunge along character facing direction!
    if (combatMods.lungeSpeed > 0) {
      targetVx += Math.sin(this.charYaw) * combatMods.lungeSpeed;
      targetVz += Math.cos(this.charYaw) * combatMods.lungeSpeed;
    }

    const accel =
      combatMods.lungeSpeed > 0
        ? 18.0
        : this.shieldSurfing
          ? 6.2
          : this.gliding
            ? 5.5
            : mag > 0.01
              ? 9.5
              : 11.5;
    this.velXZ.x = THREE.MathUtils.lerp(this.velXZ.x, targetVx, Math.min(1, dt * accel));
    this.velXZ.y = THREE.MathUtils.lerp(this.velXZ.y, targetVz, Math.min(1, dt * accel));

    this.playerPos.x += this.velXZ.x * dt;
    this.playerPos.z += this.velXZ.y * dt;
    this.world.resolveCollisions(this.playerPos, 0.38);

    const groundY = this.world.getWalkHeight(this.playerPos.x, this.playerPos.z, this.playerPos.y);

    if (this.grounded && jumpPressed && this.dengdeng.combatState !== 'spin_charge') {
      if (this.sky.getUpdraftAt(this.playerPos)) {
        this.launchIntoUpdraft();
      } else if (this.shieldSurfing) {
        // 360 Kickflip Shield Spin Jump!
        this.velY = 6.6;
        this.grounded = false;
        this.dengdeng.triggerSurfKickflip();
        this.sound.shieldRaise();
        this._fxPos.set(this.playerPos.x, this.playerPos.y + 0.15, this.playerPos.z);
        this.combatEffects.spawnSparks(this._fxPos, '#ffe885', 14);
      } else {
        this.velY = 6.2;
        this.grounded = false;
        this.sound.footstep('grass');
      }
    }

    if (!this.grounded) {
      if (this.dengdeng.combatState === 'jump_slash' && this.gliding) {
        this.setGliding(false);
      }

      if (this.gliding) {
        const updraft = this.sky.getUpdraftAt(this.playerPos);
        if (updraft && this.playerPos.y < updraft.topY - 0.8) {
          this.velY = THREE.MathUtils.lerp(this.velY, 9.8, Math.min(1, dt * 4.8));
        } else {
          this.velY = Math.max(this.velY - 6.8 * dt, -1.65);
        }
      } else {
        const grav = 16.5 + combatMods.airDownwardBoost;
        this.velY -= grav * dt;
      }

      this.playerPos.y += this.velY * dt;
      const newGroundY = this.world.getWalkHeight(
        this.playerPos.x,
        this.playerPos.z,
        this.playerPos.y
      );
      if (this.playerPos.y <= newGroundY) {
        this.playerPos.y = newGroundY;
        this.velY = 0;
        this.grounded = true;
        if (this.gliding) this.setGliding(false);
        this.sound.footstep(this._detectSurface());
      }
    } else {
      if (this.gliding) this.setGliding(false);
      // Dismount Shield-Surfing smoothly if entering deep lake water
      if (this.shieldSurfing && groundY <= this.world.waterLevel - 0.15) {
        this.setShieldSurfing(false);
      }
      // Smooth terrain, arched wooden bridge & sky-island following
      if (groundY < this.playerPos.y - 1.5) {
        // Walked off an elevated ledge/sky-island!
        this.grounded = false;
      } else {
        this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, groundY, Math.min(1, dt * 22));
      }
    }

    const speed = this.velXZ.length();

    // Carve grass wake & starlight sparks under Hylian Surf-Shield!
    if (this.shieldSurfing && this.grounded && speed > 1.2) {
      this.surfWakeTimer -= dt;
      if (this.surfWakeTimer <= 0) {
        this.surfWakeTimer = 0.09;
        this.world.triggerGrassWave(this.playerPos.x, this.playerPos.z, 1.9, 0.82);
        this._fxPos.set(this.playerPos.x, this.playerPos.y + 0.06, this.playerPos.z);
        if (this._detectSurface() === 'grass') {
          this.combatEffects.spawnGrassClippings(this._fxPos, 6);
        } else {
          this.combatEffects.spawnSparks(this._fxPos, '#ffe484', 6);
        }
      }
    }

    // Soft organic footstep cadence
    if (this.grounded && !this.shieldSurfing && speed > 0.35 && combatMods.lungeSpeed === 0) {
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
      speed: combatMods.lungeSpeed > 0 ? speed * 0.35 : speed,
      grounded: this.grounded,
      velY: this.velY,
    };
  }

  setGliding(active) {
    if (active && this.grounded) return;
    if (active && this.shieldSurfing) this.setShieldSurfing(false);
    this.gliding = active;
    this.dengdeng.setGliding(active, 0);
  }

  setShieldSurfing(active) {
    this.shieldSurfing = active;
    this.dengdeng.setShieldSurfing(active);
  }

  toggleShieldSurf() {
    if (this.shieldSurfing) {
      this.setShieldSurfing(false);
      return;
    }
    if (this.gliding) this.setGliding(false);
    this.velY = Math.max(this.velY, 3.6);
    this.grounded = false;
    this.setShieldSurfing(true);
    this.dengdeng.triggerSurfKickflip();
  }

  launchIntoUpdraft() {
    if (this.shieldSurfing) this.setShieldSurfing(false);
    this.grounded = false;
    this.velY = 9.2;
    this.setGliding(true);
  }

  _detectSurface() {
    if (this.playerPos.y > 28) return 'stone';
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

    if (this.playerPos.y > 26 && Math.hypot(x, z + 16) < 13.5) {
      region = 'sky_island';
      en = 'CELESTIAL SAKURA SKY ISLAND';
      zh = '云端誓言浮岛 · 双子山之巅';
    } else if (Math.hypot(x + 18.2, z + 4.6) < 6.5) {
      region = 'fountain';
      en = 'LOTUS WISHING FOUNTAIN';
      zh = '镜湖发光睡莲 · 同心许愿泉';
    } else if (Math.hypot(x - 32, z - 25) < 13.5) {
      region = 'cottage';
      en = 'STARLIGHT BLOSSOM COTTAGE';
      zh = '星光樱花木屋 · 我们的家';
    } else if (Math.max(Math.abs(x + 40), Math.abs(z + 34)) < 14.5) {
      region = 'maze';
      en = 'STARLIGHT HEDGE LABYRINTH';
      zh = '星语树篱迷宫';
    } else if (Math.hypot(x - 54, z + 18) < 15.5) {
      region = 'glen';
      en = 'LUMINOUS MUSHROOM GLEN';
      zh = '奇幻荧光蘑菇秘境';
    } else if (Math.hypot(x - 24, z + 34) < 14) {
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

  _updateInteractionPrompt() {
    let inter =
      this.sky.getNearestInteraction(this.playerPos) ||
      this.activities.getNearestInteraction(this.playerPos) ||
      this.puzzles.getNearestInteraction(this.playerPos) ||
      this.biomes.getNearestInteraction(this.playerPos);
    if (!inter) {
      inter = this.family.getNearestInteraction(this.playerPos);
      if (inter && inter.type === 'cat' && this.monsters.fishTreats > 0) {
        inter.label = `[F] 撸${inter.cat.name} · 投喂小鱼干(余${this.monsters.fishTreats})`;
      }
    }
    if (!inter && this.grounded && this.sky.getUpdraftAt(this.playerPos)) {
      inter = {
        type: 'updraft_launch',
        label: '[Space / F] 乘着黄金上升气流展翼飞往云端浮岛',
        dist: 0,
      };
    }
    this.activeInteraction = inter;
    if (this.interactPrompt) {
      if (inter) {
        this.interactPrompt.textContent = inter.label;
        this.interactPrompt.classList.remove('hidden');
      } else {
        this.interactPrompt.classList.add('hidden');
      }
    }
  }

  _executeActiveInteraction() {
    if (!this.activeInteraction) return;
    if (this.activeInteraction.type === 'updraft_launch') {
      this.launchIntoUpdraft();
      return;
    }
    if (
      this.activeInteraction.type === 'slalom_sign' ||
      this.activeInteraction.type === 'wishing_fountain'
    ) {
      const res = this.activities.triggerInteraction(this.activeInteraction);
      if (res && res.text) this.showStoryToast(res.speaker, res.text, 5600);
      return;
    }
    if (this.activeInteraction.type === 'sky_bell') {
      const res = this.sky.triggerInteraction(this.activeInteraction);
      if (res && res.text) this.showStoryToast(res.speaker, res.text, 5600);
      return;
    }
    if (
      this.activeInteraction.type === 'chime_clue' ||
      this.activeInteraction.type === 'chest_locked' ||
      this.activeInteraction.type === 'chest_open'
    ) {
      const res = this.puzzles.triggerInteraction(this.activeInteraction);
      if (res && res.text) this.showStoryToast(res.speaker, res.text, 5600);
      return;
    }
    if (this.activeInteraction.type === 'maze_treat') {
      const res = this.biomes.triggerInteraction(this.activeInteraction, this.sound, this.monsters);
      if (res && res.text) this.showStoryToast(res.speaker, res.text);
      return;
    }
    const feedingTreat =
      this.activeInteraction.type === 'cat' && this.monsters.fishTreats > 0;
    const isHusband = this.activeInteraction.type === 'husband';
    const res = this.family.triggerInteraction(this.activeInteraction, this.sound);
    if (feedingTreat && res) {
      this.monsters.fishTreats--;
      const cat = this.activeInteraction.cat;
      this.family.spawnFloatingHeart(
        new THREE.Vector3(cat.pos.x, cat.pos.y + 0.55, cat.pos.z),
        '#ffe066',
        5
      );
      res.text = `「投喂香香小鱼干成功！」${res.text}`;
    }
    if (isHusband && this.puzzles.collectedStars >= this.puzzles.totalStars && !this.celebration.active) {
      this.triggerGrandCelebration();
      return;
    }
    if (res && res.text) {
      this.showStoryToast(res.speaker, res.text);
    }
  }

  _processCombatEvents() {
    const events = this.dengdeng.consumeEvents();
    if (events.length === 0) return;

    const surface = this._detectSurface();
    const fwdX = Math.sin(this.charYaw);
    const fwdZ = Math.cos(this.charYaw);

    for (const ev of events) {
      if (ev.type === 'glider_open') {
        this.sound.paragliderOpen();
        this._fxPos.set(this.playerPos.x, this.playerPos.y + 1.75, this.playerPos.z);
        this.combatEffects.spawnSparks(this._fxPos, '#ffe885', 14);
      } else if (ev.type === 'surf_start') {
        this.sound.shieldRaise();
        this._fxPos.set(this.playerPos.x, this.playerPos.y + 0.15, this.playerPos.z);
        this.combatEffects.spawnSparks(this._fxPos, '#7ef7ff', 14);
      } else if (ev.type === 'sword_draw') {
        this.sound.swordDraw();
      } else if (ev.type === 'sheathe') {
        this.sound.swordSheathe();
      } else if (ev.type === 'shield_raise') {
        this.sound.shieldRaise();
      } else if (ev.type === 'sword_swing') {
        this.sound.swordSwing(ev.combo, surface === 'grass' && this.grounded);
        this.combatEffects.resetTrailContinuity();
        this.family.onPlayerSlash();
      } else if (ev.type === 'slash_wave') {
        const sx = this.playerPos.x + fwdX * 1.05;
        const sz = this.playerPos.z + fwdZ * 1.05;
        this.world.triggerGrassWave(sx, sz, ev.radius, ev.strength);
        this._fxPos.set(sx, this.playerPos.y + 0.08, sz);

        if (surface === 'grass' && this.grounded) {
          this.combatEffects.spawnGrassClippings(this._fxPos, ev.finisher ? 20 : 10);
        } else if (surface === 'stone') {
          this.combatEffects.spawnSparks(this._fxPos, '#ffe484', ev.finisher ? 12 : 6);
        }

        if (this.family.cookingBuffTimer > 0) {
          this.combatEffects.spawnSparks(this._fxPos, '#ff9ebb', 6);
        }

        if (ev.finisher) {
          this.combatEffects.spawnShockwave(this._fxPos, {
            color: '#88f2ff',
            startScale: 0.45,
            endScale: 2.35,
            duration: 0.34,
          });
          this.camImpulse.set(fwdX * 0.032, -0.022, fwdZ * 0.032);
        }
      } else if (ev.type === 'charge_ready') {
        this.sound.spinChargeReady();
        if (this.dengdeng.getBladeWorldSegment(this._bladeBase, this._bladeTip)) {
          this.combatEffects.spawnSparks(this._bladeTip, '#ffe97d', 16);
        }
      } else if (ev.type === 'spin_release') {
        this.sound.spinAttackRelease();
        this.combatEffects.resetTrailContinuity();
        this.family.onPlayerSlash();
      } else if (ev.type === 'spin_wave') {
        this.world.triggerGrassWave(this.playerPos.x, this.playerPos.z, ev.radius, ev.strength);
        this._fxPos.set(this.playerPos.x, this.playerPos.y + 0.12, this.playerPos.z);
        this.combatEffects.spawnShockwave(this._fxPos, {
          color: '#ffe680',
          startScale: 0.72,
          endScale: 3.85,
          duration: 0.44,
        });
        if (surface === 'grass') {
          this.combatEffects.spawnGrassClippings(this.playerPos, 28);
        } else {
          this.combatEffects.spawnSparks(this._fxPos, '#ffe680', 20);
        }
        this.camImpulse.set(0, 0.038, 0);
      } else if (ev.type === 'jump_slam') {
        this.sound.jumpSlashSlam();
        const sx = this.playerPos.x + fwdX * 0.85;
        const sz = this.playerPos.z + fwdZ * 0.85;
        this.world.triggerGrassWave(sx, sz, 3.5, 1.25);
        this._fxPos.set(sx, this.playerPos.y + 0.08, sz);
        this.combatEffects.spawnShockwave(this._fxPos, {
          color: '#ffdf78',
          startScale: 0.45,
          endScale: 3.25,
          duration: 0.40,
        });
        if (surface === 'grass') {
          this.combatEffects.spawnGrassClippings(this._fxPos, 22);
        } else {
          this.combatEffects.spawnSparks(this._fxPos, '#ffe680', 18);
        }
        this.camImpulse.set(0, -0.055, 0);
      } else if (ev.type === 'parry_impact') {
        this.sound.shieldParry();
        const parried = this.monsters.handlePlayerParry(this.playerPos, this.charYaw);
        if (!this.dengdeng.getShieldWorldCenter(this._fxPos)) {
          this._fxPos.set(
            this.playerPos.x + fwdX * 0.45,
            this.playerPos.y + 1.18,
            this.playerPos.z + fwdZ * 0.45
          );
        }
        this._fxNormal.set(fwdX, 0.08, fwdZ).normalize();
        this.combatEffects.spawnShockwave(this._fxPos, {
          color: parried ? '#ffe86b' : '#8af6ff',
          startScale: 0.16,
          endScale: parried ? 1.95 : 1.38,
          duration: 0.32,
          normal: this._fxNormal,
        });
        this.combatEffects.spawnSparks(this._fxPos, '#fff099', parried ? 24 : 16);
        this.world.triggerGrassWave(this._fxPos.x, this._fxPos.z, 2.7, 0.92);
        this.camImpulse.set(-fwdX * 0.035, 0.02, -fwdZ * 0.035);
      }
    }
  }

  _updateCamera(dt) {
    const smooth = Math.min(1, dt * 10.0);
    this.camYaw = this._lerpAngle(this.camYaw, this.camTargetYaw, smooth);
    this.camPitch = THREE.MathUtils.lerp(this.camPitch, this.camTargetPitch, smooth);
    this.camDist = THREE.MathUtils.lerp(this.camDist, this.camTargetDist, smooth);

    this.camImpulse.lerp(new THREE.Vector3(0, 0, 0), Math.min(1, dt * 14.0));

    // Raise focus smoothly from upper-torso (1.24m) at vista distance to face/eyes (1.41m) in close-up portrait!
    const closeT = 1.0 - THREE.MathUtils.smoothstep(this.camDist, 1.05, 2.6);
    const focusHeight = THREE.MathUtils.lerp(1.24, 1.41, closeT);

    const desiredFocus = new THREE.Vector3(
      this.playerPos.x + this.camImpulse.x,
      this.playerPos.y + focusHeight + this.camImpulse.y,
      this.playerPos.z + this.camImpulse.z
    );
    this.camFocus.lerp(desiredFocus, Math.min(1, dt * 16.0));

    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    const cx = this.camFocus.x + Math.sin(this.camYaw) * cosP * this.camDist;
    let cy = this.camFocus.y + sinP * this.camDist;
    const cz = this.camFocus.z + Math.cos(this.camYaw) * cosP * this.camDist;

    // Prevent camera from dipping underneath terrain, water, or Sky Island deck
    const surfaceFloor =
      this.playerPos.y > 24
        ? this.world.getWalkHeight(cx, cz, this.playerPos.y)
        : Math.max(this.world.getTerrainHeight(cx, cz), this.world.waterLevel);
    const minGroundY = surfaceFloor + 0.36;
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

  teleport(x, z, charYaw = this.charYaw, yHint = undefined) {
    if (this.gliding) this.setGliding(false);
    if (this.shieldSurfing) this.setShieldSurfing(false);
    this.playerPos.set(x, this.world.getWalkHeight(x, z, yHint), z);
    this.velXZ.set(0, 0);
    this.velY = 0;
    this.grounded = true;
    this.charYaw = charYaw;
    this.dengdeng.root.position.copy(this.playerPos);
    this.dengdeng.root.rotation.y = this.charYaw;
    this.dengdeng.resetSpringBones();
    this.family.teleportCompanionsNear(this.playerPos, this.charYaw);
    this._updateCamera(1.0);
    this.minimap.update();
  }

  stepSimulation(dt = 1 / 30) {
    const locomotion = this._updateLocomotion(dt);
    this._updateCamera(dt);
    this.world.update(dt, this.playerPos);
    this.biomes.update(dt);
    this.sky.update(dt);
    this.activities.update(dt, this.playerPos);
    this.family.update(dt, this.playerPos, this.charYaw);
    this.dengdeng.update(dt, locomotion, this.camera.position);
    this._processCombatEvents();
    this.monsters.update(dt, this.playerPos, this.charYaw, this.dengdeng, this.family, this.velXZ);
    this.puzzles.update(dt, this.playerPos, this.charYaw, this.dengdeng, this.monsters.defeatedCount);
    this.celebration.update(dt, this.playerPos, this.camYaw);
    this.journal.update();
    this.minimap.update();
    this._updateInteractionPrompt();

    const mods = this.dengdeng.getCombatLocomotionModifiers();
    const trailGold = this.family.cookingBuffTimer > 0 ? Math.max(0.55, mods.trailGolden) : mods.trailGolden;
    if (this.dengdeng.getBladeWorldSegment(this._bladeBase, this._bladeTip)) {
      this.combatEffects.pushBladeSample(
        this._bladeBase,
        this._bladeTip,
        mods.trailActive,
        trailGold
      );
    } else {
      this.combatEffects.resetTrailContinuity();
    }
    this.combatEffects.update(dt);

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
