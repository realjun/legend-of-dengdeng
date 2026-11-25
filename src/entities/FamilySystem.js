import * as THREE from 'three';

function createHeartSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 54);
  ctx.bezierCurveTo(10, 38, 6, 20, 18, 12);
  ctx.bezierCurveTo(26, 7, 32, 14, 32, 20);
  ctx.bezierCurveTo(32, 14, 38, 7, 46, 12);
  ctx.bezierCurveTo(58, 20, 54, 38, 32, 54);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLabelTexture(text, subText = '', accent = '#ffe39e') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 80);

  // Soft pill backdrop
  ctx.fillStyle = 'rgba(14, 22, 34, 0.56)';
  ctx.beginPath();
  ctx.roundRect(18, 12, 220, subText ? 56 : 42, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 232, 182, 0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '600 22px "Noto Serif SC", Georgia, serif';
  ctx.fillText(text, 128, subText ? 38 : 40);

  if (subText) {
    ctx.fillStyle = 'rgba(255, 248, 234, 0.85)';
    ctx.font = '14px "Noto Serif SC", sans-serif';
    ctx.fillText(subText, 128, 58);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FamilySystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.cottagePos = new THREE.Vector3(34.0, this.world.getTerrainHeight(34.0, 26.0), 26.0);
    this.campfirePos = new THREE.Vector3(29.2, this.world.getTerrainHeight(29.2, 24.4), 24.4);

    this.catsFollowing = true;
    this.cookingBuffTimer = 0;
    this.husbandTalkIndex = 0;
    this.secretTargets = []; // Populated by Maze/Puzzle systems: { x, z, isSolved: () => bool }

    this._heartTex = createHeartSpriteTexture();
    this.floatingHearts = [];
    this.smokePuffs = [];

    this._buildStarlightCottage();
    this._buildCampfireKitchen();
    this._buildHusbandCharacter();
    this.russianBlue = this._buildCat('russian');
    this.maineCoon = this._buildCat('maine');
  }

  registerSecretTarget(target) {
    this.secretTargets.push(target);
  }

  _buildStarlightCottage() {
    const cx = this.cottagePos.x;
    const cz = this.cottagePos.z;
    const cy = this.cottagePos.y;

    const cottage = new THREE.Group();
    cottage.position.set(cx, cy, cz);
    // Face West-North-West toward Awakening Trail & Mirror Lake
    cottage.rotation.y = -Math.PI * 0.66;

    const plasterMat = new THREE.MeshStandardMaterial({ color: 0xf7efe0, roughness: 0.84 });
    const timberMat = new THREE.MeshStandardMaterial({ color: 0x5f3e26, roughness: 0.86 });
    const stonePlinthMat = new THREE.MeshStandardMaterial({ color: 0x878379, roughness: 0.90 });
    const roofTileMat = new THREE.MeshStandardMaterial({ color: 0xb8584e, roughness: 0.72 });
    const warmWindowMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: new THREE.Color(0xffb44c),
      emissiveIntensity: 1.35,
      roughness: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf2cf72,
      metalness: 0.5,
      roughness: 0.32,
    });

    // Stone Plinth & Porch Deck
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.48, 4.4), stonePlinthMat);
    plinth.position.y = 0.22;
    plinth.castShadow = true;
    plinth.receiveShadow = true;

    const porch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 1.45), timberMat);
    porch.position.set(0, 0.13, 2.75);
    porch.receiveShadow = true;

    // Main Cream Plaster Walls
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.75, 4.0), plasterMat);
    walls.position.y = 1.82;
    walls.castShadow = true;
    walls.receiveShadow = true;

    // Half-Timber Framing Columns & Crossbeams
    for (const sx of [-2.38, 2.38]) {
      for (const sz of [-1.98, 1.98]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.8, 0.18), timberMat);
        post.position.set(sx, 1.82, sz);
        cottage.add(post);
      }
    }
    const midBeamF = new THREE.Mesh(new THREE.BoxGeometry(4.92, 0.14, 0.12), timberMat);
    midBeamF.position.set(0, 3.15, 1.99);
    const midBeamB = midBeamF.clone();
    midBeamB.position.z = -1.99;
    cottage.add(midBeamF, midBeamB);

    // Pitched Ghibli Gabled Roof (extruded prism + overhanging eaves)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-2.85, 0);
    roofShape.lineTo(0, 1.95);
    roofShape.lineTo(2.85, 0);
    roofShape.closePath();

    const gableWallShape = new THREE.Shape();
    gableWallShape.moveTo(-2.4, 0);
    gableWallShape.lineTo(0, 1.65);
    gableWallShape.lineTo(2.4, 0);
    gableWallShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableWallShape, { depth: 4.0, bevelEnabled: false });
    gableGeo.translate(0, 3.18, -2.0);
    const gableMesh = new THREE.Mesh(gableGeo, plasterMat);
    gableMesh.castShadow = true;

    // Two sloped roof slabs for crisp eaves & underside shadows
    const slopeLen = Math.hypot(2.95, 1.98);
    const slopeAngle = Math.atan2(1.98, 2.95);
    const roofSlabGeo = new THREE.BoxGeometry(slopeLen, 0.16, 4.75);
    const roofL = new THREE.Mesh(roofSlabGeo, roofTileMat);
    roofL.position.set(-1.38, 4.08, 0);
    roofL.rotation.z = slopeAngle;
    roofL.castShadow = true;
    roofL.receiveShadow = true;

    const roofR = new THREE.Mesh(roofSlabGeo, roofTileMat);
    roofR.position.set(1.38, 4.08, 0);
    roofR.rotation.z = -slopeAngle;
    roofR.castShadow = true;
    roofR.receiveShadow = true;

    const ridgeBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.85, 10), timberMat);
    ridgeBeam.rotation.x = Math.PI / 2;
    ridgeBeam.position.set(0, 5.02, 0);

    // Arched Oak Door + Golden Heart Emblem
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.92, 0.14), timberMat);
    doorFrame.position.set(0, 1.38, 2.01);
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 1.78, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x875432, roughness: 0.78 })
    );
    doorPanel.position.set(0, 1.35, 2.02);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), goldMat);
    knob.position.set(0.32, 1.30, 2.12);

    // Warm Glowing Windows + Flower Boxes!
    const buildWindow = (wx, wy, wz, rotY = 0) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      wg.rotation.y = rotY;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, 0.12), timberMat);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), warmWindowMat);
      pane.position.z = 0.065;
      const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.82, 0.04), timberMat);
      mullionV.position.z = 0.07;
      const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.04), timberMat);
      mullionH.position.z = 0.07;
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.20, 0.26), timberMat);
      box.position.set(0, -0.54, 0.12);
      wg.add(frame, pane, mullionV, mullionH, box);

      const flowerColors = [0xff8eb5, 0xffdf6e, 0xa8ecff];
      for (let f = -1; f <= 1; f++) {
        const bloom = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.11, 0),
          new THREE.MeshStandardMaterial({ color: flowerColors[f + 1], roughness: 0.7 })
        );
        bloom.position.set(f * 0.28, -0.40, 0.14);
        wg.add(bloom);
      }
      cottage.add(wg);
    };

    buildWindow(-1.48, 1.88, 2.0);
    buildWindow(1.48, 1.88, 2.0);
    buildWindow(2.40, 1.88, 0, Math.PI / 2);
    buildWindow(-2.40, 1.88, 0, -Math.PI / 2);

    // Cozy Stone Chimney + Rising Hearth Smoke Anchor
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.72, 3.6, 0.72), stonePlinthMat);
    chimney.position.set(-2.15, 3.45, -0.85);
    chimney.castShadow = true;
    const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.18, 0.88), stonePlinthMat);
    chimneyCap.position.set(-2.15, 5.28, -0.85);

    this.chimneyTopNode = new THREE.Object3D();
    this.chimneyTopNode.position.set(-2.15, 5.45, -0.85);
    cottage.add(chimney, chimneyCap, this.chimneyTopNode);

    // Warm Porch Lantern & PointLight
    const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), warmWindowMat);
    porchBulb.position.set(0.82, 2.42, 2.25);
    this.porchLight = new THREE.PointLight(0xffbe6b, 2.2, 15, 1.6);
    this.porchLight.position.set(0.82, 2.35, 2.45);
    cottage.add(porchBulb, this.porchLight);

    cottage.add(plinth, porch, walls, gableMesh, roofL, roofR, ridgeBeam, doorFrame, doorPanel, knob);
    this.group.add(cottage);

    // Register solid circular collider for the cottage body so player & cats walk cleanly around it
    this.world.colliders.push({ x: cx, z: cz, r: 2.95 });

    // Stepping-Stone Garden Trail connecting Flagstone Road -> Campfire -> Cottage Porch
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xc2b9a5, roughness: 0.9 });
    const steps = 11;
    const roadX = this.world.getRoadX(23.5);
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const sx = THREE.MathUtils.lerp(roadX + 1.6, this.campfirePos.x + 1.2, t);
      const sz = THREE.MathUtils.lerp(23.5, this.campfirePos.z + 0.6, t) + Math.sin(t * Math.PI) * 1.1;
      const sy = this.world.getTerrainHeight(sx, sz);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 9), flagMat);
      stone.position.set(sx, sy + 0.02, sz);
      stone.rotation.y = i * 0.7;
      stone.scale.set(1.15, 1, 0.85);
      stone.receiveShadow = true;
      this.group.add(stone);
    }

    // Initialize gentle rising chimney smoke puffs
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xfffbf4,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const smokeGeo = new THREE.DodecahedronGeometry(0.22, 1);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
      m.visible = false;
      this.group.add(m);
      this.smokePuffs.push({ mesh: m, age: (i / 7) * 3.5, maxAge: 3.5 });
    }
  }

  _buildCampfireKitchen() {
    const fx = this.campfirePos.x;
    const fz = this.campfirePos.z;
    const fy = this.campfirePos.y;

    const camp = new THREE.Group();
    camp.position.set(fx, fy, fz);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x76726a, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.88 });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x2c3038,
      metalness: 0.55,
      roughness: 0.45,
    });
    const soupMat = new THREE.MeshStandardMaterial({
      color: 0xf7d888,
      emissive: new THREE.Color(0xe89b38),
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });

    // Ring of hearth stones
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stoneMat);
      st.position.set(Math.cos(a) * 0.56, 0.08, Math.sin(a) * 0.56);
      st.scale.set(1.2, 0.7, 1.0);
      camp.add(st);
    }

    // Glowing Fire Core
    this.fireCoreMat = new THREE.MeshBasicMaterial({ color: 0xff8c2b });
    this.fireInnerMat = new THREE.MeshBasicMaterial({ color: 0xffe875 });
    this.fireOuter = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.58, 7), this.fireCoreMat);
    this.fireOuter.position.y = 0.28;
    this.fireInner = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.42, 6), this.fireInnerMat);
    this.fireInner.position.y = 0.25;
    camp.add(this.fireOuter, this.fireInner);

    // Tripod & Cast-Iron Love Cooking Pot
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.35;
      const legHolder = new THREE.Group();
      legHolder.rotation.y = a;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 1.56, 8), woodMat);
      pole.position.set(0.28, 0.74, 0);
      pole.rotation.z = 0.34;
      legHolder.add(pole);
      camp.add(legHolder);
    }

    const pot = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75),
      ironMat
    );
    pot.position.y = 0.66;
    pot.castShadow = true;
    const soupTop = new THREE.Mesh(new THREE.CircleGeometry(0.29, 16), soupMat);
    soupTop.rotation.x = -Math.PI / 2;
    soupTop.position.y = 0.76;
    camp.add(pot, soupTop);

    // Cozy Wooden Log Bench beside the fire!
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.65, 12), woodMat);
    bench.rotation.z = Math.PI / 2;
    bench.rotation.y = 0.42;
    bench.position.set(-1.35, 0.20, 0.85);
    bench.castShadow = true;
    camp.add(bench);

    this.fireLight = new THREE.PointLight(0xff9436, 1.8, 11, 1.6);
    this.fireLight.position.set(0, 0.65, 0);
    camp.add(this.fireLight);

    this.group.add(camp);
    this.world.colliders.push({ x: fx, z: fz, r: 0.72 });
  }

  _buildHusbandCharacter() {
    // Expressive Studio Ghibli / Anime Toon Husband Character ("老公") tending the cottage campfire
    const hx = this.campfirePos.x + 1.15;
    const hz = this.campfirePos.z + 0.78;
    const hy = this.world.getTerrainHeight(hx, hz);

    const root = new THREE.Group();
    root.position.set(hx, hy, hz);
    root.rotation.y = -0.75;

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbe0ce, roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x241d1b, roughness: 0.58 });
    const tunicMat = new THREE.MeshStandardMaterial({ color: 0x2f6859, roughness: 0.70 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xece3d0, roughness: 0.75 });
    const apronMat = new THREE.MeshStandardMaterial({ color: 0xf9f3e6, roughness: 0.78 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xd14945, roughness: 0.66 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3d3630, roughness: 0.82 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x5c3822, roughness: 0.72 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf0cc6b, metalness: 0.45, roughness: 0.35 });

    // Legs & Traveler Boots
    for (const sx of [-0.105, 0.105]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.054, 0.74, 10), pantsMat);
      leg.position.set(sx, 0.46, 0);
      leg.castShadow = true;
      const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.14, 10), bootMat);
      bootCuff.position.set(sx, 0.18, 0);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.13, 0.22), bootMat);
      boot.position.set(sx, 0.065, 0.035);
      boot.castShadow = true;
      root.add(leg, bootCuff, boot);
    }

    // Tapered Tunic Jacket + Belt + Cozy Cream Half-Apron + Red Scarf
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.155, 0.60, 14), tunicMat);
    torso.scale.set(1.08, 1, 0.76);
    torso.position.y = 1.08;
    torso.castShadow = true;

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.055, 14), bootMat);
    belt.scale.set(1.09, 1, 0.78);
    belt.position.y = 0.86;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.025), goldMat);
    buckle.position.set(0, 0.86, 0.132);

    const apron = new THREE.Mesh(
      new THREE.CylinderGeometry(0.168, 0.185, 0.36, 12, 1, false, -1.0, 2.0),
      apronMat
    );
    apron.scale.set(1.09, 1, 0.80);
    apron.position.y = 0.72;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.065, 0.12, 10), skinMat);
    neck.position.y = 1.40;

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 12), collarMat);
    collar.position.y = 1.36;

    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.038, 8, 18), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.38;
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.25, 0.024), scarfMat);
    scarfTail.position.set(0.075, 1.25, 0.135);
    scarfTail.rotation.z = -0.18;

    // Anime Expressive Head + Eyes with Highlights + Gentle Smile + Layered Hair!
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.54;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.152, 18, 16), skinMat);
    head.scale.set(0.95, 1.03, 0.93);
    head.castShadow = true;

    // Hair crown & sideburns positioned cleanly above eyes!
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.164, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hairCrown.position.set(0, 0.032, -0.012);
    hairCrown.rotation.x = -0.28;

    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.160, 14, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.25, Math.PI * 0.55),
      hairMat
    );
    hairBack.rotation.y = -Math.PI / 2;
    hairBack.position.set(0, 0.01, -0.018);

    // Swept anime bangs leaving bright expressive eyes clearly visible!
    for (let i = -2; i <= 2; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.105, 6), hairMat);
      tuft.position.set(i * 0.042, 0.105, 0.122 - Math.abs(i) * 0.012);
      tuft.rotation.x = Math.PI * 0.92;
      tuft.rotation.z = i * 0.14 + 0.06;
      headGroup.add(tuft);
    }

    const scleraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x3b261d });
    const browMat = new THREE.MeshBasicMaterial({ color: 0x261d1a });
    const smileMat = new THREE.MeshBasicMaterial({ color: 0xc46e62 });

    const makeEye = (sx) => {
      const eg = new THREE.Group();
      eg.position.set(sx * 0.054, 0.004, 0.134);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 10), scleraMat);
      white.scale.set(1.05, 1.15, 0.35);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 10), irisMat);
      iris.scale.set(1.0, 1.18, 0.4);
      iris.position.z = 0.005;
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), scleraMat);
      glint.position.set(0.006, 0.007, 0.012);
      eg.add(white, iris, glint);
      return eg;
    };

    const eyeL = makeEye(1);
    const eyeR = makeEye(-1);

    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.008, 0.01), browMat);
      brow.position.set(sx * 0.054, 0.044, 0.136);
      brow.rotation.z = -sx * 0.08;
      const blush = new THREE.Mesh(
        new THREE.CircleGeometry(0.018, 10),
        new THREE.MeshBasicMaterial({ color: 0xf4a29d, transparent: true, opacity: 0.45 })
      );
      blush.position.set(sx * 0.078, -0.026, 0.132);
      blush.rotation.y = sx * 0.35;
      headGroup.add(brow, blush);
    }

    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.0045, 6, 12, Math.PI * 0.85),
      smileMat
    );
    smile.rotation.z = Math.PI * 1.08;
    smile.position.set(0, -0.036, 0.136);

    headGroup.add(head, hairCrown, hairBack, eyeL, eyeR, smile);

    // Articulated Left & Right Arms
    const armL = new THREE.Group();
    armL.position.set(0.22, 1.30, 0);
    const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.042, 0.44, 9), tunicMat);
    sleeveL.position.y = -0.20;
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), skinMat);
    handL.position.y = -0.43;
    armL.add(sleeveL, handL);
    armL.rotation.z = 0.20;
    armL.rotation.x = 0.24;

    const armR = new THREE.Group();
    armR.position.set(-0.22, 1.30, 0);
    const sleeveR = sleeveL.clone();
    const handR = handL.clone();
    const ladle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.32, 6),
      new THREE.MeshStandardMaterial({ color: 0x8c5a32, roughness: 0.8 })
    );
    ladle.rotation.x = Math.PI / 2;
    ladle.position.set(0, -0.44, 0.13);
    armR.add(sleeveR, handR, ladle);

    // Delicate Floating Nameplate Sprite
    const labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createLabelTexture('老公', '星光木屋 · 爱心主厨', '#ffe6a3'),
        transparent: true,
        depthWrite: false,
      })
    );
    labelSprite.position.set(0, 1.92, 0);
    labelSprite.scale.set(0.86, 0.27, 1);

    root.add(
      torso,
      belt,
      buckle,
      apron,
      neck,
      collar,
      scarf,
      scarfTail,
      headGroup,
      armL,
      armR,
      labelSprite
    );
    this.group.add(root);
    this.world.colliders.push({ x: hx, z: hz, r: 0.42 });

    this.husband = {
      root,
      pos: new THREE.Vector3(hx, hy, hz),
      baseYaw: -0.75,
      headGroup,
      armR,
      eyeL,
      eyeR,
      labelSprite,
      waveTimer: 0,
      greetCooldown: 0,
    };
  }

  _buildCat(breed) {
    const isMaine = breed === 'maine';
    const scale = isMaine ? 1.38 : 0.98;

    const root = new THREE.Group();
    const coatColor = isMaine ? 0x7c5336 : 0x62768c;
    const coatSheen = isMaine ? 0x9c6e49 : 0x859bb3;
    const bibColor = isMaine ? 0xf3e7d3 : 0x72879e;
    const eyeColor = isMaine ? 0xe8b838 : 0x29eb7d; // Amber-gold Maine Coon vs Vivid Emerald Russian Blue!

    const coatMat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: isMaine ? 0.82 : 0.56 });
    const sheenMat = new THREE.MeshStandardMaterial({ color: coatSheen, roughness: 0.62 });
    const bibMat = new THREE.MeshStandardMaterial({ color: bibColor, roughness: 0.85 });
    const earInnerMat = new THREE.MeshStandardMaterial({ color: 0xe2a2a8, roughness: 0.75 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111518 });

    const bodyPivot = new THREE.Group();
    bodyPivot.scale.setScalar(scale);
    root.add(bodyPivot);

    // Sculpted Feline Torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), coatMat);
    torso.scale.set(0.82, 0.86, 1.58);
    torso.position.set(0, 0.23, 0);
    torso.castShadow = true;
    bodyPivot.add(torso);

    if (isMaine) {
      // Magnificent Fluffy Lion-Mane Ruff around neck & chest!
      const mane = new THREE.Mesh(new THREE.DodecahedronGeometry(0.175, 1), bibMat);
      mane.scale.set(1.05, 1.08, 0.85);
      mane.position.set(0, 0.26, 0.16);
      mane.castShadow = true;
      const chestFluff = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 10), bibMat);
      chestFluff.position.set(0, 0.19, 0.22);
      bodyPivot.add(mane, chestFluff);
    }

    // Feline Head + Breed-Specific Ears & Muzzle
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.34, 0.24);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), coatMat);
    head.scale.set(isMaine ? 1.06 : 0.96, 0.94, 0.98);
    head.castShadow = true;

    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 10, 8),
      isMaine ? bibMat : sheenMat
    );
    muzzle.scale.set(isMaine ? 1.22 : 1.0, 0.78, 0.9);
    muzzle.position.set(0, -0.028, 0.105);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.016, 0.018, 3),
      new THREE.MeshBasicMaterial({ color: isMaine ? 0xd97b78 : 0x45505e })
    );
    nose.rotation.x = Math.PI;
    nose.position.set(0, -0.014, 0.145);

    // Expressive Feline Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 10), eyeMat);
    eyeL.scale.set(1.0, 1.05, 0.55);
    eyeL.position.set(0.050, 0.015, 0.105);
    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.028, 0.012), pupilMat);
    pupilL.position.set(0.050, 0.015, 0.116);

    const eyeR = eyeL.clone();
    eyeR.position.x = -0.050;
    const pupilR = pupilL.clone();
    pupilR.position.x = -0.050;

    // Pointed Ears (+ Tall Lynx Ear Tufts for Maine Coon!)
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.115, 4), coatMat);
      ear.position.set(s * 0.074, 0.115, 0.01);
      ear.rotation.z = -s * 0.24;
      ear.rotation.y = s * 0.35;

      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.075, 4), earInnerMat);
      inner.position.set(s * 0.074, 0.108, 0.024);
      inner.rotation.copy(ear.rotation);
      headGroup.add(ear, inner);

      if (isMaine) {
        const lynxTuft = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.068, 5), sheenMat);
        lynxTuft.position.set(s * 0.092, 0.182, 0.01);
        lynxTuft.rotation.z = -s * 0.28;
        headGroup.add(lynxTuft);
      }
    }

    headGroup.add(head, muzzle, nose, eyeL, pupilL, eyeR, pupilR);
    bodyPivot.add(headGroup);

    // 4 Articulated Legs
    const legs = [];
    const legCoords = [
      [-0.075, 0.15, 0.14],
      [0.075, 0.15, 0.14],
      [-0.080, 0.15, -0.14],
      [0.080, 0.15, -0.14],
    ];
    legCoords.forEach(([lx, ly, lz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(lx, ly, lz);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.16, 8), coatMat);
      limb.position.y = -0.07;
      const paw = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 8, 8),
        isMaine ? bibMat : sheenMat
      );
      paw.scale.set(1, 0.68, 1.25);
      paw.position.set(0, -0.145, 0.015);
      pivot.add(limb, paw);
      bodyPivot.add(pivot);
      legs.push(pivot);
    });

    // Tail: Sleek Tapering Curve for Russian Blue vs Magnificent Plumed Feather Tail for Maine Coon!
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.26, -0.22);
    if (isMaine) {
      for (let seg = 0; seg < 5; seg++) {
        const r = 0.055 + Math.sin((seg / 4) * Math.PI) * 0.038;
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), seg % 2 === 0 ? coatMat : sheenMat);
        puff.position.set(0, seg * 0.068 + 0.03, -seg * 0.062 - 0.03);
        puff.castShadow = true;
        tailPivot.add(puff);
      }
    } else {
      const tCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.06, -0.12),
        new THREE.Vector3(0, 0.19, -0.20),
        new THREE.Vector3(0, 0.30, -0.16),
      ]);
      const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tCurve, 12, 0.024, 8, false), coatMat);
      tailMesh.castShadow = true;
      tailPivot.add(tailMesh);
    }
    bodyPivot.add(tailPivot);

    // Floating Name + Curiosity Sprite
    const labelText = isMaine ? '缅因猫 · 大福' : '俄罗斯蓝猫 · 小蓝';
    const subLabel = isMaine ? '蓬松小狮王' : '翡翠绿眸寻宝喵';
    const nameSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createLabelTexture(labelText, subLabel, isMaine ? '#ffd98e' : '#9cf7c8'),
        transparent: true,
        depthWrite: false,
      })
    );
    nameSprite.position.set(0, isMaine ? 0.78 : 0.64, 0);
    nameSprite.scale.set(0.66, 0.20, 1);
    root.add(nameSprite);

    const startX = this.campfirePos.x + (isMaine ? -0.9 : 0.4);
    const startZ = this.campfirePos.z + (isMaine ? -0.8 : -1.1);
    const startY = this.world.getWalkHeight(startX, startZ);
    root.position.set(startX, startY, startZ);
    this.group.add(root);

    return {
      breed,
      name: isMaine ? '缅因猫·大福' : '俄罗斯蓝猫·小蓝',
      root,
      bodyPivot,
      headGroup,
      legs,
      tailPivot,
      nameSprite,
      pos: new THREE.Vector3(startX, startY, startZ),
      yaw: 0,
      gaitPhase: Math.random() * 6,
      petTimer: 0,
      hopVelY: 0,
      hopY: 0,
      pounceCooldown: 0,
      alertSecret: false,
    };
  }

  spawnFloatingHeart(worldPos, colorHex = '#ff85a8', count = 3) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this._heartTex,
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(
        worldPos.x + (Math.random() - 0.5) * 0.45,
        worldPos.y + 0.35 + Math.random() * 0.25,
        worldPos.z + (Math.random() - 0.5) * 0.45
      );
      const sc = 0.18 + Math.random() * 0.10;
      sp.scale.set(sc, sc, 1);
      this.group.add(sp);
      this.floatingHearts.push({
        sprite: sp,
        age: 0,
        maxAge: 1.35 + Math.random() * 0.4,
        vy: 0.65 + Math.random() * 0.35,
        phase: Math.random() * 6.28,
      });
    }
  }

  onPlayerSlash() {
    // Maine Coon gets excited and does a cute brave battle hop!
    if (this.maineCoon && this.maineCoon.hopY <= 0.01 && this.maineCoon.petTimer <= 0) {
      this.maineCoon.hopVelY = 2.6;
    }
  }

  getNearestInteraction(playerPos) {
    let best = null;
    let bestDist = 2.85;

    const dHusband = playerPos.distanceTo(this.husband.pos);
    if (dHusband < bestDist) {
      bestDist = dHusband;
      best = {
        type: 'husband',
        label: '[F] 与老公聊天 · 品尝爱心浓汤',
        dist: dHusband,
      };
    }

    for (const cat of [this.russianBlue, this.maineCoon]) {
      const dc = playerPos.distanceTo(cat.pos);
      if (dc < Math.min(bestDist, 2.35)) {
        bestDist = dc;
        best = {
          type: 'cat',
          cat,
          label: `[F] 撸${cat.name}`,
          dist: dc,
        };
      }
    }

    return best;
  }

  triggerInteraction(interaction, sound) {
    if (!interaction) return null;

    if (interaction.type === 'husband') {
      this.husband.waveTimer = 2.2;
      this.cookingBuffTimer = 90.0;
      this.spawnFloatingHeart(
        new THREE.Vector3(this.husband.pos.x, this.husband.pos.y + 1.65, this.husband.pos.z),
        '#ff7b9c',
        5
      );

      const lines = [
        {
          speaker: '老公 · 爱心料理出锅',
          text: '「登登快来尝一口！刚熬好的奶油松露浓汤，喝完浑身暖洋洋、挥剑都带星光～」',
          jingle: true,
        },
        {
          speaker: '老公',
          text: '「你看小蓝和大福多黏你，不管你去树篱迷宫还是蘑菇谷冒险，它们俩都寸步不离跟着你呢！」',
          jingle: false,
        },
        {
          speaker: '老公',
          text: '「累了就随时回我们的星光木屋歇脚，院子里的暖灯永远给你留着。」',
          jingle: false,
        },
      ];
      const chosen = lines[this.husbandTalkIndex % lines.length];
      this.husbandTalkIndex++;
      if (chosen.jingle) sound?.cookingJingle();
      else sound?.talkGreeting();

      return {
        speaker: chosen.speaker,
        text: chosen.text,
        buffGranted: true,
      };
    }

    if (interaction.type === 'cat') {
      const cat = interaction.cat;
      cat.petTimer = 2.6;
      sound?.catPurr(cat.breed);
      this.spawnFloatingHeart(
        new THREE.Vector3(cat.pos.x, cat.pos.y + 0.45, cat.pos.z),
        cat.breed === 'maine' ? '#ffc857' : '#6ef7b2',
        4
      );
      if (cat.breed === 'maine') {
        return {
          speaker: '缅因猫 · 大福',
          text: '「咕噜噜喵呜～！」大福豪迈地翻开毛茸茸的大肚皮向登登撒娇，大尾巴摇得像小扇子！',
        };
      }
      return {
        speaker: '俄罗斯蓝猫 · 小蓝',
        text: '「喵～呼噜噜…」小蓝眯起翡翠绿的大眼睛，温柔地用银蓝色的小脑袋蹭了蹭登登的手心。',
      };
    }

    return null;
  }

  teleportCompanionsNear(playerPos, charYaw) {
    if (!this.catsFollowing) return;
    const rightX = Math.cos(charYaw);
    const rightZ = -Math.sin(charYaw);
    const fwdX = Math.sin(charYaw);
    const fwdZ = Math.cos(charYaw);

    const rx = playerPos.x - rightX * 1.15 - fwdX * 0.6;
    const rz = playerPos.z - rightZ * 1.15 - fwdZ * 0.6;
    this.russianBlue.pos.set(rx, this.world.getWalkHeight(rx, rz, playerPos.y), rz);
    this.russianBlue.root.position.copy(this.russianBlue.pos);

    const mx = playerPos.x + rightX * 1.25 - fwdX * 0.6;
    const mz = playerPos.z + rightZ * 1.25 - fwdZ * 0.6;
    this.maineCoon.pos.set(mx, this.world.getWalkHeight(mx, mz, playerPos.y), mz);
    this.maineCoon.root.position.copy(this.maineCoon.pos);
  }

  _updateCat(cat, dt, playerPos, charYaw, time) {
    const isMaine = cat.breed === 'maine';
    const sideSign = isMaine ? 1 : -1;

    // Target formation spot beside Dengdeng (or near cottage campfire if staying home)
    let targetX;
    let targetZ;

    if (this.catsFollowing) {
      const rightX = Math.cos(charYaw);
      const rightZ = -Math.sin(charYaw);
      const fwdX = Math.sin(charYaw);
      const fwdZ = Math.cos(charYaw);
      targetX = playerPos.x + rightX * sideSign * 1.25 - fwdX * 0.68;
      targetZ = playerPos.z + rightZ * sideSign * 1.25 - fwdZ * 0.68;

      // Russian Blue curiosity nudge toward nearby unsolved secrets!
      if (!isMaine && this.secretTargets.length > 0 && playerPos.y < 20) {
        for (const s of this.secretTargets) {
          if (s.isSolved && s.isSolved()) continue;
          const ds = Math.hypot(playerPos.x - s.x, playerPos.z - s.z);
          if (ds < 16.0 && ds > 2.0) {
            targetX = THREE.MathUtils.lerp(targetX, s.x, 0.25);
            targetZ = THREE.MathUtils.lerp(targetZ, s.z, 0.25);
            break;
          }
        }
      }
    } else {
      targetX = this.campfirePos.x + sideSign * 1.1;
      targetZ = this.campfirePos.z - 0.9;
    }

    // Snap smoothly if Dengdeng teleported far away (> 28m) or landed on an elevated Sky Island!
    const distToPlayer = Math.hypot(playerPos.x - cat.pos.x, playerPos.z - cat.pos.z);
    const verticalGap = Math.abs(playerPos.y - cat.pos.y);
    const targetFloorY = this.world.getWalkHeight(targetX, targetZ, playerPos.y);
    if (
      this.catsFollowing &&
      (distToPlayer > 28 || (verticalGap > 12 && Math.abs(playerPos.y - targetFloorY) < 1.2))
    ) {
      cat.pos.set(targetX, targetFloorY, targetZ);
    }

    let moveSpeed = 0;
    if (cat.petTimer > 0) {
      cat.petTimer = Math.max(0, cat.petTimer - dt);
      // Maine Coon dramatic belly-up flop vs Russian Blue affectionate head-tilt!
      const p = Math.sin(Math.min(1, cat.petTimer / 0.4) * Math.PI * 0.5);
      if (isMaine) {
        cat.bodyPivot.rotation.z = THREE.MathUtils.lerp(cat.bodyPivot.rotation.z, 2.25 * p, Math.min(1, dt * 10));
        cat.headGroup.rotation.x = -0.25 * p;
      } else {
        cat.headGroup.rotation.z = 0.28 * Math.sin(time * 5.0) * p;
        cat.headGroup.rotation.x = -0.20 * p;
      }
    } else {
      cat.bodyPivot.rotation.z = THREE.MathUtils.lerp(cat.bodyPivot.rotation.z, 0, Math.min(1, dt * 10));
      cat.headGroup.rotation.z = THREE.MathUtils.lerp(cat.headGroup.rotation.z, 0, Math.min(1, dt * 8));
      cat.headGroup.rotation.x = THREE.MathUtils.lerp(cat.headGroup.rotation.x, 0, Math.min(1, dt * 8));

      const dx = targetX - cat.pos.x;
      const dz = targetZ - cat.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.32) {
        const desiredSpeed = dist > 4.2 ? 5.6 : dist > 1.6 ? 3.1 : 1.75;
        moveSpeed = desiredSpeed;
        const step = Math.min(dist, desiredSpeed * dt);
        const nextX = cat.pos.x + (dx / dist) * step;
        const nextZ = cat.pos.z + (dz / dist) * step;
        // Keep cats safely inside elevated sky island rim while high above ground
        if (cat.pos.y <= 24 || this.world.getWalkHeight(nextX, nextZ, cat.pos.y) > 24) {
          cat.pos.x = nextX;
          cat.pos.z = nextZ;
        }
        this.world.resolveCollisions(cat.pos, 0.24);

        const wantYaw = Math.atan2(dx, dz);
        let diff = wantYaw - cat.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cat.yaw += diff * Math.min(1, dt * 10);
      }
    }

    // Playful hop physics
    if (cat.hopVelY !== 0 || cat.hopY > 0) {
      cat.hopVelY -= 14.0 * dt;
      cat.hopY += cat.hopVelY * dt;
      if (cat.hopY <= 0) {
        cat.hopY = 0;
        cat.hopVelY = 0;
      }
    }

    const groundY = this.world.getWalkHeight(cat.pos.x, cat.pos.z, cat.pos.y);
    cat.pos.y = THREE.MathUtils.lerp(cat.pos.y, groundY, Math.min(1, dt * 18));
    cat.root.position.set(cat.pos.x, cat.pos.y + cat.hopY, cat.pos.z);
    cat.root.rotation.y = cat.yaw;

    // 4-Leg Trotting Gait & Expressive Tail Sway
    if (moveSpeed > 0.25) {
      cat.gaitPhase += dt * (4.5 + moveSpeed * 2.4);
      const amp = Math.min(0.65, 0.22 + moveSpeed * 0.08);
      cat.legs[0].rotation.x = Math.sin(cat.gaitPhase) * amp;
      cat.legs[3].rotation.x = Math.sin(cat.gaitPhase) * amp;
      cat.legs[1].rotation.x = -Math.sin(cat.gaitPhase) * amp;
      cat.legs[2].rotation.x = -Math.sin(cat.gaitPhase) * amp;
      cat.bodyPivot.position.y = Math.abs(Math.cos(cat.gaitPhase)) * 0.035;
    } else {
      for (const l of cat.legs) {
        l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, cat.petTimer > 0 ? Math.sin(time * 9) * 0.35 : 0, Math.min(1, dt * 10));
      }
      cat.bodyPivot.position.y = THREE.MathUtils.lerp(cat.bodyPivot.position.y, 0, Math.min(1, dt * 10));
    }

    cat.tailPivot.rotation.y = Math.sin(time * (cat.petTimer > 0 ? 7.5 : 2.8) + (isMaine ? 1.2 : 0)) * 0.36;
    cat.tailPivot.rotation.x = 0.15 + Math.cos(time * 2.1) * 0.08;

    // Fade nameplate softly so it only appears when close (`< 9m`)
    const camFade = 1.0 - THREE.MathUtils.smoothstep(distToPlayer, 4.5, 11.0);
    cat.nameSprite.material.opacity = camFade * 0.92;
  }

  update(dt, playerPos, charYaw) {
    const time = performance.now() * 0.001;

    if (this.cookingBuffTimer > 0) {
      this.cookingBuffTimer = Math.max(0, this.cookingBuffTimer - dt);
    }

    // 1. Crackling Campfire Flicker & Rising Chimney Smoke
    if (this.fireOuter) {
      const f1 = 0.92 + Math.sin(time * 13.0) * 0.12 + Math.cos(time * 19.0) * 0.08;
      this.fireOuter.scale.set(1, f1, 1);
      this.fireInner.scale.set(1, 1.05 + Math.cos(time * 17.0) * 0.14, 1);
      this.fireLight.intensity = 1.75 + Math.sin(time * 15.0) * 0.28;
    }

    if (this.chimneyTopNode) {
      const origin = this.chimneyTopNode.getWorldPosition(new THREE.Vector3());
      for (const sp of this.smokePuffs) {
        sp.age += dt;
        if (sp.age >= sp.maxAge) sp.age -= sp.maxAge;
        const u = sp.age / sp.maxAge;
        sp.mesh.visible = true;
        sp.mesh.position.set(
          origin.x + Math.sin(time * 1.4 + u * 5.0) * u * 0.55,
          origin.y + u * 2.8,
          origin.z + u * 0.65
        );
        sp.mesh.scale.setScalar(0.55 + u * 1.65);
        sp.mesh.material.opacity = Math.sin(u * Math.PI) * 0.34;
      }
    }

    // 2. Husband Idle Stirring, Looking Toward Dengdeng & Happy Waving!
    if (this.husband) {
      const h = this.husband;
      const dx = playerPos.x - h.pos.x;
      const dz = playerPos.z - h.pos.z;
      const dist = Math.hypot(dx, dz);

      if (h.greetCooldown > 0) h.greetCooldown -= dt;
      if (dist < 6.5 && h.greetCooldown <= 0) {
        h.waveTimer = 2.0;
        h.greetCooldown = 14.0;
        this.spawnFloatingHeart(new THREE.Vector3(h.pos.x, h.pos.y + 1.75, h.pos.z), '#ff8fab', 2);
      }

      if (dist < 10.0) {
        const toPlayerYaw = Math.atan2(dx, dz);
        let diff = toPlayerYaw - h.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        h.root.rotation.y += diff * Math.min(1, dt * 5.0);
      } else {
        let diff = h.baseYaw - h.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        h.root.rotation.y += diff * Math.min(1, dt * 2.5);
      }

      if (h.waveTimer > 0) {
        h.waveTimer -= dt;
        h.armR.rotation.z = -2.35 + Math.sin(time * 11.0) * 0.32;
        h.armR.rotation.x = 0.25;
      } else {
        // Gentle soup-stirring motion
        h.armR.rotation.x = -0.58 + Math.sin(time * 2.4) * 0.12;
        h.armR.rotation.z = -0.18 + Math.cos(time * 2.4) * 0.10;
      }

      const blink = Math.sin(time * 0.9) > 0.985 ? 0.12 : 1.25;
      h.eyeL.scale.y = blink;
      h.eyeR.scale.y = blink;
      h.labelSprite.material.opacity = 1.0 - THREE.MathUtils.smoothstep(dist, 7.0, 18.0);
    }

    // 3. Update Russian Blue & Maine Coon Cats
    this._updateCat(this.russianBlue, dt, playerPos, charYaw, time);
    this._updateCat(this.maineCoon, dt, playerPos, charYaw, time);

    // 4. Update Floating Hearts
    for (let i = this.floatingHearts.length - 1; i >= 0; i--) {
      const fh = this.floatingHearts[i];
      fh.age += dt;
      if (fh.age >= fh.maxAge) {
        this.group.remove(fh.sprite);
        fh.sprite.material.dispose();
        this.floatingHearts.splice(i, 1);
        continue;
      }
      const u = fh.age / fh.maxAge;
      fh.sprite.position.y += fh.vy * dt;
      fh.sprite.position.x += Math.sin(time * 4.5 + fh.phase) * 0.22 * dt;
      fh.sprite.material.opacity = (1 - u * u) * 0.95;
    }
  }
}
