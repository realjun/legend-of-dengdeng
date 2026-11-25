# The Legend of Dengdeng · 海拉鲁原野漫步

基于 **Three.js** 与 **@pixiv/three-vrm** 构建的《塞尔达传说：旷野之息 / 王国之泪》与吉卜力水彩风格 3D 开放世界漫步项目。

## 目录结构

- `src/main.js` — 场景主循环、第三人称阻尼环视相机与角色漫步/奔跑/跳跃控制
- `src/player/VrmDengdeng.js` — VRM 1.0 精雕角色模型分片加载、`VRMSpringBone` 发丝物理、动捕骨骼融合与英杰剑盾挂载
- `src/world/HyruleWorld.js` — 无缝山谷地形、静谧镜湖、古木拱桥、时光神殿残垣、吉卜力树林与二十万株摇曳草海
- `src/shaders/BotWShaders.js` — 瑞利/米氏散射晴空积云、全场景同步流淌云影、水彩树冠与菲涅尔湖水 GLSL 着色器
- `src/audio/SoundEngine.js` — 程序化印象派钢琴与草地/石板/木桥脚步环境音效
- `.github/workflows/deploy-pages.yml` — 推送 `main` 分支后自动构建并发布至 GitHub Pages

## 本地开发

```bash
npm install
npm run dev
```

## 构建与 GitHub Pages 自动部署

1. 将仓库设为 **Public**（若使用 GitHub Free 账号开启 Pages）。
2. 打开仓库 **Settings → Pages**，在 **Build and deployment → Source** 下拉框中选择 **GitHub Actions**。
3. 每次推送到 `main` 分支时，GitHub Actions 会自动执行 `npm ci && npm run build` 并更新在线页面。
