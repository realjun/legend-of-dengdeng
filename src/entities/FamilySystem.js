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

function createSweatshirtGraphicTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  // Stylized cute yellow minifigure face print on husband's black crewneck sweatshirt!
  ctx.fillStyle = '#262930';
  ctx.beginPath();
  ctx.roundRect(54, 34, 148, 84, 38);
  ctx.fill();

  ctx.fillStyle = '#e7ae56';
  ctx.beginPath();
  ctx.roundRect(56, 76, 144, 132, 34);
  ctx.fill();

  // Beanie cap hairline
  ctx.fillStyle = '#23262d';
  ctx.beginPath();
  ctx.moveTo(54, 96);
  ctx.quadraticCurveTo(128, 72, 202, 96);
  ctx.lineTo(202, 56);
  ctx.quadraticCurveTo(128, 28, 54, 56);
  ctx.closePath();
  ctx.fill();

  // Expressive eyebrows & eyes with white glints
  ctx.strokeStyle = '#231e18';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(84, 114);
  ctx.quadraticCurveTo(98, 106, 112, 114);
  ctx.moveTo(144, 114);
  ctx.quadraticCurveTo(158, 106, 172, 114);
  ctx.stroke();

  for (const ex of [98, 158]) {
    ctx.fillStyle = '#1e1b18';
    ctx.beginPath();
    ctx.arc(ex, 134, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 3, 130, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cheerful white grin + little stubble dots & chin patch
  ctx.fillStyle = '#241d17';
  ctx.beginPath();
  ctx.ellipse(128, 168, 28, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(128, 167, 22, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#241d17';
  for (const [dx, dy] of [
    [-22, -13],
    [-11, -16],
    [0, -17],
    [11, -16],
    [22, -13],
    [-38, -24],
    [-42, -14],
    [38, -24],
    [42, -14],
  ]) {
    ctx.beginPath();
    ctx.arc(128 + dx, 168 + dy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(128, 194, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

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
    this.broccoli = this._buildCat('broccoli'); // 蓝猫妹妹 Broccoli
    this.jelly = this._buildCat('jelly'); // 火焰重点色暹罗弟弟 Jelly
    // Aliases for companion integrations
    this.russianBlue = this.broccoli;
    this.maineCoon = this.jelly;
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

  _createHusbandFaceTexture(blinking = false) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    // Soft natural short swept black bangs along the top forehead hairline (seamless with 3D hairCap!)
    ctx.fillStyle = '#181a20';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(512, 0);
    ctx.lineTo(512, 118);
    ctx.quadraticCurveTo(445, 78, 370, 96);
    ctx.quadraticCurveTo(328, 68, 286, 94);
    ctx.quadraticCurveTo(235, 62, 178, 98);
    ctx.quadraticCurveTo(118, 76, 56, 114);
    ctx.lineTo(0, 124);
    ctx.closePath();
    ctx.fill();

    // Fuller, natural soft-feathered dark eyebrows (styled after photo-5 & photo-6)
    ctx.fillStyle = '#221d1b';
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(256 + dir * 88, 184);
      ctx.rotate(dir * 0.04);
      ctx.beginPath();
      ctx.moveTo(-52 * dir, 5);
      ctx.quadraticCurveTo(-8 * dir, -15, 46 * dir, -4);
      ctx.quadraticCurveTo(54 * dir, 6, 42 * dir, 12);
      ctx.quadraticCurveTo(-6 * dir, 3, -50 * dir, 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Gentle East-Asian almond eyes with natural upper lid fold & warm dark-brown iris
    for (const dir of [-1, 1]) {
      const ex = 256 + dir * 86;
      const ey = 246;

      // Subtle upper eyelid crease
      ctx.strokeStyle = 'rgba(92, 62, 48, 0.40)';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 38 * dir, ey - 21);
      ctx.quadraticCurveTo(ex, ey - 32, ex + 36 * dir, ey - 17);
      ctx.stroke();

      if (blinking) {
        ctx.strokeStyle = '#241b18';
        ctx.lineWidth = 7.5;
        ctx.beginPath();
        ctx.moveTo(ex - 38, ey + 2);
        ctx.quadraticCurveTo(ex, ey + 11, ex + 38, ey + 2);
        ctx.stroke();
        continue;
      }

      // Soft almond sclera (calm, friendly, proportionate)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex - 40, ey + 3);
      ctx.quadraticCurveTo(ex - 4, ey - 21, ex + 39, ey + 2);
      ctx.quadraticCurveTo(ex + 2, ey + 19, ex - 40, ey + 3);
      ctx.closePath();
      ctx.fillStyle = '#fcfaf7';
      ctx.fill();
      ctx.clip();

      // Warm deep espresso-brown iris + dark pupil
      ctx.fillStyle = '#2e1f18';
      ctx.beginPath();
      ctx.arc(ex, ey + 1, 20.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#120d0b';
      ctx.beginPath();
      ctx.arc(ex, ey + 1, 11.2, 0, Math.PI * 2);
      ctx.fill();

      // Lively white catchlight + soft secondary glint
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 6.5, ey - 5.5, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(ex + 6.5, ey + 6.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Clean upper lash line defining the warm almond eye shape
      ctx.strokeStyle = '#1b1513';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 41, ey + 3);
      ctx.quadraticCurveTo(ex - 4, ey - 21, ex + 40, ey + 2);
      ctx.stroke();
    }

    // Subtle warm cheek glow & gentle nostril shadow beneath 3D nose bridge
    for (const dir of [-1, 1]) {
      const grad = ctx.createRadialGradient(256 + dir * 110, 304, 4, 256 + dir * 110, 304, 42);
      grad.addColorStop(0, 'rgba(232, 138, 122, 0.22)');
      grad.addColorStop(1, 'rgba(232, 138, 122, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(256 + dir * 110, 304, 42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(115, 74, 58, 0.42)';
    ctx.beginPath();
    ctx.ellipse(242, 322, 6.2, 3.5, 0.25, 0, Math.PI * 2);
    ctx.ellipse(270, 322, 6.2, 3.5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // Warm, calm, affectionate closed-lip smile (photo-6)
    ctx.fillStyle = 'rgba(196, 118, 108, 0.42)';
    ctx.beginPath();
    ctx.ellipse(256, 372, 42, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#7a423a';
    ctx.lineWidth = 5.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(206, 368);
    ctx.quadraticCurveTo(256, 383, 306, 368);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildHusbandCharacter() {
    // Personalized Husband Character ("老公") styled after real photos (photo-5 & photo-6):
    // Neat swept short black hair, fuller eyebrows, calm warm almond eyes, gentle smile,
    // and rounded black crewneck sweatshirt with the cute yellow minifigure chest graphic!
    const hx = this.campfirePos.x + 1.15;
    const hz = this.campfirePos.z + 0.78;
    const hy = this.world.getTerrainHeight(hx, hz);

    const root = new THREE.Group();
    root.position.set(hx, hy, hz);
    root.rotation.y = -0.75;

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf2cab0,
      emissive: new THREE.Color(0x281a13),
      roughness: 0.68,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x16181e,
      emissive: new THREE.Color(0x07080b),
      roughness: 0.58,
    });
    const sweaterMat = new THREE.MeshStandardMaterial({
      color: 0x181b22,
      emissive: new THREE.Color(0x06070a),
      roughness: 0.84,
    });
    const ribCollarMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.88 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x262b35, roughness: 0.84 });
    const shoeUpperMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.76 });
    const shoeSoleMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.65 });

    // Casual Dark Pants & Clean White-Soled Sneakers
    for (const sx of [-0.105, 0.105]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.76, 10), pantsMat);
      leg.position.set(sx, 0.45, 0);
      leg.castShadow = true;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.095, 0.22), shoeUpperMat);
      shoe.position.set(sx, 0.075, 0.035);
      shoe.castShadow = true;
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.128, 0.032, 0.23), shoeSoleMat);
      sole.position.set(sx, 0.018, 0.035);
      root.add(leg, shoe, sole);
    }

    // Smooth Rounded-Shoulder Black Crewneck Sweatshirt + Yellow Minifigure Chest Print!
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.195, 0.36, 12, 18), sweaterMat);
    torso.scale.set(1.12, 1.0, 0.76);
    torso.position.y = 1.08;
    torso.castShadow = true;

    // Seamless rounded shoulder yoke connecting torso & sleeves
    const shoulderBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.32, 10, 14), sweaterMat);
    shoulderBar.rotation.z = Math.PI / 2;
    shoulderBar.scale.set(1.0, 1.0, 0.92);
    shoulderBar.position.set(0, 1.30, 0);
    shoulderBar.castShadow = true;

    const hemRib = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.178, 0.06, 16), ribCollarMat);
    hemRib.scale.set(1.10, 1, 0.76);
    hemRib.position.y = 0.80;

    const chestPrintMat = new THREE.MeshBasicMaterial({
      map: createSweatshirtGraphicTexture(),
      transparent: true,
    });
    const chestGraphic = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), chestPrintMat);
    chestGraphic.position.set(0, 1.11, 0.153);
    chestGraphic.rotation.x = -0.04;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.072, 0.14, 12), skinMat);
    neck.position.y = 1.40;

    const crewCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.022, 8, 18),
      ribCollarMat
    );
    crewCollar.rotation.x = Math.PI / 2;
    crewCollar.scale.set(1.08, 0.90, 1);
    crewCollar.position.y = 1.385;

    // Sculpted Head + Natural Swept Short Black Haircut + Ghibli Face Expression Shell!
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.555;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.152, 22, 18), skinMat);
    head.scale.set(0.95, 1.05, 0.93);
    head.castShadow = true;

    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 10), skinMat);
      ear.scale.set(0.50, 1.08, 0.72);
      ear.position.set(sx * 0.144, -0.008, -0.008);
      headGroup.add(ear);
    }

    // Crisp Ghibli-style face expression shell wrapped smoothly onto +Z front of head!
    // In Three.js SphereGeometry, phi = Math.PI * 0.5 points directly along +Z!
    const faceTexOpen = this._createHusbandFaceTexture(false);
    const faceTexBlink = this._createHusbandFaceTexture(true);
    const faceShellGeo = new THREE.SphereGeometry(
      0.1538,
      28,
      22,
      Math.PI * 0.5 - 0.88,
      1.76,
      Math.PI * 0.5 - 0.66,
      1.32
    );
    const faceShellMat = new THREE.MeshBasicMaterial({
      map: faceTexOpen,
      transparent: true,
      depthWrite: false,
    });
    const faceShell = new THREE.Mesh(faceShellGeo, faceShellMat);
    faceShell.scale.copy(head.scale);

    // Subtle 3D nose bridge aligned cleanly with nostrils
    const noseBridge = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), skinMat);
    noseBridge.scale.set(0.76, 1.12, 0.88);
    noseBridge.position.set(0, -0.020, 0.141);

    // Clean, seamless short black haircut (smooth rounded crown + tapered back + temple sideburns!)
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.157, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.50),
      hairMat
    );
    hairCap.scale.set(0.97, 1.07, 0.96);
    hairCap.position.set(0, 0.020, -0.010);
    hairCap.rotation.x = -0.34;

    // Gentle side-part crown volume blended seamlessly into hairCap
    const hairTopSweep = new THREE.Mesh(new THREE.SphereGeometry(0.150, 20, 16), hairMat);
    hairTopSweep.scale.set(0.99, 0.88, 0.96);
    hairTopSweep.position.set(0.006, 0.044, -0.004);
    hairTopSweep.rotation.set(-0.08, 0, -0.06);

    // Tapered temple / sideburn panels framing both sides down to the ears
    for (const sx of [-1, 1]) {
      const sideburn = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.076, 6, 8), hairMat);
      sideburn.scale.set(0.55, 1.0, 0.92);
      sideburn.position.set(sx * 0.136, 0.042, 0.028);
      sideburn.rotation.z = sx * 0.14;
      sideburn.rotation.x = 0.16;
      headGroup.add(sideburn);
    }

    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.156, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.66),
      hairMat
    );
    hairBack.scale.set(0.96, 1.02, 0.95);
    hairBack.rotation.x = -0.78;
    hairBack.position.set(0, 0.005, -0.014);

    headGroup.add(head, faceShell, noseBridge, hairCap, hairTopSweep, hairBack);

    // Articulated Left & Right Black Sweatshirt Sleeves (tucked seamlessly into rounded shoulders)
    const armL = new THREE.Group();
    armL.position.set(0.225, 1.30, 0);
    const sleeveL = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.34, 8, 12), sweaterMat);
    sleeveL.position.y = -0.18;
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 10), skinMat);
    handL.position.y = -0.40;
    armL.add(sleeveL, handL);
    armL.rotation.z = 0.14;
    armL.rotation.x = 0.18;

    const armR = new THREE.Group();
    armR.position.set(-0.225, 1.30, 0);
    const sleeveR = sleeveL.clone();
    const handR = handL.clone();
    const ladle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.32, 6),
      new THREE.MeshStandardMaterial({ color: 0x8c5a32, roughness: 0.8 })
    );
    ladle.rotation.x = Math.PI / 2;
    ladle.position.set(0, -0.41, 0.13);
    armR.add(sleeveR, handR, ladle);

    // Delicate Floating Nameplate Sprite
    const labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createLabelTexture('老公', '星光木屋 · 专属大厨', '#ffe6a3'),
        transparent: true,
        depthWrite: false,
      })
    );
    labelSprite.position.set(0, 1.94, 0);
    labelSprite.scale.set(0.86, 0.27, 1);

    root.add(
      torso,
      shoulderBar,
      hemRib,
      chestGraphic,
      neck,
      crewCollar,
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
      faceShellMat,
      faceTexOpen,
      faceTexBlink,
      labelSprite,
      waveTimer: 0,
      greetCooldown: 0,
    };
  }

  _buildCat(kind) {
    // 'broccoli': Female Russian Blue / Slate-Blue cat with sage-olive green eyes & signature tiny white chest locket!
    // 'jelly': Male Flame-Point Siamese cat of matching sleek size with luminous cream-white body, toasted apricot mask/ears/tail & sapphire-blue eyes!
    const isJelly = kind === 'jelly';
    const scale = isJelly ? 1.02 : 0.99; // Matching sleek body sizes just like real Broccoli & Jelly!

    const root = new THREE.Group();
    const coatColor = isJelly ? 0xfcf6eb : 0x566173;
    const coatEmissive = isJelly ? 0x26211b : 0x161b24;
    const accentPointColor = isJelly ? 0xeaa35e : 0x667286;
    const accentEmissive = isJelly ? 0x241508 : 0x181e28;
    const pawColor = isJelly ? 0xffffff : 0x4d5768;
    const earOuterColor = isJelly ? 0xeba563 : 0x495363;
    const earInnerColor = isJelly ? 0xfad0cb : 0x7a6870;
    const eyeColor = isJelly ? 0x5886c9 : 0xb8d487; // Sapphire-periwinkle blue (Jelly) vs Sage-olive green (Broccoli)!

    const coatMat = new THREE.MeshStandardMaterial({
      color: coatColor,
      emissive: new THREE.Color(coatEmissive),
      roughness: 0.64,
    });
    const pointMat = new THREE.MeshStandardMaterial({
      color: accentPointColor,
      emissive: new THREE.Color(accentEmissive),
      roughness: 0.64,
    });
    const pawMat = new THREE.MeshStandardMaterial({
      color: pawColor,
      emissive: new THREE.Color(isJelly ? 0x242424 : 0x141820),
      roughness: 0.68,
    });
    const earOuterMat = new THREE.MeshStandardMaterial({
      color: earOuterColor,
      emissive: new THREE.Color(isJelly ? 0x241508 : 0x131720),
      roughness: 0.68,
    });
    const earInnerMat = new THREE.MeshStandardMaterial({
      color: earInnerColor,
      emissive: new THREE.Color(isJelly ? 0x261818 : 0x181216),
      roughness: 0.74,
    });
    const whiteLocketMat = new THREE.MeshStandardMaterial({
      color: 0xfbfaf5,
      emissive: new THREE.Color(0x343430),
      roughness: 0.68,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x10141c });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const bodyPivot = new THREE.Group();
    bodyPivot.scale.setScalar(scale);
    root.add(bodyPivot);

    // Sleek Sculpted Feline Torso (matching proportions for both cats!)
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.152, 16, 14), coatMat);
    torso.scale.set(0.84, 0.88, 1.54);
    torso.position.set(0, 0.23, 0);
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Plush feline chest curve for both cats
    const chest = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 12, 10),
      isJelly ? pawMat : coatMat
    );
    chest.scale.set(0.90, 0.96, 0.86);
    chest.position.set(0, 0.22, 0.158);
    bodyPivot.add(chest);

    if (isJelly) {
      // Soft toasted-apricot saddle tint across Jelly's back
      const saddle = new THREE.Mesh(
        new THREE.SphereGeometry(0.145, 12, 10),
        new THREE.MeshStandardMaterial({
          color: 0xf3d7ad,
          emissive: new THREE.Color(0x241a10),
          roughness: 0.68,
        })
      );
      saddle.scale.set(0.81, 0.68, 1.24);
      saddle.position.set(0, 0.274, -0.02);
      bodyPivot.add(saddle);
    } else {
      // Broccoli's signature adorable tiny WHITE CHEST LOCKET tuft clearly visible on her chest (photo-1 & photo-2)!
      const locket = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), whiteLocketMat);
      locket.scale.set(1.05, 0.72, 0.52);
      locket.position.set(0, 0.226, 0.244);
      bodyPivot.add(locket);
    }

    // Feline Head + Plump Peanut Whisker Pads + Authentic Markings
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.345, 0.235);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 14), coatMat);
    head.scale.set(1.0, 0.94, 0.96);
    head.castShadow = true;

    // Two cute rounded peanut whisker pads
    for (const sx of [-1, 1]) {
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 10, 8),
        isJelly ? pawMat : pointMat
      );
      pad.scale.set(1.05, 0.82, 0.88);
      pad.position.set(sx * 0.026, -0.030, 0.102);
      headGroup.add(pad);
    }

    if (isJelly) {
      // Jelly's soft toasted apricot-ginger Flame-Point nose bridge mask + 3 delicate forehead tabby stripes!
      const flameMask = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), pointMat);
      flameMask.scale.set(0.82, 0.95, 0.76);
      flameMask.position.set(0, -0.002, 0.094);
      headGroup.add(flameMask);

      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xe29852,
        emissive: new THREE.Color(0x221408),
        roughness: 0.68,
      });
      for (const sx of [-1, 0, 1]) {
        const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.026, 4, 6), stripeMat);
        st.position.set(sx * 0.022, 0.056, 0.102 - Math.abs(sx) * 0.004);
        st.rotation.x = -0.38;
        st.rotation.z = -sx * 0.15;
        headGroup.add(st);
      }
    }

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.015, 0.017, 3),
      new THREE.MeshBasicMaterial({ color: isJelly ? 0xf0938c : 0x2b313b })
    );
    nose.rotation.x = Math.PI;
    nose.position.set(0, -0.016, 0.138);

    // Expressive Feline Eyes + Lively White Catchlight Glints!
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), eyeMat);
      eye.scale.set(1.02, 1.02, 0.52);
      eye.position.set(sx * 0.048, 0.014, 0.104);

      const pupil = new THREE.Mesh(
        isJelly
          ? new THREE.SphereGeometry(0.013, 10, 8)
          : new THREE.BoxGeometry(0.0085, 0.026, 0.012),
        pupilMat
      );
      if (isJelly) pupil.scale.set(0.86, 1.08, 0.45);
      pupil.position.set(sx * 0.048, 0.014, 0.115);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 6, 6), glintMat);
      glint.position.set(sx * 0.048 - 0.006, 0.020, 0.121);
      headGroup.add(eye, pupil, glint);
    }

    // Sleek Pointed Feline Ears
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.047, 0.112, 4), earOuterMat);
      ear.position.set(s * 0.072, 0.110, 0.01);
      ear.rotation.z = -s * 0.24;
      ear.rotation.y = s * 0.35;

      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.074, 4), earInnerMat);
      inner.position.set(s * 0.072, 0.104, 0.024);
      inner.rotation.copy(ear.rotation);
      headGroup.add(ear, inner);
    }

    headGroup.add(head, nose);
    bodyPivot.add(headGroup);

    // 4 Smooth Capsule Legs Tucked Cleanly Into Shoulders/Hips + Snowy White Socks for Jelly
    const legs = [];
    const legCoords = [
      [-0.062, 0.165, 0.135],
      [0.062, 0.165, 0.135],
      [-0.066, 0.165, -0.135],
      [0.066, 0.165, -0.135],
    ];
    legCoords.forEach(([lx, ly, lz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(lx, ly, lz);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.115, 6, 8), coatMat);
      limb.position.y = -0.075;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 8), pawMat);
      paw.scale.set(1.0, 0.68, 1.25);
      paw.position.set(0, -0.152, 0.014);
      pivot.add(limb, paw);
      bodyPivot.add(pivot);
      legs.push(pivot);
    });

    // Sleek Tapering Curved Tail (slate-blue for Broccoli, toasted apricot-ginger flame tail for Jelly!)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.25, -0.21);
    const tCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.06, -0.12),
      new THREE.Vector3(0, 0.19, -0.20),
      new THREE.Vector3(0, 0.30, -0.16),
    ]);
    const tailMesh = new THREE.Mesh(
      new THREE.TubeGeometry(tCurve, 12, 0.025, 8, false),
      isJelly ? pointMat : coatMat
    );
    tailMesh.castShadow = true;
    tailPivot.add(tailMesh);
    bodyPivot.add(tailPivot);

    // Floating Nameplate Sprite
    const labelText = isJelly ? 'Jelly' : 'Broccoli';
    const subLabel = isJelly ? '暹罗猫弟弟 · 护卫小骑士' : '蓝猫妹妹 · 寻宝小向导';
    const nameSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createLabelTexture(labelText, subLabel, isJelly ? '#ffd599' : '#b8eb9c'),
        transparent: true,
        depthWrite: false,
      })
    );
    nameSprite.position.set(0, 0.66, 0);
    nameSprite.scale.set(0.68, 0.21, 1);
    root.add(nameSprite);

    const startX = this.campfirePos.x + (isJelly ? -0.85 : 0.45);
    const startZ = this.campfirePos.z + (isJelly ? -0.85 : -1.1);
    const startY = this.world.getWalkHeight(startX, startZ);
    root.position.set(startX, startY, startZ);
    this.group.add(root);

    return {
      breed: isJelly ? 'siamese' : 'russian',
      kind,
      name: isJelly ? '暹罗猫 Jelly' : '蓝猫 Broccoli',
      shortName: isJelly ? 'Jelly' : 'Broccoli',
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
    // Jelly gets excited and does a brave little Siamese hop!
    if (this.jelly && this.jelly.hopY <= 0.01 && this.jelly.petTimer <= 0) {
      this.jelly.hopVelY = 2.6;
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

    for (const cat of [this.broccoli, this.jelly]) {
      const dc = playerPos.distanceTo(cat.pos);
      if (dc < Math.min(bestDist, 2.35)) {
        bestDist = dc;
        best = {
          type: 'cat',
          cat,
          label: `[F] 撸 ${cat.name}`,
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
          text: '「你看 Broccoli 和 Jelly 多黏你，不管你去迷宫还是云端冒险，姐弟俩都寸步不离跟着你呢！」',
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
      const isJelly = cat.kind === 'jelly';
      this.spawnFloatingHeart(
        new THREE.Vector3(cat.pos.x, cat.pos.y + 0.45, cat.pos.z),
        isJelly ? '#ffb86c' : '#8be89e',
        4
      );
      if (isJelly) {
        return {
          speaker: '暹罗猫 · Jelly',
          text: '「咪呜——咕噜噜～！」Jelly 睁着圆溜溜的蓝眼睛撒娇地翻开雪白肚皮，烤吐司色的小耳朵一抖一抖讨摸摸！',
        };
      }
      return {
        speaker: '蓝猫 · Broccoli',
        text: '「喵呜～呼噜噜…」Broccoli 眯起温柔的浅绿眼睛，露出胸口那一小撮可爱白毛，轻轻蹭着登登的手心。',
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
    this.broccoli.pos.set(rx, this.world.getWalkHeight(rx, rz, playerPos.y), rz);
    this.broccoli.root.position.copy(this.broccoli.pos);

    const mx = playerPos.x + rightX * 1.18 - fwdX * 0.6;
    const mz = playerPos.z + rightZ * 1.18 - fwdZ * 0.6;
    this.jelly.pos.set(mx, this.world.getWalkHeight(mx, mz, playerPos.y), mz);
    this.jelly.root.position.copy(this.jelly.pos);
  }

  _updateCat(cat, dt, playerPos, charYaw, time) {
    const isJelly = cat.kind === 'jelly';
    const sideSign = isJelly ? 1 : -1;

    // Target formation spot beside Dengdeng (or near cottage campfire if staying home)
    let targetX;
    let targetZ;

    if (this.catsFollowing) {
      const rightX = Math.cos(charYaw);
      const rightZ = -Math.sin(charYaw);
      const fwdX = Math.sin(charYaw);
      const fwdZ = Math.cos(charYaw);
      targetX = playerPos.x + rightX * sideSign * 1.18 - fwdX * 0.68;
      targetZ = playerPos.z + rightZ * sideSign * 1.18 - fwdZ * 0.68;

      // Broccoli's keen curiosity nudge toward nearby unsolved secrets!
      if (!isJelly && this.secretTargets.length > 0 && playerPos.y < 20) {
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
      targetX = this.campfirePos.x + sideSign * 1.05;
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
      // Jelly playful belly-up roll vs Broccoli sweet affectionate head-tilt!
      const p = Math.sin(Math.min(1, cat.petTimer / 0.4) * Math.PI * 0.5);
      if (isJelly) {
        cat.bodyPivot.rotation.z = THREE.MathUtils.lerp(cat.bodyPivot.rotation.z, 2.20 * p, Math.min(1, dt * 10));
        cat.headGroup.rotation.x = -0.22 * p;
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

    cat.tailPivot.rotation.y = Math.sin(time * (cat.petTimer > 0 ? 7.5 : 2.8) + (isJelly ? 1.2 : 0)) * 0.36;
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

      const isBlinking = Math.sin(time * 0.9) > 0.985;
      if (h.faceShellMat) {
        const wantMap = isBlinking ? h.faceTexBlink : h.faceTexOpen;
        if (h.faceShellMat.map !== wantMap) {
          h.faceShellMat.map = wantMap;
          h.faceShellMat.needsUpdate = true;
        }
      }
      h.labelSprite.material.opacity = 1.0 - THREE.MathUtils.smoothstep(dist, 7.0, 18.0);
    }

    // 3. Update Broccoli & Jelly Cats
    this._updateCat(this.broccoli, dt, playerPos, charYaw, time);
    this._updateCat(this.jelly, dt, playerPos, charYaw, time);

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
