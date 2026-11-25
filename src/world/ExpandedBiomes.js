import * as THREE from 'three';
import { createZonaiRuneTexture } from '../utils/ToonMaterials.js';

const MAZE_GRID = [
  '#########',
  '#T  #   #',
  '### # ###',
  '#   #   #',
  '# ##C # #',
  '# # ### #',
  '# ##### #',
  '#       #',
  '####E####',
];

export class ExpandedBiomes {
  constructor(scene, world, family, monsters) {
    this.scene = scene;
    this.world = world;
    this.family = family;
    this.monsters = monsters;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.mazeCenter = new THREE.Vector3(-40, this.world.getTerrainHeight(-40, -34), -34);
    this.glenCenter = new THREE.Vector3(54, this.world.getTerrainHeight(54, -18), -18);

    this.mazeTreatOpened = false;
    this.mazeTreatPos = new THREE.Vector3();
    this.mazeGoalPos = new THREE.Vector3();
    this.animatedCrystals = [];
    this.sporePoints = null;

    this._buildStarlightHedgeLabyrinth();
    this._buildBioluminescentMushroomGlen();
  }

  _buildStarlightHedgeLabyrinth() {
    const cell = 2.9;
    const rows = MAZE_GRID.length;
    const cols = MAZE_GRID[0].length;
    const baseY = this.mazeCenter.y;

    // Manicured Moss-Edged Flagstone Courtyard Floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xa6a396,
      roughness: 0.88,
    });
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(cols * cell + 0.6, 0.12, rows * cell + 0.6),
      floorMat
    );
    floor.position.set(this.mazeCenter.x, baseY - 0.02, this.mazeCenter.z);
    floor.receiveShadow = true;
    this.group.add(floor);

    const hedgeMat = new THREE.MeshStandardMaterial({
      color: 0x2f7545,
      roughness: 0.84,
    });
    const hedgeTopMat = new THREE.MeshStandardMaterial({
      color: 0x499c56,
      roughness: 0.78,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xc2bdae,
      roughness: 0.82,
    });
    const lanternGlowMat = new THREE.MeshBasicMaterial({ color: 0x9cf7ff });

    const wallCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = MAZE_GRID[r][c];
        const wx = this.mazeCenter.x + (c - (cols - 1) * 0.5) * cell;
        const wz = this.mazeCenter.z + (r - (rows - 1) * 0.5) * cell;

        if (ch === '#') {
          wallCells.push({ x: wx, z: wz, idx: r * cols + c });
          this.world.boxColliders.push({
            cx: wx,
            cz: wz,
            hx: cell * 0.48,
            hz: cell * 0.48,
            maxY: baseY + 3.0,
          });
        } else if (ch === 'E') {
          // Entrance Archway & Twin Firefly Lantern Posts!
          for (const sx of [-1.18, 1.18]) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.65, 0.46), stoneMat);
            pillar.position.set(wx + sx, baseY + 1.32, wz);
            pillar.castShadow = true;
            const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), lanternGlowMat);
            lantern.position.set(wx + sx, baseY + 2.88, wz);
            this.group.add(pillar, lantern);
            this.animatedCrystals.push(lantern);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.34, 0.56), stoneMat);
          lintel.position.set(wx, baseY + 2.72, wz);
          lintel.castShadow = true;
          this.group.add(lintel);
        } else if (ch === 'T') {
          // Secret Cat-Treat Gift Box in Northwest Alcove!
          this.mazeTreatPos.set(wx, baseY, wz);
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.34, 12), stoneMat);
          ped.position.set(wx, baseY + 0.17, wz);
          this.treatBoxMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, 0.34, 0.36),
            new THREE.MeshStandardMaterial({ color: 0xe8994a, roughness: 0.5, metalness: 0.2 })
          );
          this.treatBoxMesh.position.set(wx, baseY + 0.51, wz);
          this.treatBoxMesh.castShadow = true;
          this.group.add(ped, this.treatBoxMesh);
        } else if (ch === 'C') {
          // Center Sanctuary Pedestal!
          this.mazeGoalPos.set(wx, baseY, wz);
          const dais = new THREE.Mesh(
            new THREE.CylinderGeometry(1.15, 1.32, 0.32, 20),
            new THREE.MeshStandardMaterial({
              map: createZonaiRuneTexture('#7cf7ff', '#2c424a'),
              roughness: 0.65,
            })
          );
          dais.position.set(wx, baseY + 0.16, wz);
          dais.receiveShadow = true;

          const starCore = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.32, 0),
            new THREE.MeshBasicMaterial({ color: 0xffe985 })
          );
          starCore.position.set(wx, baseY + 1.45, wz);
          const starRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.58, 0.03, 8, 28),
            lanternGlowMat
          );
          starRing.position.set(wx, baseY + 1.45, wz);

          const light = new THREE.PointLight(0x88f4ff, 2.0, 14, 1.5);
          light.position.set(wx, baseY + 1.9, wz);

          this.group.add(dais, starCore, starRing, light);
          this.animatedCrystals.push(starCore, starRing);

          // Register as Russian Blue Cat secret target!
          this.family?.registerSecretTarget({
            x: wx,
            z: wz,
            isSolved: () => !!this._mazeChestOpened,
          });
        }
      }
    }

    // Instanced Sculpted Two-Tier Topiary Hedges + Starlight Hedge Blossoms (ultra-fast 3 draw calls!)
    const wallCount = wallCells.length;
    const baseBoxGeo = new THREE.BoxGeometry(cell * 0.98, 1.65, cell * 0.98);
    const crownBoxGeo = new THREE.BoxGeometry(cell * 0.86, 0.38, cell * 0.86);
    const bloomGeo = new THREE.DodecahedronGeometry(0.11, 0);

    const baseInst = new THREE.InstancedMesh(baseBoxGeo, hedgeMat, wallCount);
    const crownInst = new THREE.InstancedMesh(crownBoxGeo, hedgeTopMat, wallCount);
    const bloomInst = new THREE.InstancedMesh(
      bloomGeo,
      new THREE.MeshBasicMaterial({ color: 0xdff8ff }),
      wallCount * 2
    );
    baseInst.castShadow = true;
    baseInst.receiveShadow = true;
    crownInst.castShadow = true;

    const dummy = new THREE.Object3D();
    const bloomPalette = [
      new THREE.Color('#ccf6ff'),
      new THREE.Color('#fff5cc'),
      new THREE.Color('#ffd4e8'),
    ];

    wallCells.forEach((w, i) => {
      dummy.position.set(w.x, baseY + 0.82, w.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      baseInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(w.x, baseY + 1.76, w.z);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);

      for (let b = 0; b < 2; b++) {
        const bi = i * 2 + b;
        const ox = Math.sin(w.idx * 3.1 + b * 2.2) * (cell * 0.30);
        const oz = Math.cos(w.idx * 2.7 + b * 1.9) * (cell * 0.30);
        dummy.position.set(w.x + ox, baseY + 1.98, w.z + oz);
        dummy.scale.setScalar(0.85 + (b % 2) * 0.3);
        dummy.updateMatrix();
        bloomInst.setMatrixAt(bi, dummy.matrix);
        bloomInst.setColorAt(bi, bloomPalette[(i + b) % bloomPalette.length]);
      }
    });

    baseInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    bloomInst.instanceMatrix.needsUpdate = true;
    if (bloomInst.instanceColor) bloomInst.instanceColor.needsUpdate = true;
    this.group.add(baseInst, crownInst, bloomInst);

    // Subtle Emerald Cat-Paw Stepping Cues hinting toward the East Entrance Corridor!
    const pawMat = new THREE.MeshBasicMaterial({
      color: 0x5effb8,
      transparent: true,
      opacity: 0.62,
    });
    [
      [4, 7.3],
      [5.2, 7.0],
      [6.6, 7.0],
      [7.0, 5.6],
    ].forEach(([gc, gr]) => {
      const px = this.mazeCenter.x + (gc - 4) * cell;
      const pz = this.mazeCenter.z + (gr - 4) * cell;
      const paw = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), pawMat);
      paw.rotation.x = -Math.PI / 2;
      paw.position.set(px, baseY + 0.055, pz);
      this.group.add(paw);
    });
  }

  _buildBioluminescentMushroomGlen() {
    const gx = this.glenCenter.x;
    const gz = this.glenCenter.z;
    const gy = this.glenCenter.y;

    const stalkMat = new THREE.MeshStandardMaterial({
      color: 0xf4eee1,
      roughness: 0.72,
    });

    const capPalettes = [
      { base: 0x2fd9c8, glow: 0x1ca89a, spot: 0xcffff8 },
      { base: 0xf274a6, glow: 0xb83b6d, spot: 0xffe3ef },
      { base: 0x8a74f7, glow: 0x563ec9, spot: 0xe3dcff },
    ];

    const shroomSpecs = [
      { ox: -5.5, oz: -6.2, h: 4.6, r: 2.1, p: 0 },
      { ox: 6.2, oz: -5.4, h: 5.1, r: 2.35, p: 1 },
      { ox: 7.4, oz: 4.8, h: 4.2, r: 1.95, p: 2 },
      { ox: -6.8, oz: 5.2, h: 3.9, r: 1.80, p: 0 },
      { ox: 0.5, oz: -8.8, h: 3.4, r: 1.55, p: 2 },
      { ox: -9.5, oz: -0.8, h: 3.1, r: 1.45, p: 1 },
      { ox: 9.8, oz: -0.5, h: 3.6, r: 1.65, p: 0 },
      { ox: -2.8, oz: 8.2, h: 2.8, r: 1.30, p: 2 },
      { ox: 3.6, oz: 7.8, h: 2.5, r: 1.20, p: 1 },
      // Smaller fairy-ring cluster mushrooms
      { ox: -3.6, oz: -4.8, h: 1.75, r: 0.85, p: 1 },
      { ox: 4.4, oz: -3.8, h: 1.95, r: 0.92, p: 0 },
      { ox: 5.2, oz: 3.2, h: 1.65, r: 0.80, p: 1 },
      { ox: -4.8, oz: 3.6, h: 1.85, r: 0.88, p: 2 },
    ];

    shroomSpecs.forEach((s, idx) => {
      const sx = gx + s.ox;
      const sz = gz + s.oz;
      const sy = this.world.getTerrainHeight(sx, sz);
      const pal = capPalettes[s.p];

      const shroom = new THREE.Group();
      shroom.position.set(sx, sy, sz);

      const leanX = Math.sin(idx * 1.9) * 0.25;
      const leanZ = Math.cos(idx * 2.3) * 0.25;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.1, 0),
        new THREE.Vector3(leanX * 0.4, s.h * 0.45, leanZ * 0.4),
        new THREE.Vector3(leanX, s.h, leanZ),
      ]);
      const stalk = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 12, s.r * 0.16, 10, false),
        stalkMat
      );
      stalk.castShadow = true;
      shroom.add(stalk);

      const capGroup = new THREE.Group();
      capGroup.position.set(leanX, s.h, leanZ);
      capGroup.rotation.set(leanZ * 0.22, 0, -leanX * 0.22);

      const capMat = new THREE.MeshStandardMaterial({
        color: pal.base,
        emissive: new THREE.Color(pal.glow),
        emissiveIntensity: 0.55,
        roughness: 0.42,
      });
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(s.r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
        capMat
      );
      cap.scale.y = 0.62;
      cap.position.y = -s.r * 0.12;
      cap.castShadow = true;

      // Glowing underside gill disc!
      const gill = new THREE.Mesh(
        new THREE.CircleGeometry(s.r * 0.94, 18),
        new THREE.MeshBasicMaterial({ color: pal.spot })
      );
      gill.rotation.x = Math.PI / 2;
      gill.position.y = -s.r * 0.08;

      // Luminous polka-dot spots on cap!
      const spotMat = new THREE.MeshBasicMaterial({ color: pal.spot });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + idx;
        const sp = new THREE.Mesh(new THREE.SphereGeometry(s.r * 0.11, 8, 8), spotMat);
        sp.scale.y = 0.35;
        sp.position.set(
          Math.cos(a) * s.r * 0.55,
          s.r * 0.32,
          Math.sin(a) * s.r * 0.55
        );
        capGroup.add(sp);
      }

      capGroup.add(cap, gill);
      shroom.add(capGroup);
      this.group.add(shroom);

      if (s.h > 2.2) {
        this.world.colliders.push({ x: sx, z: sz, r: s.r * 0.22 });
      }
    });

    // Central Enchanted Crystal Pool Dais + Soft Cyan-Violet Glade PointLight
    const centerGlow = new THREE.PointLight(0x66f5e4, 2.4, 22, 1.4);
    centerGlow.position.set(gx, gy + 3.2, gz);
    this.group.add(centerGlow);

    // Floating Bioluminescent Spore Lanterns
    const sporeCount = 90;
    const pos = new Float32Array(sporeCount * 3);
    for (let i = 0; i < sporeCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * 14.5;
      pos[i * 3] = gx + Math.cos(a) * rad;
      pos[i * 3 + 1] = gy + 0.5 + Math.random() * 5.2;
      pos[i * 3 + 2] = gz + Math.sin(a) * rad;
    }
    const sc = document.createElement('canvas');
    sc.width = 32;
    sc.height = 32;
    const sctx = sc.getContext('2d');
    const sg = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    sg.addColorStop(0.4, 'rgba(170, 250, 255, 0.65)');
    sg.addColorStop(1.0, 'rgba(170, 250, 255, 0.0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 32, 32);
    const sporeTex = new THREE.CanvasTexture(sc);

    const sporeGeo = new THREE.BufferGeometry();
    sporeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sporePoints = new THREE.Points(
      sporeGeo,
      new THREE.PointsMaterial({
        map: sporeTex,
        color: 0x9efaff,
        size: 0.34,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.group.add(this.sporePoints);

    // Spawn 2 playful Glen guardians!
    if (this.monsters) {
      this.monsters.spawnMonster('soot_puff', gx - 2.2, gz + 2.5, 11);
      this.monsters.spawnMonster('acorn_imp', gx + 2.6, gz - 1.8, 12);
    }
  }

  getNearestInteraction(playerPos) {
    if (!this.mazeTreatOpened && playerPos.distanceTo(this.mazeTreatPos) < 2.2) {
      return {
        type: 'maze_treat',
        label: '[F] 打开小蓝发现的秘藏礼盒（香香小鱼干 ×3）',
        dist: playerPos.distanceTo(this.mazeTreatPos),
      };
    }
    return null;
  }

  triggerInteraction(inter, sound, monsters) {
    if (inter?.type === 'maze_treat' && !this.mazeTreatOpened) {
      this.mazeTreatOpened = true;
      if (this.treatBoxMesh) this.treatBoxMesh.visible = false;
      if (monsters) monsters.fishTreats += 3;
      sound?.shrineSolved();
      return {
        speaker: '星语树篱秘藏',
        text: '获得了「特制香香小鱼干 ×3」！小蓝和大福闻到香味都开心地竖起了耳朵～',
      };
    }
    return null;
  }

  update(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.animatedCrystals.length; i++) {
      const c = this.animatedCrystals[i];
      c.rotation.y += dt * 1.1;
      c.rotation.x = Math.sin(t * 1.6 + i) * 0.25;
    }
    if (this.sporePoints) {
      const arr = this.sporePoints.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(t * 1.2 + i) * dt * 0.25;
      }
      this.sporePoints.geometry.attributes.position.needsUpdate = true;
    }
  }
}
