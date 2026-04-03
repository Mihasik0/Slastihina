const db = require('../config/database');

// Получение всех записей бухгалтерского учета
exports.getAllAccounting = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const startDate = req.query.start_date;
        const endDate = req.query.end_date;
        const paymentStatus = req.query.payment_status;
        const movement = req.query.movement;

        let query = `
            SELECT 
                a.accounting_id,
                a.inn,
                a.contract_id,
                a.request_id,
                a.warehouse_id,
                a.contract_amount,
                a.payment_status,
                a.request_status,
                a.movement,
                a.created_at,
                s.supplier_name,
                c.contract_terms,
                r.problem_description,
                wi.item_name as warehouse_item_name
            FROM accounting a
            LEFT JOIN supplier s ON a.inn = s.inn
            LEFT JOIN contract c ON a.contract_id = c.contract_id
            LEFT JOIN request r ON a.request_id = r.request_id
            LEFT JOIN warehouse_items wi ON a.warehouse_id = wi.item_id
            WHERE a.receipt_id IS NULL
        `;
        
        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND a.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND a.created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (paymentStatus && paymentStatus !== 'all') {
            query += ` AND a.payment_status = $${paramIndex}`;
            params.push(paymentStatus);
            paramIndex++;
        }

        if (movement && movement !== 'all') {
            query += ` AND a.movement = $${paramIndex}`;
            params.push(movement);
            paramIndex++;
        }

        query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Получаем общее количество
        let countQuery = `SELECT COUNT(*) as total FROM accounting a WHERE 1=1`;
        const countParams = [];
        let countParamIndex = 1;

        if (startDate) {
            countQuery += ` AND a.created_at >= $${countParamIndex}`;
            countParams.push(startDate);
            countParamIndex++;
        }

        if (endDate) {
            countQuery += ` AND a.created_at <= $${countParamIndex}`;
            countParams.push(endDate);
            countParamIndex++;
        }

        if (paymentStatus && paymentStatus !== 'all') {
            countQuery += ` AND a.payment_status = $${countParamIndex}`;
            countParams.push(paymentStatus);
            countParamIndex++;
        }

        if (movement && movement !== 'all') {
            countQuery += ` AND a.movement = $${countParamIndex}`;
            countParams.push(movement);
            countParamIndex++;
        }

        const countResult = await db.query(countQuery, countParams);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                limit,
                offset
            }
        });

    } catch (error) {
        console.error('Ошибка получения записей учета:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики бухгалтерского учета
exports.getAccountingStats = async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_records,
                SUM(CASE WHEN payment_status = 'Оплачен' THEN contract_amount ELSE 0 END) as total_paid,
                SUM(CASE WHEN payment_status = 'Не оплачен' THEN contract_amount ELSE 0 END) as total_unpaid,
                SUM(CASE WHEN payment_status = 'Частично оплачен' THEN contract_amount ELSE 0 END) as total_partial,
                SUM(CASE WHEN movement = 'поступление' THEN contract_amount ELSE 0 END) as total_income,
                SUM(CASE WHEN movement = 'выбытие' THEN contract_amount ELSE 0 END) as total_expense,
                COUNT(CASE WHEN payment_status = 'Оплачен' THEN 1 END) as paid_count,
                COUNT(CASE WHEN payment_status = 'Не оплачен' THEN 1 END) as unpaid_count,
                COUNT(CASE WHEN payment_status = 'Частично оплачен' THEN 1 END) as partial_count
            FROM accounting
            WHERE receipt_id IS NULL
        `;
        
        const result = await db.query(statsQuery);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание записи бухгалтерского учета
exports.createAccounting = async (req, res) => {
    try {
        const { inn, contract_id, request_id, warehouse_id, contract_amount, payment_status, request_status, movement } = req.body;

        if (!contract_amount || !payment_status || !request_status || !movement) {
            return res.status(400).json({ 
                success: false, 
                message: 'Не все обязательные поля заполнены' 
            });
        }

        if (!['поступление', 'выбытие'].includes(movement)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Некорректный тип движения' 
            });
        }

        if (!['Оплачен', 'Не оплачен', 'Частично оплачен'].includes(payment_status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Некорректный статус оплаты' 
            });
        }

        const query = `
            INSERT INTO accounting (
                inn, contract_id, request_id, warehouse_id, contract_amount, 
                payment_status, request_status, movement
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const result = await db.query(query, [
            inn || null,
            contract_id || null,
            request_id || null,
            warehouse_id || null,
            contract_amount,
            payment_status,
            request_status,
            movement
        ]);

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Запись учета успешно создана'
        });

    } catch (error) {
        console.error('Ошибка создания записи учета:', error);
        
        if (error.code === '23503') {
            return res.status(400).json({ 
                success: false, 
                message: 'Указанный поставщик, договор, заявка или товар не существует' 
            });
        }
        
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление записи бухгалтерского учета
exports.updateAccounting = async (req, res) => {
    try {
        const { payment_status, request_status, contract_amount } = req.body;

        const currentRecord = await db.query(
            'SELECT * FROM accounting WHERE accounting_id = $1',
            [req.params.id]
        );

        if (currentRecord.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Запись не найдена' 
            });
        }

        const query = `
            UPDATE accounting 
            SET payment_status = COALESCE($1, payment_status),
                request_status = COALESCE($2, request_status),
                contract_amount = COALESCE($3, contract_amount)
            WHERE accounting_id = $4
            RETURNING *
        `;

        const result = await db.query(query, [
            payment_status || currentRecord.rows[0].payment_status,
            request_status || currentRecord.rows[0].request_status,
            contract_amount || currentRecord.rows[0].contract_amount,
            req.params.id
        ]);

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Запись учета успешно обновлена'
        });

    } catch (error) {
        console.error('Ошибка обновления записи учета:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Удаление записи бухгалтерского учета
exports.deleteAccounting = async (req, res) => {
    try {
        const query = 'DELETE FROM accounting WHERE accounting_id = $1 RETURNING accounting_id';
        const result = await db.query(query, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Запись не найдена' 
            });
        }

        res.json({ success: true, message: 'Запись учета удалена' });

    } catch (error) {
        console.error('Ошибка удаления записи учета:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение записи по ID
exports.getAccountingById = async (req, res) => {
    try {
        const query = `
            SELECT 
                a.*,
                s.supplier_name,
                c.contract_terms,
                c.amount as contract_total_amount,
                r.problem_description,
                r.status as request_current_status,
                wi.item_name as warehouse_item_name
            FROM accounting a
            LEFT JOIN supplier s ON a.inn = s.inn
            LEFT JOIN contract c ON a.contract_id = c.contract_id
            LEFT JOIN request r ON a.request_id = r.request_id
            LEFT JOIN warehouse_items wi ON a.warehouse_id = wi.item_id
            WHERE a.accounting_id = $1
        `;
        const result = await db.query(query, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Запись не найдена' });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('Ошибка получения записи учета:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение отчета по периоду
exports.getReportByPeriod = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ 
                success: false, 
                message: 'Укажите начальную и конечную дату' 
            });
        }

        const query = `
            SELECT 
                DATE(a.created_at) as date,
                COUNT(*) as total_operations,
                SUM(CASE WHEN a.movement = 'поступление' THEN a.contract_amount ELSE 0 END) as income,
                SUM(CASE WHEN a.movement = 'выбытие' THEN a.contract_amount ELSE 0 END) as expense,
                SUM(CASE WHEN a.payment_status = 'Оплачен' THEN a.contract_amount ELSE 0 END) as paid,
                SUM(CASE WHEN a.payment_status = 'Не оплачен' THEN a.contract_amount ELSE 0 END) as unpaid
            FROM accounting a
            WHERE a.created_at >= $1 AND a.created_at <= $2
            GROUP BY DATE(a.created_at)
            ORDER BY DATE(a.created_at) DESC
        `;

        const result = await db.query(query, [start_date, end_date]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Ошибка получения отчета:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение всех чеков с информацией об оплате
exports.getAllReceipts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const paid = req.query.paid;

        let query = `
            SELECT 
                r.receipt_id,
                r.request_id,
                r.diagnosis_id,
                r.repair_id,
                r.amount,
                r.paid,
                r.payment_date,
                r.receipt_number,
                r.created_at,
                req.status as request_status,
                req.problem_description,
                req.client_id,
                reg.first_name || ' ' || reg.last_name as client_name
            FROM receipts r
            LEFT JOIN request req ON r.request_id = req.request_id
            LEFT JOIN registration reg ON req.client_id = reg.client_id
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;

        if (paid !== undefined && paid !== 'all') {
            query += ` AND r.paid = $${paramIndex}`;
            params.push(paid === 'true' || paid === '1');
            paramIndex++;
        }

        query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Ошибка получения чеков:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики по чекам
exports.getReceiptsStats = async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_receipts,
                COUNT(CASE WHEN paid = true THEN 1 END) as paid_count,
                COUNT(CASE WHEN paid = false THEN 1 END) as unpaid_count,
                SUM(CASE WHEN paid = true THEN amount ELSE 0 END) as total_paid_amount,
                SUM(CASE WHEN paid = false THEN amount ELSE 0 END) as total_unpaid_amount,
                SUM(amount) as total_amount
            FROM receipts
        `;
        
        const result = await db.query(statsQuery);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Ошибка получения статистики чеков:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление статуса оплаты чека
exports.updateReceiptPayment = async (req, res) => {
    try {
        const { paid } = req.body;
        const receiptId = req.params.id;

        const query = `
            UPDATE receipts 
            SET paid = $1,
                payment_date = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE receipt_id = $2
            RETURNING *
        `;

        const result = await db.query(query, [paid, receiptId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Чек не найден' 
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Статус оплаты обновлен'
        });

    } catch (error) {
        console.error('Ошибка обновления чека:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики по мастерам и использованным материалам
exports.getMastersStats = async (req, res) => {
    try {
        const query = `
            SELECT 
                reg.client_id as master_id,
                reg.first_name || ' ' || reg.last_name as master_name,
                COUNT(DISTINCT r.request_id) as total_requests,
                COUNT(DISTINCT COALESCE(rep.repair_id, d.diagnosis_id)) as total_repairs,
                COALESCE(SUM(rec.amount), 0) as total_revenue,
                COALESCE(
                    (
                        SELECT json_agg(
                            DISTINCT jsonb_build_object(
                                'item_name', wi.item_name,
                                'quantity', parts.quantity,
                                'price', parts.price
                            )
                        )
                        FROM (
                            SELECT rp.item_id, rp.quantity, rp.price
                            FROM repair rep2
                            JOIN diagnosis d2 ON rep2.diagnosis_id = d2.diagnosis_id
                            JOIN request r2 ON d2.request_id = r2.request_id
                            JOIN repair_parts rp ON rep2.repair_id = rp.repair_id
                            WHERE r2.master_id = reg.client_id
                            UNION ALL
                            SELECT dp.item_id, dp.quantity, dp.price
                            FROM diagnosis d3
                            JOIN request r3 ON d3.request_id = r3.request_id
                            JOIN diagnosis_parts dp ON d3.diagnosis_id = dp.diagnosis_id
                            WHERE r3.master_id = reg.client_id
                        ) parts
                        LEFT JOIN warehouse_items wi ON parts.item_id = wi.item_id
                        WHERE wi.item_name IS NOT NULL
                    ),
                    '[]'::json
                ) as materials_used
            FROM registration reg
            LEFT JOIN request r ON reg.client_id = r.master_id
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            LEFT JOIN repair rep ON d.diagnosis_id = rep.diagnosis_id
            LEFT JOIN receipts rec ON r.request_id = rec.request_id
            WHERE reg.role = 'master'
            GROUP BY reg.client_id, reg.first_name, reg.last_name
            HAVING COUNT(DISTINCT r.request_id) > 0
            ORDER BY total_repairs DESC
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Ошибка получения статистики мастеров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики по договорам для графика
exports.getContractsStats = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.contract_id,
                c.amount,
                c.delivery_volume,
                c.created_at,
                s.supplier_name,
                c.product_name,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM accounting a 
                        WHERE a.contract_id = c.contract_id 
                        AND a.payment_status = 'Оплачен'
                    ) THEN 'Оплачен'
                    ELSE 'Не оплачен'
                END as payment_status
            FROM contract c
            LEFT JOIN supplier s ON c.inn = s.inn
            ORDER BY c.created_at DESC
            LIMIT 10
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Ошибка получения статистики договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
