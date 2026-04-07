const db = require('../config/database');

// Создание отзыва
exports.createReview = async (req, res) => {
    try {
        const { request_id, rating, comment } = req.body;
        const client_id = req.user.id;
        
        console.log('📝 Создание отзыва:', { request_id, rating, client_id });
        
        if (!request_id || !rating) {
            return res.status(400).json({
                success: false,
                message: 'Укажите заявку и оценку'
            });
        }
        
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Оценка должна быть от 1 до 5'
            });
        }
        
        // Проверяем, что заявка принадлежит клиенту и завершена
        const requestCheck = await db.query(
            'SELECT request_id, client_id, master_id, status FROM request WHERE request_id = $1',
            [request_id]
        );
        
        if (requestCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        const request = requestCheck.rows[0];
        
        if (request.client_id !== client_id) {
            return res.status(403).json({
                success: false,
                message: 'Вы можете оставлять отзывы только на свои заявки'
            });
        }
        
        if (request.status !== 'Завершен') {
            return res.status(400).json({
                success: false,
                message: 'Отзыв можно оставить только на завершенную заявку'
            });
        }
        
        // Создаем отзыв
        const query = `
            INSERT INTO reviews (request_id, client_id, master_id, rating, comment)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (request_id, client_id) 
            DO UPDATE SET rating = $4, comment = $5, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const result = await db.query(query, [
            request_id,
            client_id,
            request.master_id,
            rating,
            comment || null
        ]);
        
        console.log('✅ Отзыв создан:', result.rows[0]);
        
        res.status(201).json({
            success: true,
            message: 'Спасибо за ваш отзыв!',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Ошибка создания отзыва:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение всех отзывов (для главной страницы)
exports.getAllReviews = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        
        const query = `
            SELECT 
                r.review_id,
                r.rating,
                r.comment,
                r.created_at,
                reg.first_name,
                reg.last_name,
                req.device_type,
                req.brand,
                req.model,
                master.first_name as master_first_name,
                master.last_name as master_last_name
            FROM reviews r
            JOIN registration reg ON r.client_id = reg.client_id
            JOIN request req ON r.request_id = req.request_id
            LEFT JOIN registration master ON r.master_id = master.client_id
            ORDER BY r.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        
        const result = await db.query(query, [limit, offset]);
        
        // Получаем статистику
        const statsQuery = `
            SELECT 
                COUNT(*) as total_reviews,
                AVG(rating) as average_rating,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_stars,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_stars,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_stars,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_stars,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
            FROM reviews
        `;
        
        const statsResult = await db.query(statsQuery);
        
        res.json({
            success: true,
            data: result.rows,
            stats: statsResult.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения отзывов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение отзыва по заявке
exports.getReviewByRequest = async (req, res) => {
    try {
        const request_id = req.params.request_id;
        
        const query = `
            SELECT 
                r.*,
                reg.first_name,
                reg.last_name
            FROM reviews r
            JOIN registration reg ON r.client_id = reg.client_id
            WHERE r.request_id = $1
        `;
        
        const result = await db.query(query, [request_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Отзыв не найден'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения отзыва:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение отзывов мастера
exports.getMasterReviews = async (req, res) => {
    try {
        const master_id = req.params.master_id;
        
        const query = `
            SELECT 
                r.review_id,
                r.rating,
                r.comment,
                r.created_at,
                reg.first_name,
                reg.last_name,
                req.device_type,
                req.brand,
                req.model
            FROM reviews r
            JOIN registration reg ON r.client_id = reg.client_id
            JOIN request req ON r.request_id = req.request_id
            WHERE r.master_id = $1
            ORDER BY r.created_at DESC
        `;
        
        const result = await db.query(query, [master_id]);
        
        // Статистика мастера
        const statsQuery = `
            SELECT 
                COUNT(*) as total_reviews,
                AVG(rating) as average_rating
            FROM reviews
            WHERE master_id = $1
        `;
        
        const statsResult = await db.query(statsQuery, [master_id]);
        
        res.json({
            success: true,
            data: result.rows,
            stats: statsResult.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения отзывов мастера:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

module.exports = exports;
