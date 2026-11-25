# The Legend of Dengdeng · 海拉鲁原野漫步

基于 **Three.js** 与 **@pixiv/three-vrm** 构建的《塞尔达传说：旷野之息 / 王国之泪》与吉卜力水彩风格 3D 开放世界漫步项目。

## 目录结构

- `src/main.js` — 场景主循环、第三人称阻尼环视相机与角色漫步/奔跑/跳跃/剑盾武打控制
- `src/player/VrmDengdeng.js` — VRM 1.0 精雕角色模型分片加载、`VRMSpringBone` 发丝物理、动捕骨骼与大师之剑/海利亚盾武打招式融合
- `src/effects/CombatEffects.js` — 大师之剑实时弧形剑气残影、回旋斩与完美盾反冲击波光环、斩草飞叶与火星粒子系统
- `src/world/HyruleWorld.js` — 无缝山谷地形、静谧镜湖、古木拱桥、时光神殿残垣、吉卜力树林与二十万株剑风联动摇曳草海
- `src/shaders/BotWShaders.js` — 瑞利/米氏散射晴空积云、全场景同步流淌云影、水彩树冠与菲涅尔湖水 GLSL 着色器
- `src/audio/SoundEngine.js` — 程序化印象派钢琴、草地/石板/木桥脚步与拔剑/挥斩/回旋斩/盾反音效
- `.github/workflows/deploy-pages.yml` — 推送 `main` 分支后自动构建并发布至 GitHub Pages

## 操作说明

- **漫步 / 视角**：`WASD` 移动，`Shift` 奔跑，`Space` 跳跃，鼠标左键拖拽环视，滚轮缩放视角
- **挥剑三连斩 / 跳劈**：按 `J` 或单击鼠标左键（空中触发跳劈下砸）
- **蓄力回旋斩**：长按 `J` 蓄力纳刀，松开释放 360° 旋风回旋斩
- **举盾防御 / 戒备步**：按住 `K` 或鼠标右键举起海利亚盾，锁定视角方向横向戒备移动
- **完美盾反**：按 `E` 或 `L` 挥盾弹反释放冲击波
- **收拔剑盾**：按 `R` 手动收剑入鞘 / 拔出剑盾（脱离战斗数秒后也会自动收剑归鞘）

## 本地开发

```bash
npm install
npm run dev
```

## 构建与 GitHub Pages 自动部署

1. 将仓库设为 **Public**（若使用 GitHub Free 账号开启 Pages）。
2. 打开仓库 **Settings → Pages**，在 **Build and deployment → Source** 下拉框中选择 **GitHub Actions**。
3. 每次推送到 `main` 分支时，GitHub Actions 会自动执行 `npm ci && npm run build` 并更新在线页面。
