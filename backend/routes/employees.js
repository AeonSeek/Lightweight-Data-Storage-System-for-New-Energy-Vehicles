const express = require('express');
const router = express.Router();
const { getAllEmployees, addEmployee, updateEmployee, deleteEmployee } = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

router.use(authenticateToken);
router.use(authorizeRole('system_admin'));

// GET /api/employees - 获取所有员工列表 (支持分页)
router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10; // 与 database.js 中的默认值保持一致或根据需要调整

    const options = { page, pageSize };

    getAllEmployees(options, (err, result) => {
        if (err) {
            console.error('Error fetching employees with pagination:', err);
            return res.status(500).json({ success: false, message: '获取员工列表失败，请联系管理员。' });
        }

        const { employees, totalCount } = result;
        const totalPages = Math.ceil(totalCount / pageSize);

        res.json({
            success: true,
            employees: employees,
            pagination: {
                currentPage: page,
                pageSize: pageSize,
                totalCount: totalCount,
                totalPages: totalPages
            }
        });
    });
});

// POST /api/employees - 添加新员工 (恢复原样)
router.post('/', (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
        return res.status(400).json({ success: false, message: '所有字段均为必填项。' });
    }

    addEmployee(username, email, password, role, (err, newEmployee) => {
        if (err) {
            console.error('Error adding new employee:', err.message);
            if (err.message === '用户名已存在' || err.message === '电子邮箱已被注册') {
                return res.status(409).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: '添加员工失败，请稍后重试。' });
        }
        res.status(201).json({ success: true, message: '员工添加成功！', employee: newEmployee });
    });
});

// PUT /api/employees/:id - 更新员工信息 (恢复原样)
router.put('/:id', (req, res) => {
    const employeeId = parseInt(req.params.id);
    const { username, email, password, role } = req.body;

    if (isNaN(employeeId)) {
        return res.status(400).json({ success: false, message: '无效的员工ID。' });
    }
    if (!username || !email || !role) {
        return res.status(400).json({ success: false, message: '用户名、邮箱和角色为必填项。' });
    }
    const employeeData = { username: username.trim(), email: email.trim(), role: role };
    if (password && typeof password === 'string' && password.trim() !== '') {
        employeeData.password = password.trim();
    }

    updateEmployee(employeeId, employeeData, (err, updatedInfo) => {
        if (err) {
            console.error(`Error updating employee ${employeeId}:`, err.message);
            if (err.message === '用户名或邮箱已存在') {
                return res.status(409).json({ success: false, message: err.message });
            }
            if (err.message.startsWith('未找到要更新的员工') || err.message.startsWith('没有提供需要更新的字段信息')) {
                return res.status(404).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: '更新员工失败，请稍后重试。' });
        }
        res.status(200).json({ success: true, message: '员工信息更新成功！', employee: updatedInfo });
    });
});

// DELETE /api/employees/:id - 删除员工 (恢复原样)
router.delete('/:id', (req, res) => {
    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
        return res.status(400).json({ success: false, message: '无效的员工ID。' });
    }

    deleteEmployee(employeeId, (err, numDeleted) => {
        if (err) {
            console.error(`Error deleting employee ${employeeId}:`, err.message);
            if (err.message === '未找到要删除的员工') {
                return res.status(404).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: '删除员工失败，请稍后重试。' });
        }
        if (numDeleted > 0) {
            res.status(200).json({ success: true, message: '员工删除成功！' });
        } else {
            res.status(404).json({ success: false, message: '未找到要删除的员工。' });
        }
    });
});

module.exports = router; 