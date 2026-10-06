// database.js (已移至 backend 資料夾)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt'); // 引入 bcrypt
const saltRounds = 10; // 設定 bcrypt 加鹽輪數
const redisClient = require('./redisClient'); // 确保引入 redisClient

// 此路徑 (__dirname 為 backend) 正確指向根目錄的 database
const DB_FILE = path.join(__dirname, '..', 'production_data.db'); 

// 连接数据库
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    }
    else {
        console.log('✅ Connected to the SQLite database.');
        // REMOVED initializeDatabase(); from here. It will be called explicitly from server.js
    }
});

// 初始化表结构
function initializeDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS battery_data ( id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, storage_temp REAL, drying_humidity REAL, cleanliness_level INTEGER, formation_voltage REAL, formation_current REAL, ocv_voltage REAL, seal_pressure REAL, gas_ppm INTEGER, smoke_status TEXT )`, (err) => { if (err) console.error("❌ Error creating battery_data table:", err.message); else console.log("✅ Table battery_data checked/created."); });
        db.run(`CREATE TABLE IF NOT EXISTS welding_data ( id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, aqi INTEGER, noise_db REAL, robot1_current REAL, robot1_voltage REAL, weld_quality_rate REAL, laser_power REAL, robot_status TEXT, cooling_temp REAL )`, (err) => { if (err) console.error("❌ Error creating welding_data table:", err.message); else console.log("✅ Table welding_data checked/created."); });
        db.run(`CREATE TABLE IF NOT EXISTS assembly_data ( id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, zone_temp REAL, brightness_lux INTEGER, bolt_torque REAL, torque_result TEXT, battery_sensor BOOLEAN, coolant_level REAL, brake_fluid_level REAL, agv_status TEXT, call_button_status TEXT )`, (err) => { if (err) console.error("❌ Error creating assembly_data table:", err.message); else console.log("✅ Table assembly_data checked/created."); });
        db.run(`CREATE TABLE IF NOT EXISTS testing_data ( id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, test_env_temp REAL, test_env_humidity REAL, soc REAL, charge_current REAL, insulation_resistance REAL, camber_angle REAL, toe_angle REAL, adas_calibration TEXT, final_result TEXT, water_test_result TEXT )`, (err) => { if (err) console.error("❌ Error creating testing_data table:", err.message); else console.log("✅ Table testing_data checked/created."); });
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'general_user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("❌ Error creating users table:", err.message);
            } else {
                console.log("✅ Table users checked/created.");
                // Seed an admin user if no users exist or no admin user exists
                db.get("SELECT COUNT(*) as count FROM users WHERE role = ?", ['system_admin'], (err, row) => {
                    if (err) {
                        console.error("  [DB] ❌ Error checking for admin user:", err.message);
                        return;
                    }
                    if (row && row.count === 0) {
                        console.log("  [DB] No admin user found. Seeding initial system_admin...");
                        const adminUsername = 'superadmin';
                        const adminEmail = 'superadmin@example.com';
                        const adminPassword = 'superadminpassword'; // Use a strong password in production!

                        bcrypt.hash(adminPassword, saltRounds, (hashErr, hash) => {
                            if (hashErr) {
                                console.error(`  [DB] ❌ Error hashing password for ${adminUsername}:`, hashErr);
                            } else {
                                db.run("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
                                    [adminUsername, adminEmail, hash, 'system_admin'],
                                    function(runErr) {
                                        if (runErr) {
                                            if (runErr.message.includes('UNIQUE constraint failed')) {
                                                 console.warn(`  [DB] ⚠️ Admin user ${adminUsername} or ${adminEmail} might already exist (UNIQUE constraint).`);
                                            } else {
                                                console.error(`  [DB] ❌ Error seeding admin user ${adminUsername}:`, runErr.message);
                                            }
                                        } else {
                                            console.log(`  [DB] ✅ Seeded system_admin: ${adminUsername}`);
                                        }
                                    });
                            }
                        });
                    } else if (row) {
                        console.log(`  [DB] Admin user check: ${row.count} admin(s) found.`);
                    }
                });
            }
        });

        // 添加 employees 表
        db.run(`CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, -- 存储哈希后的密码
            role TEXT NOT NULL DEFAULT '操作员', -- 默认为普通操作员，可以是 '管理员'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("❌ Error creating employees table:", err.message);
            } else {
                console.log("✅ Table employees checked/created.");
                // 检查表中是否有数据，如果没有，则插入种子数据
                db.get("SELECT COUNT(*) as count FROM employees", (countErr, row) => {
                    if (countErr) {
                        console.error("  [DB] ❌ Error checking employee count:", countErr.message);
                        return;
                    }
                    if (row && row.count === 0) {
                        console.log("  [DB] Seeding initial employee data...");
                        const initialEmployees = [
                            { username: 'admin_user', email: 'admin@example.com', password: 'password123', role: '管理员' },
                            { username: 'operator_user', email: 'operator@example.com', password: 'password456', role: '操作员' }
                        ];

                        initialEmployees.forEach(emp => {
                            bcrypt.hash(emp.password, saltRounds, (hashErr, hash) => {
                                if (hashErr) {
                                    console.error(`  [DB] ❌ Error hashing password for ${emp.username}:`, hashErr);
                                } else {
                                    // 使用 db.run 直接插入，避免共享 stmt 的问题
                                    db.run("INSERT INTO employees (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
                                        [emp.username, emp.email, hash, emp.role],
                                        function(runErr) { // 使用 function 关键字以访问 this.lastID (如果需要)
                                            if (runErr) {
                                                console.error(`  [DB] ❌ Error seeding employee ${emp.username}:`, runErr.message);
                                            } else {
                                                console.log(`  [DB] ✅ Seeded employee: ${emp.username}`);
                                            }
                                        });
                                }
                            });
                        });
                    } else if (row) {
                        console.log(`  [DB] Employees table already has ${row.count} entries. Skipping seed.`);
                    }
                });
            }
        });

        // 在 initializeDatabase 函数内添加 production_logs 表
        db.run(`
        CREATE TABLE IF NOT EXISTS production_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workshop_name TEXT NOT NULL,
            log_date TEXT NOT NULL, -- Format YYYY-MM-DD
            units_produced INTEGER DEFAULT 0,
            units_passed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(workshop_name, log_date)
        )
        `, (err) => { // Note: backtick is used for the SQL string
            if (err) console.error("❌ Error creating production_logs table:", err.message);
            else console.log("✅ Table 'production_logs' checked/created.");
        });
    });
}

// --- 数据插入函数 (模拟最新数据) ---
async function insertDummyBatteryData() {
    console.log('  [SIM] Generating dummy battery data for Redis...');
    const data = {
        timestamp: new Date().toISOString(),
        storage_temp: parseFloat((20 + Math.random() * 5).toFixed(1)),
        drying_humidity: parseFloat((5 + Math.random() * 5).toFixed(1)),
        cleanliness_level: Math.random() > 0.1 ? 7 : 8,
        formation_voltage: parseFloat((4.15 + Math.random() * 0.1).toFixed(2)),
        formation_current: parseFloat((10 + Math.random() * 2).toFixed(1)),
        ocv_voltage: parseFloat((3.8 + Math.random() * 0.1).toFixed(2)),
        seal_pressure: parseFloat((800 + Math.random() * 50).toFixed(0)),
        gas_ppm: parseInt((Math.random() * 10).toFixed(0)),
        smoke_status: Math.random() > 0.05 ? 'Normal' : 'Alarm'
    };
    if (redisClient.isOpen) {
        try {
            const streamData = Object.entries(data).reduce((acc, [key, value]) => { acc[key] = String(value); return acc; }, {});
            await redisClient.xAdd('stream:battery:raw_data', '*', streamData);
            console.log('  [SIM] ✅ Dummy battery data sent to Redis Stream stream:battery:raw_data');
        } catch (err) {
            console.error('  [SIM] ❌ Error sending battery data to Redis Stream:', err);
        }
    } else {
        console.warn('  [SIM] ⚠️ Redis client not open. Battery data not sent to Stream.');
    }
}

async function insertDummyWeldingData() {
    console.log('  [SIM] Generating dummy welding data for Redis...');
    const data = {
        timestamp: new Date().toISOString(),
        aqi: (30 + Math.random() * 20).toFixed(0),
        noise_db: (75 + Math.random() * 10).toFixed(1),
        robot1_current: parseFloat((180 + Math.random() * 20).toFixed(0)),
        robot1_voltage: parseFloat((22 + Math.random() * 2).toFixed(1)),
        weld_quality_rate: parseFloat((98 + Math.random() * 2).toFixed(1)),
        laser_power: parseFloat((3.5 + Math.random() * 0.5).toFixed(1)),
        robot_status: Math.random() > 0.1 ? 'Running' : (Math.random() > 0.5 ? 'Idle' : 'Fault'),
        cooling_temp: parseFloat((25 + Math.random() * 3).toFixed(1))
    };

    if (redisClient.isOpen) {
        try {
            // 将所有字段都转为字符串以存入 Redis Stream
            const streamData = Object.entries(data).reduce((acc, [key, value]) => {
                acc[key] = String(value);
                return acc;
            }, {});
            await redisClient.xAdd('stream:welding:raw_data', '*', streamData);
            console.log('  [SIM] ✅ Dummy welding data sent to Redis Stream stream:welding:raw_data');
        } catch (err) {
            console.error('  [SIM] ❌ Error sending welding data to Redis Stream:', err);
        }
    } else {
        console.warn('  [SIM] ⚠️ Redis client not open. Welding data not sent to Stream.');
    }
}

function storeRawBatteryDataToSQLite(data, callback) {
    console.log('  [DB] Storing raw (abnormal) battery data to SQLite...', data);
    const query = `INSERT INTO battery_data (timestamp, storage_temp, drying_humidity, cleanliness_level, formation_voltage, formation_current, ocv_voltage, seal_pressure, gas_ppm, smoke_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [
        data.timestamp, data.storage_temp, data.drying_humidity, data.cleanliness_level,
        data.formation_voltage, data.formation_current, data.ocv_voltage,
        data.seal_pressure, data.gas_ppm, data.smoke_status
    ], function(err) {
        if (err) {
            console.error("  [DB] ❌ Insert abnormal battery data ERROR:", err.message);
            return callback(err);
        }
        console.log(`  [DB] ✅ Abnormal battery data stored to SQLite with ID: ${this.lastID}`);
        callback(null, this.lastID);
    });
}

function storeRawWeldingDataToSQLite(data, callback) {
    console.log('  [DB] Storing raw (abnormal) welding data to SQLite...', data);
    const query = `INSERT INTO welding_data (timestamp, aqi, noise_db, robot1_current, robot1_voltage, weld_quality_rate, laser_power, robot_status, cooling_temp)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [
        data.timestamp,
        data.aqi,
        data.noise_db,
        data.robot1_current,
        data.robot1_voltage,
        data.weld_quality_rate,
        data.laser_power,
        data.robot_status,
        data.cooling_temp
    ], function(err) {
        if (err) {
            console.error("  [DB] ❌ Insert abnormal welding data ERROR:", err.message);
            return callback(err);
        }
        console.log(`  [DB] ✅ Abnormal welding data stored to SQLite with ID: ${this.lastID}`);
        callback(null, this.lastID);
    });
}

async function insertDummyAssemblyData() {
    console.log('  [SIM] Generating dummy assembly data for Redis...');
    const data = {
        timestamp: new Date().toISOString(),
        zone_temp: parseFloat((22 + Math.random() * 4).toFixed(1)),
        brightness_lux: parseInt((450 + Math.random() * 100).toFixed(0)),
        bolt_torque: parseFloat((55 + Math.random() * 5).toFixed(1)),
        torque_result: Math.random() > 0.05 ? 'OK' : 'NOK',
        battery_sensor: Math.random() > 0.02 ? true : false, // boolean
        coolant_level: parseFloat((95 + Math.random() * 5).toFixed(0)),
        brake_fluid_level: parseFloat((98 + Math.random() * 2).toFixed(0)),
        agv_status: Math.random() > 0.2 ? 'Delivering' : (Math.random() > 0.5 ? 'Idle' : 'Charging'),
        call_button_status: Math.random() > 0.9 ? 'Pressed' : 'Released'
    };
    if (redisClient.isOpen) {
        try {
            const streamData = Object.entries(data).reduce((acc, [key, value]) => { acc[key] = String(value); return acc; }, {});
            await redisClient.xAdd('stream:assembly:raw_data', '*', streamData);
            console.log('  [SIM] ✅ Dummy assembly data sent to Redis Stream stream:assembly:raw_data');
        } catch (err) {
            console.error('  [SIM] ❌ Error sending assembly data to Redis Stream:', err);
        }
    } else {
        console.warn('  [SIM] ⚠️ Redis client not open. Assembly data not sent to Stream.');
    }
}

function storeRawAssemblyDataToSQLite(data, callback) {
    console.log('  [DB] Storing raw (abnormal) assembly data to SQLite...', data);
    const query = `INSERT INTO assembly_data (timestamp, zone_temp, brightness_lux, bolt_torque, torque_result, battery_sensor, coolant_level, brake_fluid_level, agv_status, call_button_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [
        data.timestamp, data.zone_temp, data.brightness_lux, data.bolt_torque,
        data.torque_result, data.battery_sensor, data.coolant_level,
        data.brake_fluid_level, data.agv_status, data.call_button_status
    ], function(err) {
        if (err) {
            console.error("  [DB] ❌ Insert abnormal assembly data ERROR:", err.message);
            return callback(err);
        }
        console.log(`  [DB] ✅ Abnormal assembly data stored to SQLite with ID: ${this.lastID}`);
        callback(null, this.lastID);
    });
}

async function insertDummyTestingData() {
    console.log('  [SIM] Generating dummy testing data for Redis...');
    const data = {
        timestamp: new Date().toISOString(),
        test_env_temp: parseFloat((25 + Math.random() * 1).toFixed(1)),
        test_env_humidity: parseFloat((50 + Math.random() * 5).toFixed(1)),
        soc: parseFloat((80 + Math.random() * 15).toFixed(1)),
        charge_current: parseFloat(Math.random() > 0.3 ? (15 + Math.random() * 10).toFixed(1) : '0'),
        insulation_resistance: parseFloat((500 + Math.random() * 100).toFixed(0)),
        camber_angle: parseFloat((-0.5 + Math.random() * 1).toFixed(2)),
        toe_angle: parseFloat((0.1 + Math.random() * 0.1).toFixed(2)),
        adas_calibration: Math.random() > 0.1 ? 'Calibrated' : 'Not Calibrated',
        final_result: Math.random() > 0.03 ? 'Pass' : 'Fail',
        water_test_result: Math.random() > 0.02 ? 'Pass' : 'Leak Detected'
    };
    if (redisClient.isOpen) {
        try {
            const streamData = Object.entries(data).reduce((acc, [key, value]) => { acc[key] = String(value); return acc; }, {});
            await redisClient.xAdd('stream:testing:raw_data', '*', streamData);
            console.log('  [SIM] ✅ Dummy testing data sent to Redis Stream stream:testing:raw_data');
        } catch (err) {
            console.error('  [SIM] ❌ Error sending testing data to Redis Stream:', err);
        }
    } else {
        console.warn('  [SIM] ⚠️ Redis client not open. Testing data not sent to Stream.');
    }
}

function storeRawTestingDataToSQLite(data, callback) {
    console.log('  [DB] Storing raw (abnormal) testing data to SQLite...', data);
    const query = `INSERT INTO testing_data (timestamp, test_env_temp, test_env_humidity, soc, charge_current, insulation_resistance, camber_angle, toe_angle, adas_calibration, final_result, water_test_result)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [
        data.timestamp, data.test_env_temp, data.test_env_humidity, data.soc,
        data.charge_current, data.insulation_resistance, data.camber_angle,
        data.toe_angle, data.adas_calibration, data.final_result, data.water_test_result
    ], function(err) {
        if (err) {
            console.error("  [DB] ❌ Insert abnormal testing data ERROR:", err.message);
            return callback(err);
        }
        console.log(`  [DB] ✅ Abnormal testing data stored to SQLite with ID: ${this.lastID}`);
        callback(null, this.lastID);
    });
}

// --- 数据查询函数 ---
// 获取最新数据 (保持不变)
function getLatestData(tableName, callback) {
    const allowedTables = ['battery_data', 'welding_data', 'assembly_data', 'testing_data'];
    if (!allowedTables.includes(tableName)) {
        console.error(`  [DB] ❌ Invalid table name for latest data: ${tableName}`);
        return callback(new Error(`Invalid table name: ${tableName}`), null);
    }
    const query = `SELECT * FROM ${tableName} ORDER BY timestamp DESC LIMIT 1`;
    db.get(query, [], (err, row) => {
        if (err) {
            console.error(`  [DB] ❌ Error fetching latest data from ${tableName}:`, err.message);
            callback(err, null);
        } else {
            if (tableName === 'assembly_data' && row && row.battery_sensor !== undefined && row.battery_sensor !== null) {
                row.battery_sensor = Boolean(row.battery_sensor);
            }
            callback(null, row || {}); // 返回空对象如果没有数据
        }
    });
}

// **获取历史数据函数**
function getHistoricalData(tableName, metric, limit = 30, callback) { // Default limit 30
    const allowedTables = ['battery_data', 'welding_data', 'assembly_data', 'testing_data'];
    if (!allowedTables.includes(tableName)) {
        console.error(`  [DB] ❌ Invalid table name for history: ${tableName}`);
        return callback(new Error(`Invalid table name: ${tableName}`), null);
    }
    // Basic validation for metric name (防止SQL注入的基础检查)
    if (!/^[a-zA-Z0-9_]+$/.test(metric)) {
         console.error(`  [DB] ❌ Invalid metric name for history: ${metric}`);
         return callback(new Error(`Invalid metric name: ${metric}`), null);
    }

    console.log(`  [DB] Querying history for ${tableName}.${metric} with limit ${limit}`);
    // 选择 timestamp 和指定的 metric 列，按时间戳倒序，限制数量
    const query = `SELECT timestamp, ${metric} FROM ${tableName} WHERE ${metric} IS NOT NULL ORDER BY timestamp DESC LIMIT ?`;
    db.all(query, [limit], (err, rows) => {
        if (err) {
            console.error(`  [DB] ❌ Error fetching historical data for ${tableName}.${metric}:`, err.message);
            callback(err, null);
        } else {
            console.log(`  [DB] ✅ Fetched ${rows.length} history points for ${tableName}.${metric}`);
            // 将结果反转，使时间顺序从旧到新，方便图表库使用
            callback(null, rows.reverse() || []);
        }
    });
}

// --- 用户管理函数 ---

/**
 * 新增使用者到資料庫
 * @param {string} username 使用者名稱
 * @param {string} email 電子郵件
 * @param {string} password 明文密碼
 * @param {string} role (optional) 使用者角色, defaults to 'general_user'
 * @param {function} callback 回調函數 (err)
 */
function addUser(username, email, password, role = 'general_user', callback) {
    // If role is a function, it means it was called with 3 args, so role is the callback
    if (typeof role === 'function') {
        callback = role;
        role = 'general_user';
    }

    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error('  [DB] ❌ Error hashing password:', err);
            return callback(err);
        }
        const query = `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`;
        db.run(query, [username, email, hash, role], function(err) {
            if (err) {
                console.error('  [DB] ❌ Error inserting user:', err.message);
                if (err.message.includes('UNIQUE constraint failed: users.username')) {
                    return callback(new Error('用户名已存在'));
                }
                if (err.message.includes('UNIQUE constraint failed: users.email')) {
                    return callback(new Error('电子邮箱已被注册'));
                }
                return callback(err);
            }
            console.log(`  [DB] ✅ User ${username} (Role: ${role}) added with ID: ${this.lastID}`);
            callback(null);
        });
    });
}

/**
 * 根據使用者名稱或電子郵件查找使用者
 * @param {string} identifier 使用者名稱或電子郵件
 * @param {function} callback 回調函數 (err, user)
 */
function findUserByUsernameOrEmail(identifier, callback) {
    const query = `SELECT id, username, email, password_hash, role FROM users WHERE username = ? OR email = ?`; // Added role to select
    db.get(query, [identifier, identifier], (err, user) => {
        if (err) {
            console.error('  [DB] ❌ Error finding user:', err);
            return callback(err, null);
        }
        callback(null, user);
    });
}

/**
 * 获取所有员工信息 (分页)
 * @param {object} options 包含分页参数的对象 { page: number, pageSize: number }
 * @param {function} callback 回调函数 (err, { employees: [], totalCount: number })
 */
function getAllEmployees(options, callback) {
    const page = parseInt(options.page) || 1;
    const pageSize = parseInt(options.pageSize) || 10; // 默认每页10条
    const offset = (page - 1) * pageSize;

    let employees = [];
    let totalCount = 0;

    // 使用 db.serialize 确保查询按顺序执行
    db.serialize(() => {
        // 1. 获取总数
        const countQuery = `SELECT COUNT(*) as count FROM employees`;
        db.get(countQuery, [], (err, row) => {
            if (err) {
                console.error('  [DB] ❌ Error counting employees:', err.message);
                return callback(err, null);
            }
            totalCount = row ? row.count : 0;

            // 如果总数为0，直接返回空结果
            if (totalCount === 0) {
                return callback(null, { employees: [], totalCount: 0 });
            }

            // 2. 获取当前页的数据 (不包含密码哈希)
            const dataQuery = `SELECT id, username, email, role, created_at
                             FROM employees
                             ORDER BY id ASC
                             LIMIT ? OFFSET ?`;
            db.all(dataQuery, [pageSize, offset], (dataErr, rows) => {
                if (dataErr) {
                    console.error('  [DB] ❌ Error fetching paginated employees:', dataErr.message);
                    return callback(dataErr, null);
                }
                employees = rows || [];
                // 成功获取总数和当前页数据后，调用回调
                callback(null, { employees: employees, totalCount: totalCount });
            });
        });
    });
}

/**
 * 添加新员工到数据库
 * @param {string} username
 * @param {string} email
 * @param {string} password // Plain text password
 * @param {string} role
 * @param {function} callback (err, newEmployeeId)
 */
function addEmployee(username, email, password, role, callback) {
    bcrypt.hash(password, saltRounds, (hashErr, passwordHash) => {
        if (hashErr) {
            console.error('  [DB] ❌ Error hashing password for new employee:', hashErr);
            return callback(hashErr);
        }

        const query = `INSERT INTO employees (username, email, password_hash, role) VALUES (?, ?, ?, ?)`;
        db.run(query, [username, email, passwordHash, role], function(runErr) {
            if (runErr) {
                console.error('  [DB] ❌ Error inserting new employee:', runErr.message);
                if (runErr.message.includes('UNIQUE constraint failed: employees.username')) {
                    return callback(new Error('用户名已存在'));
                }
                if (runErr.message.includes('UNIQUE constraint failed: employees.email')) {
                    return callback(new Error('电子邮箱已被注册'));
                }
                return callback(runErr);
            }
            console.log(`  [DB] ✅ New employee ${username} added with ID: ${this.lastID}`);
            callback(null, { id: this.lastID, username, email, role });
        });
    });
}

/**
 * 更新员工信息
 * @param {number} id 员工ID
 * @param {object} employeeData 包含要更新的字段的对象 { username, email, password, role }
 *                        password 是可选的明文新密码，如果提供则更新密码
 * @param {function} callback (err, updatedEmployeeInfo)
 */
function updateEmployee(id, employeeData, callback) {
    const { username, email, password, role } = employeeData;

    if (!id || !username || !email || !role) {
        return callback(new Error("ID、用户名、邮箱和角色不能为空"));
    }

    let queryFields = [];
    let queryParams = [];

    if (username) { queryFields.push('username = ?'); queryParams.push(username); }
    if (email) { queryFields.push('email = ?'); queryParams.push(email); }
    if (role) { queryFields.push('role = ?'); queryParams.push(role); }

    const performUpdate = () => {
        if (queryFields.length === 0) {
            return callback(new Error("没有提供需要更新的字段信息（密码除外）。如果只想更新密码，请确保提供了密码字段。"));
        }
        queryParams.push(id); // Add ID for the WHERE clause
        const query = `UPDATE employees SET ${queryFields.join(', ')} WHERE id = ?`;

        db.run(query, queryParams, function(runErr) {
            if (runErr) {
                console.error(`  [DB] ❌ Error updating employee ${id}:`, runErr.message);
                if (runErr.message.includes('UNIQUE constraint failed')) {
                    return callback(new Error('用户名或邮箱已存在'));
                }
                return callback(runErr);
            }
            if (this.changes === 0) {
                // It's possible nothing changed if data is identical, or ID not found.
                // For simplicity, we treat it as potentially ID not found if other checks pass.
                // A more robust way would be to check if employee exists first.
                return callback(new Error('未找到要更新的员工或数据未发生实际改变'));
            }
            console.log(`  [DB] ✅ Employee ${id} updated successfully (fields: ${queryFields.join(', ')}).`);
            callback(null, { id, username, email, role }); // Return basic info
        });
    };

    if (password && password.trim() !== '') { // 如果提供了新密码且不为空
        bcrypt.hash(password, saltRounds, (hashErr, passwordHash) => {
            if (hashErr) {
                console.error('  [DB] ❌ Error hashing new password for employee update:', hashErr);
                return callback(hashErr);
            }
            queryFields.push('password_hash = ?');
            queryParams.push(passwordHash);
            performUpdate();
        });
    } else { // 不更新密码，或者密码字段为空
        if (queryFields.length > 0) { // 确保至少有其他字段要更新
             performUpdate();
        } else {
            // 如果只提供了空密码且没有其他字段更新，则认为无需操作或提示错误
            return callback(new Error("没有提供需要更新的字段信息。"));
        }
    }
}

/**
 * 删除员工
 * @param {number} id 员工ID
 * @param {function} callback (err, numRowsDeleted)
 */
function deleteEmployee(id, callback) {
    if (!id) {
        return callback(new Error("需要提供员工ID"));
    }
    const query = `DELETE FROM employees WHERE id = ?`;
    db.run(query, [id], function(runErr) {
        if (runErr) {
            console.error(`  [DB] ❌ Error deleting employee ${id}:`, runErr.message);
            return callback(runErr);
        }
        if (this.changes === 0) {
            console.log(`  [DB] ⚠️ Attempted to delete non-existent employee ID: ${id}`);
            return callback(new Error('未找到要删除的员工'));
        }
        console.log(`  [DB] ✅ Employee ${id} deleted successfully.`);
        callback(null, this.changes); // Return number of rows deleted (should be 1)
    });
}

/**
 * 获取所有系统用户信息 (不包含密码哈希)
 * @param {function} callback 回调函数 (err, users)
 */
function getAllSystemUsers(callback) {
    const query = `SELECT id, username, email, role, created_at FROM users ORDER BY id ASC`;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('  [DB] ❌ Error fetching all system users:', err.message);
            return callback(err, null);
        }
        callback(null, rows || []);
    });
}

/**
 * 更新系统用户信息 (例如角色、用户名、邮箱；密码可选)
 * @param {number} id 用户ID
 * @param {object} userData 包含要更新的字段 { username, email, role, password (可选新密码) }
 * @param {function} callback (err, updatedUserInfo)
 */
function updateSystemUser(id, userData, callback) {
    const { username, email, role, password } = userData;

    if (!id || !username || !email || !role) {
        return callback(new Error("用户ID、用户名、邮箱和角色为必填项以进行更新。"));
    }

    let queryFields = ['username = ?', 'email = ?', 'role = ?'];
    let queryParams = [username, email, role];

    const performUpdate = () => {
        queryParams.push(id); // Add ID for the WHERE clause
        const query = `UPDATE users SET ${queryFields.join(', ')} WHERE id = ?`;

        db.run(query, queryParams, function(runErr) {
            if (runErr) {
                console.error(`  [DB] ❌ Error updating system user ${id}:`, runErr.message);
                if (runErr.message.includes('UNIQUE constraint failed')) {
                    return callback(new Error('更新失败：用户名或邮箱已存在。'));
                }
                return callback(runErr);
            }
            if (this.changes === 0) {
                return callback(new Error('未找到要更新的系统用户或数据未发生实际改变。'));
            }
            console.log(`  [DB] ✅ System user ${id} updated successfully.`);
            callback(null, { id, username, email, role });
        });
    };

    if (password && password.trim() !== '') {
        bcrypt.hash(password, saltRounds, (hashErr, passwordHash) => {
            if (hashErr) {
                console.error('  [DB] ❌ Error hashing new password for system user update:', hashErr);
                return callback(hashErr);
            }
            queryFields.push('password_hash = ?');
            queryParams.push(passwordHash);
            performUpdate();
        });
    } else {
        performUpdate();
    }
}

/**
 * 删除系统用户
 * @param {number} id 用户ID
 * @param {function} callback (err, numRowsDeleted)
 */
function deleteSystemUser(id, callback) {
    // Basic safety: prevent deleting user with ID 1 (assuming it's the initial superadmin)
    // This is a simple check; a more robust system might have other checks.
    if (id === 1) {
        console.warn('  [DB] ⚠️ Attempt to delete initial superadmin (ID 1) blocked.');
        return callback(new Error('不允许删除初始超级管理员用户。'));
    }

    const query = `DELETE FROM users WHERE id = ?`;
    db.run(query, [id], function(runErr) {
        if (runErr) {
            console.error(`  [DB] ❌ Error deleting system user ${id}:`, runErr.message);
            return callback(runErr);
        }
        if (this.changes === 0) {
            return callback(new Error('未找到要删除的系统用户。'));
        }
        console.log(`  [DB] ✅ System user ${id} deleted successfully.`);
        callback(null, this.changes);
    });
}

// --- Production Log Functions (Using Callbacks) ---

/**
 * Adds or updates a production log for a specific workshop and date.
 * @param {string} workshopName - The name of the workshop.
 * @param {string} logDate - The date of the log in 'YYYY-MM-DD' format.
 * @param {number} unitsProduced - Total units produced on that date.
 * @param {number} unitsPassed - Total units that passed quality checks on that date.
 * @param {function} callback - Callback function (err, result)
 */
function addProductionLog(workshopName, logDate, unitsProduced, unitsPassed, callback) {
  const sql = `
    INSERT INTO production_logs (workshop_name, log_date, units_produced, units_passed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workshop_name, log_date) DO UPDATE SET
    units_produced = excluded.units_produced,
    units_passed = excluded.units_passed,
    created_at = CURRENT_TIMESTAMP
  `;
  db.run(sql, [workshopName, logDate, unitsProduced, unitsPassed], function(err) {
    if (err) {
      console.error(`Error adding/updating production log for ${workshopName} on ${logDate}:`, err);
      return callback(err, null);
    }
    console.log(`Production log for ${workshopName} on ${logDate} added/updated. Changes: ${this.changes}`);
    callback(null, { success: true, changes: this.changes, lastID: this.lastID });
  });
}

/**
 * Fetches aggregated production data (total produced, total passed) for a workshop within a date range.
 * @param {string} workshopName - The name of the workshop.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @param {function} callback - Callback function (err, data)
 */
function getAggregatedProductionData(workshopName, startDate, endDate, callback) {
  const sql = `
    SELECT
      SUM(units_produced) as total_units_produced,
      SUM(units_passed) as total_units_passed
    FROM production_logs
    WHERE workshop_name = ? AND log_date >= ? AND log_date <= ?
  `;
  db.get(sql, [workshopName, startDate, endDate], (err, row) => {
    if (err) {
      console.error(`Error fetching aggregated production data for ${workshopName} between ${startDate}-${endDate}:`, err);
      return callback(err, null);
    }
    callback(null, row || { total_units_produced: 0, total_units_passed: 0 });
  });
}

/**
 * Fetches recent production logs for a workshop, ordered by date.
 * @param {string} workshopName - The name of the workshop.
 * @param {number} [limit=7] - The maximum number of recent logs to fetch.
 * @param {function} callback - Callback function (err, rows)
 */
function getRecentProductionLogs(workshopName, limit = 7, callback) {
  // If limit is passed as a callback because it's the 3rd arg and limit is optional
  if (typeof limit === 'function') {
    callback = limit;
    limit = 7; // Default limit
  }
  const sql = `
    SELECT log_date, units_produced, units_passed
    FROM production_logs
    WHERE workshop_name = ?
    ORDER BY log_date DESC
    LIMIT ?
  `;
  db.all(sql, [workshopName, limit], (err, rows) => {
    if (err) {
      console.error(`Error fetching recent production logs for ${workshopName}:`, err);
      return callback(err, null);
    }
    // Reverse to have logs in ascending date order for easier chart display
    callback(null, (rows || []).reverse());
    });
}

// --- Employee Management Functions ---

/**
 * 获取单个员工信息 (不包含密码哈希)
 * @param {number} id 员工ID
 * @param {function} callback 回调函数 (err, employee)
 */
function getEmployeeById(id, callback) {
    // Select all fields except password_hash for security when fetching for display/edit
    const query = `SELECT id, username, email, role, created_at FROM employees WHERE id = ?`;
    db.get(query, [id], (err, employee) => {
        if (err) {
            console.error(`  [DB] ❌ Error fetching employee with ID ${id}:`, err.message);
            return callback(err, null);
        }
        callback(null, employee); // Returns the employee object or undefined if not found
    });
}

module.exports = {
    db,
    initializeDatabase,
    insertDummyBatteryData,
    insertDummyWeldingData,
    insertDummyAssemblyData,
    insertDummyTestingData,
    storeRawBatteryDataToSQLite,
    storeRawWeldingDataToSQLite,
    storeRawAssemblyDataToSQLite,
    storeRawTestingDataToSQLite,
    getLatestData,
    getHistoricalData,
    addUser,
    findUserByUsernameOrEmail,
    getAllEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getAllSystemUsers,
    updateSystemUser,
    deleteSystemUser,
    addProductionLog,
    getAggregatedProductionData,
    getRecentProductionLogs,
    getEmployeeById
}; 