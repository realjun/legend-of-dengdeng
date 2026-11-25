import * as THREE from 'three';

function createSoftGlowMap() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class SkyIslandSystem {
  constructor(scene, world, puzzles, family, combatEffects, sound) {
    this.scene = scene;
    this.world = world;
    this.puzzles = puzzles;
    this.family = family;
    this.fx = combatEffects;
    this.sound = sound;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.islandPos = new THREE.Vector3(0.0, 32.0, -16.0);
    this.bellPos = new THREE.Vector3(0.0, 32.16, -19.2);
    this.bellPivot = null;
    this.bellSwing = 0;
    this.bellRung = false;

    this.orbitRocks = [];
    this.updrafts = [];
    this.glowMap = createSoftGlowMap();

    this._buildFloatingSakuraIsland();
    this._buildUpdraftStreams();
  }

  _buildFloatingSakuraIsland() {
    const ix = this.islandPos.x;
    const iy = this.islandPos.y;
    const iz = this.islandPos.z;

    const root = new THREE.Group();
    root.position.set(ix, iy, iz);
    this.group.add(root);

    // Register elevated walkable sky-deck (only active when player/cats are above minY = 28.5m!)
    this.world.walkSurfaces.push({
      x: ix,
      z: iz,
      rx: 10.1,
      rz: 10.1,
      minY: 28.5,
      heightAt: (x, z) => {
        const r = Math.hypot(x - ix, z - iz);
        if (r > 10.15) return -Infinity;
        return r < 3.9 ? iy + 0.16 : iy;
      },
    });

    // 1. Lush Sky-Meadow Top + White-Gold Marble Star Compass Plaza
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x6ec965, roughness: 0.85 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xebe6d8, roughness: 0.62 });
    const cliffMat = new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.92, flatShading: true });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf4cf6a,
      metalness: 0.58,
      roughness: 0.28,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x6ef4ff,
      emissive: new THREE.Color(0x3ad8ff),
      emissiveIntensity: 0.72,
      roughness: 0.2,
    });

    const topMeadow = new THREE.Mesh(new THREE.CylinderGeometry(10.1, 9.7, 0.75, 24), grassMat);
    topMeadow.position.y = -0.375;
    topMeadow.receiveShadow = true;
    topMeadow.castShadow = true;

    const stoneRim = new THREE.Mesh(new THREE.TorusGeometry(9.95, 0.22, 8, 28), stoneMat);
    stoneRim.rotation.x = Math.PI / 2;
    stoneRim.position.y = -0.02;

    const centralPlaza = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.15, 0.16, 24), stoneMat);
    centralPlaza.position.y = 0.08;
    centralPlaza.receiveShadow = true;

    const compassRing = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.05, 32), goldMat);
    compassRing.rotation.x = -Math.PI / 2;
    compassRing.position.y = 0.17;

    root.add(topMeadow, stoneRim, centralPlaza, compassRing);

    // 2. Sculpted Inverted Floating Cliff Underside + Glowing Sky-Crystal Core
    const cliffUpper = new THREE.Mesh(new THREE.CylinderGeometry(9.3, 5.4, 3.6, 12), cliffMat);
    cliffUpper.position.y = -2.5;
    cliffUpper.castShadow = true;

    const cliffLower = new THREE.Mesh(new THREE.ConeGeometry(5.3, 5.8, 10), cliffMat);
    cliffLower.rotation.x = Math.PI;
    cliffLower.position.y = -7.1;

    const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), crystalMat);
    coreCrystal.scale.set(0.85, 1.9, 0.85);
    coreCrystal.position.y = -9.4;
    this.coreCrystal = coreCrystal;

    root.add(cliffUpper, cliffLower, coreCrystal);

    // 5 Orbiting Satellite Sky-Stones with glowing crystal shards
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const sat = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 + (i % 2) * 0.3, 0), cliffMat);
      rock.scale.set(1.1, 0.75, 1.0);
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), crystalMat);
      shard.position.y = -0.65;
      sat.add(rock, shard);
      this.group.add(sat);
      this.orbitRocks.push({
        group: sat,
        baseAngle: ang,
        dist: 12.6 + (i % 2) * 1.6,
        yOffset: -1.2 + (i % 3) * 1.1,
        speed: 0.22 + i * 0.03,
      });
    }

    // 3. Twin Blooming Sky-Sakura Trees Framing Dueling Peaks!
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.88 });
    const sakuraPinkA = new THREE.MeshStandardMaterial({
      color: 0xffb5d0,
      emissive: new THREE.Color(0xff85b2),
      emissiveIntensity: 0.14,
      roughness: 0.75,
    });
    const sakuraPinkB = new THREE.MeshStandardMaterial({
      color: 0xffd4e5,
      emissive: new THREE.Color(0xff9ec4),
      emissiveIntensity: 0.12,
      roughness: 0.75,
    });

    for (const sx of [-1, 1]) {
      const tx = sx * 5.8;
      const tz = -1.6;
      const tree = new THREE.Group();
      tree.position.set(tx, 0, tz);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.5, 9), trunkMat);
      trunk.position.y = 1.25;
      trunk.rotation.z = -sx * 0.08;
      trunk.castShadow = true;
      tree.add(trunk);

      const puffs = [
        { ox: 0, oy: 2.9, oz: 0, r: 1.45, mat: sakuraPinkA },
        { ox: -0.9, oy: 2.55, oz: 0.4, r: 1.05, mat: sakuraPinkB },
        { ox: 0.95, oy: 2.6, oz: -0.3, r: 1.12, mat: sakuraPinkB },
        { ox: 0.2, oy: 3.45, oz: -0.2, r: 1.0, mat: sakuraPinkA },
      ];
      for (const pf of puffs) {
        const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(pf.r, 1), pf.mat);
        canopy.scale.set(1.12, 0.78, 1.08);
        canopy.position.set(pf.ox, pf.oy, pf.oz);
        canopy.castShadow = true;
        tree.add(canopy);
      }
      root.add(tree);
      this.world.colliders.push({ x: ix + tx, z: iz + tz, r: 0.45, minY: 28.5 });
    }

    // 4. Celestial Wishing Archway & Swinging Golden Wishing Bell (`云端同心钟`) at (0, 0.16, -3.2)
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 0.16, -3.2);
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.2, 12), stoneMat);
      col.position.set(sx * 1.45, 1.6, 0);
      col.castShadow = true;
      archGroup.add(col);
      this.world.colliders.push({ x: ix + sx * 1.45, z: iz - 3.2, r: 0.32, minY: 28.5 });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 0.44), stoneMat);
    lintel.position.set(0, 3.28, 0);
    const goldCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), goldMat);
    goldCrest.position.set(0, 3.68, 0);
    archGroup.add(lintel, goldCrest);

    this.bellPivot = new THREE.Group();
    this.bellPivot.position.set(0, 3.14, 0);
    const bellRope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), goldMat);
    bellRope.position.y = -0.21;
    const bellBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.36, 0.52, 16, 1, true),
      goldMat
    );
    bellBody.material.side = THREE.DoubleSide;
    bellBody.position.y = -0.62;
    const bellCrown = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), goldMat);
    bellCrown.position.y = -0.38;
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), crystalMat);
    clapper.position.y = -0.86;
    this.bellPivot.add(bellRope, bellBody, bellCrown, clapper);
    archGroup.add(this.bellPivot);
    root.add(archGroup);

    // 5. Sky Island Starlight Treasure Chest #5!
    this.puzzles.addStarChest({
      id: 'sky_chest',
      x: ix,
      y: iy + 0.16,
      z: iz + 0.4,
      rotY: 0,
      locked: true,
      lockHint: '敲响北侧的「云端同心钟」[F]，让清脆钟声回荡天际即可解封',
      title: '心愿星徽 ⑤ · 云端誓言之星',
      message:
        '「给登登的第五颗星：站在云端俯瞰整片山谷，星光木屋、Broccoli 与 Jelly 都在脚下温柔闪耀——愿你永远自在乘风，而我永远是托起你的那股暖流。」',
    });

    // 6. Floating Sakura Petals drifting gently around the Sky Island
    const petalCount = 70;
    const petalPos = new Float32Array(petalCount * 3);
    for (let i = 0; i < petalCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 9.5;
      petalPos[i * 3 + 0] = ix + Math.cos(a) * r;
      petalPos[i * 3 + 1] = iy + 0.4 + Math.random() * 5.2;
      petalPos[i * 3 + 2] = iz + Math.sin(a) * r;
    }
    const petalGeo = new THREE.BufferGeometry();
    petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
    const petalMat = new THREE.PointsMaterial({
      color: 0xffc4de,
      map: this.glowMap,
      size: 0.28,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.skyPetals = new THREE.Points(petalGeo, petalMat);
    this.group.add(this.skyPetals);
  }

  _buildUpdraftStreams() {
    const specs = [
      { name: '镜湖北岸·上升气流', x: 6.5, z: -12.5, topY: 39.0, radius: 2.85 },
      { name: '星光木屋·上升气流', x: 23.5, z: 17.5, topY: 38.0, radius: 2.85 },
      { name: '银杏圣坛·上升气流', x: 18.5, z: -28.0, topY: 38.0, radius: 2.85 },
    ];

    const ringGeo = new THREE.TorusGeometry(1.75, 0.038, 6, 28);
    ringGeo.rotateX(Math.PI / 2);

    for (const s of specs) {
      const baseY = this.world.getTerrainHeight(s.x, s.z);
      const streamGroup = new THREE.Group();
      streamGroup.position.set(s.x, baseY, s.z);

      // Glowing Wind-Rune Pad on the ground
      const padMat = new THREE.MeshBasicMaterial({
        color: 0x7ef7ff,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
      });
      const outerPad = new THREE.Mesh(new THREE.RingGeometry(1.65, 2.15, 32), padMat);
      outerPad.rotation.x = -Math.PI / 2;
      outerPad.position.y = 0.06;
      const innerPad = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.92, 6), padMat);
      innerPad.rotation.x = -Math.PI / 2;
      innerPad.position.y = 0.06;
      streamGroup.add(outerPad, innerPad);

      // Rising Golden-Cyan Wind Rings along the vertical column!
      const windRings = [];
      const ringCount = 9;
      for (let i = 0; i < ringCount; i++) {
        const rMat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xffe885 : 0x7ef7ff,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const rm = new THREE.Mesh(ringGeo, rMat);
        streamGroup.add(rm);
        windRings.push({ mesh: rm, mat: rMat, phase: i / ringCount });
      }

      this.group.add(streamGroup);
      this.updrafts.push({
        ...s,
        baseY,
        innerPad,
        windRings,
      });
    }
  }

  getUpdraftAt(pos) {
    for (const u of this.updrafts) {
      const d = Math.hypot(pos.x - u.x, pos.z - u.z);
      if (d <= u.radius && pos.y >= u.baseY - 0.5 && pos.y <= u.topY) {
        return u;
      }
    }
    return null;
  }

  getNearestInteraction(playerPos) {
    const dBell = playerPos.distanceTo(this.bellPos);
    if (dBell < 2.65) {
      return {
        type: 'sky_bell',
        label: this.bellRung
          ? '[F] 再次敲响云端同心钟 · 祈愿长长久久'
          : '[F] 敲响云端同心钟 · 解封云端星徽宝箱',
        dist: dBell,
      };
    }
    return null;
  }

  triggerInteraction(inter) {
    if (!inter || inter.type !== 'sky_bell') return null;
    this.bellSwing = 0.72;
    const firstTime = !this.bellRung;
    this.bellRung = true;

    // Play resonant golden sky-bell carillon!
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.sound?.playTone(f, 0.95, 'sine', 0.20, idx * 0.14);
      this.sound?.playTone(f * 2, 0.55, 'triangle', 0.08, idx * 0.14 + 0.02);
    });
    if (firstTime) {
      this.puzzles.unlockChest('sky_chest');
    }

    this.fx?.spawnShockwave(new THREE.Vector3(this.bellPos.x, this.bellPos.y + 1.8, this.bellPos.z), {
      color: '#ffe87c',
      startScale: 0.4,
      endScale: 4.5,
      duration: 0.65,
    });
    this.family?.spawnFloatingHeart(
      new THREE.Vector3(this.bellPos.x, this.bellPos.y + 2.2, this.bellPos.z),
      '#ff9ec7',
      5
    );

    return {
      speaker: '云端同心钟',
      text: firstTime
        ? '「当——♪」清越的钟声穿过云海与双子山！身后的『云端誓言之星』宝箱封印已解开！'
        : '「当——♪」钟声载着给登登的心愿飞向远方天际，Broccoli 与 Jelly 也仰起头开心地眯起了眼睛～',
    };
  }

  update(dt) {
    const t = performance.now() * 0.001;

    if (this.coreCrystal) {
      this.coreCrystal.rotation.y += dt * 0.85;
    }

    // Orbit satellite sky-rocks gently around the island
    for (const o of this.orbitRocks) {
      const a = o.baseAngle + t * o.speed;
      o.group.position.set(
        this.islandPos.x + Math.cos(a) * o.dist,
        this.islandPos.y + o.yOffset + Math.sin(t * 1.6 + o.baseAngle) * 0.45,
        this.islandPos.z + Math.sin(a) * o.dist
      );
      o.group.rotation.y += dt * 0.4;
    }

    // Swing Wishing Bell with damped harmonic motion
    if (this.bellPivot) {
      if (this.bellSwing > 0.002) {
        this.bellSwing = Math.max(0, this.bellSwing - dt * 0.28);
        this.bellPivot.rotation.z = Math.sin(t * 8.5) * this.bellSwing;
      } else {
        this.bellPivot.rotation.z = Math.sin(t * 1.4) * 0.03;
      }
    }

    // Drift Sky-Sakura Petals
    if (this.skyPetals) {
      const attr = this.skyPetals.geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        let px = attr.getX(i) + Math.sin(t * 1.2 + i) * 0.35 * dt;
        let py = attr.getY(i) - 0.55 * dt;
        let pz = attr.getZ(i) + Math.cos(t * 1.1 + i * 0.7) * 0.35 * dt;
        if (py < this.islandPos.y + 0.15) {
          py = this.islandPos.y + 5.2;
          const a = (i * 2.399) % (Math.PI * 2);
          const r = 1.5 + ((i * 1.7) % 8.5);
          px = this.islandPos.x + Math.cos(a) * r;
          pz = this.islandPos.z + Math.sin(a) * r;
        }
        attr.setXYZ(i, px, py, pz);
      }
      attr.needsUpdate = true;
    }

    // Animate Rising Golden-Cyan Updraft Wind Rings
    for (const u of this.updrafts) {
      u.innerPad.rotation.z += dt * 1.2;
      const colHeight = u.topY - u.baseY - 2.0;
      for (const wr of u.windRings) {
        wr.phase = (wr.phase + dt * 0.28) % 1.0;
        const p = wr.phase;
        wr.mesh.position.y = 0.4 + p * colHeight;
        const radiusPulse = 0.85 + Math.sin(p * Math.PI) * 0.32;
        wr.mesh.scale.set(radiusPulse, radiusPulse, 1);
        wr.mat.opacity = Math.sin(p * Math.PI) * 0.42;
      }
    }
  }
}
