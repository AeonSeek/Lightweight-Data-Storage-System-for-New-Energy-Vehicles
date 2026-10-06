const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const bcrypt = require('bcrypt'); // 引入 bcrypt
const cors = require('cors'); // 引入 cors
const { db, initializeDatabase, insertDummyBatteryData, insertDummyWeldingData, insertDummyAssemblyData, insertDummyTestingData, getLatestData, getHistoricalData, addUser, findUserByUsernameOrEmail, getAllEmployees } = require('./database'); // 引入 addUser 和 findUserByUsernameOrEmail
const jwt = require('jsonwebtoken'); // 引入 jsonwebtoken
const { fork } = require('child_process'); // 引入 fork

// 引入员工路由
const employeeRoutes = require('./routes/employees');
const systemUserRoutes = require('./routes/systemUsers'); // 引入新的系统用户路由
const productionLogsRoutes = require('./routes/productionLogs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-and-secret-jwt-key-replace-this'; // 替换为更安全的密钥，最好来自环境变量

// Middleware
app.use(cors()); // 启用 CORS，允许所有来源（开发时方便，生产环境应配置具体来源）
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.json()); // 解析 JSON 请求体

// 初始化資料庫
initializeDatabase();

// API: Get Latest Data (保持不变)
app.get('/api/data/:workshop', (req, res) => {
    const workshop = req.params.workshop;
    console.log(`[API] Request received for LATEST data: ${workshop}`);
    let tableName = '';
    switch (workshop) {
        case 'battery': tableName = 'battery_data'; break;
        case 'welding': tableName = 'welding_data'; break;
        case 'assembly': tableName = 'assembly_data'; break;
        case 'testing': tableName = 'testing_data'; break;
        default:
            console.error(`[API] ❌ Workshop not found: ${workshop}`);
            return res.status(404).json({ error: 'Workshop not found' });
    }
    getLatestData(tableName, (err, data) => {
        if (err) {
            console.error(`[API] ❌ Failed to retrieve LATEST data for ${tableName}:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve data', details: err.message });
        }
        if (data && data.timestamp) {
            try { data.timestamp_locale = new Date(data.timestamp).toLocaleString('zh-CN', { hour12: false }); }
            catch (dateError) { console.error("[API] ⚠️ Timestamp formatting error:", dateError); data.timestamp_locale = data.timestamp; }
        } else if (data) { data.timestamp_locale = "N/A"; }
        console.log(`[API] ✅ Sending LATEST data for ${workshop}`);
        res.json(data || {});
    });
});

// **新增 API: 获取历史数据**
app.get('/api/data/:workshop/history/:metric', (req, res) => {
    const { workshop, metric } = req.params;
    const limit = parseInt(req.query.limit) || 30; // 获取 limit 参数，默认为 30

    console.log(`[API] Request received for HISTORY data: ${workshop}.${metric} (limit: ${limit})`);

    let tableName = '';
    switch (workshop) {
        case 'battery': tableName = 'battery_data'; break;
        case 'welding': tableName = 'welding_data'; break;
        case 'assembly': tableName = 'assembly_data'; break;
        case 'testing': tableName = 'testing_data'; break;
        default:
            console.error(`[API] ❌ Workshop not found for history: ${workshop}`);
            return res.status(404).json({ error: 'Workshop not found' });
    }

    // 基础的 metric 名称验证 (实际应用需要更严格的验证)
    const allowedMetricsPattern = /^[a-zA-Z0-9_]+$/;
     if (!allowedMetricsPattern.test(metric)) {
         console.error(`[API] ❌ Invalid metric format for history: ${metric}`);
         return res.status(400).json({ error: 'Invalid metric format' });
     }

    // 调用 database.js 中的函数获取历史数据
    getHistoricalData(tableName, metric, limit, (err, data) => {
        if (err) {
            console.error(`[API] ❌ Failed to retrieve HISTORY data for ${tableName}.${metric}:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve historical data', details: err.message });
        }
        console.log(`[API] ✅ Sending HISTORY data for ${workshop}.${metric} (${data.length} points)`);
        res.json(data || []); // 发送查询到的数据数组
    });
});

// 定義根路由，指向登入頁面
app.get('/', (req, res) => {
    console.log(`[${new Date().toISOString()}] ➡️ Request received for root path (/), serving login.html`);
    res.sendFile(path.join(path.join(__dirname, '..', 'frontend'), 'html', 'login.html'));
});

// 註冊路由
app.post('/register', (req, res) => {
    const { username, email, password, role } = req.body; // Role can be optional here for general registration
    console.log(`[${new Date().toISOString()}] ➡️ Register attempt: username=${username}, email=${email}, role=${role || 'general_user'}`);

    if (!username || !email || !password) {
        console.log(`  [Server] ❌ Registration failed: Missing fields`);
        return res.status(400).json({ success: false, message: '所有欄位皆為必填' });
    }

    // For now, new registrations are 'general_user' unless specified and validated
    const userRole = role === 'system_admin' ? 'system_admin' : 'general_user'; // Simple role assignment, can be more complex

    // 調用 database.js 中的 addUser 函數
    addUser(username, email, password, userRole, (err) => {
        if (err) {
            console.log(`  [Server] ❌ Registration failed for ${username}: ${err.message}`);
            // 將資料庫回傳的錯誤訊息傳回前端
            return res.status(409).json({ success: false, message: err.message }); // 409 Conflict
        }
        console.log(`  [Server] ✅ Registration successful for ${username}`);
        res.status(201).json({ success: true, message: '註冊成功！' }); // 201 Created
    });
});

// 登入路由
app.post('/login', (req, res) => {
    const { identifier, password } = req.body; // 使用 identifier 接收 username 或 email
    console.log(`[${new Date().toISOString()}] ➡️ Login attempt: identifier=${identifier}`);

    if (!identifier || !password) {
        console.log(`  [Server] ❌ Login failed: Missing fields`);
        return res.status(400).json({ success: false, message: '請輸入用戶名或電子郵件及密碼' });
    }

    // 查找用戶
    findUserByUsernameOrEmail(identifier, (err, user) => {
        if (err) {
            console.error(`  [Server] ❌ Login error (DB query): ${err.message}`);
            return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
        }

        if (!user) {
            console.log(`  [Server] ❌ Login failed: User not found for identifier ${identifier}`);
            return res.status(401).json({ success: false, message: '用戶名、電子郵件或密碼錯誤' }); // 401 Unauthorized
        }

        // 驗證密碼
        bcrypt.compare(password, user.password_hash, (compareErr, isMatch) => {
            if (compareErr) {
                console.error(`  [Server] ❌ Login error (bcrypt compare): ${compareErr.message}`);
                return res.status(500).json({ success: false, message: '伺服器內部錯誤' });
            }

            if (isMatch) {
                console.log(`  [Server] ✅ Login successful for ${user.username}`);
                // 生成 JWT
                const token = jwt.sign(
                    { id: user.id, username: user.username, role: user.role },
                    JWT_SECRET,
                    { expiresIn: '1h' } // Token 有效期 1 小时，可根据需求调整
                );
                res.status(200).json({ 
                    success: true, 
                    message: '登入成功！', 
                    token: token, 
                    username: user.username,
                    role: user.role // 将角色也返回给前端
                });
            } else {
                console.log(`  [Server] ❌ Login failed: Incorrect password for ${user.username}`);
                res.status(401).json({ success: false, message: '用戶名、電子郵件或密碼錯誤' }); // 401 Unauthorized
            }
        });
    });
});

// 挂载员工管理 API 路由
app.use('/api/employees', employeeRoutes);
app.use('/api/system-users', systemUserRoutes); // 注册新的系统用户 API 路由
app.use('/api/production-logs', productionLogsRoutes);

// Data Simulation & Server Start
const SIMULATION_INTERVAL = 5000;
setTimeout(() => {
    console.log(`[SIM] ▶️ Starting data simulation loop every ${SIMULATION_INTERVAL / 1000} seconds...`);
    const intervalTimer = setInterval(async () => {
        console.log(`[SIM] --- Interval Fired @ ${new Date().toLocaleTimeString()} ---`);
        try {
            await insertDummyWeldingData();
            await insertDummyBatteryData();
            await insertDummyAssemblyData();
            await insertDummyTestingData();
        } catch (simError) {
            console.error("[SIM] ❌ Error during simulation interval:", simError);
        }
    }, SIMULATION_INTERVAL);
    console.log("[SIM] ▶️ Inserting initial simulation data...");
    (async () => { // IIFE for initial async calls
        try {
            await insertDummyWeldingData();
            await insertDummyBatteryData();
            await insertDummyAssemblyData();
            await insertDummyTestingData();
        } catch (initSimError) {
            console.error("[SIM] ❌ Error during initial simulation:", initSimError);
        }
    })();
}, 1500);

// 启动 Sensor Data Worker 子进程
const workerPath = path.join(__dirname, 'sensorDataWorker.js');
const sensorWorker = fork(workerPath);

sensorWorker.on('message', (msg) => {
    console.log('[MainServer] Message from sensor worker:', msg);
});
sensorWorker.on('error', (err) => {
    console.error('[MainServer] Error from sensor worker:', err);
});
sensorWorker.on('exit', (code, signal) => {
    if (signal) {
        console.warn(`[MainServer] Sensor worker was killed by signal: ${signal}`);
    } else if (code !== 0) {
        console.warn(`[MainServer] Sensor worker exited with error code: ${code}. Restarting...`);
        // 可以考虑重启策略，但简单起见，这里仅记录
        // sensorWorker = fork(workerPath); // 简单的重启示例 (生产环境需要更健壮的策略)
    } else {
        console.log('[MainServer] Sensor worker exited successfully.');
    }
});

const server = app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log("   Waiting for database initialization and simulation start...");
});
// 直接使用導入的 db 對象
process.on('SIGINT', () => { console.log('\n[SYS] Gracefully shutting down from SIGINT (Ctrl+C)'); db.close((err) => { if (err) { console.error('[SYS] ❌ Error closing database:', err.message); } else { console.log('[SYS] ✅ Database connection closed.'); } process.exit(err ? 1 : 0); }); });