// Feather-Light Adventure Journal HUD, Keepsake Star Tracker & One-Click Postcard Fast-Travel

const POSTCARD_DESTINATIONS = [
  {
    id: 'cottage',
    name: '🏡 星光樱花木屋',
    sub: '老公的爱心料理 · 小蓝与大福的家',
    x: 27.8,
    z: 23.6,
    yaw: 0.92,
    cam: { yaw: -2.18, pitch: 0.14, dist: 4.1 },
  },
  {
    id: 'chime',
    name: '🎵 四季音律遗迹',
    sub: '敲响四色水晶柱 · 解封第 ① 颗星',
    x: -22.8,
    z: 21.8,
    yaw: -1.15,
    cam: { yaw: 1.95, pitch: 0.18, dist: 4.6 },
  },
  {
    id: 'sanctuary',
    name: '🍂 黄金银杏圣坛',
    sub: '双喵共鸣回旋斩 · 解封第 ② 颗星',
    x: 24.0,
    z: -29.2,
    yaw: Math.PI,
    cam: { yaw: 0.0, pitch: 0.16, dist: 4.5 },
  },
  {
    id: 'maze',
    name: '🌿 星语树篱迷宫',
    sub: '探寻迷宫中央与秘宝 · 第 ③ 颗星',
    x: -40.0,
    z: -20.5,
    yaw: Math.PI,
    cam: { yaw: 0.0, pitch: 0.24, dist: 4.8 },
  },
  {
    id: 'glen',
    name: '🍄 奇幻荧光蘑菇谷',
    sub: '发光巨菇与小怪兽 · 解封第 ④ 颗星',
    x: 46.8,
    z: -14.8,
    yaw: 1.98,
    cam: { yaw: -1.15, pitch: 0.15, dist: 4.6 },
  },
  {
    id: 'sky',
    name: '☁️ 云端樱花浮岛',
    sub: '敲响云端同心钟 · 解封第 ⑤ 颗星',
    x: 0.0,
    z: -12.6,
    yHint: 33.0,
    yaw: Math.PI,
    cam: { yaw: 0.18, pitch: 0.14, dist: 4.9 },
  },
  {
    id: 'slalom',
    name: '🏄 星环滑草坡道',
    sub: '按 C 踩盾冲过 5 道星环赢鱼干',
    x: 22.0,
    z: 21.4,
    yaw: Math.atan2(-3.6, -5.9),
    cam: { yaw: Math.atan2(3.6, 5.9), pitch: 0.16, dist: 4.3 },
  },
  {
    id: 'fountain',
    name: '🪷 镜湖睡莲许愿泉',
    sub: '踏过巨型发光睡莲 · 泉心许愿',
    x: -18.2,
    z: -2.2,
    yaw: Math.PI,
    cam: { yaw: 0.22, pitch: 0.16, dist: 4.4 },
  },
];

export class AdventureJournal {
  constructor(app) {
    this.app = app;
    this.starCountEl = document.getElementById('hud-star-count');
    this.fishCountEl = document.getElementById('hud-fish-count');
    this.buffBadgeEl = document.getElementById('hud-buff-badge');
    this.toggleBtn = document.getElementById('btn-journal-toggle');
    this.drawerEl = document.getElementById('journal-drawer');
    this.closeBtn = document.getElementById('btn-journal-close');
    this.starListEl = document.getElementById('journal-star-list');
    this.postcardGridEl = document.getElementById('journal-postcards');
    this.celebrateBtn = document.getElementById('btn-trigger-celebration');
    this.dedicationCard = document.getElementById('dedication-card');
    this.dedicationClose = document.getElementById('btn-dedication-close');

    this.drawerOpen = false;
    this._lastStars = -1;
    this._lastFish = -1;
    this._lastBuffActive = null;

    this._initUI();
  }

  _initUI() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.sound.init();
        this.toggleDrawer();
      });
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDrawer(false);
      });
    }

    if (this.postcardGridEl) {
      this.postcardGridEl.innerHTML = '';
      for (const dest of POSTCARD_DESTINATIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'postcard-btn';
        btn.innerHTML = `<span class="pc-title">${dest.name}</span><span class="pc-sub">${dest.sub}</span>`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.app.sound.init();
          this.app.sound.pickup();
          this.app.teleport(dest.x, dest.z, dest.yaw, dest.yHint);
          this.app.setCameraView({ ...dest.cam, immediate: false });
          this.toggleDrawer(false);
        });
        this.postcardGridEl.appendChild(btn);
      }
    }

    if (this.celebrateBtn) {
      this.celebrateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.sound.init();
        this.toggleDrawer(false);
        this.app.triggerGrandCelebration();
      });
    }

    if (this.dedicationClose) {
      this.dedicationClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideDedication();
      });
    }
  }

  toggleDrawer(force = undefined) {
    this.drawerOpen = force !== undefined ? force : !this.drawerOpen;
    if (this.drawerEl) {
      this.drawerEl.classList.toggle('hidden', !this.drawerOpen);
    }
    if (this.drawerOpen) {
      this.refreshChecklist();
    }
  }

  showDedication() {
    if (this.dedicationCard) {
      this.dedicationCard.classList.remove('hidden');
    }
  }

  hideDedication() {
    if (this.dedicationCard) {
      this.dedicationCard.classList.add('hidden');
    }
  }

  refreshChecklist() {
    if (!this.starListEl) return;
    this.starListEl.innerHTML = '';
    for (const c of this.app.puzzles.chests) {
      const li = document.createElement('div');
      li.className = `star-row ${c.opened ? 'done' : ''}`;
      const icon = c.opened ? '★' : '☆';
      const status = c.opened ? '已珍藏' : c.locked ? c.lockHint : '已解封 · 可前往开启';
      li.innerHTML = `<span class="star-icon">${icon}</span><div class="star-info"><div class="star-name">${c.title}</div><div class="star-hint">${status}</div></div>`;
      this.starListEl.appendChild(li);
    }
  }

  update() {
    const stars = this.app.puzzles.collectedStars;
    const total = this.app.puzzles.totalStars;
    const fish = this.app.monsters.fishTreats;
    const buffActive = this.app.family.cookingBuffTimer > 0;

    if (stars !== this._lastStars) {
      this._lastStars = stars;
      if (this.starCountEl) {
        this.starCountEl.textContent = `${stars}/${total}`;
      }
      if (this.drawerOpen) this.refreshChecklist();
    }

    if (fish !== this._lastFish) {
      this._lastFish = fish;
      if (this.fishCountEl) {
        this.fishCountEl.textContent = `${fish}`;
      }
    }

    if (buffActive !== this._lastBuffActive) {
      this._lastBuffActive = buffActive;
      if (this.buffBadgeEl) {
        this.buffBadgeEl.classList.toggle('hidden', !buffActive);
      }
    }
  }
}
