import * as THREE from 'three';

export function createHylianShieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(256, 220, 30, 256, 256, 260);
  grad.addColorStop(0, '#274f9e');
  grad.addColorStop(1, '#162d63');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#dde5f0';
  ctx.lineWidth = 34;
  ctx.strokeRect(18, 18, 476, 476);

  // Golden Triforce
  ctx.fillStyle = '#f6cb52';
  const tri = (cx, cy, s) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx - s, cy + s * 0.86);
    ctx.lineTo(cx + s, cy + s * 0.86);
    ctx.closePath();
    ctx.fill();
  };
  tri(256, 132, 38);
  tri(216, 202, 38);
  tri(296, 202, 38);

  // Crimson Loftwing Crest
  ctx.fillStyle = '#db3b3b';
  ctx.beginPath();
  ctx.moveTo(256, 285);
  ctx.lineTo(106, 255);
  ctx.lineTo(148, 355);
  ctx.lineTo(256, 395);
  ctx.lineTo(364, 355);
  ctx.lineTo(406, 255);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createZonaiRuneTexture(primary = '#3af2b6', bg = '#253c39') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = primary;
  ctx.lineWidth = 8;
  ctx.strokeRect(28, 28, 456, 456);

  ctx.beginPath();
  ctx.arc(256, 256, 145, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(256, 256, 76, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * 78, 256 + Math.sin(a) * 78);
    ctx.lineTo(256 + Math.cos(a) * 195, 256 + Math.sin(a) * 195);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWoodPlankTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#a4774c';
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#825934';
  for (let x = 0; x < 512; x += 128) {
    ctx.fillRect(x, 0, 6, 512);
  }
  ctx.strokeStyle = 'rgba(65, 38, 16, 0.24)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 36; i++) {
    const y = (i * 15) % 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(160, y + 10, 340, y - 10, 512, y + 4);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
