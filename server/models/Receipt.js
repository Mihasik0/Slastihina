const db = require('../config/database');

class Receipt {
    // Получение чеков по ID заявки
    static async findByRequestId(requestId) {
        const query = `
            SELECT rec.*, 
                   r.device_type, r.brand, r.model, r.problem_description,
                   u.first_name, u.last_name, u.email, u.phone, u.address,
                   d.cost as diagnosis_cost, d.fault_description,
                   rep.services_rendered
            FROM receipts rec
            LEFT JOIN request r ON rec.request_id = r.request_id
            LEFT JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON rec.diagnosis_id = d.diagnosis_id
            LEFT JOIN repair rep ON rec.repair_id = rep.repair_id
            WHERE rec.request_id = $1
            ORDER BY rec.created_at DESC
        `;
        
        try {
            const result = await db.query(query, [requestId]);
            return result.rows;
        } catch (error) {
            console.error('Ошибка получения чеков:', error);
            throw error;
        }
    }
    
    // Получение чека по номеру
    static async findByNumber(receiptNumber) {
        const query = `
            SELECT rec.*, 
                   r.device_type, r.brand, r.model,
                   u.first_name, u.last_name, u.email, u.phone, u.address,
                   d.cost as diagnosis_cost, d.fault_description,
                   rep.services_rendered
            FROM receipts rec
            LEFT JOIN request r ON rec.request_id = r.request_id
            LEFT JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON rec.diagnosis_id = d.diagnosis_id
            LEFT JOIN repair rep ON rec.repair_id = rep.repair_id
            WHERE rec.receipt_number = $1
        `;
        
        try {
            const result = await db.query(query, [receiptNumber]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка получения чека:', error);
            throw error;
        }
    }
    
    // Оплата чека
    static async pay(receiptId) {
        const query = `
            UPDATE receipts 
            SET paid = TRUE, payment_date = CURRENT_TIMESTAMP
            WHERE receipt_id = $1
            RETURNING *
        `;
        
        try {
            const result = await db.query(query, [receiptId]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка оплаты чека:', error);
            throw error;
        }
    }
}

module.exports = Receipt;