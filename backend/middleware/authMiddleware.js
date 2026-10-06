const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-and-secret-jwt-key-replace-this'; // 与 server.js 中保持一致

/**
 * 中间件：验证 JWT
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ success: false, message: '认证失败：缺少令牌' }); // Unauthorized
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT 验证错误:', err.message);
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ success: false, message: '认证失败：令牌已过期' }); // Forbidden
            }
            return res.status(403).json({ success: false, message: '认证失败：无效的令牌' }); // Forbidden
        }
        req.user = user; // 将解码后的用户信息（包含id, username, role）附加到请求对象
        next(); // Token 有效，继续处理请求
    });
}

/**
 * 中间件：授权特定角色
 * @param {string | string[]} requiredRole 单个角色字符串或角色数组
 */
function authorizeRole(requiredRoleOrRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ success: false, message: '授权失败：用户信息不完整' }); // Forbidden
        }

        const userRole = req.user.role;
        let authorized = false;

        if (Array.isArray(requiredRoleOrRoles)) {
            if (requiredRoleOrRoles.includes(userRole)) {
                authorized = true;
            }
        } else {
            if (userRole === requiredRoleOrRoles) {
                authorized = true;
            }
        }

        if (authorized) {
            next(); // 用户角色符合要求
        } else {
            console.warn(`授权失败：用户角色 '${userRole}' 无权访问此资源。需要角色: '${requiredRoleOrRoles}'`);
            return res.status(403).json({ success: false, message: '授权失败：权限不足' }); // Forbidden
        }
    };
}

module.exports = {
    authenticateToken,
    authorizeRole
}; 