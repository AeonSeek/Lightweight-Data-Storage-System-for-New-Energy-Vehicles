# 新能源汽车生产车间数据存储与监控系统

基于 Node.js、Express、SQLite 和 Redis 的演示项目，包含电池、焊接、总装和检测车间的数据展示、用户登录、员工管理及生产日志。

## 目录

- `backend/`：API 服务、认证中间件、数据库初始化、传感器模拟工作进程。
- `frontend/`：HTML 页面、样式、脚本和图片。
- `package.json` / `package-lock.json`：依赖及锁定版本。
- `.env.example`：环境变量名称示例。

## 本地运行

1. 安装 Node.js/npm，并准备本地 Redis 服务（默认 `localhost:6379`）。`sqlite3`、`bcrypt` 为原生依赖，安装失败时可能需要本机编译工具。
2. 在仓库根目录执行 `npm ci`。
3. 启动前设置 `JWT_SECRET`，可选设置 `PORT`（默认 3000）。例如 PowerShell：

```powershell
$env:JWT_SECRET = '请替换为自己生成的随机长密钥'
npm start
```

4. 打开 `http://localhost:3000/html/login.html`。

程序会在根目录创建 `production_data.db` 并初始化表和演示数据。`.env.example` 仅供参考；当前代码直接读取进程环境变量，不会自动加载 `.env`。

## 数据与配置

依赖通过 `npm ci` 安装，不提交 `node_modules`。本地数据库、编辑器个人设置、日志和真实环境配置不提交。需要保留旧数据时，请自行从原始包备份数据库到本机，再运行项目。

## 整理说明与已有局限

源码从原始 `nev_workshop_monitor.zip` 提取，保留原有前后端布局及依赖锁文件；未带入依赖目录、旧数据库、编辑器个人设置和空的 `READEME.md`。整理分支移除根目录原始压缩包；原始版本仍可通过 Git 历史找回。

项目带有固定的演示管理员初始化信息，JWT 配置也有演示默认值；请仅用于本地演示，正式部署前需要单独调整。此次整理未重写认证逻辑，也未验证 Redis、数据库和全部业务页面的集成运行。
