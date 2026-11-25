import * as THREE from 'three';

export const COMMON_NOISE_GLSL = /* glsl */ `
  float safePow(float x, float p) {
    return pow(max(x, 0.0001), p);
  }

  vec3 srgb(float r, float g, float b) {
    return pow(max(vec3(r, g, b), vec3(0.0001)), vec3(2.2));
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  // Synchronized drifting cloud shadow across terrain, grass, and ruins (0.0 = cloud shade, 1.0 = full sun)
  float sampleCloudLight(vec2 worldXZ, float uTime) {
    float c = fbm(worldXZ * 0.016 + vec2(uTime * 0.018, uTime * 0.011));
    return mix(0.46, 1.0, smoothstep(0.38, 0.66, c));
  }

  // Breath of the Wild directional atmospheric aerial perspective
  vec3 applyBotWAerialPerspective(vec3 color, vec3 viewVec, float dist, vec3 sunDir, vec3 horizonCol, vec3 sunGlowCol, float fogStrength) {
    vec3 V = normalize(viewVec);
    float sunAlign = max(0.0, dot(V, normalize(sunDir)));
    vec3 hazeCol = mix(horizonCol, sunGlowCol, safePow(sunAlign, 4.0) * 0.65);
    float f = 1.0 - exp(-dist * fogStrength);
    f = clamp(safePow(f, 1.25), 0.0, 0.90);
    return mix(color, hazeCol, f);
  }
`;

// ============================================================================
// 1. Breath of the Wild Sky Dome (Rayleigh + Mie Sun Halo + Ghibli Cumulus)
// ============================================================================
export function createBotWSkyDome(sharedUniforms) {
  const geo = new THREE.SphereGeometry(620, 64, 40);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uZenithColor: { value: new THREE.Color('#1a66d1') },
      uMidSkyColor: { value: new THREE.Color('#57b2f2') },
      uHorizonColor: sharedUniforms.uHorizonColor,
      uSunGlowColor: sharedUniforms.uSunGlowColor,
      uCloudLit: { value: new THREE.Color('#ffffff') },
      uCloudShade: { value: new THREE.Color('#b6d4f0') },
      uNightStars: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform float uNightStars;
      varying vec3 vDir;

      ${COMMON_NOISE_GLSL}

      void main() {
        vec3 D = normalize(vDir);
        vec3 S = normalize(uSunDir);
        float h = clamp(D.y, 0.0, 1.0);

        vec3 sky = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.22, h));
        sky = mix(sky, uZenithColor, safePow(h, 0.85));

        // Mie forward sun scattering halo & crisp solar disc
        float sunDot = max(0.0, dot(D, S));
        sky += uSunGlowColor * safePow(sunDot, 8.0) * 0.36;
        sky += vec3(1.0, 0.98, 0.90) * smoothstep(0.9985, 0.9996, sunDot) * 1.25;

        // Multi-layered Painterly Studio Ghibli Cumulus Cloud Billows (cleanly above horizon!)
        if (D.y > 0.08) {
          vec2 uv = D.xz / (D.y + 0.32) * 1.45 + vec2(uTime * 0.005, uTime * 0.0025);
          float base = fbm(uv);
          float puff = fbm(uv * 2.4 - vec2(0.15, 0.32));
          float density = base * 0.74 + puff * 0.26;

          float bandMask = smoothstep(0.09, 0.22, D.y) * (1.0 - smoothstep(0.52, 0.86, D.y));
          float cloudAlpha = smoothstep(0.55, 0.69, density) * bandMask;

          // Offset sample toward sun for crisp Ghibli gouache cloud rim-lighting!
          float litSample = fbm(uv + S.xz * 0.14 + vec2(0.0, 0.09));
          float celCloud = smoothstep(0.38, 0.58, litSample);
          vec3 cloudCol = mix(uCloudShade, uCloudLit, celCloud);
          cloudCol += uSunGlowColor * safePow(sunDot, 4.0) * 0.18 * celCloud;

          sky = mix(sky, cloudCol, cloudAlpha * 0.95);
        }

        // Subtle twinkling night stars when sun sets
        if (uNightStars > 0.02 && D.y > 0.08) {
          vec2 suv = floor(D.xz / (D.y + 0.3) * 260.0);
          float star = step(0.9965, hash21(suv));
          float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + suv.x);
          sky += vec3(0.90, 0.95, 1.0) * star * twinkle * uNightStars * smoothstep(0.08, 0.35, D.y);
        }

        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

// ============================================================================
// 2. Breath of the Wild Painterly Terrain (Meadow + Voronoi Flagstone + Cliff)
// ============================================================================
export function createBotWTerrainMaterial(sharedUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uSkyAmbient: sharedUniforms.uSkyAmbient,
      uHorizonColor: sharedUniforms.uHorizonColor,
      uSunGlowColor: sharedUniforms.uSunGlowColor,
      uFogStrength: sharedUniforms.uFogStrength,
      uWaterLevel: { value: -0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyAmbient;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform float uFogStrength;
      uniform float uWaterLevel;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      ${COMMON_NOISE_GLSL}

      // Procedural Voronoi cellular distance for weathered Hylian flagstone pavers!
      vec2 voronoi(vec2 x) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float md = 8.0;
        float md2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + 17.3));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md2 = md;
              md = d;
            } else if (d < md2) {
              md2 = d;
            }
          }
        }
        return vec2(sqrt(md), sqrt(md2) - sqrt(md));
      }

      // Winding Hyrule trail curve x(z)
      float roadCenterX(float z) {
        return sin(z * 0.055) * 9.5 + sin(z * 0.022 + 0.8) * 6.0;
      }

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec2 xz = vWorldPos.xz;

        float macro = fbm(xz * 0.035);
        float mid = fbm(xz * 0.18 + 9.4);
        float detail = vnoise(xz * 1.4);

        // 1. Rich Breath-of-the-Wild Mottled Meadow Palette (Linear space)
        vec3 grassEmerald = srgb(0.24, 0.56, 0.21);
        vec3 grassSunOlive = srgb(0.44, 0.68, 0.25);
        vec3 grassDeepJade = srgb(0.16, 0.42, 0.22);

        vec3 meadow = mix(grassEmerald, grassSunOlive, smoothstep(0.32, 0.70, macro));
        meadow = mix(meadow, grassDeepJade, smoothstep(0.52, 0.84, mid) * 0.45);
        meadow *= 0.88 + detail * 0.24;

        // 2. Weathered Hylian Flagstone & Earth Trail (with grass growing between stones!)
        float rx = roadCenterX(xz.y);
        float dRoad = abs(xz.x - rx + (mid - 0.5) * 1.3);
        // Pause stone road over the wooden lake bridge (-11 < z < 3)
        float bridgeGap = smoothstep(4.5, 10.5, abs(xz.y + 4.0));
        float roadMask = (1.0 - smoothstep(1.1, 2.5, dRoad)) * bridgeGap;

        vec3 earthCol = mix(srgb(0.64, 0.54, 0.40), srgb(0.50, 0.42, 0.31), mid);
        vec2 vor = voronoi(xz * 1.35);
        float stoneEdge = smoothstep(0.06, 0.15, vor.y) * step(0.38, vnoise(xz * 0.45));
        vec3 paverCol = mix(srgb(0.70, 0.67, 0.60), srgb(0.58, 0.56, 0.50), detail);
        vec3 trailCol = mix(earthCol, paverCol, stoneEdge * 0.82);

        // 3. Natural Lake Sand, Pebbles & Wet Shoreline
        float hAboveWater = vWorldPos.y - uWaterLevel;
        float beachMask = 1.0 - smoothstep(0.08, 0.85 + (macro - 0.5) * 0.45, hAboveWater);
        vec3 sandCol = mix(srgb(0.80, 0.73, 0.58), srgb(0.68, 0.60, 0.46), mid);
        float wet = 1.0 - smoothstep(-0.15, 0.24, hAboveWater);
        sandCol = mix(sandCol, srgb(0.35, 0.45, 0.43), wet * 0.62);

        // 4. Stratified Hyrule Limestone Cliffs & Mossy Ledges
        float slope = 1.0 - N.y;
        float cliffMask = smoothstep(0.18, 0.36, slope + (mid - 0.5) * 0.12);
        float strata = vnoise(vec2(vWorldPos.y * 1.65, (xz.x - xz.y) * 0.22));
        float cracks = vnoise(vec2(xz.x * 0.9, vWorldPos.y * 0.85));
        vec3 rockWarm = srgb(0.58, 0.56, 0.51);
        vec3 rockCool = srgb(0.40, 0.44, 0.49);
        vec3 cliffCol = mix(rockCool, rockWarm, smoothstep(0.28, 0.72, strata * 0.7 + cracks * 0.3));
        // Perturb normal slightly on cliffs for crisp cel rock facets!
        N = normalize(N + vec3((cracks - 0.5) * 0.28, (strata - 0.5) * 0.22, (mid - 0.5) * 0.28) * cliffMask);

        vec3 albedo = mix(meadow, trailCol, roadMask * 0.88);
        albedo = mix(albedo, sandCol, beachMask);
        albedo = mix(albedo, cliffCol, cliffMask);

        // Synchronized Cloud Shadows + Soft Cel Sun Illumination
        float cloudLight = sampleCloudLight(xz, uTime);
        float ndl = dot(N, normalize(uSunDir));
        float celLight = smoothstep(-0.05, 0.24, ndl) * cloudLight;

        vec3 shadowAmb = uSkyAmbient * 0.92;
        vec3 lit = albedo * mix(shadowAmb, uSunColor * 1.08, celLight);

        vec3 viewVec = vWorldPos - cameraPosition;
        float dist = length(viewVec);
        vec3 finalCol = applyBotWAerialPerspective(
          lit, viewVec, dist, uSunDir, uHorizonColor, uSunGlowColor, uFogStrength
        );

        gl_FragColor = vec4(finalCol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ============================================================================
// 3. 85,000-Blade BotW Grass Shader (Cloud Shadows, Sun Translucency & Foot Parting!)
// ============================================================================
export function createBotWGrassMaterial(sharedUniforms) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uSkyAmbient: sharedUniforms.uSkyAmbient,
      uHorizonColor: sharedUniforms.uHorizonColor,
      uSunGlowColor: sharedUniforms.uSunGlowColor,
      uFogStrength: sharedUniforms.uFogStrength,
      uPlayerPos: sharedUniforms.uPlayerPos,
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uPlayerPos;

      varying float vH;
      varying vec3 vWorldPos;
      varying vec3 vBladeTint;
      varying float vGust;

      void main() {
        vH = clamp(position.y / 0.54, 0.0, 1.0);
        vec4 baseWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

        // Smooth distance taper beyond 85m so grass melts into distant hills with zero pop-in!
        float camDist = distance(baseWorld.xz, cameraPosition.xz);
        float distScale = 1.0 - smoothstep(72.0, 118.0, camDist);

        // Sweeping Studio Ghibli wind waves
        float wave1 = sin(uTime * 2.2 + baseWorld.x * 0.13 + baseWorld.z * 0.10);
        float wave2 = cos(uTime * 1.5 - baseWorld.x * 0.07 + baseWorld.z * 0.16);
        float gust = wave1 * 0.65 + wave2 * 0.35;
        vGust = gust * 0.5 + 0.5;

        vec3 local = position * distScale;
        vec4 wp = instanceMatrix * vec4(local, 1.0);

        float flex = vH * vH;
        wp.x += gust * 0.19 * flex;
        wp.z += wave2 * 0.12 * flex;
        wp.y -= abs(gust) * 0.035 * flex;

        // Interactive Footstep Grass-Parting around Champion Dengdeng!
        vec2 toBlade = wp.xz - uPlayerPos.xz;
        float pDist = length(toBlade);
        if (pDist < 1.15 && abs(baseWorld.y - uPlayerPos.y) < 1.5) {
          float push = (1.0 - pDist / 1.15) * flex * 0.52;
          vec2 pushDir = normalize(toBlade + vec2(0.0001));
          wp.xz += pushDir * push;
          wp.y -= push * 0.35;
        }

        vWorldPos = wp.xyz;
        #ifdef USE_INSTANCING_COLOR
          vBladeTint = instanceColor;
        #else
          vBladeTint = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyAmbient;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform float uFogStrength;

      varying float vH;
      varying vec3 vWorldPos;
      varying vec3 vBladeTint;
      varying float vGust;

      ${COMMON_NOISE_GLSL}

      void main() {
        vec2 xz = vWorldPos.xz;
        float macro = fbm(xz * 0.035);

        // Root matches exact BotW terrain meadow green -> sunlit tip (Linear space)!
        vec3 rootBase = mix(srgb(0.21, 0.50, 0.19), srgb(0.38, 0.62, 0.23), smoothstep(0.32, 0.70, macro));
        vec3 tipBase = mix(srgb(0.44, 0.75, 0.28), srgb(0.64, 0.85, 0.33), smoothstep(0.32, 0.70, macro));

        vec3 albedo = mix(rootBase, tipBase, safePow(vH, 0.9)) * vBladeTint;
        // Subtle wind wave sheen across rolling grass crests
        albedo += srgb(0.32, 0.38, 0.14) * smoothstep(0.62, 0.96, vGust) * vH * 0.35;

        // Synchronized Cloud Shadows!
        float cloudLight = sampleCloudLight(xz, uTime);
        vec3 lit = albedo * mix(uSkyAmbient * 0.92, uSunColor * 1.08, cloudLight);

        // Backlit Subsurface Sun Translucency (golden-lime glow when looking toward the sun!)
        vec3 viewVec = vWorldPos - cameraPosition;
        float backSun = max(0.0, dot(normalize(viewVec), normalize(uSunDir)));
        lit += srgb(0.65, 0.78, 0.25) * safePow(backSun, 4.0) * vH * cloudLight * 0.55;

        float dist = length(viewVec);
        vec3 finalCol = applyBotWAerialPerspective(
          lit, viewVec, dist, uSunDir, uHorizonColor, uSunGlowColor, uFogStrength
        );

        gl_FragColor = vec4(finalCol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ============================================================================
// 4. Authentic 4-Band Studio Ghibli Cel-Foliage Shader
// ============================================================================
export function createGhibliFoliageMaterial(sharedUniforms, paletteHex) {
  const colors = paletteHex.map((h) => new THREE.Color(h));
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uHorizonColor: sharedUniforms.uHorizonColor,
      uSunGlowColor: sharedUniforms.uSunGlowColor,
      uFogStrength: sharedUniforms.uFogStrength,
      uColorMap: { value: colors },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        #ifdef USE_INSTANCING
          mat4 mMat = modelMatrix * instanceMatrix;
        #else
          mat4 mMat = modelMatrix;
        #endif

        vec4 wp = mMat * vec4(position, 1.0);
        // Gentle Studio Ghibli leaf-clump breeze rustle!
        float rustle = sin(uTime * 2.1 + wp.x * 0.8 + wp.y * 0.6) * 0.055;
        wp.x += rustle;
        wp.z += cos(uTime * 1.7 + wp.z * 0.7) * 0.045;

        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(mMat) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform float uFogStrength;
      uniform vec3 uColorMap[4];

      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      ${COMMON_NOISE_GLSL}

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        float cloudLight = sampleCloudLight(vWorldPos.xz, uTime);
        float b = dot(N, L) * (0.35 + 0.65 * cloudLight);

        // Soft-feathered 4-band Studio Ghibli gouache leaf steps!
        vec3 col = uColorMap[3];
        col = mix(col, uColorMap[2], smoothstep(-0.18, -0.04, b));
        col = mix(col, uColorMap[1], smoothstep(0.18, 0.32, b));
        col = mix(col, uColorMap[0], smoothstep(0.58, 0.74, b));

        col *= mix(srgb(0.82, 0.88, 0.96), uSunColor, 0.80);

        vec3 viewVec = vWorldPos - cameraPosition;
        vec3 finalCol = applyBotWAerialPerspective(
          col, viewVec, length(viewVec), uSunDir, uHorizonColor, uSunGlowColor, uFogStrength
        );
        gl_FragColor = vec4(finalCol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ============================================================================
// 5. Breath of the Wild Fresnel Sky-Reflective Lake Water Shader
// ============================================================================
export function createBotWWaterMaterial(sharedUniforms) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uHorizonColor: sharedUniforms.uHorizonColor,
      uSunGlowColor: sharedUniforms.uSunGlowColor,
      uFogStrength: sharedUniforms.uFogStrength,
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.55 + uTime * 1.8) * cos(wp.z * 0.5 + uTime * 1.4) * 0.025;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform float uFogStrength;
      varying vec3 vWorldPos;

      ${COMMON_NOISE_GLSL}

      void main() {
        vec2 xz = vWorldPos.xz;

        // Dual-scale animated water surface normal ripples
        float e = 0.25;
        float n0 = fbm(xz * 0.75 + vec2(uTime * 0.28, uTime * 0.18));
        float nx = fbm((xz + vec2(e, 0.0)) * 0.75 + vec2(uTime * 0.28, uTime * 0.18));
        float nz = fbm((xz + vec2(0.0, e)) * 0.75 + vec2(uTime * 0.28, uTime * 0.18));
        vec3 N = normalize(vec3((n0 - nx) * 0.55, 1.0, (n0 - nz) * 0.55));

        vec3 viewVec = vWorldPos - cameraPosition;
        vec3 V = normalize(-viewVec);
        vec3 S = normalize(uSunDir);

        // Fresnel sky reflection blended with crystal aquamarine-cobalt water body!
        float fresnel = safePow(clamp(1.0 - max(0.0, dot(N, V)), 0.0, 1.0), 3.2);
        vec3 deepCobalt = srgb(0.08, 0.41, 0.65);
        vec3 crystalAqua = srgb(0.18, 0.68, 0.76);
        vec3 waterBody = mix(deepCobalt, crystalAqua, n0 * 0.55 + 0.2);

        vec3 skyRefl = mix(srgb(0.38, 0.70, 0.94), uHorizonColor, 0.55);
        vec3 col = mix(waterBody, skyRefl, clamp(fresnel * 0.82 + 0.14, 0.0, 0.92));

        // Crisp Breath-of-the-Wild solar specular glints!
        vec3 H = normalize(S + V);
        float spec = safePow(max(0.0, dot(N, H)), 140.0);
        float celGlint = smoothstep(0.32, 0.55, spec);
        col += uSunColor * celGlint * 1.15;

        col = applyBotWAerialPerspective(
          col, viewVec, length(viewVec), uSunDir, uHorizonColor, uSunGlowColor, uFogStrength
        );
        gl_FragColor = vec4(col, 0.88);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ============================================================================
// 6. Studio Ghibli / BotW Mossy Limestone Boulder & Ruin Shader
// ============================================================================
export function createBotWRockMaterial(sharedUniforms, baseTint = [0.68, 0.65, 0.59]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uSkyAmbient: sharedUniforms.uSkyAmbient,
      uHorizonColor: sharedUniforms.uHorizonColor,
      uSunGlowColor: sharedUniforms.uSunGlowColor,
      uFogStrength: sharedUniforms.uFogStrength,
      uBaseTint: { value: new THREE.Vector3(...baseTint) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyAmbient;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform float uFogStrength;
      uniform vec3 uBaseTint;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      ${COMMON_NOISE_GLSL}

      void main() {
        vec3 N = normalize(vWorldNormal);
        float strata = vnoise(vec2(vWorldPos.y * 2.1, (vWorldPos.x - vWorldPos.z) * 0.55));
        float grain = fbm(vWorldPos.xz * 1.4 + vWorldPos.y);

        vec3 warmStone = srgb(uBaseTint.x, uBaseTint.y, uBaseTint.z);
        vec3 coolStone = srgb(uBaseTint.x * 0.76, uBaseTint.y * 0.80, uBaseTint.z * 0.88);
        vec3 albedo = mix(coolStone, warmStone, smoothstep(0.25, 0.75, strata * 0.65 + grain * 0.35));

        // Natural emerald moss cushion on upward-facing stone surfaces
        float mossMask = smoothstep(0.58, 0.84, N.y + (grain - 0.5) * 0.32);
        vec3 mossCol = mix(srgb(0.24, 0.54, 0.21), srgb(0.38, 0.65, 0.25), grain);
        albedo = mix(albedo, mossCol, mossMask * 0.85);

        float cloudLight = sampleCloudLight(vWorldPos.xz, uTime);
        float ndl = dot(N, normalize(uSunDir));
        float cel = smoothstep(-0.06, 0.22, ndl) * cloudLight;
        vec3 lit = albedo * mix(uSkyAmbient * 0.90, uSunColor * 1.06, cel);

        vec3 viewVec = vWorldPos - cameraPosition;
        vec3 finalCol = applyBotWAerialPerspective(
          lit, viewVec, length(viewVec), uSunDir, uHorizonColor, uSunGlowColor, uFogStrength
        );
        gl_FragColor = vec4(finalCol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
