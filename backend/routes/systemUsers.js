const express = require('express');
const router = express.Router();
const {
    addUser, // Reusing for creating users, role will be passed in body
    getAllSystemUsers,
    updateSystemUser,
    deleteSystemUser
} = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// Protect all routes in this module: user must be authenticated and be a 'system_admin'
router.use(authenticateToken);
router.use(authorizeRole('system_admin'));

// GET /api/system-users - Get all system users
router.get('/', (req, res) => {
    getAllSystemUsers((err, users) => {
        if (err) {
            return res.status(500).json({ success: false, message: '获取系统用户列表失败。' });
        }
        res.json({ success: true, users: users });
    });
});

// POST /api/system-users - Create a new system user (admin creating other users, including admins)
router.post('/', (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
        return res.status(400).json({ success: false, message: '用户名、邮箱、密码和角色均为必填项。' });
    }
    // Validate role (e.g., ensure it's one of the allowed roles)
    const allowedRoles = ['system_admin', 'general_user']; // Define allowed roles
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ success: false, message: '无效的角色。' });
    }

    addUser(username, email, password, role, (err, newUserId) => {
        if (err) {
            // addUser already handles UNIQUE constraint errors with specific messages
            return res.status(err.message.includes('已存在') ? 409 : 500).json({ success: false, message: err.message || '创建系统用户失败。' });
        }
        // To return the created user info, we might need addUser to return more, or do another fetch.
        // For now, just success. The ID is not directly returned by the current addUser to the route callback.
        res.status(201).json({ success: true, message: `系统用户 ${username} 创建成功。` });
    });
});

// PUT /api/system-users/:id - Update a system user's details (e.g., role, email, username; password optional)
router.put('/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, role, password } = req.body;

    if (isNaN(userId)) {
        return res.status(400).json({ success: false, message: '无效的用户ID。' });
    }
    if (!username || !email || !role) {
        return res.status(400).json({ success: false, message: '用户名、邮箱和角色为必填项。' });
    }
    const allowedRoles = ['system_admin', 'general_user'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ success: false, message: '更新失败：无效的角色。' });
    }

    // Prevent current admin from demoting themselves if they are the only admin (complex logic, for future)
    // For now, basic update

    updateSystemUser(userId, { username, email, role, password }, (err, updatedUser) => {
        if (err) {
            return res.status(err.message.includes('已存在') || err.message.includes('未找到') ? 400 : 500)
                      .json({ success: false, message: err.message || '更新系统用户信息失败。' });
        }
        res.json({ success: true, message: '系统用户信息更新成功。', user: updatedUser });
    });
});

// DELETE /api/system-users/:id - Delete a system user
router.delete('/:id', (req, res) => {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
        return res.status(400).json({ success: false, message: '无效的用户ID。' });
    }

    // Optional: Prevent admin from deleting themselves - check req.user.id against userId
    if (req.user && req.user.id === userId) {
        return res.status(403).json({ success: false, message: '不允许删除自己的账户。' });
    }

    deleteSystemUser(userId, (err, numDeleted) => {
        if (err) {
            return res.status(err.message.includes('未找到') || err.message.includes('不允许删除') ? 400 : 500)
                      .json({ success: false, message: err.message || '删除系统用户失败。' });
        }
        res.json({ success: true, message: '系统用户删除成功。' });
    });
});

module.exports = router; 