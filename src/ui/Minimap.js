// Breath-of-the-Wild & Ghibli Topographic Radar Minimap ("右下角实时地形与家人星徽小地图")

const MAZE_PREVIEW_GRID = [
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

const WORLD_HALF = 92; // World X/Z extent baked into topographic base map (-92m .. +92m)
const TEX_SIZE = 512;

export class Minimap {
  constructor(app) {
    this.app = app;
    this.wrapEl = document.getElementById('minimap-wrap');
    this.canvas = document.getElementById('minimap-canvas');
    this.labelEl = document.getElementById('minimap-label');
    this.modeBtn = document.getElementById('minimap-mode-btn');

    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.size = 156;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Zoom radius in meters (click minimap to toggle close 50m vs wide valley 90m!)
    this.zoomRadii = [50, 88];
    this.zoomIdx = 0;
    this.northUp = false; // Default: intuitive BotW Camera-Forward-Up radar; toggleable via N / button

    this.baseMapCanvas = document.createElement('canvas');
    this.baseMapCanvas.width = TEX_SIZE;
    this.baseMapCanvas.height = TEX_SIZE;
    this._baked = false;
    this._lastLabel = '';

    this._setupCanvas();
    this._bindEvents();
  }

  _setupCanvas() {
    if (!this.canvas) return;
    this.canvas.width = this.size * this.dpr;
    this.canvas.height = this.size * this.dpr;
  }

  _bindEvents() {
    if (this.canvas) {
      this.canvas.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.sound.init();
        this.toggleZoom();
      });
    }
    if (this.modeBtn) {
      this.modeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.sound.init();
        this.toggleOrientation();
      });
    }
  }

  toggleZoom() {
    this.zoomIdx = (this.zoomIdx + 1) % this.zoomRadii.length;
    this.app.sound.pickup();
    this._refreshModeBadge();
  }

  toggleOrientation() {
    this.northUp = !this.northUp;
    this.app.sound.pickup();
    this._refreshModeBadge();
  }

  _refreshModeBadge() {
    if (!this.modeBtn) return;
    const r = this.zoomRadii[this.zoomIdx];
    this.modeBtn.textContent = `${this.northUp ? '正北' : '随视角'} · ${r === 50 ? '近景' : '全域'}`;
  }

  _worldToTex(wx, wz) {
    return [
      ((wx + WORLD_HALF) / (WORLD_HALF * 2)) * TEX_SIZE,
      ((wz + WORLD_HALF) / (WORLD_HALF * 2)) * TEX_SIZE,
    ];
  }

  _bakeTopographicBaseMap() {
    const world = this.app.world;
    if (!world) return;

    const ctx = this.baseMapCanvas.getContext('2d');
    const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    const data = img.data;
    const waterY = world.waterLevel;
    const step = (WORLD_HALF * 2) / TEX_SIZE;

    // 1. Sample terrain heightfield, hillshade & BotW contour lines
    for (let py = 0; py < TEX_SIZE; py++) {
      const wz = -WORLD_HALF + (py + 0.5) * step;
      const roadX = world.getRoadX(wz);

      for (let px = 0; px < TEX_SIZE; px++) {
        const wx = -WORLD_HALF + (px + 0.5) * step;
        const h = world.getTerrainHeight(wx, wz);
        const hE = world.getTerrainHeight(wx + 0.9, wz);
        const hS = world.getTerrainHeight(wx, wz + 0.9);
        const slope = (h - hE) * 0.65 + (h - hS) * 0.65;

        let r;
        let g;
        let b;

        if (h < waterY) {
          // Serene Mirror Lake cerulean-teal gradient
          const depth = Math.min(1, (waterY - h) / 2.6);
          r = 52 - depth * 20;
          g = 138 - depth * 32;
          b = 172 - depth * 22;
          // Subtle shoreline ripple highlight
          if (waterY - h < 0.22) {
            r += 28;
            g += 34;
            b += 26;
          }
        } else if (h < waterY + 0.24) {
          // Soft warm sandy bank
          r = 166;
          g = 156;
          b = 122;
        } else {
          // Lush Ghibli meadow elevation palette + directional hillshade
          const elevT = Math.max(0, Math.min(1, (h - waterY) / 7.5));
          r = 68 + elevT * 36 + slope * 26;
          g = 118 + elevT * 38 + slope * 28;
          b = 66 + elevT * 18 + slope * 14;

          // Delicate Breath-of-the-Wild topographic contour lines every 0.9m
          const contourPhase = Math.abs(((h * 1.12) % 1 + 1) % 1 - 0.5);
          if (contourPhase < 0.048) {
            r -= 15;
            g -= 18;
            b -= 12;
          }

          // Winding Flagstone Trail (outside lake water)
          if (Math.abs(wx - roadX) < 1.65) {
            r = 174;
            g = 162;
            b = 132;
          }
        }

        const idx = (py * TEX_SIZE + px) * 4;
        data[idx + 0] = Math.max(0, Math.min(255, r));
        data[idx + 1] = Math.max(0, Math.min(255, g));
        data[idx + 2] = Math.max(0, Math.min(255, b));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const pxPerMeter = TEX_SIZE / (WORLD_HALF * 2);

    // 2. Paint Mirror Lake Wooden Bridge (-12 .. +4)
    const bx = world.getRoadX(-4);
    const [btx, bty0] = this._worldToTex(bx, -12.2);
    const [, bty1] = this._worldToTex(bx, 4.2);
    ctx.fillStyle = '#9c6e44';
    ctx.fillRect(btx - 1.7 * pxPerMeter, bty0, 3.4 * pxPerMeter, bty1 - bty0);

    // 3. Paint Giant Glowing Lotus Stepping-Stones & Wishing Fountain Islet (-18.2, -4.6)
    const lotusCoords = [
      [-5.6, -1.6, 1.5],
      [-8.6, -2.5, 1.45],
      [-11.6, -3.3, 1.55],
      [-14.5, -4.0, 1.48],
    ];
    ctx.fillStyle = '#52c47c';
    for (const [lx, lz, lr] of lotusCoords) {
      const [tx, ty] = this._worldToTex(lx, lz);
      ctx.beginPath();
      ctx.arc(tx, ty, lr * pxPerMeter, 0, Math.PI * 2);
      ctx.fill();
    }
    {
      const [ix, iy] = this._worldToTex(-18.2, -4.6);
      ctx.fillStyle = '#ede6d5';
      ctx.beginPath();
      ctx.arc(ix, iy, 3.25 * pxPerMeter, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6ef4ff';
      ctx.beginPath();
      ctx.arc(ix, iy, 1.1 * pxPerMeter, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Paint 9x9 Whispering Starlight Hedge Labyrinth (-40, -34) so maze corridors are visible!
    {
      const cell = 2.9;
      const rows = MAZE_PREVIEW_GRID.length;
      const cols = MAZE_PREVIEW_GRID[0].length;
      const [mcx, mcy] = this._worldToTex(-40, -34);
      const halfSpan = (cols * cell * 0.5) * pxPerMeter;
      ctx.fillStyle = 'rgba(175, 170, 154, 0.78)';
      ctx.fillRect(mcx - halfSpan, mcy - halfSpan, halfSpan * 2, halfSpan * 2);

      ctx.fillStyle = '#255e38';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (MAZE_PREVIEW_GRID[r][c] !== '#') continue;
          const wx = -40 + (c - (cols - 1) * 0.5) * cell;
          const wz = -34 + (r - (rows - 1) * 0.5) * cell;
          const [tx, ty] = this._worldToTex(wx, wz);
          const hs = cell * 0.48 * pxPerMeter;
          ctx.fillRect(tx - hs, ty - hs, hs * 2, hs * 2);
        }
      }
    }

    // 5. Paint Starlight Blossom Cottage & Sakura Grove (34, 26)
    {
      const [cx, cy] = this._worldToTex(34, 26);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.62);
      ctx.fillStyle = '#b95c48';
      ctx.fillRect(-3.2 * pxPerMeter, -2.5 * pxPerMeter, 6.4 * pxPerMeter, 5.0 * pxPerMeter);
      ctx.strokeStyle = '#f7e6c4';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-3.2 * pxPerMeter, -2.5 * pxPerMeter, 6.4 * pxPerMeter, 5.0 * pxPerMeter);
      ctx.restore();

      // Soft Sakura tree canopies around cottage
      ctx.fillStyle = 'rgba(255, 168, 202, 0.65)';
      for (const [sx, sz] of [
        [39.5, 22.0],
        [37.5, 31.5],
        [27.5, 30.2],
      ]) {
        const [tx, ty] = this._worldToTex(sx, sz);
        ctx.beginPath();
        ctx.arc(tx, ty, 2.3 * pxPerMeter, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. Paint Golden Ginkgo Sanctuary (24, -34) & Bioluminescent Mushroom Glen (54, -18)
    {
      const [gx, gy] = this._worldToTex(24, -34);
      ctx.fillStyle = 'rgba(235, 198, 96, 0.58)';
      ctx.beginPath();
      ctx.arc(gx, gy, 4.5 * pxPerMeter, 0, Math.PI * 2);
      ctx.fill();

      const [mx, my] = this._worldToTex(54, -18);
      ctx.fillStyle = 'rgba(138, 108, 225, 0.42)';
      ctx.beginPath();
      ctx.arc(mx, my, 9.5 * pxPerMeter, 0, Math.PI * 2);
      ctx.fill();
    }

    this._baked = true;
  }

  _projectWorldPoint(wx, wz, playerPos, mapYaw, scale, maxR) {
    const dx = wx - playerPos.x;
    const dz = wz - playerPos.z;
    const u = (dx * Math.cos(mapYaw) - dz * Math.sin(mapYaw)) * scale;
    const v = (dx * Math.sin(mapYaw) + dz * Math.cos(mapYaw)) * scale;
    const dist = Math.hypot(u, v);
    if (dist <= maxR) {
      return { u, v, clamped: false, dist };
    }
    const k = maxR / (dist || 1);
    return { u: u * k, v: v * k, clamped: true, dist };
  }

  _drawStarShape(ctx, x, y, outerR, innerR, fillStyle, strokeStyle = null) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _drawCatMarker(ctx, x, y, color, borderColor, earTipColor = null) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.2;
    // Left & right pointy cat ears + round head
    ctx.beginPath();
    ctx.moveTo(-3.6, -1.2);
    ctx.lineTo(-4.0, -5.2);
    ctx.lineTo(-1.0, -3.2);
    ctx.lineTo(1.0, -3.2);
    ctx.lineTo(4.0, -5.2);
    ctx.lineTo(3.6, -1.2);
    ctx.arc(0, 0.3, 3.7, -0.25, Math.PI + 0.25, false);
    ctx.closePath();
    ctx.fill();
    if (earTipColor) {
      ctx.fillStyle = earTipColor;
      ctx.beginPath();
      ctx.moveTo(-3.6, -1.5);
      ctx.lineTo(-4.0, -5.2);
      ctx.lineTo(-1.2, -3.2);
      ctx.closePath();
      ctx.moveTo(3.6, -1.5);
      ctx.lineTo(4.0, -5.2);
      ctx.lineTo(1.2, -3.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  update() {
    if (!this.ctx || !this.app.ready) return;
    if (!this._baked) {
      this._bakeTopographicBaseMap();
      this._refreshModeBadge();
    }

    const ctx = this.ctx;
    const dpr = this.dpr;
    const S = this.size;
    const half = S * 0.5;
    const clipR = half - 6;

    const playerPos = this.app.playerPos;
    const mapYaw = this.northUp ? 0 : this.app.camYaw;
    const radarMeters = this.zoomRadii[this.zoomIdx];
    const scale = clipR / radarMeters; // CSS pixels per world meter

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, S, S);

    // 1. Circular Radar Clip & Rotated Pre-Baked Topographic World Texture
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, clipR, 0, Math.PI * 2);
    ctx.clip();

    // Deep outer valley background outside +-92m
    ctx.fillStyle = '#2d4732';
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(mapYaw);
    const worldSpanPx = WORLD_HALF * 2 * scale;
    const offsetX = -WORLD_HALF * scale - playerPos.x * scale;
    const offsetY = -WORLD_HALF * scale - playerPos.z * scale;
    ctx.drawImage(this.baseMapCanvas, offsetX, offsetY, worldSpanPx, worldSpanPx);
    ctx.restore();

    // Subtle dark vignette around inner edge for BotW radar depth
    const vig = ctx.createRadialGradient(half, half, clipR * 0.58, half, half, clipR);
    vig.addColorStop(0, 'rgba(10, 16, 24, 0)');
    vig.addColorStop(1, 'rgba(8, 14, 22, 0.48)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, S, S);

    // 2. Floating Sakura Sky Island Halo at (0, -16)
    {
      const pSky = this._projectWorldPoint(0, -16, playerPos, mapYaw, scale, clipR + 20);
      if (!pSky.clamped) {
        ctx.save();
        ctx.strokeStyle =
          playerPos.y > 24 ? 'rgba(255, 200, 226, 0.92)' : 'rgba(148, 238, 255, 0.48)';
        ctx.fillStyle =
          playerPos.y > 24 ? 'rgba(110, 205, 128, 0.55)' : 'rgba(165, 235, 255, 0.14)';
        ctx.lineWidth = playerPos.y > 24 ? 1.8 : 1.2;
        ctx.setLineDash(playerPos.y > 24 ? [] : [3, 3]);
        ctx.beginPath();
        ctx.arc(half + pSky.u, half + pSky.v, Math.max(4, 10.1 * scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Golden Wind Updraft Rings
    if (this.app.sky?.updrafts) {
      ctx.strokeStyle = 'rgba(126, 247, 255, 0.78)';
      ctx.lineWidth = 1.2;
      for (const up of this.app.sky.updrafts) {
        const p = this._projectWorldPoint(up.x, up.z, playerPos, mapYaw, scale, clipR - 4);
        if (p.clamped) continue;
        ctx.beginPath();
        ctx.arc(half + p.u, half + p.v, 3.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 4. Nearby Playful Monsters (soft coral dots)
    if (this.app.monsters?.monsters) {
      ctx.fillStyle = '#ff6b7a';
      for (const m of this.app.monsters.monsters) {
        if (!m.alive) continue;
        const p = this._projectWorldPoint(m.pos.x, m.pos.z, playerPos, mapYaw, scale, clipR - 5);
        if (p.clamped) continue;
        ctx.beginPath();
        ctx.arc(half + p.u, half + p.v, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Starlight Blossom Cottage & Husband Warm Home Marker (clamps to edge so home is always findable!)
    if (this.app.family?.husband) {
      const hp = this.app.family.husband.pos;
      const pHome = this._projectWorldPoint(hp.x, hp.z, playerPos, mapYaw, scale, clipR - 8);
      const hx = half + pHome.u;
      const hy = half + pHome.v;
      ctx.fillStyle = '#ff8fab';
      ctx.strokeStyle = '#241520';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(hx, hy, pHome.clamped ? 3.8 : 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tiny white roof/heart glint
      ctx.fillStyle = '#fff8ee';
      ctx.beginPath();
      ctx.arc(hx, hy - 0.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. 5 Heart-Star Keepsake Chests (unopened chests clamp to rim as golden guide stars!)
    if (this.app.puzzles?.chests) {
      for (const ch of this.app.puzzles.chests) {
        const p = this._projectWorldPoint(
          ch.pos.x,
          ch.pos.z,
          playerPos,
          mapYaw,
          scale,
          clipR - 8
        );
        if (ch.opened && p.clamped) continue;
        const sx = half + p.u;
        const sy = half + p.v;
        if (ch.opened) {
          this._drawStarShape(ctx, sx, sy, 4.4, 2.0, 'rgba(255, 226, 130, 0.55)');
        } else {
          const outer = p.clamped ? 4.6 : 5.8;
          this._drawStarShape(ctx, sx, sy, outer, outer * 0.45, '#ffe268', '#3b2b0a');
        }
      }
    }

    // 7. Blue Cat ("Broccoli") & Flame-Point Siamese ("Jelly") Live Cat-Ear Companion Markers!
    if (this.app.family?.broccoli || this.app.family?.russianBlue) {
      const rb = (this.app.family.broccoli || this.app.family.russianBlue).pos;
      const p = this._projectWorldPoint(rb.x, rb.z, playerPos, mapYaw, scale, clipR - 7);
      if (!p.clamped) {
        this._drawCatMarker(ctx, half + p.u, half + p.v, '#4b5566', '#b5cf82');
      }
    }
    if (this.app.family?.jelly || this.app.family?.maineCoon) {
      const mc = (this.app.family.jelly || this.app.family.maineCoon).pos;
      const p = this._projectWorldPoint(mc.x, mc.z, playerPos, mapYaw, scale, clipR - 7);
      if (!p.clamped) {
        this._drawCatMarker(ctx, half + p.u, half + p.v, '#faf4e8', '#c77733', '#e89c52');
      }
    }

    // 8. Camera Field-of-View Fan + Dengdeng Champion Direction Cursor at Center
    const camConeAngle = this.northUp ? this.app.camYaw : 0;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-camConeAngle);
    const coneGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    coneGrad.addColorStop(0, 'rgba(255, 244, 196, 0.34)');
    coneGrad.addColorStop(1, 'rgba(255, 244, 196, 0.0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34, -Math.PI * 0.5 - 0.40, -Math.PI * 0.5 + 0.40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Dengdeng Facing Arrow
    const charFwdU = Math.sin(this.app.charYaw - mapYaw);
    const charFwdV = Math.cos(this.app.charYaw - mapYaw);
    const arrowRot = Math.atan2(charFwdU, -charFwdV);
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(arrowRot);
    ctx.fillStyle = '#fff8dc';
    ctx.strokeStyle = '#24324a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -7.8);
    ctx.lineTo(5.4, 5.6);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-5.4, 5.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // End circular radar clip

    // 9. Gilded Breath-of-the-Wild Compass Bezel & Cardinal Ticks
    ctx.strokeStyle = 'rgba(244, 222, 168, 0.62)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(half, half, clipR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244, 222, 168, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(half, half, clipR + 3.2, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal ticks (E, S, W) + Glowing North ('N') Badge around Bezel
    const cardinals = [
      { label: 'N', dx: 0, dz: -1, north: true },
      { label: 'E', dx: 1, dz: 0, north: false },
      { label: 'S', dx: 0, dz: 1, north: false },
      { label: 'W', dx: -1, dz: 0, north: false },
    ];
    for (const c of cardinals) {
      const cu = (c.dx * Math.cos(mapYaw) - c.dz * Math.sin(mapYaw)) * clipR;
      const cv = (c.dx * Math.sin(mapYaw) + c.dz * Math.cos(mapYaw)) * clipR;
      const bx = half + cu;
      const by = half + cv;
      if (c.north) {
        ctx.fillStyle = '#192333';
        ctx.strokeStyle = '#ffd97d';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe28a';
        ctx.font = '700 9.5px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', bx, by + 0.5);
      } else {
        ctx.fillStyle = 'rgba(245, 228, 186, 0.72)';
        ctx.beginPath();
        ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // 10. Subtle Coordinate / Elevation Readout below Minimap
    if (this.labelEl) {
      const rx = Math.round(playerPos.x);
      const rz = Math.round(-playerPos.z);
      const ry = Math.round(playerPos.y);
      const tag = playerPos.y > 24 ? `☁️ 云端 ${ry}m` : `${rx}, ${rz} · ${ry}m`;
      if (tag !== this._lastLabel) {
        this._lastLabel = tag;
        this.labelEl.textContent = tag;
      }
    }
  }
}
