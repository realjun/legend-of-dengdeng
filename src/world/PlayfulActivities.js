import * as THREE from 'three';

const SLALOM_GATES = [
  { x: 20.8, z: 19.5, yaw: -0.56, freq: 523.25 },
  { x: 17.2, z: 13.6, yaw: -0.56, freq: 587.33 },
  { x: 13.6, z: 7.8, yaw: -0.54, freq: 659.25 },
  { x: 10.4, z: 2.2, yaw: -0.52, freq: 783.99 },
  { x: 7.6, z: -2.2, yaw: -0.50, freq: 1046.5 },
];

const LOTUS_PADS = [
  { x: -5.6, z: -1.6, r: 1.50, hasFlower: true },
  { x: -8.6, z: -2.5, r: 1.45, hasFlower: false },
  { x: -11.6, z: -3.3, r: 1.55, hasFlower: true },
  { x: -14.5, z: -4.0, r: 1.48, hasFlower: false },
];

const FOUNTAIN_WISHES = [
  '「第一朵星瓣落入泉心：愿登登每天醒来都有好心情，烦恼像水波一样轻轻散开。」',
  '「第二朵星瓣落入泉心：愿小蓝与大福健健康康，每天陪登登晒太阳、打呼噜。」',
  '「第三朵星瓣落入泉心：愿老公做的每一顿饭都合登登胃口，一年四季三餐温暖。」',
  '「第四朵星瓣落入泉心：愿我们手牵手走过现实与童话里的每一座山川湖海！」',
];

export class PlayfulActivities {
  constructor(scene, world, family, monsters, combatEffects, sound) {
    this.scene = scene;
    this.world = world;
    this.family = family;
    this.monsters = monsters;
    this.fx = combatEffects;
    this.sound = sound;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 1. Starlight Shield-Surfing Slalom State
    this.gates = [];
    this.slalomActive = false;
    this.slalomStep = 0;
    this.slalomTimer = 0;
    this.completedRuns = 0;
    this.onSlalomComplete = null;
    this.signPos = new THREE.Vector3(22.2, this.world.getTerrainHeight(22.2, 20.6), 20.6);

    // 2. Mirror Lake Lotus Pads & Wishing Fountain Islet
    this.isletCenter = new THREE.Vector3(-18.2, this.world.waterLevel + 0.28, -4.6);
    this.wishIndex = 0;
    this.fountainDrops = [];

    this._buildSlalomCourse();
    this._buildLotusSteppingStonesAndFountain();
  }

  _buildSlalomCourse() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c5436, roughness: 0.85 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf6d36b,
      metalness: 0.58,
      roughness: 0.28,
    });

    // Cute Wooden Signpost + Mini Surf-Shield Emblem at Top of Slope
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 1.35, 8), woodMat);
    post.position.set(this.signPos.x, this.signPos.y + 0.67, this.signPos.z);
    post.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.44, 0.08), woodMat);
    board.position.set(this.signPos.x, this.signPos.y + 1.18, this.signPos.z);
    board.rotation.y = -0.55;
    const starCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), goldMat);
    starCrest.position.set(this.signPos.x, this.signPos.y + 1.54, this.signPos.z);
    this.signStar = starCrest;
    this.group.add(post, board, starCrest);

    // 5 Glowing Starlight Ring Gates along the grassy slope
    SLALOM_GATES.forEach((spec, idx) => {
      const gy = this.world.getTerrainHeight(spec.x, spec.z);
      const gateRoot = new THREE.Group();
      gateRoot.position.set(spec.x, gy + 1.15, spec.z);
      gateRoot.rotation.y = spec.yaw;

      const ringMat = new THREE.MeshStandardMaterial({
        color: idx === 0 ? 0xffe478 : 0x72ecff,
        emissive: new THREE.Color(idx === 0 ? 0xffb838 : 0x38b8ff),
        emissiveIntensity: idx === 0 ? 0.85 : 0.35,
        roughness: 0.25,
      });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.065, 10, 28), ringMat);
      gateRoot.add(torus);

      const topGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({ color: 0xfff099 })
      );
      topGem.position.y = 1.42;
      gateRoot.add(topGem);

      this.group.add(gateRoot);
      this.gates.push({
        idx,
        spec,
        pos: new THREE.Vector3(spec.x, gy, spec.z),
        gateRoot,
        ringMat,
        topGem,
        cleared: false,
      });
    });
  }

  startSlalomRun() {
    this.slalomActive = true;
    this.slalomStep = 0;
    this.slalomTimer = 28.0;
    for (let i = 0; i < this.gates.length; i++) {
      this.gates[i].cleared = false;
    }
  }

  _buildLotusSteppingStonesAndFountain() {
    const wy = this.world.waterLevel;
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3da868, roughness: 0.72 });
    const leafRimMat = new THREE.MeshStandardMaterial({ color: 0x58c47e, roughness: 0.68 });
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffa8cc,
      emissive: new THREE.Color(0xff72aa),
      emissiveIntensity: 0.36,
      roughness: 0.45,
    });
    const stamenMat = new THREE.MeshBasicMaterial({ color: 0xffe875 });

    // 4 Giant Walkable Water-Lily Stepping Pads across Mirror Lake!
    for (const pad of LOTUS_PADS) {
      const padGroup = new THREE.Group();
      padGroup.position.set(pad.x, wy + 0.06, pad.z);

      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.r, pad.r * 0.94, 0.10, 20, 1, false, 0.18, Math.PI * 1.88),
        leafMat
      );
      disc.receiveShadow = true;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(pad.r * 0.96, 0.045, 6, 22, Math.PI * 1.86),
        leafRimMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = 0.18;
      rim.position.y = 0.04;
      padGroup.add(disc, rim);

      if (pad.hasFlower) {
        const flower = new THREE.Group();
        flower.position.set(pad.r * 0.52, 0.08, -pad.r * 0.35);
        for (let p = 0; p < 8; p++) {
          const a = (p / 8) * Math.PI * 2;
          const pet = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 5), petalMat);
          pet.position.set(Math.cos(a) * 0.14, 0.10, Math.sin(a) * 0.14);
          pet.rotation.z = -Math.cos(a) * 0.55;
          pet.rotation.x = Math.sin(a) * 0.55;
          flower.add(pet);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), stamenMat);
        core.position.y = 0.08;
        flower.add(core);
        padGroup.add(flower);
      }

      this.group.add(padGroup);

      // Register walkable lily pad surface!
      this.world.walkSurfaces.push({
        x: pad.x,
        z: pad.z,
        rx: pad.r * 0.92,
        rz: pad.r * 0.92,
        heightAt: (x, z) =>
          Math.hypot(x - pad.x, z - pad.z) <= pad.r * 1.02 ? wy + 0.11 : -Infinity,
      });
    }

    // Romantic White-Marble Wishing Fountain Islet at (-18.2, -4.6)
    const ix = this.isletCenter.x;
    const iz = this.isletCenter.z;
    const iy = this.isletCenter.y;

    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.52 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf2cd68,
      metalness: 0.58,
      roughness: 0.28,
    });
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x6ef4ff,
      transparent: true,
      opacity: 0.85,
    });

    const isletRoot = new THREE.Group();
    isletRoot.position.set(ix, wy, iz);

    const baseDeck = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.55, 0.56, 24), marbleMat);
    baseDeck.receiveShadow = true;
    const goldTrim = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.06, 8, 28), goldMat);
    goldTrim.rotation.x = Math.PI / 2;
    goldTrim.position.y = 0.28;

    // Central Sculpted Wishing Fountain Basin
    const basinWall = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.88, 0.54, 18), marbleMat);
    basinWall.position.y = 0.54;
    basinWall.castShadow = true;
    const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(0.96, 18), poolMat);
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.position.y = 0.82;

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.95, 12), marbleMat);
    spire.position.y = 0.95;
    const heartGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshStandardMaterial({
        color: 0xff9ec7,
        emissive: new THREE.Color(0xff6ea8),
        emissiveIntensity: 0.85,
        roughness: 0.2,
      })
    );
    heartGem.position.y = 1.62;
    this.fountainGem = heartGem;

    // Shimmering Water-Light Droplets arcing out of the Wishing Fountain
    const dropGeo = new THREE.SphereGeometry(0.045, 6, 6);
    for (let i = 0; i < 12; i++) {
      const dm = new THREE.Mesh(dropGeo, poolMat);
      isletRoot.add(dm);
      this.fountainDrops.push({
        mesh: dm,
        angle: (i / 12) * Math.PI * 2,
        phase: i / 12,
      });
    }

    isletRoot.add(baseDeck, goldTrim, basinWall, waterDisc, spire, heartGem);
    this.group.add(isletRoot);

    this.world.walkSurfaces.push({
      x: ix,
      z: iz,
      rx: 3.2,
      rz: 3.2,
      heightAt: (x, z) => (Math.hypot(x - ix, z - iz) <= 3.28 ? iy : -Infinity),
    });
    this.world.colliders.push({ x: ix, z: iz, r: 1.08 });
  }

  getNearestInteraction(playerPos) {
    const dSign = playerPos.distanceTo(this.signPos);
    if (dSign < 2.5) {
      return {
        type: 'slalom_sign',
        label: '[F] 开启星环滑草小挑战（按 C 踩盾冲过 5 道星环赢小鱼干！）',
        dist: dSign,
      };
    }

    const dFountain = Math.hypot(
      playerPos.x - this.isletCenter.x,
      playerPos.z - this.isletCenter.z
    );
    if (dFountain < 2.65 && Math.abs(playerPos.y - this.isletCenter.y) < 1.5) {
      return {
        type: 'wishing_fountain',
        label: '[F] 在镜湖同心许愿泉投下星瓣许愿',
        dist: dFountain,
      };
    }
    return null;
  }

  triggerInteraction(inter) {
    if (!inter) return null;
    if (inter.type === 'slalom_sign') {
      this.startSlalomRun();
      this.sound?.pickup();
      return {
        speaker: '星环滑草起点',
        text: '挑战开始！按下 [C] 键跃上海利亚盾滑草冲浪，顺着山坡依次穿过前方 5 道金色星环吧！',
      };
    }

    if (inter.type === 'wishing_fountain') {
      const wish = FOUNTAIN_WISHES[this.wishIndex % FOUNTAIN_WISHES.length];
      this.wishIndex++;
      [587.33, 739.99, 880.0, 1174.66, 1479.98].forEach((f, i) => {
        this.sound?.playTone(f, 0.85, 'sine', 0.16, i * 0.11);
      });
      this.fx?.spawnShockwave(
        new THREE.Vector3(this.isletCenter.x, this.world.waterLevel + 0.08, this.isletCenter.z),
        {
          color: '#7ef7ff',
          startScale: 0.8,
          endScale: 5.2,
          duration: 0.75,
        }
      );
      this.family?.spawnFloatingHeart(
        new THREE.Vector3(this.isletCenter.x, this.isletCenter.y + 1.85, this.isletCenter.z),
        '#ff9ec7',
        5
      );
      return {
        speaker: '镜湖同心许愿泉',
        text: wish,
      };
    }
    return null;
  }

  update(dt, playerPos) {
    const t = performance.now() * 0.001;

    if (this.signStar) {
      this.signStar.rotation.y += dt * 1.6;
    }

    if (this.fountainGem) {
      this.fountainGem.rotation.y += dt * 1.4;
      this.fountainGem.position.y = 1.62 + Math.sin(t * 2.6) * 0.06;
    }

    // Animate Wishing Fountain arcing water droplets
    for (const d of this.fountainDrops) {
      d.phase = (d.phase + dt * 0.85) % 1.0;
      const p = d.phase;
      const r = 0.15 + p * 0.72;
      const y = 1.38 + Math.sin(p * Math.PI) * 0.36 - p * 0.52;
      d.mesh.position.set(Math.cos(d.angle) * r, y, Math.sin(d.angle) * r);
    }

    // Auto-start Slalom if player passes straight through Gate #0!
    const g0 = this.gates[0];
    if (!this.slalomActive && Math.hypot(playerPos.x - g0.pos.x, playerPos.z - g0.pos.z) < 1.85) {
      this.startSlalomRun();
    }

    if (this.slalomActive) {
      this.slalomTimer -= dt;
      if (this.slalomTimer <= 0) {
        this.slalomActive = false;
      } else {
        const targetGate = this.gates[this.slalomStep];
        if (
          targetGate &&
          Math.hypot(playerPos.x - targetGate.pos.x, playerPos.z - targetGate.pos.z) < 2.05
        ) {
          targetGate.cleared = true;
          this.sound?.crystalChime(targetGate.spec.freq);
          this.fx?.spawnSparks(
            new THREE.Vector3(targetGate.pos.x, targetGate.pos.y + 1.2, targetGate.pos.z),
            '#ffe878',
            16
          );
          this.slalomStep++;

          if (this.slalomStep >= this.gates.length) {
            this.slalomActive = false;
            this.completedRuns++;
            this.monsters.fishTreats += 3;
            this.sound?.shrineSolved();
            this.family?.spawnFloatingHeart(
              new THREE.Vector3(playerPos.x, playerPos.y + 1.7, playerPos.z),
              '#ffd166',
              6
            );
            if (this.onSlalomComplete) {
              this.onSlalomComplete(this.completedRuns);
            }
          }
        }
      }
    }

    // Update Gate visual highlights
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      g.topGem.rotation.y += dt * 2.2;
      const isNext = this.slalomActive && this.slalomStep === i;
      if (g.cleared) {
        g.ringMat.color.setHex(0x6bf59e);
        g.ringMat.emissive.setHex(0x36d878);
        g.ringMat.emissiveIntensity = 0.95;
      } else if (isNext || (!this.slalomActive && i === 0)) {
        g.ringMat.color.setHex(0xffe478);
        g.ringMat.emissive.setHex(0xffb838);
        g.ringMat.emissiveIntensity = 0.9 + Math.sin(t * 6.0) * 0.25;
      } else {
        g.ringMat.color.setHex(0x72ecff);
        g.ringMat.emissive.setHex(0x38b8ff);
        g.ringMat.emissiveIntensity = 0.30;
      }
    }
  }
}
