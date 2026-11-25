import * as THREE from 'three';

const MAX_TRAIL_PTS = 40;
const MAX_PARTICLES = 84;

export class CombatEffects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._initRibbonTrail();
    this._initShockwavePool();
    this._initParticlePool();

    this._prevBase = new THREE.Vector3();
    this._prevTip = new THREE.Vector3();
    this._hasPrevSample = false;
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpDirPrev = new THREE.Vector3();
    this._tmpDirCurr = new THREE.Vector3();
    this._dummy = new THREE.Object3D();
  }

  _initRibbonTrail() {
    this.trailSamples = []; // { base: Vector3, tip: Vector3, age: number, maxAge: number, golden: number }

    const vertCount = MAX_TRAIL_PTS * 2;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const alphas = new Float32Array(vertCount);
    const goldens = new Float32Array(vertCount);
    const indices = [];

    for (let i = 0; i < MAX_TRAIL_PTS - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aGolden', new THREE.BufferAttribute(goldens, 1));
    geo.setIndex(indices);
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aGolden;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vGolden;
        void main() {
          vUv = uv;
          vAlpha = aAlpha;
          vGolden = aGolden;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        varying float vGolden;
        void main() {
          // vUv.y: 0 = hilt side, 1 = sharp tip edge
          float edge = smoothstep(0.08, 0.96, vUv.y);
          float rimTip = smoothstep(0.76, 0.99, vUv.y);
          float softInner = smoothstep(0.0, 0.24, vUv.y);

          vec3 cyanCore = vec3(0.34, 0.86, 1.0);
          vec3 goldCore = vec3(1.0, 0.84, 0.36);
          vec3 bodyCol = mix(cyanCore, goldCore, vGolden * 0.72);
          vec3 hotEdge = mix(vec3(0.88, 0.98, 1.0), vec3(1.0, 0.97, 0.82), vGolden);

          vec3 col = mix(bodyCol, hotEdge, rimTip * 0.85 + edge * 0.25);
          float streak = 0.78 + 0.22 * sin(vUv.y * 22.0 - vUv.x * 8.0);
          float alpha = vAlpha * softInner * (0.36 + 0.64 * edge) * streak;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(col * (0.85 + 0.45 * rimTip), alpha * 0.86);
        }
      `,
    });

    this.trailMesh = new THREE.Mesh(geo, mat);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = 12;
    this.group.add(this.trailMesh);
  }

  _initShockwavePool() {
    const ringGeo = new THREE.RingGeometry(0.72, 1.0, 64, 1);
    const ringMatBase = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#78eeff') },
        uOpacity: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vRingXY;
        void main() {
          vRingXY = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vRingXY;
        void main() {
          // True radial normalized position across [0.72, 1.0] annulus!
          float r = clamp((length(vRingXY) - 0.72) / 0.28, 0.0, 1.0);
          float softGlow = sin(r * 3.14159265) * 0.42;
          float razorRim = smoothstep(0.68, 0.93, r) * (1.0 - smoothstep(0.93, 1.0, r));
          float a = (softGlow + razorRim * 0.95) * uOpacity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), razorRim * 0.75), a);
        }
      `,
    });

    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const mat = ringMatBase.clone();
      mat.uniforms = {
        uColor: { value: new THREE.Color('#78eeff') },
        uOpacity: { value: 0.0 },
      };
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 13;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        active: false,
        age: 0,
        duration: 0.4,
        startScale: 0.3,
        endScale: 2.5,
      });
    }
  }

  _initParticlePool() {
    // Tapered grass-snippet / spark diamond geometry (1 draw call via InstancedMesh!)
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0.0, 0.11, 0.0,
      -0.022, 0.0, 0.0,
      0.022, 0.0, 0.0,
      0.0, -0.11, 0.0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    this.particleInst = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.particleInst.frustumCulled = false;
    this.particleInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.particles = [];
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particleInst.setMatrixAt(i, zeroMat);
      this.particleInst.setColorAt(i, white);
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        age: 0,
        maxAge: 0.6,
        scale: 1,
        gravity: 9.0,
      });
    }
    this.particleInst.instanceMatrix.needsUpdate = true;
    if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
    this.particleCursor = 0;
    this.group.add(this.particleInst);
  }

  resetTrailContinuity() {
    this._hasPrevSample = false;
  }

  pushBladeSample(basePos, tipPos, active, golden = 0.0, maxAge = 0.21) {
    if (!active) {
      this._hasPrevSample = false;
      return;
    }

    if (this._hasPrevSample) {
      const tipDist = this._prevTip.distanceTo(tipPos);
      const subSteps = Math.min(5, Math.max(1, Math.ceil(tipDist / 0.13)));
      this._tmpDirPrev.subVectors(this._prevTip, this._prevBase);
      this._tmpDirCurr.subVectors(tipPos, basePos);
      const lenPrev = this._tmpDirPrev.length() || 0.75;
      const lenCurr = this._tmpDirCurr.length() || 0.75;
      this._tmpDirPrev.divideScalar(lenPrev);
      this._tmpDirCurr.divideScalar(lenCurr);

      const qPrev = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._tmpDirPrev);
      const qCurr = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._tmpDirCurr);
      const qMid = new THREE.Quaternion();

      for (let s = 1; s <= subSteps; s++) {
        const t = s / subSteps;
        this._tmpA.lerpVectors(this._prevBase, basePos, t);
        qMid.slerpQuaternions(qPrev, qCurr, t);
        const bladeLen = THREE.MathUtils.lerp(lenPrev, lenCurr, t);
        this._tmpB.set(0, bladeLen, 0).applyQuaternion(qMid).add(this._tmpA);

        this._appendRawSample(
          this._tmpA.clone(),
          this._tmpB.clone(),
          (1 - t) * 0.012,
          maxAge,
          golden
        );
      }
    } else {
      this._appendRawSample(basePos.clone(), tipPos.clone(), 0, maxAge, golden);
      this._hasPrevSample = true;
    }

    this._prevBase.copy(basePos);
    this._prevTip.copy(tipPos);
  }

  _appendRawSample(base, tip, age, maxAge, golden) {
    this.trailSamples.push({ base, tip, age, maxAge, golden });
    while (this.trailSamples.length > MAX_TRAIL_PTS) {
      this.trailSamples.shift();
    }
  }

  spawnShockwave(pos, {
    color = '#7cf0ff',
    startScale = 0.35,
    endScale = 2.8,
    duration = 0.38,
    normal = null,
  } = {}) {
    let slot = this.rings.find((r) => !r.active);
    if (!slot) slot = this.rings[0];

    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.startScale = startScale;
    slot.endScale = endScale;

    slot.mesh.position.copy(pos);
    if (normal) {
      this._tmpA.copy(pos).add(normal);
      slot.mesh.lookAt(this._tmpA);
    } else {
      slot.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    }
    slot.mesh.scale.setScalar(startScale);
    slot.mesh.material.uniforms.uColor.value.set(color);
    slot.mesh.material.uniforms.uOpacity.value = 0.95;
    slot.mesh.visible = true;
  }

  spawnGrassClippings(origin, count = 14) {
    const greens = [
      new THREE.Color('#7cd84e'),
      new THREE.Color('#9be85e'),
      new THREE.Color('#5dbd3a'),
      new THREE.Color('#c8f279'),
    ];
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const rad = 0.25 + Math.random() * 1.15;
      p.active = true;
      p.pos.set(
        origin.x + Math.cos(angle) * rad,
        origin.y + 0.18 + Math.random() * 0.32,
        origin.z + Math.sin(angle) * rad
      );
      const speed = 1.4 + Math.random() * 2.6;
      p.vel.set(
        Math.cos(angle) * speed,
        1.8 + Math.random() * 2.8,
        Math.sin(angle) * speed
      );
      p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.rotVel.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      p.age = 0;
      p.maxAge = 0.55 + Math.random() * 0.35;
      p.scale = 0.85 + Math.random() * 0.65;
      p.gravity = 6.2;

      const idx = (this.particleCursor + MAX_PARTICLES - 1) % MAX_PARTICLES;
      this.particleInst.setColorAt(idx, greens[i % greens.length]);
    }
    if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
  }

  spawnSparks(origin, colorHex = '#ffe680', count = 12) {
    const c1 = new THREE.Color(colorHex);
    const c2 = new THREE.Color('#a6f6ff');
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.3) * Math.PI * 0.7;
      const spd = 2.4 + Math.random() * 4.2;
      p.active = true;
      p.pos.copy(origin);
      p.vel.set(
        Math.cos(theta) * Math.cos(phi) * spd,
        Math.sin(phi) * spd + 1.2,
        Math.sin(theta) * Math.cos(phi) * spd
      );
      p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.rotVel.set(10, 12, 8);
      p.age = 0;
      p.maxAge = 0.26 + Math.random() * 0.18;
      p.scale = 0.30 + Math.random() * 0.28;
      p.gravity = 8.5;

      this.particleInst.setColorAt(idx, i % 2 === 0 ? c1 : c2);
    }
    if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
  }

  update(dt) {
    // 1. Update Ribbon Trail
    for (let i = this.trailSamples.length - 1; i >= 0; i--) {
      const s = this.trailSamples[i];
      s.age += dt;
      if (s.age >= s.maxAge) {
        this.trailSamples.splice(i, 1);
      }
    }

    const n = this.trailSamples.length;
    const geo = this.trailMesh.geometry;
    if (n >= 2) {
      const posArr = geo.attributes.position.array;
      const uvArr = geo.attributes.uv.array;
      const alphaArr = geo.attributes.aAlpha.array;
      const goldArr = geo.attributes.aGolden.array;

      for (let i = 0; i < n; i++) {
        const s = this.trailSamples[i];
        const u = i / (n - 1);
        const life = Math.max(0, 1 - s.age / s.maxAge);
        const fade = life * life * Math.sin(Math.min(1, u * 3.2) * Math.PI * 0.5);

        const v0 = i * 2;
        const v1 = v0 + 1;

        posArr[v0 * 3] = s.base.x;
        posArr[v0 * 3 + 1] = s.base.y;
        posArr[v0 * 3 + 2] = s.base.z;

        posArr[v1 * 3] = s.tip.x;
        posArr[v1 * 3 + 1] = s.tip.y;
        posArr[v1 * 3 + 2] = s.tip.z;

        uvArr[v0 * 2] = u;
        uvArr[v0 * 2 + 1] = 0;
        uvArr[v1 * 2] = u;
        uvArr[v1 * 2 + 1] = 1;

        alphaArr[v0] = fade * 0.45;
        alphaArr[v1] = fade;

        goldArr[v0] = s.golden;
        goldArr[v1] = s.golden;
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.uv.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aGolden.needsUpdate = true;
      geo.setDrawRange(0, (n - 1) * 6);
      this.trailMesh.visible = true;
    } else {
      geo.setDrawRange(0, 0);
      this.trailMesh.visible = false;
    }

    // 2. Update Shockwave Rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = Math.min(1, r.age / r.duration);
      const ease = 1 - Math.pow(1 - t, 2.6);
      r.mesh.scale.setScalar(THREE.MathUtils.lerp(r.startScale, r.endScale, ease));
      r.mesh.material.uniforms.uOpacity.value = Math.pow(1 - t, 1.8) * 0.92;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }

    // 3. Update Cut Grass & Spark Particles
    let anyDirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyDirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this._dummy.scale.setScalar(0);
        this._dummy.updateMatrix();
        this.particleInst.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;

      const lifeLeft = 1 - p.age / p.maxAge;
      this._dummy.position.copy(p.pos);
      this._dummy.rotation.copy(p.rot);
      this._dummy.scale.setScalar(p.scale * Math.min(1, lifeLeft * 2.2));
      this._dummy.updateMatrix();
      this.particleInst.setMatrixAt(i, this._dummy.matrix);
    }
    if (anyDirty) {
      this.particleInst.instanceMatrix.needsUpdate = true;
    }
  }
}
