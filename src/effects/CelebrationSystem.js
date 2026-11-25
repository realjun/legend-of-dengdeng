import * as THREE from 'three';

function createSoftSparkTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.35, 'rgba(255,248,225,0.85)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const FIREWORK_PALETTE = [0xff8ec6, 0xffe57a, 0x64f5d2, 0xb98eff, 0xffa86b];

export class CelebrationSystem {
  constructor(scene, world, family, sound) {
    this.scene = scene;
    this.world = world;
    this.family = family;
    this.sound = sound;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.active = false;
    this.elapsed = 0;
    this.fireworkTimer = 0.35;

    this.sparkTex = createSoftSparkTexture();
    this.lanterns = [];
    this.fireworks = [];

    this._buildSkyLanternPool();
  }

  _buildSkyLanternPool() {
    const shadeGeo = new THREE.CylinderGeometry(0.24, 0.17, 0.48, 8, 1, true);
    const topCapGeo = new THREE.ConeGeometry(0.24, 0.12, 8);
    const coreGeo = new THREE.SphereGeometry(0.085, 8, 8);

    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xffb85c,
      emissive: new THREE.Color(0xff9238),
      emissiveIntensity: 1.35,
      roughness: 0.65,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff6c4 });

    // 64 Floating Sky Lanterns ("孔明灯")
    for (let i = 0; i < 64; i++) {
      const lg = new THREE.Group();
      const shade = new THREE.Mesh(shadeGeo, shadeMat);
      const cap = new THREE.Mesh(topCapGeo, shadeMat);
      cap.position.y = 0.30;
      const flame = new THREE.Mesh(coreGeo, coreMat);
      flame.position.y = -0.10;
      lg.add(shade, cap, flame);
      this.group.add(lg);

      this.lanterns.push({
        group: lg,
        baseX: 0,
        baseZ: 0,
        y: 0,
        maxY: 48 + Math.random() * 16,
        vy: 1.25 + Math.random() * 0.95,
        swayAmp: 0.55 + Math.random() * 0.85,
        swayFreq: 0.65 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        scale: 0.78 + Math.random() * 0.55,
      });
    }

    // Warm golden ambient glow near the celebration center
    this.warmLight = new THREE.PointLight(0xffb866, 2.2, 26);
    this.group.add(this.warmLight);
  }

  _seedLantern(l, centerPos, initialSpread = true) {
    // Cluster half the lanterns near Dengdeng & Cottage, half drifting across Mirror Lake vista!
    const nearPlayer = Math.random() < 0.55;
    const angle = Math.random() * Math.PI * 2;
    if (nearPlayer) {
      const r = 3.2 + Math.random() * 24.0;
      l.baseX = centerPos.x + Math.cos(angle) * r;
      l.baseZ = centerPos.z + Math.sin(angle) * r;
    } else {
      l.baseX = (Math.random() - 0.5) * 68;
      l.baseZ = -4 + (Math.random() - 0.5) * 44;
    }
    const floorY = Math.max(this.world.getTerrainHeight(l.baseX, l.baseZ), this.world.waterLevel);
    l.y = floorY + (initialSpread ? 1.2 + Math.random() * 34.0 : 0.8 + Math.random() * 2.5);
    l.maxY = Math.max(centerPos.y + 26, 48 + Math.random() * 18);
    l.group.scale.setScalar(l.scale);
  }

  startCelebration(playerPos, setMoodCallback, camYaw = 0) {
    this.active = true;
    this.elapsed = 0;
    this.group.visible = true;

    // Shift world into starry night twilight so Sky Lanterns & Fireworks glow vividly!
    if (setMoodCallback) {
      setMoodCallback('night');
    }

    for (const l of this.lanterns) {
      this._seedLantern(l, playerPos, true);
    }
    this.warmLight.position.set(playerPos.x, playerPos.y + 4.5, playerPos.z);

    // Burst joyful hearts around Russian Blue, Maine Coon & Husband!
    if (this.family) {
      this.family.spawnFloatingHeart(
        new THREE.Vector3(playerPos.x, playerPos.y + 1.8, playerPos.z),
        '#ff9ec7',
        6
      );
      if (this.family.russianBlue) {
        const rb = this.family.russianBlue.pos;
        this.family.spawnFloatingHeart(new THREE.Vector3(rb.x, rb.y + 0.5, rb.z), '#6ef7b2', 4);
      }
      if (this.family.maineCoon) {
        const mc = this.family.maineCoon.pos;
        this.family.spawnFloatingHeart(new THREE.Vector3(mc.x, mc.y + 0.6, mc.z), '#ffd166', 4);
      }
    }

    this.sound?.playLoveSerenade();

    // Launch two immediate celebratory bursts right in the sky ahead of camera!
    const lookFwdX = -Math.sin(camYaw);
    const lookFwdZ = -Math.cos(camYaw);
    const sideX = Math.cos(camYaw);
    const sideZ = -Math.sin(camYaw);
    this._spawnFireworkBurst(
      new THREE.Vector3(
        playerPos.x + lookFwdX * 26 - sideX * 7,
        playerPos.y + 10.5,
        playerPos.z + lookFwdZ * 26 - sideZ * 7
      ),
      0xff8ec6
    );
    this._spawnFireworkBurst(
      new THREE.Vector3(
        playerPos.x + lookFwdX * 30 + sideX * 8,
        playerPos.y + 12.5,
        playerPos.z + lookFwdZ * 30 + sideZ * 8
      ),
      0xffe57a
    );
  }

  stopCelebration() {
    this.active = false;
    this.group.visible = false;
    for (const fw of this.fireworks) {
      this.group.remove(fw.points);
      fw.points.geometry.dispose();
      fw.points.material.dispose();
    }
    this.fireworks.length = 0;
  }

  _spawnFireworkBurst(origin, colorHex) {
    const count = 68;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      // Uniform spherical starburst shell
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const speed = 6.5 + Math.random() * 6.5;
      velocities.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 1.4,
          Math.sin(phi) * Math.sin(theta) * speed
        )
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex,
      map: this.sparkTex,
      size: 0.72,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.sound?.fireworkPop();

    this.fireworks.push({
      points,
      velocities,
      age: 0,
      maxAge: 1.85,
    });
  }

  update(dt, playerPos, camYaw = 0) {
    if (!this.active) return;
    this.elapsed += dt;
    const t = performance.now() * 0.001;

    this.warmLight.position.set(playerPos.x, playerPos.y + 4.2, playerPos.z);
    this.warmLight.intensity = 2.0 + Math.sin(t * 5.0) * 0.35;

    // 1. Drift 64 Glowing Sky Lanterns upward into the starry sky
    for (const l of this.lanterns) {
      l.y += l.vy * dt;
      if (l.y > l.maxY) {
        this._seedLantern(l, playerPos, false);
      }
      const sx = l.baseX + Math.sin(t * l.swayFreq + l.phase) * l.swayAmp;
      const sz = l.baseZ + Math.cos(t * l.swayFreq * 0.85 + l.phase) * l.swayAmp;
      l.group.position.set(sx, l.y, sz);
      l.group.rotation.y += dt * 0.35;
      l.group.rotation.z = Math.sin(t * 1.4 + l.phase) * 0.07;
    }

    // 2. Periodically launch new Starburst Fireworks ahead of the camera look direction!
    this.fireworkTimer -= dt;
    if (this.fireworkTimer <= 0) {
      this.fireworkTimer = 1.25 + Math.random() * 0.9;
      const lookFwdX = -Math.sin(camYaw);
      const lookFwdZ = -Math.cos(camYaw);
      const sideX = Math.cos(camYaw);
      const sideZ = -Math.sin(camYaw);
      const spread = (Math.random() - 0.5) * 28;
      const dist = 24 + Math.random() * 18;
      const fx = playerPos.x + lookFwdX * dist + sideX * spread;
      const fz = playerPos.z + lookFwdZ * dist + sideZ * spread;
      const fy = Math.max(22, playerPos.y + 15 + Math.random() * 14);
      const col = FIREWORK_PALETTE[Math.floor(Math.random() * FIREWORK_PALETTE.length)];
      this._spawnFireworkBurst(new THREE.Vector3(fx, fy, fz), col);
    }

    // 3. Advance active Firework Starburst Shells
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const fw = this.fireworks[i];
      fw.age += dt;
      if (fw.age >= fw.maxAge) {
        this.group.remove(fw.points);
        fw.points.geometry.dispose();
        fw.points.material.dispose();
        this.fireworks.splice(i, 1);
        continue;
      }
      const attr = fw.points.geometry.attributes.position;
      const drag = Math.pow(0.28, dt);
      for (let j = 0; j < fw.velocities.length; j++) {
        const v = fw.velocities[j];
        v.multiplyScalar(drag);
        v.y -= 2.8 * dt;
        attr.setXYZ(
          j,
          attr.getX(j) + v.x * dt,
          attr.getY(j) + v.y * dt,
          attr.getZ(j) + v.z * dt
        );
      }
      attr.needsUpdate = true;
      const u = fw.age / fw.maxAge;
      fw.points.material.opacity = Math.max(0, 1 - u * u);
    }
  }
}
