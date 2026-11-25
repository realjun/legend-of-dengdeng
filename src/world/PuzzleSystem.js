import * as THREE from 'three';

const CHIME_SPEC = [
  { name: '天青·Do', color: 0x5ce8ff, freq: 523.25, angle: -1.05 },
  { name: '翠玉·Mi', color: 0x6bf59e, freq: 659.25, angle: -0.35 },
  { name: '暖金·Sol', color: 0xffd863, freq: 783.99, angle: 0.35 },
  { name: '樱粉·La', color: 0xff8ec2, freq: 880.0, angle: 1.05 },
];

// Melody sequence: Sky-Cyan (0) -> Warm-Gold (2) -> Sakura-Rose (3) -> Emerald (1)
const MELODY_ORDER = [0, 2, 3, 1];

export class PuzzleSystem {
  constructor(scene, world, family, combatEffects, sound) {
    this.scene = scene;
    this.world = world;
    this.family = family;
    this.fx = combatEffects;
    this.sound = sound;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.chests = [];
    this.collectedStars = 0;
    this.totalStars = 5; // 4 terrestrial + 1 Sky Island chest (added in Commit #5 or via addChest!)
    this.onStarCollected = null;

    // Puzzle 1: Harmonic Chime Pillars near Temple of Time Ruins
    this.chimeCenter = new THREE.Vector3(-26.5, this.world.getTerrainHeight(-26.5, 19.5), 19.5);
    this.chimePillars = [];
    this.chimeProgress = 0;
    this.chimeSolved = false;
    this.melodyPlayback = []; // scheduled preview timers

    // Puzzle 2: Twin-Paw & Resonance Trial at Golden Ginkgo Sanctuary (24, -34)
    this.sanctCenter = new THREE.Vector3(24.0, this.world.getWalkHeight(24.0, -34.0), -34.0);
    this.sanctSolved = false;
    this.pawPads = [];

    this._buildChimePuzzle();
    this._buildSanctuaryTwinPawPuzzle();
    this._buildMazeAndGlenChests();
  }

  addStarChest({ id, x, y, z, rotY = 0, locked = false, lockHint = '', title, message }) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = rotY;

    const royalMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e78,
      roughness: 0.48,
      metalness: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf4cf6a,
      metalness: 0.62,
      roughness: 0.26,
    });

    // Chest Base Box + Gold Trim
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.42, 0.52), royalMat);
    base.position.y = 0.21;
    base.castShadow = true;
    base.receiveShadow = true;

    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.08, 0.56), goldMat);
    trim.position.y = 0.40;

    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), goldMat);
    clasp.position.set(0, 0.38, 0.27);

    // Hinged Arched Lid
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.42, -0.26);

    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.16, 0.52), royalMat);
    lidBox.position.set(0, 0.08, 0.26);
    lidBox.castShadow = true;

    const lidArch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.76, 14, 1, false, 0, Math.PI),
      goldMat
    );
    lidArch.rotation.z = Math.PI / 2;
    lidArch.position.set(0, 0.14, 0.26);
    lidPivot.add(lidBox, lidArch);

    // Shimmering Lock Seal Dome (visible while locked)
    const sealMat = new THREE.MeshBasicMaterial({
      color: 0x7af4ff,
      transparent: true,
      opacity: locked ? 0.34 : 0.0,
      wireframe: true,
    });
    const sealDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.66, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      sealMat
    );
    sealDome.visible = locked;

    // Rising Starlight Heart-Crystal inside the chest!
    const starGroup = new THREE.Group();
    starGroup.position.set(0, 0.35, 0);
    starGroup.visible = false;
    const starGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.20, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe875 })
    );
    const starHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.30, 0.025, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xff9ec7 })
    );
    starGroup.add(starGem, starHalo);

    root.add(base, trim, clasp, lidPivot, sealDome, starGroup);
    this.group.add(root);

    const chest = {
      id,
      root,
      pos: new THREE.Vector3(x, y, z),
      lidPivot,
      sealDome,
      sealMat,
      starGroup,
      locked,
      lockHint,
      opened: false,
      openAnim: 0,
      title,
      message,
    };

    this.chests.push(chest);
    this.family?.registerSecretTarget({
      x,
      z,
      isSolved: () => chest.opened,
    });

    return chest;
  }

  unlockChest(id) {
    const c = this.chests.find((ch) => ch.id === id);
    if (!c || !c.locked) return;
    c.locked = false;
    c.sealDome.visible = false;
    this.fx?.spawnShockwave(new THREE.Vector3(c.pos.x, c.pos.y + 0.25, c.pos.z), {
      color: '#ffe875',
      startScale: 0.3,
      endScale: 2.6,
      duration: 0.45,
    });
    this.fx?.spawnSparks(new THREE.Vector3(c.pos.x, c.pos.y + 0.6, c.pos.z), '#ffe875', 20);
  }

  _buildChimePuzzle() {
    const cx = this.chimeCenter.x;
    const cz = this.chimeCenter.z;
    const cy = this.chimeCenter.y;

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xbab4a4, roughness: 0.85 });

    // Circular Mosaic Platform
    const ringFloor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.18, 24), stoneMat);
    ringFloor.position.set(cx, cy + 0.06, cz);
    ringFloor.receiveShadow = true;
    this.group.add(ringFloor);

    // Clue Melody Tablet at the front edge of the circle
    const tx = cx + 3.2;
    const tz = cz + 2.2;
    const ty = this.world.getTerrainHeight(tx, tz);
    this.clueTabletPos = new THREE.Vector3(tx, ty, tz);

    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.15, 0.24), stoneMat);
    tablet.position.set(tx, ty + 0.58, tz);
    tablet.rotation.y = 0.65;
    tablet.castShadow = true;
    const tabletRune = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({ color: 0x7ef5ff })
    );
    tabletRune.position.set(tx, ty + 1.32, tz);
    this.group.add(tablet, tabletRune);
    this.clueTabletRune = tabletRune;

    // 4 Semi-Circular Harmonic Crystal Chime Pillars
    CHIME_SPEC.forEach((spec, idx) => {
      const px = cx - Math.cos(spec.angle) * 3.1;
      const pz = cz + Math.sin(spec.angle) * 3.1;
      const py = this.world.getTerrainHeight(px, pz);

      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.40, 0.68, 10), stoneMat);
      ped.position.set(px, py + 0.34, pz);
      ped.castShadow = true;

      const crystalMat = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: new THREE.Color(spec.color),
        emissiveIntensity: 0.22,
        roughness: 0.2,
        metalness: 0.15,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), crystalMat);
      crystal.scale.set(0.75, 1.85, 0.75);
      crystal.position.set(px, py + 1.32, pz);
      crystal.castShadow = true;

      this.group.add(ped, crystal);
      this.world.colliders.push({ x: px, z: pz, r: 0.42 });

      this.chimePillars.push({
        idx,
        spec,
        pos: new THREE.Vector3(px, py, pz),
        crystal,
        crystalMat,
        lit: false,
        flashTimer: 0,
        hitCooldown: 0,
      });
    });

    // Chest #1: Sealed in the center of the Chime Circle!
    this.addStarChest({
      id: 'chime_chest',
      x: cx,
      y: cy + 0.15,
      z: cz,
      rotY: 0.65,
      locked: true,
      lockHint: '聆听音律石碑 [F]，用剑按「天青→暖金→樱粉→翠玉」顺序敲响水晶柱解封',
      title: '心愿星徽 ① · 四季旋律之星',
      message: '「给登登的第一颗星：愿我们走过的每一个春夏秋冬，都像这段旋律一样清澈动听。」',
    });
  }

  playChimePreview() {
    this.melodyPlayback = MELODY_ORDER.map((pillarIdx, step) => ({
      pillarIdx,
      delay: step * 0.52 + 0.08,
      fired: false,
    }));
  }

  _buildSanctuaryTwinPawPuzzle() {
    const sx = this.sanctCenter.x;
    const sz = this.sanctCenter.z;
    const sy = this.sanctCenter.y;

    // Two Glowing Cat-Paw Rune Pads + Central Resonance Prism
    const padSpecs = [
      { ox: -2.2, oz: 1.2, color: 0x9be28c, role: 'russian' },
      { ox: 2.2, oz: 1.2, color: 0xffb469, role: 'maine' },
    ];

    padSpecs.forEach((p) => {
      const mat = new THREE.MeshBasicMaterial({
        color: p.color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.68, 24), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(sx + p.ox, sy + 0.04, sz + p.oz);
      const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), mat);
      centerDot.rotation.x = -Math.PI / 2;
      centerDot.position.set(sx + p.ox, sy + 0.04, sz + p.oz);
      this.group.add(ring, centerDot);
      this.pawPads.push({
        pos: new THREE.Vector3(sx + p.ox, sy, sz + p.oz),
        mat,
        role: p.role,
        active: false,
      });
    });

    this.addStarChest({
      id: 'sanctuary_chest',
      x: sx,
      y: sy + 0.02,
      z: sz - 1.2,
      rotY: 0,
      locked: true,
      lockHint: '带着 Broccoli 与 Jelly 踏上圣坛，释放一次「长按J回旋斩」或「E盾反」共鸣解封',
      title: '心愿星徽 ② · 双喵守护之星',
      message: '「给登登的第二颗星：有 Broccoli 的绿眸寻路、Jelly 的蓝眼护航，我们一家四口永远整整齐齐！」',
    });
  }

  _buildMazeAndGlenChests() {
    // Chest #3: Heart of the Starlight Hedge Labyrinth (-40, -34) (unlocked once reached!)
    const my = this.world.getTerrainHeight(-40, -34);
    this.addStarChest({
      id: 'maze_chest',
      x: -40,
      y: my + 0.32,
      z: -34,
      rotY: 0,
      locked: false,
      title: '心愿星徽 ③ · 星语迷宫之星',
      message: '「给登登的第三颗星：哪怕在弯弯绕绕的迷宫里，只要顺着星光与猫爪印，总会走到惊喜中央。」',
    });

    // Chest #4: Bioluminescent Mushroom Glen (54, -18) — unseals when Glen monsters are cleared or spun!
    const gy = this.world.getTerrainHeight(54, -18);
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.05, 0.28, 16),
      new THREE.MeshStandardMaterial({ color: 0x7b7896, roughness: 0.75 })
    );
    ped.position.set(54, gy + 0.14, -18);
    this.group.add(ped);

    this.addStarChest({
      id: 'glen_chest',
      x: 54,
      y: gy + 0.28,
      z: -18,
      rotY: -0.4,
      locked: true,
      lockHint: '在荧光蘑菇秘境挥剑击败任意 1 只小怪兽（或在祭坛旁释放回旋斩）即可解封',
      title: '心愿星徽 ④ · 荧光秘境之星',
      message: '「给登登的第四颗星：愿你永远保有奇幻的想象力，在发光的蘑菇森林里自在挥剑当大侠！」',
    });
  }

  // Check sword hits against Harmonic Chime Pillars & Glen Seal
  checkSwordResonance(playerPos, charYaw, combatState, defeatedMonsters) {
    // Unlock Glen chest automatically if any monster has been defeated or Spin Attack near chest!
    const glenChest = this.chests.find((c) => c.id === 'glen_chest');
    if (glenChest && glenChest.locked) {
      if (
        defeatedMonsters > 0 ||
        (combatState === 'spin_attack' && playerPos.distanceTo(glenChest.pos) < 5.0)
      ) {
        this.unlockChest('glen_chest');
      }
    }

    // Check Sanctuary Twin-Paw + Spin/Parry Resonance!
    if (
      !this.sanctSolved &&
      (combatState === 'spin_attack' || combatState === 'shield_parry') &&
      playerPos.distanceTo(this.sanctCenter) < 5.6
    ) {
      this.sanctSolved = true;
      this.sound?.shrineSolved();
      this.unlockChest('sanctuary_chest');
    }

    if (
      this.chimeSolved ||
      (combatState !== 'slash1' &&
        combatState !== 'slash2' &&
        combatState !== 'slash3' &&
        combatState !== 'spin_attack' &&
        combatState !== 'jump_slash')
    ) {
      this._struckThisSwing = false;
      return;
    }

    if (this._struckThisSwing) return;

    const fwdX = Math.sin(charYaw);
    const fwdZ = Math.cos(charYaw);

    let bestP = null;
    let bestScore = Infinity;
    for (const p of this.chimePillars) {
      if (p.hitCooldown > 0) continue;
      const dx = p.pos.x - playerPos.x;
      const dz = p.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.25) continue;
      const dot = dist > 0.15 ? (dx / dist) * fwdX + (dz / dist) * fwdZ : 1.0;
      if (combatState !== 'spin_attack' && dot < 0.15) continue;
      const score = dist - dot * 0.65;
      if (score < bestScore) {
        bestScore = score;
        bestP = p;
      }
    }

    if (bestP) {
      const p = bestP;
      this._struckThisSwing = true;
      p.hitCooldown = 0.35;
      p.flashTimer = 0.55;
      this.sound?.crystalChime(p.spec.freq);
      this.fx?.spawnSparks(
        new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z),
        '#' + p.spec.color.toString(16).padStart(6, '0'),
        14
      );

      if (MELODY_ORDER[this.chimeProgress] === p.idx) {
        p.lit = true;
        this.chimeProgress++;
        if (this.chimeProgress >= MELODY_ORDER.length) {
          this.chimeSolved = true;
          this.sound?.shrineSolved();
          this.unlockChest('chime_chest');
        }
      } else {
        this.chimeProgress = MELODY_ORDER[0] === p.idx ? 1 : 0;
        for (const other of this.chimePillars) {
          other.lit = MELODY_ORDER[0] === p.idx && other.idx === p.idx;
        }
      }
    }
  }

  getNearestInteraction(playerPos) {
    if (!this.chimeSolved && playerPos.distanceTo(this.clueTabletPos) < 2.5) {
      return {
        type: 'chime_clue',
        label: '[F] 聆听音律石碑的旋律提示',
        dist: playerPos.distanceTo(this.clueTabletPos),
      };
    }

    for (const c of this.chests) {
      if (c.opened) continue;
      const d = playerPos.distanceTo(c.pos);
      if (d < 2.35) {
        if (c.locked) {
          return {
            type: 'chest_locked',
            chest: c,
            label: `🔒 封印宝箱 · ${c.lockHint}`,
            dist: d,
          };
        }
        return {
          type: 'chest_open',
          chest: c,
          label: `[F] 开启宝箱 · ${c.title}`,
          dist: d,
        };
      }
    }
    return null;
  }

  triggerInteraction(inter) {
    if (!inter) return null;

    if (inter.type === 'chime_clue') {
      this.playChimePreview();
      return {
        speaker: '古代音律石碑',
        text: '水晶柱依次闪烁奏响了四音旋律：「天青蓝 → 暖阳金 → 樱花粉 → 翡翠绿」，用大师之剑按颜色顺序敲响它们吧！',
      };
    }

    if (inter.type === 'chest_locked') {
      this.sound?.talkGreeting();
      return {
        speaker: '星光封印宝箱',
        text: inter.chest.lockHint,
      };
    }

    if (inter.type === 'chest_open') {
      const c = inter.chest;
      if (c.opened) return null;
      c.opened = true;
      c.starGroup.visible = true;
      this.collectedStars++;
      this.sound?.discoveryFanfare();
      this.fx?.spawnShockwave(new THREE.Vector3(c.pos.x, c.pos.y + 0.4, c.pos.z), {
        color: '#ffe878',
        startScale: 0.25,
        endScale: 2.4,
        duration: 0.45,
      });
      this.fx?.spawnSparks(new THREE.Vector3(c.pos.x, c.pos.y + 0.65, c.pos.z), '#ff9ec7', 22);
      if (this.onStarCollected) {
        this.onStarCollected(this.collectedStars, this.totalStars, c);
      }
      return {
        speaker: `${c.title} (${this.collectedStars}/${this.totalStars})`,
        text: c.message,
      };
    }

    return null;
  }

  update(dt, playerPos, charYaw, dengdeng, defeatedMonsters) {
    const t = performance.now() * 0.001;

    this.checkSwordResonance(playerPos, charYaw, dengdeng.combatState, defeatedMonsters);

    // Scheduled Melody Preview Playback
    for (let i = this.melodyPlayback.length - 1; i >= 0; i--) {
      const item = this.melodyPlayback[i];
      item.delay -= dt;
      if (item.delay <= 0 && !item.fired) {
        item.fired = true;
        const p = this.chimePillars[item.pillarIdx];
        if (p) {
          p.flashTimer = 0.46;
          this.sound?.crystalChime(p.spec.freq);
          this.fx?.spawnShockwave(new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z), {
            color: '#' + p.spec.color.toString(16).padStart(6, '0'),
            startScale: 0.2,
            endScale: 1.25,
            duration: 0.34,
          });
        }
        this.melodyPlayback.splice(i, 1);
      }
    }

    if (this.clueTabletRune) {
      this.clueTabletRune.rotation.y += dt * 1.4;
      this.clueTabletRune.position.y = this.clueTabletPos.y + 1.32 + Math.sin(t * 2.5) * 0.06;
    }

    for (const p of this.chimePillars) {
      if (p.hitCooldown > 0) p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      if (p.flashTimer > 0) p.flashTimer = Math.max(0, p.flashTimer - dt);
      const targetEmissive = p.flashTimer > 0 ? 1.55 : p.lit || this.chimeSolved ? 0.92 : 0.20;
      p.crystalMat.emissiveIntensity = THREE.MathUtils.lerp(
        p.crystalMat.emissiveIntensity,
        targetEmissive,
        Math.min(1, dt * 12)
      );
      p.crystal.rotation.y += dt * (p.lit ? 1.8 : 0.5);
    }

    // Sanctuary Cat-Paw Pads Glow when Dengdeng + Cats are near!
    const nearSanct = playerPos.distanceTo(this.sanctCenter) < 7.5;
    for (const pad of this.pawPads) {
      pad.mat.opacity = nearSanct || this.sanctSolved ? 0.78 + Math.sin(t * 4) * 0.15 : 0.28;
    }

    // Animate Opening Chest Lids & Rising Star Crystals!
    for (const c of this.chests) {
      if (c.sealDome.visible) {
        c.sealDome.rotation.y += dt * 0.8;
      }
      if (c.opened && c.openAnim < 1.0) {
        c.openAnim = Math.min(1.0, c.openAnim + dt * 1.65);
        const ease = 1 - Math.pow(1 - c.openAnim, 3);
        c.lidPivot.rotation.x = -ease * 1.95;
        c.starGroup.position.y = 0.35 + ease * 1.15 + Math.sin(t * 3.2) * 0.05;
        c.starGroup.rotation.y += dt * 2.8;
      } else if (c.opened) {
        c.starGroup.position.y = 1.50 + Math.sin(t * 2.8) * 0.07;
        c.starGroup.rotation.y += dt * 1.8;
      }
    }
  }
}
