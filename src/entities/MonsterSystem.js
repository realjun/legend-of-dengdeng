import * as THREE from 'three';

function createHpBarTexture(ratio = 1.0, stunned = false) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 28;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 28);

  ctx.fillStyle = 'rgba(10, 16, 26, 0.68)';
  ctx.beginPath();
  ctx.roundRect(8, 7, 112, 14, 7);
  ctx.fill();

  const w = Math.max(0, Math.min(1, ratio)) * 106;
  if (w > 1) {
    ctx.fillStyle = stunned ? '#ffe46b' : '#ff6b7a';
    ctx.beginPath();
    ctx.roundRect(11, 10, w, 8, 4);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255, 244, 214, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(8, 7, 112, 14, 7);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MonsterSystem {
  constructor(scene, world, combatEffects, sound) {
    this.scene = scene;
    this.world = world;
    this.fx = combatEffects;
    this.sound = sound;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.monsters = [];
    this.orbs = [];
    this.drops = [];

    this.fishTreats = 2; // Start with 2 dried fish treats in pocket for the cats!
    this.starPetals = 0;
    this.defeatedCount = 0;

    // External callback when a reflected star-orb hits a puzzle target (used by PuzzleSystem in Commit #4!)
    this.onReflectedOrbUpdate = null;

    this._spawnInitialMonsters();
  }

  _spawnInitialMonsters() {
    const specs = [
      // Meadow & Woods Bouncy Soot-Puff Sprites (away from peaceful spawn & cottage!)
      { kind: 'soot_puff', x: -3.5, z: 4.5 },
      { kind: 'soot_puff', x: 14.5, z: -2.0 },
      { kind: 'soot_puff', x: -11.0, z: -22.0 },
      { kind: 'soot_puff', x: 38.0, z: -12.0 },
      // Acorn-Cap Shield Imps (test heavy combo finishers / spin attack / shield counter!)
      { kind: 'acorn_imp', x: -12.5, z: 3.5 },
      { kind: 'acorn_imp', x: 19.5, z: -19.5 },
      { kind: 'acorn_imp', x: 46.0, z: -20.0 },
      // Clockwork Star-Orb Constructs (test Hylian Shield Guard & E-Key Perfect Parry Deflect!)
      { kind: 'star_turret', x: -19.2, z: 14.8 },
      { kind: 'star_turret', x: 9.5, z: -26.5 },
    ];

    specs.forEach((s, idx) => {
      this.spawnMonster(s.kind, s.x, s.z, idx);
    });
  }

  spawnMonster(kind, x, z, seed = 0) {
    const y = this.world.getWalkHeight(x, z);
    const root = new THREE.Group();
    root.position.set(x, y, z);

    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    let maxHp = 3;
    let radius = 0.45;
    let height = 0.85;
    let parts = {};

    if (kind === 'soot_puff') {
      maxHp = 3;
      radius = 0.44;
      height = 0.78;
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x33294a,
        roughness: 0.85,
        emissive: new THREE.Color(0x160f29),
        emissiveIntensity: 0.35,
      });
      const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 1), bodyMat);
      core.position.y = 0.36;
      core.castShadow = true;

      // Cute sprout leaf on head!
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x7be054, roughness: 0.6 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), leafMat);
      stem.position.y = 0.75;
      const leafL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), leafMat);
      leafL.scale.set(1.5, 0.35, 0.8);
      leafL.position.set(-0.06, 0.82, 0);
      leafL.rotation.z = 0.35;
      const leafR = leafL.clone();
      leafR.position.x = 0.06;
      leafR.rotation.z = -0.35;

      // Big expressive Ghibli soot-sprite eyes!
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111118 });
      for (const sx of [-1, 1]) {
        const ew = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), whiteMat);
        ew.scale.set(1, 1, 0.45);
        ew.position.set(sx * 0.11, 0.41, 0.31);
        const ep = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), pupilMat);
        ep.position.set(sx * 0.10, 0.41, 0.355);
        bodyGroup.add(ew, ep);
      }

      bodyGroup.add(core, stem, leafL, leafR);
      parts = { bodyMat, core };
    } else if (kind === 'acorn_imp') {
      maxHp = 4;
      radius = 0.50;
      height = 1.02;
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x8d623f,
        roughness: 0.78,
        emissive: new THREE.Color(0x000000),
      });
      const capMat = new THREE.MeshStandardMaterial({ color: 0x57351d, roughness: 0.82 });
      const shieldWoodMat = new THREE.MeshStandardMaterial({ color: 0xa67446, roughness: 0.75 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe45e });

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.56, 12), bodyMat);
      trunk.position.y = 0.34;
      trunk.castShadow = true;

      // Textured Acorn Cap Helmet!
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        capMat
      );
      cap.position.y = 0.56;
      cap.castShadow = true;
      const acornStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 7), capMat);
      acornStem.position.y = 0.96;
      acornStem.rotation.z = 0.18;

      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
        eye.position.set(sx * 0.095, 0.47, 0.245);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.20), capMat);
        foot.position.set(sx * 0.13, 0.06, 0.04);
        bodyGroup.add(eye, foot);
      }

      // Little Round Bark Shield held in front!
      const barkShield = new THREE.Group();
      barkShield.position.set(0, 0.36, 0.33);
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 14), shieldWoodMat);
      disk.rotation.x = Math.PI / 2;
      disk.castShadow = true;
      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xd9b45b, metalness: 0.4, roughness: 0.4 })
      );
      boss.position.z = 0.03;
      barkShield.add(disk, boss);

      bodyGroup.add(trunk, cap, acornStem, barkShield);
      parts = { bodyMat, barkShield };
    } else {
      // 'star_turret': Ancient Clockwork Owl/Zonai Star-Orb Construct!
      maxHp = 5;
      radius = 0.62;
      height = 1.55;
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x566866,
        roughness: 0.62,
        metalness: 0.22,
        emissive: new THREE.Color(0x000000),
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xefd070,
        metalness: 0.55,
        roughness: 0.30,
      });
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x4df7e0 });

      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.46, 10), bodyMat);
      ped.position.y = 0.23;
      ped.castShadow = true;

      const midRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 24), goldMat);
      midRing.rotation.x = Math.PI / 2;
      midRing.position.y = 0.54;

      const headPivot = new THREE.Group();
      headPivot.position.y = 0.96;

      const turretHead = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.62, 12), bodyMat);
      turretHead.castShadow = true;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 8), goldMat);
      crown.position.y = 0.42;

      const eyeBezel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 20), goldMat);
      eyeBezel.position.set(0, 0.04, 0.33);
      const eyeLens = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), lensMat);
      eyeLens.position.set(0, 0.04, 0.32);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.50, 0.022, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x62ffda })
      );
      halo.position.y = 0.45;

      headPivot.add(turretHead, crown, eyeBezel, eyeLens, halo);
      bodyGroup.add(ped, midRing, headPivot);
      parts = { bodyMat, headPivot, lensMat, halo };
    }

    // Dainty Floating HP Bar Sprite (only visible once engaged or hurt)
    const hpSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createHpBarTexture(1.0, false),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    hpSprite.position.set(0, height + 0.38, 0);
    hpSprite.scale.set(0.75, 0.17, 1);
    root.add(hpSprite);

    // Subtle Stun Stars Ring above dizzy monsters
    const stunRing = new THREE.Group();
    stunRing.position.set(0, height + 0.18, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe869 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), starMat);
      st.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
      stunRing.add(st);
    }
    stunRing.visible = false;
    root.add(stunRing);

    this.group.add(root);

    const monster = {
      kind,
      root,
      bodyGroup,
      parts,
      hpSprite,
      stunRing,
      homePos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: seed * 1.7,
      hp: maxHp,
      maxHp,
      radius,
      height,
      alive: true,
      respawnTimer: 0,
      stunTimer: 0,
      hitFlashTimer: 0,
      invulnTimer: 0,
      attackTimer: 1.5 + (seed % 3) * 0.7,
      phase: seed * 2.1,
    };

    this.monsters.push(monster);
    return monster;
  }

  _refreshMonsterHpBar(m) {
    if (m.hpSprite.material.map) m.hpSprite.material.map.dispose();
    m.hpSprite.material.map = createHpBarTexture(m.hp / m.maxHp, m.stunTimer > 0);
    m.hpSprite.material.needsUpdate = true;
  }

  _spawnOrb(origin, dir, sourceMonster) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x5bf5ff });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), mat);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe478,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.20, 0.28, 20), ringMat);
    core.add(ring);
    core.position.copy(origin);
    this.group.add(core);

    this.orbs.push({
      mesh: core,
      mat,
      ring,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(6.0),
      reflected: false,
      sourceMonster,
      age: 0,
      maxAge: 4.5,
    });

    this.sound?.bowRelease();
  }

  _spawnLootDrop(pos) {
    const isFish = Math.random() < 0.55;
    const g = new THREE.Group();
    g.position.set(pos.x, pos.y + 0.35, pos.z);

    if (isFish) {
      // Cute Golden-Silver Dried Fish Treat ("小鱼干") for the cats!
      const fishMat = new THREE.MeshStandardMaterial({
        color: 0xf4c76b,
        emissive: new THREE.Color(0xbf8426),
        emissiveIntensity: 0.35,
        roughness: 0.45,
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), fishMat);
      body.scale.set(1.65, 0.65, 0.42);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.11, 4), fishMat);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.19;
      g.add(body, tail);
    } else {
      // Luminous Starlight Petal ("星光花瓣")
      const starMat = new THREE.MeshBasicMaterial({ color: 0x88f7ff });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), starMat);
      g.add(gem);
    }

    this.group.add(g);
    const angle = Math.random() * Math.PI * 2;
    this.drops.push({
      kind: isFish ? 'fish' : 'petal',
      mesh: g,
      pos: g.position.clone(),
      vel: new THREE.Vector3(Math.cos(angle) * 1.4, 3.2, Math.sin(angle) * 1.4),
      age: 0,
    });
  }

  damageMonster(m, dmg, knockDir, { heavy = false } = {}) {
    if (!m.alive || m.invulnTimer > 0) return false;

    // Acorn Imp frontal bark-shield block unless heavy attack or already dizzy!
    if (m.kind === 'acorn_imp' && m.stunTimer <= 0 && !heavy) {
      m.vel.set(knockDir.x * 3.2, 1.2, knockDir.z * 3.2);
      m.invulnTimer = 0.20;
      this.sound?.shieldRaise();
      this.fx?.spawnSparks(
        new THREE.Vector3(m.pos.x, m.pos.y + 0.5, m.pos.z),
        '#ffe082',
        10
      );
      return 'blocked';
    }

    if (m.kind === 'acorn_imp' && heavy && m.stunTimer <= 0) {
      m.stunTimer = 3.2;
    }

    const crit = m.stunTimer > 0 || heavy;
    m.hp -= dmg;
    m.hitFlashTimer = 0.16;
    m.invulnTimer = 0.22;

    if (m.kind !== 'star_turret') {
      m.vel.set(knockDir.x * (heavy ? 5.8 : 3.8), heavy ? 3.2 : 1.8, knockDir.z * (heavy ? 5.8 : 3.8));
    }

    this.sound?.swordHit(crit);
    const fxOrigin = new THREE.Vector3(m.pos.x, m.pos.y + m.height * 0.55, m.pos.z);
    this.fx?.spawnSparks(fxOrigin, crit ? '#ffe86b' : '#8cf4ff', crit ? 16 : 10);

    if (m.hp <= 0) {
      m.alive = false;
      m.root.visible = false;
      m.respawnTimer = 32.0;
      this.defeatedCount++;
      this.fx?.spawnShockwave(fxOrigin, {
        color: '#ffe680',
        startScale: 0.25,
        endScale: 1.95,
        duration: 0.34,
      });
      this._spawnLootDrop(m.pos);
    } else {
      this._refreshMonsterHpBar(m);
    }

    return 'hit';
  }

  // Called during active player sword swings & spin attacks!
  checkPlayerSwordHits(playerPos, charYaw, combatState) {
    if (
      combatState !== 'slash1' &&
      combatState !== 'slash2' &&
      combatState !== 'slash3' &&
      combatState !== 'spin_attack' &&
      combatState !== 'jump_slash'
    ) {
      return;
    }

    const isSpin = combatState === 'spin_attack';
    const isHeavy = isSpin || combatState === 'slash3' || combatState === 'jump_slash';
    const reach = isSpin ? 3.25 : combatState === 'slash3' ? 2.65 : 2.35;
    const dmg = isSpin ? 2 : combatState === 'slash3' || combatState === 'jump_slash' ? 2 : 1;
    const fwdX = Math.sin(charYaw);
    const fwdZ = Math.cos(charYaw);

    for (const m of this.monsters) {
      if (!m.alive || m.invulnTimer > 0) continue;
      const dx = m.pos.x - playerPos.x;
      const dz = m.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + m.radius) continue;
      if (Math.abs(m.pos.y - playerPos.y) > 2.0) continue;

      if (!isSpin && dist > 0.25) {
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        if (dot < -0.15) continue;
      }

      const kDir =
        dist > 0.05
          ? new THREE.Vector3(dx / dist, 0, dz / dist)
          : new THREE.Vector3(fwdX, 0, fwdZ);
      this.damageMonster(m, dmg, kDir, { heavy: isHeavy });
    }
  }

  // Called when Dengdeng executes Shield Parry (`E` / `L`)!
  handlePlayerParry(playerPos, charYaw) {
    const fwdX = Math.sin(charYaw);
    const fwdZ = Math.cos(charYaw);
    let parriedAnything = false;

    // 1. Deflect incoming Star Energy Orbs straight back at 2.8x speed!
    for (const orb of this.orbs) {
      if (orb.reflected) continue;
      const dx = orb.pos.x - playerPos.x;
      const dz = orb.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4.25) {
        orb.reflected = true;
        orb.age = 0;
        orb.mat.color.setHex(0xffe96b);
        orb.mesh.scale.setScalar(1.38);
        if (orb.sourceMonster && orb.sourceMonster.alive) {
          const toSrc = new THREE.Vector3(
            orb.sourceMonster.pos.x - orb.pos.x,
            orb.sourceMonster.pos.y + 1.0 - orb.pos.y,
            orb.sourceMonster.pos.z - orb.pos.z
          ).normalize();
          orb.vel.copy(toSrc).multiplyScalar(17.5);
        } else {
          orb.vel.set(fwdX * 17.5, 0.2, fwdZ * 17.5);
        }
        parriedAnything = true;
      }
    }

    // 2. Flip nearby melee monsters dizzy onto their backs!
    for (const m of this.monsters) {
      if (!m.alive || m.kind === 'star_turret') continue;
      const dx = m.pos.x - playerPos.x;
      const dz = m.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.65) {
        m.stunTimer = 3.5;
        const inv = dist > 0.05 ? 1 / dist : 1;
        m.vel.set(dx * inv * 4.5, 2.4, dz * inv * 4.5);
        this._refreshMonsterHpBar(m);
        parriedAnything = true;
      }
    }

    return parriedAnything;
  }

  update(dt, playerPos, charYaw, dengdeng, family, playerVelXZ) {
    const time = performance.now() * 0.001;

    // Active sword hit check during strike frames
    if (
      (dengdeng.combatState === 'slash1' && dengdeng.combatTime >= 0.08 && dengdeng.combatTime <= 0.28) ||
      (dengdeng.combatState === 'slash2' && dengdeng.combatTime >= 0.07 && dengdeng.combatTime <= 0.28) ||
      (dengdeng.combatState === 'slash3' && dengdeng.combatTime >= 0.16 && dengdeng.combatTime <= 0.42) ||
      (dengdeng.combatState === 'spin_attack' && dengdeng.combatTime >= 0.04 && dengdeng.combatTime <= 0.52) ||
      (dengdeng.combatState === 'jump_slash' && dengdeng.combatTime >= 0.10)
    ) {
      this.checkPlayerSwordHits(playerPos, charYaw, dengdeng.combatState);
    }

    // Generous active parry window while Dengdeng is mid-parry sweep!
    if (dengdeng.combatState === 'shield_parry' && dengdeng.combatTime <= 0.28) {
      this.handlePlayerParry(playerPos, charYaw);
    }

    // Maine Coon Cat ("大福") Brave Pounce Assist!
    const maine = family?.maineCoon;
    if (maine && family.catsFollowing) {
      if (maine.pounceCooldown > 0) maine.pounceCooldown -= dt;
      if (maine.pounceCooldown <= 0 && maine.petTimer <= 0) {
        const targetM = this.monsters.find(
          (m) => m.alive && m.stunTimer <= 0 && m.pos.distanceTo(playerPos) < 5.5 && m.kind !== 'star_turret'
        );
        if (targetM) {
          maine.pounceCooldown = 6.5;
          maine.hopVelY = 3.8;
          maine.pos.lerp(targetM.pos, 0.55);
          targetM.stunTimer = 2.2;
          this.damageMonster(
            targetM,
            1,
            new THREE.Vector3(targetM.pos.x - maine.pos.x, 0, targetM.pos.z - maine.pos.z).normalize(),
            { heavy: true }
          );
          this.sound?.catPurr('maine');
        }
      }
    }

    // 1. Update Monsters
    for (const m of this.monsters) {
      if (!m.alive) {
        m.respawnTimer -= dt;
        if (m.respawnTimer <= 0 && m.homePos.distanceTo(playerPos) > 12.0) {
          m.alive = true;
          m.hp = m.maxHp;
          m.stunTimer = 0;
          m.pos.copy(m.homePos);
          m.vel.set(0, 0, 0);
          m.root.position.copy(m.pos);
          m.root.visible = true;
          this._refreshMonsterHpBar(m);
        }
        continue;
      }

      if (m.invulnTimer > 0) m.invulnTimer = Math.max(0, m.invulnTimer - dt);
      if (m.hitFlashTimer > 0) {
        m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt);
        m.parts.bodyMat?.emissive.setHex(m.hitFlashTimer > 0 ? 0xffffff : 0x000000);
        if (m.parts.bodyMat) m.parts.bodyMat.emissiveIntensity = m.hitFlashTimer > 0 ? 0.85 : 0.15;
      }

      const dx = playerPos.x - m.pos.x;
      const dz = playerPos.z - m.pos.z;
      const dist = Math.hypot(dx, dz);

      if (m.stunTimer > 0) {
        m.stunTimer = Math.max(0, m.stunTimer - dt);
        m.stunRing.visible = true;
        m.stunRing.rotation.y += dt * 5.5;
        m.bodyGroup.rotation.z = THREE.MathUtils.lerp(
          m.bodyGroup.rotation.z,
          m.kind === 'acorn_imp' ? 1.35 : 0.35 * Math.sin(time * 8),
          Math.min(1, dt * 10)
        );
        if (m.stunTimer === 0) {
          m.stunRing.visible = false;
          this._refreshMonsterHpBar(m);
        }
      } else {
        m.stunRing.visible = false;
        m.bodyGroup.rotation.z = THREE.MathUtils.lerp(m.bodyGroup.rotation.z, 0, Math.min(1, dt * 10));

        // Monster-specific AI
        if (m.kind === 'soot_puff' || m.kind === 'acorn_imp') {
          const homeDist = Math.hypot(m.pos.x - m.homePos.x, m.pos.z - m.homePos.z);
          if (dist < 8.5 && homeDist < 16.0) {
            const wantYaw = Math.atan2(dx, dz);
            m.yaw = wantYaw;
            m.attackTimer -= dt;
            if (dist > 1.35) {
              const spd = m.kind === 'soot_puff' ? 1.85 : 1.45;
              m.pos.x += (dx / dist) * spd * dt;
              m.pos.z += (dz / dist) * spd * dt;
            }
            // Playful lunge hop!
            if (m.attackTimer <= 0 && dist < 2.6) {
              m.attackTimer = 2.3;
              m.vel.set((dx / (dist || 1)) * 4.2, 2.8, (dz / (dist || 1)) * 4.2);
            }
          } else {
            // Gentle idle patrol around homePos
            const tx = m.homePos.x + Math.sin(time * 0.7 + m.phase) * 2.2;
            const tz = m.homePos.z + Math.cos(time * 0.6 + m.phase) * 2.2;
            const hx = tx - m.pos.x;
            const hz = tz - m.pos.z;
            const hd = Math.hypot(hx, hz);
            if (hd > 0.2) {
              m.pos.x += (hx / hd) * 0.9 * dt;
              m.pos.z += (hz / hd) * 0.9 * dt;
              m.yaw = Math.atan2(hx, hz);
            }
          }

          if (m.kind === 'soot_puff') {
            const squash = 1.0 + Math.sin(time * 6.5 + m.phase) * 0.10;
            m.bodyGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
          } else if (m.parts.barkShield) {
            m.parts.barkShield.position.y = 0.36 + Math.sin(time * 4.5 + m.phase) * 0.03;
          }

          // Melee bump check against Dengdeng
          if (dist < m.radius + 0.45 && Math.abs(playerPos.y - m.pos.y) < 1.2 && m.vel.lengthSq() > 2.5) {
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            if (dengdeng.shieldHolding) {
              // Blocked cleanly by Hylian Shield!
              m.vel.set(-nx * 4.2, 2.0, -nz * 4.2);
              m.stunTimer = 2.0;
              this._refreshMonsterHpBar(m);
              this.sound?.shieldRaise();
              this.fx?.spawnSparks(
                new THREE.Vector3(playerPos.x - nx * 0.4, playerPos.y + 1.0, playerPos.z - nz * 0.4),
                '#8cf6ff',
                10
              );
            } else if (playerVelXZ) {
              playerVelXZ.x += nx * 3.8;
              playerVelXZ.y += nz * 3.8;
              m.vel.set(-nx * 2.8, 1.5, -nz * 2.8);
            }
          }
        } else if (m.kind === 'star_turret') {
          if (m.parts.halo) {
            m.parts.halo.rotation.z += dt * 1.4;
            m.parts.halo.rotation.x = Math.sin(time * 1.5) * 0.35;
          }
          if (dist < 17.5 && Math.abs(playerPos.y - m.pos.y) < 5.5) {
            const aimYaw = Math.atan2(dx, dz);
            m.parts.headPivot.rotation.y = aimYaw - m.yaw;
            m.attackTimer -= dt;
            if (m.attackTimer < 0.75) {
              // Telegraph golden-coral eye flash right before firing!
              m.parts.lensMat.color.setHex(Math.sin(time * 28) > 0 ? 0xff785a : 0xffe869);
            } else {
              m.parts.lensMat.color.setHex(0x4df7e0);
            }
            if (m.attackTimer <= 0) {
              m.attackTimer = 3.3;
              const muzzle = new THREE.Vector3(
                m.pos.x + Math.sin(aimYaw) * 0.52,
                m.pos.y + 1.02,
                m.pos.z + Math.cos(aimYaw) * 0.52
              );
              const dir = new THREE.Vector3(
                playerPos.x - muzzle.x,
                playerPos.y + 1.05 - muzzle.y,
                playerPos.z - muzzle.z
              ).normalize();
              this._spawnOrb(muzzle, dir, m);
            }
          } else {
            m.parts.lensMat.color.setHex(0x4df7e0);
            m.parts.headPivot.rotation.y += dt * 0.45;
          }
        }
      }

      // Physics integration & terrain clamp for monsters
      if (m.vel.lengthSq() > 0.001 || m.pos.y > this.world.getWalkHeight(m.pos.x, m.pos.z) + 0.02) {
        m.vel.y -= 14.5 * dt;
        m.pos.x += m.vel.x * dt;
        m.pos.y += m.vel.y * dt;
        m.pos.z += m.vel.z * dt;
        m.vel.x *= Math.max(0, 1 - dt * 4.5);
        m.vel.z *= Math.max(0, 1 - dt * 4.5);
        this.world.resolveCollisions(m.pos, m.radius);
      }
      const gy = this.world.getWalkHeight(m.pos.x, m.pos.z);
      if (m.pos.y <= gy) {
        m.pos.y = gy;
        if (m.vel.y < 0) m.vel.y = 0;
      }

      m.root.position.copy(m.pos);
      m.root.rotation.y = m.yaw;

      const showHp = (m.hp < m.maxHp || m.stunTimer > 0 || dist < 9.5) && dist < 16.0;
      m.hpSprite.material.opacity = THREE.MathUtils.lerp(
        m.hpSprite.material.opacity,
        showHp ? 0.92 : 0.0,
        Math.min(1, dt * 8)
      );
    }

    // 2. Update Star Energy Orbs (Enemy Projectiles & Player Parry-Reflected Lasers!)
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.age += dt;
      orb.pos.addScaledVector(orb.vel, dt);
      orb.mesh.position.copy(orb.pos);
      orb.ring.lookAt(this.scene.position);

      let remove = orb.age >= orb.maxAge;

      if (!remove && orb.reflected) {
        // Check puzzle prism targets first (hook for Commit #4!)
        if (this.onReflectedOrbUpdate && this.onReflectedOrbUpdate(orb.pos)) {
          remove = true;
        }
        // Check hit against any monster!
        for (const m of this.monsters) {
          if (!m.alive) continue;
          if (orb.pos.distanceTo(new THREE.Vector3(m.pos.x, m.pos.y + m.height * 0.55, m.pos.z)) < m.radius + 0.55) {
            this.damageMonster(m, 3, orb.vel.clone().normalize(), { heavy: true });
            this.fx?.spawnShockwave(orb.pos, {
              color: '#ffe66d',
              startScale: 0.25,
              endScale: 2.2,
              duration: 0.35,
            });
            remove = true;
            break;
          }
        }
      } else if (!remove) {
        // Incoming orb vs Dengdeng!
        const dPlayer = Math.hypot(orb.pos.x - playerPos.x, orb.pos.z - playerPos.z);
        if (dPlayer < 0.68 && Math.abs(orb.pos.y - (playerPos.y + 1.0)) < 0.85) {
          if (dengdeng.combatState === 'shield_parry') {
            this.handlePlayerParry(playerPos, charYaw);
          } else if (dengdeng.shieldHolding) {
            this.sound?.shieldRaise();
            this.fx?.spawnSparks(orb.pos, '#7cf4ff', 14);
            remove = true;
          } else {
            if (playerVelXZ) {
              const dir = orb.vel.clone().normalize();
              playerVelXZ.x += dir.x * 3.6;
              playerVelXZ.y += dir.z * 3.6;
            }
            this.fx?.spawnSparks(orb.pos, '#ff8e72', 12);
            this.sound?.swordHit(false);
            remove = true;
          }
        }
      }

      if (!remove && orb.pos.y < this.world.getTerrainHeight(orb.pos.x, orb.pos.z)) {
        this.fx?.spawnSparks(orb.pos, '#7cf4ff', 8);
        remove = true;
      }

      if (remove) {
        this.group.remove(orb.mesh);
        this.orbs.splice(i, 1);
      }
    }

    // 3. Update Collectible Loot Drops ("小鱼干" & "星光花瓣")
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const gy = this.world.getWalkHeight(d.pos.x, d.pos.z) + 0.22;
      if (d.pos.y > gy || d.vel.y > 0) {
        d.vel.y -= 9.8 * dt;
        d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y <= gy) {
          d.pos.y = gy;
          d.vel.set(0, 0, 0);
        }
      } else {
        d.pos.y = gy + Math.sin(time * 3.5 + i) * 0.06;
      }

      // Smooth magnetic pickup when Dengdeng walks near!
      const toP = new THREE.Vector3(
        playerPos.x - d.pos.x,
        playerPos.y + 0.85 - d.pos.y,
        playerPos.z - d.pos.z
      );
      const dist = toP.length();
      if (dist < 3.2 && d.age > 0.35) {
        d.pos.addScaledVector(toP.normalize(), dt * 8.5);
      }

      d.mesh.position.copy(d.pos);
      d.mesh.rotation.y += dt * 2.6;

      if (dist < 0.55 && d.age > 0.35) {
        if (d.kind === 'fish') this.fishTreats++;
        else this.starPetals++;
        this.sound?.pickup();
        this.fx?.spawnSparks(d.pos, '#ffe97d', 8);
        this.group.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
  }
}
