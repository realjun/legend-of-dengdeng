/**
 * scripts/prepare-assets.mjs
 *
 * Reproducible, zero-photo asset build pipeline (runs automatically on `predev` / `prebuild`):
 * 1. Downloads open-source CC0 / MIT base 3D assets from official GitHub repositories:
 *    - @pixiv/three-vrm official VRM 1.0 humanoid base (MIT)
 *    - craftzdog/ghibli-style-shader sculpted Ghibli foliage (MIT)
 *    - RhodoniteTS / Quaternius humanoid 60fps .vrma mocap clips (CC0)
 * 2. Procedurally bakes Breath-of-the-Wild Champion's Tunic embroidery, leather baldric,
 *    Hylian riding shorts, leather boots, and natural dark hair onto the VRM UV textures
 *    while preserving baked cloth-fold AO & strand highlights.
 * 3. Emits 768 KB chunks + manifest under `public/models/` and copies Three.js Draco decoders.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.asset-cache');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, 'models');
const CHUNKS_DIR = path.join(MODELS_DIR, 'chunks');
const ANIMS_DIR = path.join(PUBLIC_DIR, 'animations');
const DRACO_DIR = path.join(PUBLIC_DIR, 'draco');

const UPSTREAM = {
  vrm: 'https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
  trees: 'https://raw.githubusercontent.com/craftzdog/ghibli-style-shader/master/public/trees.glb',
  vrmaBase: 'https://raw.githubusercontent.com/actnwit/RhodoniteTS/main/assets/vrma',
  clips: ['Idle', 'Walk', 'Run', 'JumpUp', 'Floating'],
};

const CHUNK_SIZE = 768 * 1024;

async function downloadCached(url, cacheName) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const dest = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    return fs.readFileSync(dest);
  }
  console.log(`[prepare-assets] Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf;
}

// --- Minimal 2D anti-aliased raster helpers on raw RGBA buffers ---
function blendPx(data, w, h, x, y, r, g, b, alpha = 1) {
  if (x < 0 || x >= w || y < 0 || y >= h || alpha <= 0) return;
  const idx = (y * w + x) * 4;
  const inv = 1 - alpha;
  data[idx] = Math.round(data[idx] * inv + r * alpha);
  data[idx + 1] = Math.round(data[idx + 1] * inv + g * alpha);
  data[idx + 2] = Math.round(data[idx + 2] * inv + b * alpha);
}

function drawThickLine(png, x0, y0, x1, y1, width, rgb) {
  const { data, width: w, height: h } = png;
  const half = width * 0.5;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - half - 2));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + half + 2));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - half - 2));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + half + 2));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy || 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / lenSq));
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const dist = Math.hypot(x - px, y - py);
      if (dist <= half + 0.8) {
        const a = Math.max(0, Math.min(1, half + 0.5 - dist));
        blendPx(data, w, h, x, y, rgb[0], rgb[1], rgb[2], a);
      }
    }
  }
}

function fillRect(png, x0, y0, x1, y1, rgb) {
  const { data, width: w, height: h } = png;
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      blendPx(data, w, h, x, y, rgb[0], rgb[1], rgb[2], 1);
    }
  }
}

function strokeRect(png, x0, y0, x1, y1, width, rgb) {
  drawThickLine(png, x0, y0, x1, y0, width, rgb);
  drawThickLine(png, x1, y0, x1, y1, width, rgb);
  drawThickLine(png, x1, y1, x0, y1, width, rgb);
  drawThickLine(png, x0, y1, x0, y0, width, rgb);
}

function fillTriangle(png, ax, ay, bx, by, cx, cy, rgb) {
  const { data, width: w, height: h } = png;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) || 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area;
      const w1 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
        blendPx(data, w, h, x, y, rgb[0], rgb[1], rgb[2], 1);
      }
    }
  }
}

function drawArc(png, cx, cy, rx, ry, degStart, degEnd, width, rgb) {
  const steps = 48;
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i <= steps; i++) {
    const rad = ((degStart + ((degEnd - degStart) * i) / steps) * Math.PI) / 180;
    const x = cx + Math.cos(rad) * rx;
    const y = cy + Math.sin(rad) * ry;
    if (i > 0) drawThickLine(png, prevX, prevY, x, y, width, rgb);
    prevX = x;
    prevY = y;
  }
}

function bakeChampionTunic(srcBuf) {
  const src = PNG.sync.read(srcBuf);
  const { width: w, height: h } = src;
  const out = new PNG({ width: w, height: h });

  // Fill base BotW Champion Azure
  for (let i = 0; i < w * h * 4; i += 4) {
    out.data[i] = 44;
    out.data[i + 1] = 154;
    out.data[i + 2] = 214;
    out.data[i + 3] = 255;
  }

  const ivory = [249, 243, 228];
  const gold = [238, 204, 118];
  const leather = [106, 63, 35];
  const leatherDark = [68, 39, 21];

  const drawCrest = (cx, topY, bottomY, isFront) => {
    if (isFront) {
      drawArc(out, cx, topY - 11, 134, 83, 12, 168, 18, ivory);
      drawArc(out, cx, topY - 14, 118, 70, 15, 165, 6, gold);
    }
    const swordTop = topY + 78;
    const swordBot = bottomY - 88;
    drawThickLine(out, cx, swordTop, cx, swordBot, 16, ivory);
    drawThickLine(out, cx, swordTop + 10, cx, swordBot - 10, 4, gold);

    const wy = swordTop + 70;
    drawThickLine(out, cx - 165, wy + 48, cx - 62, wy, 15, ivory);
    drawThickLine(out, cx - 62, wy, cx + 62, wy, 15, ivory);
    drawThickLine(out, cx + 62, wy, cx + 165, wy + 48, 15, ivory);
    drawThickLine(out, cx - 135, wy + 96, cx - 48, wy + 52, 12, ivory);
    drawThickLine(out, cx + 135, wy + 96, cx + 48, wy + 52, 12, ivory);

    for (const s of [-1, 1]) {
      const dx = cx + s * 145;
      const dy = wy + 195;
      const r = 34;
      const rx = Math.round(r * 0.78);
      drawThickLine(out, dx, dy - r, dx + rx, dy, 10, ivory);
      drawThickLine(out, dx + rx, dy, dx, dy + r, 10, ivory);
      drawThickLine(out, dx, dy + r, dx - rx, dy, 10, ivory);
      drawThickLine(out, dx - rx, dy, dx, dy - r, 10, ivory);
    }

    fillRect(out, 220, bottomY - 44, 804, bottomY - 26, ivory);
    fillRect(out, 220, bottomY - 18, 804, bottomY - 8, gold);
    for (let tx = 244; tx < 780; tx += 52) {
      fillTriangle(out, tx, bottomY - 50, tx + 16, bottomY - 80, tx + 32, bottomY - 50, ivory);
    }

    if (isFront) {
      drawThickLine(out, cx + 148, topY + 10, cx - 195, bottomY - 40, 38, leatherDark);
      drawThickLine(out, cx + 148, topY + 10, cx - 195, bottomY - 40, 28, leather);
      const bx = cx - 18;
      const by = topY + 265;
      strokeRect(out, bx - 24, by - 22, bx + 24, by + 22, 7, gold);
    } else {
      drawThickLine(out, cx - 148, topY + 15, cx + 195, bottomY - 40, 38, leatherDark);
      drawThickLine(out, cx - 148, topY + 15, cx + 195, bottomY - 40, 28, leather);
    }
  };

  drawCrest(512, 215, 838, true);
  drawCrest(512, 1215, 1885, false);

  for (const syOff of [0, 1024]) {
    drawThickLine(out, 56, 260 + syOff, 124, 462 + syOff, 18, ivory);
    drawThickLine(out, 74, 255 + syOff, 142, 456 + syOff, 6, gold);
    drawThickLine(out, 968, 260 + syOff, 900, 462 + syOff, 18, ivory);
    drawThickLine(out, 950, 255 + syOff, 882, 456 + syOff, 6, gold);
  }

  // Multiply by original VRoid baked cloth-fold AO
  for (let i = 0; i < w * h * 4; i += 4) {
    const lum = (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255;
    const ao = Math.min(1, lum * 1.03);
    out.data[i] = Math.round(out.data[i] * ao);
    out.data[i + 1] = Math.round(out.data[i + 1] * ao);
    out.data[i + 2] = Math.round(out.data[i + 2] * ao);
  }

  return PNG.sync.write(out);
}

function bakeHylianBottoms(srcBuf) {
  const src = PNG.sync.read(srcBuf);
  const { width: w, height: h } = src;
  const out = new PNG({ width: w, height: h });

  for (let i = 0; i < w * h * 4; i += 4) {
    out.data[i] = 226;
    out.data[i + 1] = 214;
    out.data[i + 2] = 188;
    out.data[i + 3] = 255;
  }
  fillRect(out, 40, 44, 984, 96, [108, 65, 36]);
  strokeRect(out, 482, 46, 542, 94, 8, [238, 202, 110]);

  for (let i = 0; i < w * h * 4; i += 4) {
    const gray = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    const fold = Math.min(255, 168 + gray * 2.1) / 255;
    out.data[i] = Math.round(out.data[i] * fold);
    out.data[i + 1] = Math.round(out.data[i + 1] * fold);
    out.data[i + 2] = Math.round(out.data[i + 2] * fold);
  }
  return PNG.sync.write(out);
}

function bakeAdventureBoots(srcBuf) {
  const src = PNG.sync.read(srcBuf);
  const { width: w, height: h } = src;
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) {
    const v = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    if (v < 85) {
      const t = v / 85;
      out.data[i] = Math.round(78 + t * 58);
      out.data[i + 1] = Math.round(46 + t * 38);
      out.data[i + 2] = Math.round(26 + t * 22);
    } else {
      const t = (v - 85) / 170;
      out.data[i] = Math.round(195 + t * 52);
      out.data[i + 1] = Math.round(182 + t * 54);
      out.data[i + 2] = Math.round(158 + t * 56);
    }
    out.data[i + 3] = 255;
  }
  return PNG.sync.write(out);
}

function bakeDarkHair(srcBuf) {
  const src = PNG.sync.read(srcBuf);
  const { width: w, height: h } = src;
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) {
    const lum = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    const t = Math.pow(lum / 255, 1.35);
    out.data[i] = Math.min(255, Math.round(16 + t * 46));
    out.data[i + 1] = Math.min(255, Math.round(14 + t * 40));
    out.data[i + 2] = Math.min(255, Math.round(16 + t * 39));
    out.data[i + 3] = 255;
  }
  return PNG.sync.write(out);
}

function resizePngBox(srcBuf, dstW, dstH) {
  const src = PNG.sync.read(srcBuf);
  const out = new PNG({ width: dstW, height: dstH });
  const sx = src.width / dstW;
  const sy = src.height / dstH;
  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(src.height - 1, Math.floor(y * sy));
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(src.width - 1, Math.floor(x * sx));
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * dstW + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

async function buildChampionVrm() {
  const manifestPath = path.join(MODELS_DIR, 'dengdeng_manifest.json');
  if (fs.existsSync(manifestPath)) {
    console.log('[prepare-assets] VRM chunks already present, skipping VRM bake.');
    return;
  }

  const rawVrm = await downloadCached(UPSTREAM.vrm, 'VRM1_Constraint_Twist_Sample.vrm');
  const jsonLen = rawVrm.readUInt32LE(12);
  const j = JSON.parse(rawVrm.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const binLen = rawVrm.readUInt32LE(20 + jsonLen);
  const binData = rawVrm.subarray(binStart, binStart + binLen);

  console.log('[prepare-assets] Baking Champion Tunic & natural dark hair UV textures...');
  const replacements = new Map();
  for (const im of j.images) {
    const name = im.name || '';
    const bvIdx = im.bufferView;
    const bv = j.bufferViews[bvIdx];
    const off = bv.byteOffset || 0;
    const slice = binData.subarray(off, off + bv.byteLength);

    if (name === 'Tops_01') replacements.set(bvIdx, bakeChampionTunic(slice));
    else if (name === 'Bottoms_01') replacements.set(bvIdx, bakeHylianBottoms(slice));
    else if (name === 'Shoes_01') replacements.set(bvIdx, bakeAdventureBoots(slice));
    else if (name === 'Hair_00' || name === 'HairBack_00') replacements.set(bvIdx, bakeDarkHair(slice));
    else if (name === 'Thumbnail') replacements.set(bvIdx, resizePngBox(slice, 64, 64));
    else if (name === 'Body_00_nml') replacements.set(bvIdx, resizePngBox(slice, 1024, 1024));
  }

  for (const m of j.materials || []) {
    const mtoon = m.extensions?.VRMC_materials_mtoon;
    if (!mtoon) continue;
    const mname = m.name || '';
    if (mname.includes('Tops')) {
      mtoon.shadeColorFactor = [0.58, 0.72, 0.88];
      mtoon.parametricRimColorFactor = [0.72, 0.9, 1.0];
      mtoon.parametricRimLiftFactor = 0.06;
      mtoon.parametricRimFresnelPowerFactor = 4.8;
    } else if (mname.includes('SKIN')) {
      mtoon.shadeColorFactor = [0.93, 0.76, 0.71];
      mtoon.parametricRimColorFactor = [0.98, 0.92, 0.8];
      mtoon.parametricRimLiftFactor = 0.04;
      mtoon.parametricRimFresnelPowerFactor = 5.2;
    } else if (mname.includes('HAIR')) {
      mtoon.shadeColorFactor = [0.65, 0.64, 0.68];
      mtoon.parametricRimColorFactor = [0.38, 0.36, 0.38];
      mtoon.parametricRimLiftFactor = 0.04;
      mtoon.parametricRimFresnelPowerFactor = 5.0;
    }
  }

  const bvOrder = j.bufferViews
    .map((bv, idx) => [idx, bv])
    .sort((a, b) => (a[1].byteOffset || 0) - (b[1].byteOffset || 0));

  const chunksOut = [];
  let binCursor = 0;
  let prevEnd = 0;
  const origOffsets = new Map();

  for (const [bvIdx, bv] of bvOrder) {
    const origOff = bv.byteOffset || 0;
    const origLen = bv.byteLength;
    if (origOff < prevEnd && !replacements.has(bvIdx)) {
      bv.byteOffset = origOffsets.get(origOff) ?? binCursor;
      continue;
    }
    const part = replacements.get(bvIdx) || binData.subarray(origOff, origOff + origLen);
    const pad = (4 - (binCursor % 4)) % 4;
    if (pad > 0) {
      chunksOut.push(Buffer.alloc(pad));
      binCursor += pad;
    }
    origOffsets.set(origOff, binCursor);
    bv.byteOffset = binCursor;
    bv.byteLength = part.length;
    chunksOut.push(part);
    binCursor += part.length;
    prevEnd = Math.max(prevEnd, origOff + origLen);
  }

  const endPad = (4 - (binCursor % 4)) % 4;
  if (endPad > 0) {
    chunksOut.push(Buffer.alloc(endPad));
    binCursor += endPad;
  }
  const newBin = Buffer.concat(chunksOut, binCursor);
  j.buffers[0].byteLength = newBin.length;

  let jsonBytes = Buffer.from(JSON.stringify(j), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad > 0) {
    jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  }

  const totalLen = 12 + 8 + jsonBytes.length + 8 + newBin.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(jsonBytes.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(newBin.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4);

  const glbBytes = Buffer.concat([header, jsonBytes, binHdr, newBin], totalLen);
  const digest = crypto.createHash('sha256').update(glbBytes).digest('hex').slice(0, 10);

  fs.rmSync(CHUNKS_DIR, { recursive: true, force: true });
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });

  const manifestChunks = [];
  let idx = 0;
  for (let start = 0; start < totalLen; start += CHUNK_SIZE) {
    const slice = glbBytes.subarray(start, Math.min(totalLen, start + CHUNK_SIZE));
    const fname = `dengdeng_${String(idx++).padStart(2, '0')}.bin`;
    fs.writeFileSync(path.join(CHUNKS_DIR, fname), slice);
    manifestChunks.push({
      url: `models/chunks/${fname}?h=${digest}`,
      byteLength: slice.length,
    });
  }

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ hash: digest, totalBytes: totalLen, chunks: manifestChunks }, null, 2)
  );
  console.log(`[prepare-assets] Emitted ${manifestChunks.length} VRM chunks (${(totalLen / 1048576).toFixed(2)} MB).`);
}

async function bakeGhibliFoliageBin(treesBuf, outPath) {
  const dracoJsPath = path.join(ROOT, 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js');
  if (!fs.existsSync(dracoJsPath)) return;

  const ctx = { console };
  vm.runInNewContext(fs.readFileSync(dracoJsPath, 'utf8'), ctx);
  const draco = await ctx.DracoDecoderModule({});

  const jsonLen = treesBuf.readUInt32LE(12);
  const j = JSON.parse(treesBuf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const prim = j.meshes[0].primitives[0];
  const ext = prim.extensions.KHR_draco_mesh_compression;
  const bv = j.bufferViews[ext.bufferView];
  const compSlice = treesBuf.subarray(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);

  const decoder = new draco.Decoder();
  const buffer = new draco.DecoderBuffer();
  const rawArr = new Int8Array(compSlice.buffer, compSlice.byteOffset, compSlice.byteLength);
  buffer.Init(rawArr, compSlice.byteLength);

  const mesh = new draco.Mesh();
  const status = decoder.DecodeBufferToMesh(buffer, mesh);
  if (!status.ok()) {
    draco.destroy(mesh);
    draco.destroy(buffer);
    draco.destroy(decoder);
    throw new Error(`Draco decode failed: ${status.error_msg()}`);
  }

  const vCount = mesh.num_points();
  const fCount = mesh.num_faces();

  const extractFloatAttr = (uniqueId, itemSize) => {
    const attr = decoder.GetAttributeByUniqueId(mesh, uniqueId);
    const numValues = vCount * itemSize;
    const byteSize = numValues * 4;
    const ptr = draco._malloc(byteSize);
    decoder.GetAttributeDataArrayForAllPoints(mesh, attr, draco.DT_FLOAT32, byteSize, ptr);
    const out = new Float32Array(draco.HEAPF32.buffer, ptr, numValues).slice();
    draco._free(ptr);
    return out;
  };

  const pos = extractFloatAttr(ext.attributes.POSITION, 3);
  const norm = extractFloatAttr(ext.attributes.NORMAL, 3);

  // Center bounding box just like BufferGeometry.center()
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let v = 0; v < vCount; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const midX = (minX + maxX) * 0.5;
  const midY = (minY + maxY) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  for (let v = 0; v < vCount; v++) {
    pos[v * 3] -= midX;
    pos[v * 3 + 1] -= midY;
    pos[v * 3 + 2] -= midZ;
  }

  const indices = new Uint32Array(fCount * 3);
  const ia = new draco.DracoInt32Array();
  for (let f = 0; f < fCount; f++) {
    decoder.GetFaceFromMesh(mesh, f, ia);
    indices[f * 3] = ia.GetValue(0);
    indices[f * 3 + 1] = ia.GetValue(1);
    indices[f * 3 + 2] = ia.GetValue(2);
  }
  draco.destroy(ia);
  draco.destroy(mesh);
  draco.destroy(buffer);
  draco.destroy(decoder);

  // Connected-component leaf-clump decimation (stride=4, clumpScale=1.44)
  const parent = new Int32Array(vCount);
  for (let i = 0; i < vCount; i++) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    let c = x;
    while (c !== r) {
      const n = parent[c];
      parent[c] = r;
      c = n;
    }
    return r;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const ra = find(indices[i]);
    const rb = find(indices[i + 1]);
    const rc = find(indices[i + 2]);
    if (ra !== rb) parent[rb] = ra;
    const rab = find(ra);
    if (rab !== rc) parent[rc] = rab;
  }

  const compId = new Int32Array(vCount).fill(-1);
  let numComps = 0;
  for (let v = 0; v < vCount; v++) {
    const r = find(v);
    if (compId[r] === -1) compId[r] = numComps++;
    compId[v] = compId[r];
  }

  const stride = 4;
  const clumpScale = 1.44;
  const cx = new Float32Array(numComps);
  const cy = new Float32Array(numComps);
  const cz = new Float32Array(numComps);
  const cnt = new Int32Array(numComps);

  for (let v = 0; v < vCount; v++) {
    const cid = compId[v];
    if (cid % stride !== 0) continue;
    cx[cid] += pos[v * 3];
    cy[cid] += pos[v * 3 + 1];
    cz[cid] += pos[v * 3 + 2];
    cnt[cid]++;
  }
  for (let c = 0; c < numComps; c++) {
    if (cnt[c] > 0) {
      cx[c] /= cnt[c];
      cy[c] /= cnt[c];
      cz[c] /= cnt[c];
    }
  }

  const remap = new Int32Array(vCount).fill(-1);
  let outV = 0;
  for (let v = 0; v < vCount; v++) {
    if (compId[v] % stride === 0) remap[v] = outV++;
  }

  const posI16 = new Int16Array(outV * 3);
  const normI8 = new Int8Array(outV * 3);
  for (let v = 0; v < vCount; v++) {
    const nv = remap[v];
    if (nv === -1) continue;
    const cid = compId[v];
    const px = cx[cid] + (pos[v * 3] - cx[cid]) * clumpScale;
    const py = cy[cid] + (pos[v * 3 + 1] - cy[cid]) * clumpScale;
    const pz = cz[cid] + (pos[v * 3 + 2] - cz[cid]) * clumpScale;
    posI16[nv * 3] = Math.max(-32767, Math.min(32767, Math.round(px * 4096)));
    posI16[nv * 3 + 1] = Math.max(-32767, Math.min(32767, Math.round(py * 4096)));
    posI16[nv * 3 + 2] = Math.max(-32767, Math.min(32767, Math.round(pz * 4096)));
    normI8[nv * 3] = Math.max(-127, Math.min(127, Math.round(norm[v * 3] * 127)));
    normI8[nv * 3 + 1] = Math.max(-127, Math.min(127, Math.round(norm[v * 3 + 1] * 127)));
    normI8[nv * 3 + 2] = Math.max(-127, Math.min(127, Math.round(norm[v * 3 + 2] * 127)));
  }

  const outIdx = [];
  for (let i = 0; i < indices.length; i += 3) {
    const na = remap[indices[i]];
    if (na !== -1) outIdx.push(na, remap[indices[i + 1]], remap[indices[i + 2]]);
  }
  const idxU16 = Uint16Array.from(outIdx);

  const normPaddedLen = (normI8.byteLength + 1) & ~1;
  const totalBytes = 8 + posI16.byteLength + normPaddedLen + idxU16.byteLength;
  const outBuf = Buffer.alloc(totalBytes);
  outBuf.writeUInt32LE(outV, 0);
  outBuf.writeUInt32LE(idxU16.length, 4);
  let off = 8;
  Buffer.from(posI16.buffer, posI16.byteOffset, posI16.byteLength).copy(outBuf, off);
  off += posI16.byteLength;
  Buffer.from(normI8.buffer, normI8.byteOffset, normI8.byteLength).copy(outBuf, off);
  off += normPaddedLen;
  Buffer.from(idxU16.buffer, idxU16.byteOffset, idxU16.byteLength).copy(outBuf, off);

  fs.writeFileSync(outPath, outBuf);
  console.log(`[prepare-assets] Emitted quantized Ghibli foliage (${(totalBytes / 1024).toFixed(1)} KB, ${outV} verts).`);
}

async function prepareTreesAndAnimations() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.mkdirSync(ANIMS_DIR, { recursive: true });
  fs.mkdirSync(DRACO_DIR, { recursive: true });

  // Copy Three.js local Draco WASM decoders as fallback for trees.glb
  const threeDracoDir = path.join(ROOT, 'node_modules/three/examples/jsm/libs/draco/gltf');
  if (fs.existsSync(threeDracoDir)) {
    for (const f of fs.readdirSync(threeDracoDir)) {
      fs.copyFileSync(path.join(threeDracoDir, f), path.join(DRACO_DIR, f));
    }
  }

  const foliageBinDest = path.join(MODELS_DIR, 'ghibli_foliage.bin');
  const treesDest = path.join(MODELS_DIR, 'trees.glb');
  if (!fs.existsSync(foliageBinDest)) {
    const treesBuf = await downloadCached(UPSTREAM.trees, 'trees.glb');
    fs.writeFileSync(treesDest, treesBuf);
    await bakeGhibliFoliageBin(treesBuf, foliageBinDest);
  }

  for (const clip of UPSTREAM.clips) {
    const dest = path.join(ANIMS_DIR, `${clip}.vrma`);
    if (!fs.existsSync(dest)) {
      const buf = await downloadCached(`${UPSTREAM.vrmaBase}/${clip}.vrma`, `${clip}.vrma`);
      fs.writeFileSync(dest, buf);
    }
  }
}

await prepareTreesAndAnimations();
await buildChampionVrm();
