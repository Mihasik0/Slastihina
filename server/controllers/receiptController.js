const db = require('../config/database');

// Получение чеков по ID заявки с деталями запчастей
exports.getByRequestId = async (req, res) => {
    try {
        const query = `
            SELECT 
                rec.*,
                r.device_type, r.brand, r.model, r.problem_description,
                u.first_name, u.last_name, u.email, u.phone, u.address,
                d.cost as diagnosis_cost, d.fault_description,
                rep.services_rendered,
                (
                    SELECT json_agg(
                        json_build_object(
                            'item_name', wi.item_name,
                            'quantity', rp.quantity,
                            'price', rp.price,
                            'total', rp.quantity * rp.price
                        )
                    )
                    FROM repair_parts rp
                    LEFT JOIN warehouse_items wi ON rp.item_id = wi.item_id
                    WHERE rp.repair_id = rep.repair_id
                ) as used_parts
            FROM receipts rec
            LEFT JOIN request r ON rec.request_id = r.request_id
            LEFT JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON rec.diagnosis_id = d.diagnosis_id
            LEFT JOIN repair rep ON rec.repair_id = rep.repair_id
            WHERE rec.request_id = $1
            ORDER BY rec.created_at DESC
        `;
        
        const result = await db.query(query, [req.params.requestId]);
        
        // Парсим used_parts
        for (const row of result.rows) {
            if (row.used_parts && typeof row.used_parts === 'string') {
                try {
                    row.used_parts = JSON.parse(row.used_parts);
                } catch (e) {
                    row.used_parts = [];
                }
            }
        }
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Ошибка получения чеков:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение чека по номеру
exports.getByNumber = async (req, res) => {
    try {
        const query = `
            SELECT 
                rec.*,
                r.device_type, r.brand, r.model,
                u.first_name, u.last_name, u.email, u.phone, u.address,
                d.cost as diagnosis_cost, d.fault_description,
                rep.services_rendered,
                (
                    SELECT json_agg(
                        json_build_object(
                            'item_name', wi.item_name,
                            'quantity', rp.quantity,
                            'price', rp.price,
                            'total', rp.quantity * rp.price
                        )
                    )
                    FROM repair_parts rp
                    LEFT JOIN warehouse_items wi ON rp.item_id = wi.item_id
                    WHERE rp.repair_id = rep.repair_id
                ) as used_parts
            FROM receipts rec
            LEFT JOIN request r ON rec.request_id = r.request_id
            LEFT JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON rec.diagnosis_id = d.diagnosis_id
            LEFT JOIN repair rep ON rec.repair_id = rep.repair_id
            WHERE rec.receipt_number = $1
        `;
        
        const result = await db.query(query, [req.params.receiptNumber]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Чек не найден'
            });
        }
        
        if (result.rows[0].used_parts && typeof result.rows[0].used_parts === 'string') {
            try {
                result.rows[0].used_parts = JSON.parse(result.rows[0].used_parts);
            } catch (e) {
                result.rows[0].used_parts = [];
            }
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Ошибка получения чека:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Оплата чека
exports.pay = async (req, res) => {
    try {
        const query = `
            UPDATE receipts 
            SET paid = TRUE, payment_date = CURRENT_TIMESTAMP
            WHERE receipt_id = $1
            RETURNING *
        `;
        
        const result = await db.query(query, [req.params.receiptId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Чек не найден'
            });
        }
        
        res.json({
            success: true,
            message: 'Чек оплачен',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Ошибка оплаты чека:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};