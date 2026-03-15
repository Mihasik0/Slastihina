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
            RETURNING request_id, client_id, status, proposed_time, problem_description, 
                      model, brand, device_type, created_at
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
            SELECT r.*, 
                   d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description,
                   d.required_parts
            FROM request r
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            WHERE r.client_id = $1
            ORDER BY r.created_at DESC
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
            SELECT r.*, 
                   d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description,
                   d.required_parts, d.additional_materials
            FROM request r
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            WHERE r.request_id = $1 AND r.client_id = $2
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
                COUNT(CASE WHEN status = 'Диагностика проведена' THEN 1 END) as diagnosed,
                MAX(created_at) as last_request_date
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
}

module.exports = Request;