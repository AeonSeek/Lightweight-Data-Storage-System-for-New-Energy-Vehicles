const express = require('express');
const router = express.Router();
const { addProductionLog, getAggregatedProductionData, getRecentProductionLogs } = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// --- Helper Functions ---
function isValidDate(dateString) {
    // Basic check for YYYY-MM-DD format
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    const timestamp = date.getTime();
    if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;
    return date.toISOString().startsWith(dateString);
}

// --- Routes ---

// POST a new production log entry
// Protected: Only system_admin can add production logs
router.post('/', authenticateToken, authorizeRole('system_admin'), (req, res) => {
    const { workshopName, logDate, unitsProduced, unitsPassed } = req.body;

    if (!workshopName || !logDate || unitsProduced === undefined || unitsPassed === undefined) {
        return res.status(400).json({ message: "缺少必要参数: workshopName, logDate, unitsProduced, unitsPassed" });
    }
    if (!isValidDate(logDate)) {
        return res.status(400).json({ message: "logDate 格式无效，请使用 YYYY-MM-DD" });
    }
    if (typeof unitsProduced !== 'number' || typeof unitsPassed !== 'number' || unitsProduced < 0 || unitsPassed < 0) {
        return res.status(400).json({ message: "unitsProduced 和 unitsPassed 必须是非负数字" });
    }
    if (unitsPassed > unitsProduced) {
        return res.status(400).json({ message: "合格品数 (unitsPassed) 不能大于总产量 (unitsProduced)" });
    }

    addProductionLog(workshopName, logDate, unitsProduced, unitsPassed, (err, result) => {
        if (err) {
            console.error("Error in POST /api/production-logs:", err);
            return res.status(500).json({ message: "添加生产日志失败", error: err.message });
        }
        if (result && result.changes > 0) {
            res.status(201).json({ message: "生产日志添加/更新成功", data: { workshopName, logDate, unitsProduced, unitsPassed, id: result.lastID } });
        } else if (result) {
            // This case can happen if ON CONFLICT DO UPDATE is triggered but the data is identical, so no changes are made.
            res.status(200).json({ message: "生产日志已存在且未发生变化或数据与现有记录相同", data: { workshopName, logDate, unitsProduced, unitsPassed } });
        } else {
            // Fallback for unexpected error where result is null/undefined but no error was thrown
            console.error("Error in POST /api/production-logs: Result is undefined but no error was thrown.");
            return res.status(500).json({ message: "添加生产日志时发生未知错误。" });
        }
    });
});

// GET aggregated production data for a workshop within a date range
// Protected: All authenticated users can access this
router.get('/:workshopName/aggregated', authenticateToken, (req, res) => {
    const { workshopName } = req.params;
    const { startDate, endDate } = req.query;

    if (!workshopName) {
        return res.status(400).json({ message: "缺少 workshopName 参数" });
    }
    if (!startDate || !endDate) {
        return res.status(400).json({ message: "缺少 startDate 或 endDate 查询参数" });
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return res.status(400).json({ message: "startDate 或 endDate 格式无效，请使用 YYYY-MM-DD" });
    }

    getAggregatedProductionData(workshopName, startDate, endDate, (err, data) => {
        if (err) {
            console.error(`Error in GET /api/production-logs/${workshopName}/aggregated:`, err);
            return res.status(500).json({ message: "获取汇总生产数据失败", error: err.message });
        }
        res.status(200).json({ workshopName, startDate, endDate, data });
    });
});

// GET recent production logs for a workshop
// Protected: All authenticated users can access this
router.get('/:workshopName/recent', authenticateToken, (req, res) => {
    const { workshopName } = req.params;
    let { limit } = req.query;

    if (!workshopName) {
        return res.status(400).json({ message: "缺少 workshopName 参数" });
    }

    limit = parseInt(limit, 10);
    if (isNaN(limit) || limit <= 0) {
        limit = 7; // Default limit
    }

    getRecentProductionLogs(workshopName, limit, (err, data) => {
        if (err) {
            console.error(`Error in GET /api/production-logs/${workshopName}/recent:`, err);
            return res.status(500).json({ message: "获取近期生产日志失败", error: err.message });
        }
        res.status(200).json({ workshopName, limit, data });
    });
});

module.exports = router;
