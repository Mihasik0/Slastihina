const db = require('../config/database');

class Master {
    // Получение заявок, назначенных мастеру
    static async getAssignedRequests(masterId, status = null) {
        let query = `
            SELECT r.*, 
                   u.first_name, u.last_name, u.email, u.phone, u.address,
                   d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description, d.diagnosis_report,
                   d.completed as diagnosis_completed
            FROM request r
            JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            WHERE r.master_id = $1
        `;
        
        const params = [masterId];
        
        if (status && status !== 'all') {
            query += ` AND r.status = $2`;
            params.push(status);
        }
        
        query += ` ORDER BY r.created_at DESC`;
        
        try {
            const result = await db.query(query, params);
            return result.rows;
        } catch (error) {
            console.error('Ошибка получения заявок мастера:', error);
            throw error;
        }
    }
    
    // Получение статистики мастера
    static async getStats(masterId) {
        const query = `
            SELECT 
                COUNT(r.request_id) as total_requests,
                COUNT(CASE WHEN r.status = 'Принят' THEN 1 END) as in_progress,
                COUNT(CASE WHEN r.status = 'Диагностика проведена' THEN 1 END) as diagnosed,
                COUNT(CASE WHEN r.status = 'Завершен' THEN 1 END) as completed,
                COUNT(CASE WHEN r.status = 'Не принят' THEN 1 END) as rejected,
                COUNT(CASE WHEN d.diagnosis_id IS NOT NULL AND d.completed = false THEN 1 END) as pending_diagnosis
            FROM request r
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            WHERE r.master_id = $1
        `;
        
        try {
            const result = await db.query(query, [masterId]);
            return result.rows[0] || {
                total_requests: 0,
                in_progress: 0,
                diagnosed: 0,
                completed: 0,
                rejected: 0,
                pending_diagnosis: 0
            };
        } catch (error) {
            console.error('Ошибка получения статистики мастера:', error);
            throw error;
        }
    }
    
    // Назначение мастера на заявку
    static async assignMaster(requestId, masterId) {
        const query = `
            UPDATE request 
            SET master_id = $1 
            WHERE request_id = $2 
            RETURNING *
        `;
        
        try {
            const result = await db.query(query, [masterId, requestId]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка назначения мастера:', error);
            throw error;
        }
    }
    
    // Получение всех мастеров
    static async getAllMasters() {
        const query = `
            SELECT client_id, first_name, last_name, email, phone 
            FROM registration 
            WHERE role = 'master'
            ORDER BY first_name, last_name
        `;
        
        try {
            const result = await db.query(query);
            return result.rows;
        } catch (error) {
            console.error('Ошибка получения мастеров:', error);
            throw error;
        }
    }
}

module.exports = Master;