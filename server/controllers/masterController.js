const Master = require('../models/Master');

// Получение заявок мастера
exports.getRequests = async (req, res) => {
    try {
        const status = req.query.status || null;
        const requests = await Master.getAssignedRequests(req.user.id, status);
        
        res.json({
            success: true,
            data: requests
        });
    } catch (error) {
        console.error('Ошибка получения заявок:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение статистики мастера
exports.getStats = async (req, res) => {
    try {
        const stats = await Master.getStats(req.user.id);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Назначение мастера (только для админа)
exports.assignMaster = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { masterId } = req.body;
        
        const request = await Master.assignMaster(requestId, masterId);
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        res.json({
            success: true,
            message: 'Мастер назначен',
            data: request
        });
    } catch (error) {
        console.error('Ошибка назначения мастера:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение списка мастеров (только для админа)
exports.getMasters = async (req, res) => {
    try {
        const masters = await Master.getAllMasters();
        
        res.json({
            success: true,
            data: masters
        });
    } catch (error) {
        console.error('Ошибка получения мастеров:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};