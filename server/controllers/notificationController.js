const db = require('../config/database');

// Получение уведомлений пользователя
exports.getUserNotifications = async (req, res) => {
    try {
        const user_id = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const unread_only = req.query.unread_only === 'true';
        
        let query = `
            SELECT 
                notification_id,
                type,
                title,
                message,
                request_id,
                is_read,
                created_at
            FROM notifications
            WHERE user_id = $1
        `;
        
        const params = [user_id];
        
        if (unread_only) {
            query += ' AND is_read = false';
        }
        
        query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        
        // Получаем количество непрочитанных
        const unreadCountQuery = `
            SELECT COUNT(*) as unread_count
            FROM notifications
            WHERE user_id = $1 AND is_read = false
        `;
        
        const unreadResult = await db.query(unreadCountQuery, [user_id]);
        
        res.json({
            success: true,
            data: result.rows,
            unread_count: parseInt(unreadResult.rows[0].unread_count)
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения уведомлений:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Отметить уведомление как прочитанное
exports.markAsRead = async (req, res) => {
    try {
        const notification_id = req.params.id;
        const user_id = req.user.id;
        
        const query = `
            UPDATE notifications
            SET is_read = true
            WHERE notification_id = $1 AND user_id = $2
            RETURNING *
        `;
        
        const result = await db.query(query, [notification_id, user_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Уведомление не найдено'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления уведомления:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Отметить все уведомления как прочитанные
exports.markAllAsRead = async (req, res) => {
    try {
        const user_id = req.user.id;
        
        const query = `
            UPDATE notifications
            SET is_read = true
            WHERE user_id = $1 AND is_read = false
            RETURNING notification_id
        `;
        
        const result = await db.query(query, [user_id]);
        
        res.json({
            success: true,
            message: `Отмечено как прочитанные: ${result.rows.length} уведомлений`
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления уведомлений:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Удаление уведомления
exports.deleteNotification = async (req, res) => {
    try {
        const notification_id = req.params.id;
        const user_id = req.user.id;
        
        const query = `
            DELETE FROM notifications
            WHERE notification_id = $1 AND user_id = $2
            RETURNING notification_id
        `;
        
        const result = await db.query(query, [notification_id, user_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Уведомление не найдено'
            });
        }
        
        res.json({
            success: true,
            message: 'Уведомление удалено'
        });
        
    } catch (error) {
        console.error('❌ Ошибка удаления уведомления:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Создание уведомления (для админа/системы)
exports.createNotification = async (req, res) => {
    try {
        const { user_id, type, title, message, request_id } = req.body;
        
        if (!user_id || !type || !title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Не все обязательные поля заполнены'
            });
        }
        
        const query = `
            INSERT INTO notifications (user_id, type, title, message, request_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await db.query(query, [
            user_id,
            type,
            title,
            message,
            request_id || null
        ]);
        
        res.status(201).json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Ошибка создания уведомления:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение количества непрочитанных уведомлений
exports.getUnreadCount = async (req, res) => {
    try {
        const user_id = req.user.id;
        
        const query = `
            SELECT COUNT(*) as unread_count
            FROM notifications
            WHERE user_id = $1 AND is_read = false
        `;
        
        const result = await db.query(query, [user_id]);
        
        res.json({
            success: true,
            unread_count: parseInt(result.rows[0].unread_count)
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения количества уведомлений:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

module.exports = exports;
