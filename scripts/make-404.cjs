/**
 * GitHub Pages 没有服务端路由回退，深链（/musica/songs/practice-001）会 404。
 * 把构建好的 index.html 复制成 404.html，Pages 就会用它渲染未知路径。
 * 依赖 base 是绝对路径（DEPLOY_BASE=/musica/），所以 assets 仍能正确加载。
 */
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
const index = path.join(dist, 'index.html');

if (!fs.existsSync(index)) {
  console.error('未找到 dist/index.html，请先执行 npm run build');
  process.exit(1);
}

fs.copyFileSync(index, path.join(dist, '404.html'));
console.log('已生成 dist/404.html（GitHub Pages 深链回退）');
