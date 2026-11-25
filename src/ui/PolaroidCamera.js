// Vintage Keepsake Polaroid Camera for Dengdeng ("登登专属拍立得纪念相机")

const POLAROID_CAPTIONS = [
  '与老公、小蓝、大福共度的奇幻山谷时光 ♡',
  '致我最爱的登登：愿你眼里的星光永远明亮如初 ✦',
  '清风拂过草海，小蓝与大福摇着尾巴跟在登登身旁～',
  '把这一刻的晴空、樱花与欢笑装进永恒的相册里 ♪',
  '无论在现实还是童话世界，我们一家四口永远在一起！',
];

const REGION_TITLES = {
  cottage: '星光樱花木屋 · 我们的家',
  sky_island: '云端誓言浮岛 · 双子山之巅',
  fountain: '镜湖发光睡莲 · 同心许愿泉',
  maze: '星语树篱迷宫 · 寻宝秘境',
  glen: '奇幻荧光蘑菇秘境',
  ginkgo: '黄金银杏双喵圣坛',
  bridge: '静谧镜湖 · 古木拱桥',
  ruins: '时光神殿遗迹 · 四季音律台',
};

export class PolaroidCamera {
  constructor(app) {
    this.app = app;
    this.snapBtn = document.getElementById('btn-polaroid');
    this.flashEl = document.getElementById('polaroid-flash');
    this.modalEl = document.getElementById('polaroid-modal');
    this.imgEl = document.getElementById('polaroid-preview-img');
    this.saveBtn = document.getElementById('btn-polaroid-save');
    this.closeBtn = document.getElementById('btn-polaroid-close');

    this.lastDataUrl = '';
    this.shotCount = 0;

    this._bindEvents();
  }

  _bindEvents() {
    if (this.snapBtn) {
      this.snapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.sound.init();
        this.snapPhoto();
      });
    }

    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.lastDataUrl) return;
        const a = document.createElement('a');
        a.href = this.lastDataUrl;
        a.download = `legend-of-dengdeng-polaroid-${this.shotCount}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeModal();
      });
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.closeModal();
        }
      });
    }
  }

  isOpen() {
    return this.modalEl && !this.modalEl.classList.contains('hidden');
  }

  closeModal() {
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }

  snapPhoto() {
    if (!this.app.ready) return '';
    this.shotCount++;
    this.app.sound.cameraShutter();

    // Brief warm shutter flash
    if (this.flashEl) {
      this.flashEl.classList.add('active');
      setTimeout(() => this.flashEl.classList.remove('active'), 180);
    }

    // Render fresh WebGL frame immediately before reading canvas pixels!
    this.app.renderer.render(this.app.scene, this.app.camera);

    const outW = 1040;
    const outH = 748;
    const padX = 40;
    const padTop = 36;
    const photoW = outW - padX * 2;
    const photoH = 540;

    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d');

    // 1. Warm Ivory Watercolor Polaroid Paper Card
    const cardGrad = ctx.createLinearGradient(0, 0, 0, outH);
    cardGrad.addColorStop(0, '#fdf9ef');
    cardGrad.addColorStop(1, '#f4ebd6');
    ctx.fillStyle = cardGrad;
    ctx.fillRect(0, 0, outW, outH);

    // Subtle gold outer border
    ctx.strokeStyle = '#dcc188';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, outW - 28, outH - 28);

    // 2. Center-crop / cover-fit 3D WebGL canvas into 16:9 photo window
    const srcW = this.app.canvas.width;
    const srcH = this.app.canvas.height;
    const targetAspect = photoW / photoH;
    const srcAspect = srcW / Math.max(1, srcH);
    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (srcAspect > targetAspect) {
      sw = srcH * targetAspect;
      sx = (srcW - sw) * 0.5;
    } else {
      sh = srcW / targetAspect;
      sy = (srcH - sh) * 0.5;
    }
    ctx.drawImage(this.app.canvas, sx, sy, sw, sh, padX, padTop, photoW, photoH);

    // Thin gold inner bevel around the photo
    ctx.strokeStyle = 'rgba(205, 170, 102, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, padTop, photoW, photoH);

    // 3. Cute Twin Cat-Paw Stamps (Emerald Russian Blue + Amber Maine Coon)
    const drawPaw = (cx, cy, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 10, 0, Math.PI * 2);
      ctx.fill();
      for (const [ox, oy] of [
        [-10, -7],
        [-3.5, -11],
        [3.5, -11],
        [10, -7],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawPaw(76, 646, '#4cc995');
    drawPaw(112, 652, '#e8ac46');

    // 4. Region Title, Romantic Caption & Star Emblem Stamp
    const regionTitle =
      REGION_TITLES[this.app.currentRegion] || '海拉鲁原野 · 登登的奇幻山谷';
    const caption = POLAROID_CAPTIONS[(this.shotCount - 1) % POLAROID_CAPTIONS.length];

    ctx.fillStyle = '#2d261e';
    ctx.font = '600 26px "Noto Serif SC", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(regionTitle, outW * 0.5, 636);

    ctx.fillStyle = '#6c5a45';
    ctx.font = '19px "Noto Serif SC", Georgia, serif';
    ctx.fillText(caption, outW * 0.5, 676);

    ctx.fillStyle = '#9c7c44';
    ctx.font = '600 15px "Cinzel", "Noto Serif SC", serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `THE LEGEND OF DENGDENG  ·  ★ ${this.app.puzzles.collectedStars}/${this.app.puzzles.totalStars}`,
      outW - 48,
      714
    );

    this.lastDataUrl = c.toDataURL('image/png');
    if (this.imgEl) {
      this.imgEl.src = this.lastDataUrl;
    }
    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }
    return this.lastDataUrl;
  }
}
