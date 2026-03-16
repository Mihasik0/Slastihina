const db = require('../config/database');

class Request {
    // Создание новой заявки
    static async create(requestData) {
        const {
            client_id,
            device_type,
            brand,
            model,
            proposed_time,
            problem_description,
            status = 'Принят'
        } = requestData;

        const query = `
            INSERT INTO request (
                client_id, status, proposed_time, problem_description, 
                model, brand, device_type
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const values = [client_id, status, proposed_time, problem_description, model, brand, device_type];

        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка создания заявки:', error);
            throw error;
        }
    }

    // Получение заявок пользователя
    static async findByClientId(clientId) {
        const query = `
            SELECT * FROM request 
            WHERE client_id = $1 
            ORDER BY created_at DESC
        `;
        
        try {
            const result = await db.query(query, [clientId]);
            return result.rows;
        } catch (error) {
            console.error('Ошибка получения заявок:', error);
            throw error;
        }
    }

    // Получение конкретной заявки
    static async findById(requestId, clientId) {
        const query = `
            SELECT * FROM request 
            WHERE request_id = $1 AND client_id = $2
        `;
        
        try {
            const result = await db.query(query, [requestId, clientId]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка получения заявки:', error);
            throw error;
        }
    }

    // Получение статистики пользователя
    static async getUserStats(clientId) {
        const query = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'Принят' THEN 1 END) as accepted,
                COUNT(CASE WHEN status = 'Не принят' THEN 1 END) as rejected,
                COUNT(CASE WHEN status = 'Завершен' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'Диагностика проведена' THEN 1 END) as diagnosed
            FROM request
            WHERE client_id = $1
        `;
        
        try {
            const result = await db.query(query, [clientId]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
            throw error;
        }
    }

    // ========== МЕТОДЫ ДЛЯ АДМИНА ==========
    // Получение всех заявок (для админа)
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT r.*, u.first_name, u.last_name, u.email, u.phone
            FROM request r
            JOIN registration u ON r.client_id = u.client_id
            ORDER BY r.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        
        try {
            const result = await db.query(query, [limit, offset]);
            return result.rows;
        } catch (error) {
            console.error('Ошибка получения всех заявок:', error);
            throw error;
        }
    }

    // Получение количества всех заявок
    static async getCount() {
        const query = 'SELECT COUNT(*) as total FROM request';
        try {
            const result = await db.query(query);
            return parseInt(result.rows[0].total);
        } catch (error) {
            console.error('Ошибка получения количества заявок:', error);
            throw error;
        }
    }

    // Обновление статуса заявки
        static async updateStatus(requestId, status) {
            const query = `
                UPDATE request 
                SET status = $1 
                WHERE request_id = $2 
                RETURNING *
            `;
            
            try {
                const result = await db.query(query, [status, requestId]);
                return result.rows[0];
            } catch (error) {
                console.error('Ошибка обновления статуса:', error);
                throw error;
            }
        }
}



module.exports = Request;