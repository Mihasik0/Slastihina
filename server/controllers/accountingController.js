const db = require('../config/database');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

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
            WHERE 1=1
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
                COUNT(CASE WHEN payment_status = 'Оплачен' THEN 1 END) as paid_count,
                COUNT(CASE WHEN payment_status = 'Не оплачен' THEN 1 END) as unpaid_count,
                COUNT(CASE WHEN payment_status = 'Частично оплачен' THEN 1 END) as partial_count,
                (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM receipts 
                    WHERE paid = true
                ) as total_income,
                (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM contract
                ) as total_expense
            FROM accounting
        `;
        
        const result = await db.query(statsQuery);
        const stats = result.rows[0];
        
        // Вычисляем баланс (доход - расход)
        const balance = parseFloat(stats.total_income) - parseFloat(stats.total_expense);
        stats.balance = balance;
        stats.balance_status = balance < 0 ? 'задолженность' : 'прибыль';
        
        res.json({
            success: true,
            data: stats
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

        // Получаем доходы из чеков
        const incomeQuery = `
            SELECT 
                DATE(payment_date) as date,
                SUM(amount) as income
            FROM receipts
            WHERE paid = true
            AND payment_date >= $1 AND payment_date <= $2
            GROUP BY DATE(payment_date)
        `;
        
        // Получаем расходы из договоров
        const expenseQuery = `
            SELECT 
                DATE(created_at) as date,
                SUM(amount) as expense
            FROM contract
            WHERE created_at >= $1 AND created_at <= $2
            GROUP BY DATE(created_at)
        `;
        
        const incomeResult = await db.query(incomeQuery, [start_date, end_date]);
        const expenseResult = await db.query(expenseQuery, [start_date, end_date]);
        
        // Объединяем данные по датам
        const dateMap = {};
        
        incomeResult.rows.forEach(row => {
            const dateStr = row.date.toISOString().split('T')[0];
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = { date: dateStr, income: 0, expense: 0 };
            }
            dateMap[dateStr].income = parseFloat(row.income);
        });
        
        expenseResult.rows.forEach(row => {
            const dateStr = row.date.toISOString().split('T')[0];
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = { date: dateStr, income: 0, expense: 0 };
            }
            dateMap[dateStr].expense = parseFloat(row.expense);
        });
        
        // Преобразуем в массив и добавляем баланс
        const reportData = Object.values(dateMap).map(item => {
            const balance = item.income - item.expense;
            return {
                ...item,
                balance: balance,
                balance_status: balance < 0 ? 'задолженность' : 'прибыль'
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            success: true,
            data: reportData
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
                r.master_id,
                r.amount,
                r.paid,
                r.payment_date,
                r.receipt_number,
                r.created_at,
                r.is_warranty,
                req.status as request_status,
                req.problem_description,
                req.client_id,
                req.device_type,
                req.brand,
                req.model,
                reg.first_name || ' ' || reg.last_name as client_name,
                master.first_name || ' ' || master.last_name as master_name,
                d.fault_description,
                d.diagnosis_report,
                rep.services_rendered,
                rep.used_parts,
                rep.used_materials,
                rep.warranty_end_date
            FROM receipts r
            LEFT JOIN request req ON r.request_id = req.request_id
            LEFT JOIN registration reg ON req.client_id = reg.client_id
            LEFT JOIN registration master ON r.master_id = master.client_id
            LEFT JOIN diagnosis d ON r.diagnosis_id = d.diagnosis_id
            LEFT JOIN repair rep ON r.repair_id = rep.repair_id
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
                COALESCE(SUM(CASE WHEN rec.paid = true THEN rec.amount ELSE 0 END), 0) as total_revenue,
                COALESCE(
                    (
                        SELECT json_agg(materials_summary)
                        FROM (
                            SELECT 
                                jsonb_build_object(
                                    'item_name', wi.item_name,
                                    'quantity', SUM(wm.quantity),
                                    'price', AVG(wm.price),
                                    'total', SUM(wm.quantity * wm.price)
                                ) as materials_summary
                            FROM warehouse_movements wm
                            JOIN warehouse_items wi ON wm.item_id = wi.item_id
                            JOIN request r2 ON wm.request_id = r2.request_id
                            WHERE r2.master_id = reg.client_id 
                            AND wm.movement_type = 'выбытие'
                            GROUP BY wi.item_name
                        ) materials_data
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

// Получение динамики оплат по датам (последние 30 дней)
exports.getPaymentsDynamics = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        const query = `
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '${days} days',
                    CURRENT_DATE,
                    '1 day'::interval
                )::date AS date
            )
            SELECT 
                ds.date,
                COALESCE(SUM(CASE WHEN r.paid = true THEN r.amount ELSE 0 END), 0) as paid_amount,
                COALESCE(SUM(CASE WHEN r.paid = false THEN r.amount ELSE 0 END), 0) as unpaid_amount,
                COALESCE(COUNT(CASE WHEN r.paid = true THEN 1 END), 0) as paid_count,
                COALESCE(COUNT(CASE WHEN r.paid = false THEN 1 END), 0) as unpaid_count
            FROM date_series ds
            LEFT JOIN receipts r ON DATE(r.created_at) = ds.date
            GROUP BY ds.date
            ORDER BY ds.date ASC
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Ошибка получения динамики оплат:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение общей финансовой сводки
exports.getFinancialSummary = async (req, res) => {
    try {
        const summaryQuery = `
            SELECT 
                -- Доходы из чеков
                (SELECT COALESCE(SUM(amount), 0) FROM receipts WHERE paid = true) as total_income_from_receipts,
                (SELECT COUNT(*) FROM receipts WHERE paid = true) as paid_receipts_count,
                
                -- Расходы из договоров
                (SELECT COALESCE(SUM(amount), 0) FROM contract) as total_expense_from_contracts,
                (SELECT COUNT(*) FROM contract) as contracts_count,
                
                -- Неоплаченные чеки
                (SELECT COALESCE(SUM(amount), 0) FROM receipts WHERE paid = false) as unpaid_receipts_amount,
                (SELECT COUNT(*) FROM receipts WHERE paid = false) as unpaid_receipts_count,
                
                -- Всего чеков
                (SELECT COALESCE(SUM(amount), 0) FROM receipts) as total_receipts_amount,
                (SELECT COUNT(*) FROM receipts) as total_receipts_count
        `;
        
        const result = await db.query(summaryQuery);
        const summary = result.rows[0];
        
        // Вычисляем баланс
        const totalIncome = parseFloat(summary.total_income_from_receipts) || 0;
        const totalExpense = parseFloat(summary.total_expense_from_contracts) || 0;
        const balance = totalIncome - totalExpense;
        
        // Формируем ответ
        const financialSummary = {
            income: {
                total: totalIncome,
                source: 'Оплаченные чеки',
                count: parseInt(summary.paid_receipts_count) || 0
            },
            expense: {
                total: totalExpense,
                source: 'Договоры с поставщиками',
                count: parseInt(summary.contracts_count) || 0
            },
            balance: {
                amount: balance,
                status: balance >= 0 ? 'прибыль' : 'задолженность',
                formatted: balance >= 0 ? `+${balance.toFixed(2)}` : balance.toFixed(2)
            },
            unpaid_receipts: {
                total: parseFloat(summary.unpaid_receipts_amount) || 0,
                count: parseInt(summary.unpaid_receipts_count) || 0
            },
            total_receipts: {
                total: parseFloat(summary.total_receipts_amount) || 0,
                count: parseInt(summary.total_receipts_count) || 0
            }
        };
        
        res.json({
            success: true,
            data: financialSummary
        });
        
    } catch (error) {
        console.error('Ошибка получения финансовой сводки:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Генерация PDF отчета
exports.generatePDFReport = async (req, res) => {
    try {
        const { start_date, end_date, report_type } = req.query;

        // Получаем данные для отчета
        let query = '';
        let params = [];
        
        if (report_type === 'accounting') {
            query = `
                SELECT 
                    a.accounting_id,
                    a.contract_amount,
                    a.payment_status,
                    a.movement,
                    a.created_at,
                    s.supplier_name,
                    c.contract_terms,
                    wi.item_name
                FROM accounting a
                LEFT JOIN supplier s ON a.inn = s.inn
                LEFT JOIN contract c ON a.contract_id = c.contract_id
                LEFT JOIN warehouse_items wi ON a.warehouse_id = wi.item_id
                WHERE 1=1
            `;
            
            if (start_date) {
                query += ` AND a.created_at >= $1`;
                params.push(start_date);
            }
            if (end_date) {
                query += ` AND a.created_at <= $${params.length + 1}`;
                params.push(end_date);
            }
            
            query += ` ORDER BY a.created_at DESC`;
        } else if (report_type === 'receipts') {
            query = `
                SELECT 
                    r.receipt_number,
                    r.amount,
                    r.paid,
                    r.payment_date,
                    r.created_at,
                    req.problem_description,
                    reg.first_name || ' ' || reg.last_name as client_name,
                    m.first_name || ' ' || m.last_name as master_name
                FROM receipts r
                LEFT JOIN request req ON r.request_id = req.request_id
                LEFT JOIN registration reg ON req.client_id = reg.client_id
                LEFT JOIN registration m ON r.master_id = m.client_id
                WHERE 1=1
            `;
            
            if (start_date) {
                query += ` AND r.created_at >= $1`;
                params.push(start_date);
            }
            if (end_date) {
                query += ` AND r.created_at <= $${params.length + 1}`;
                params.push(end_date);
            }
            
            query += ` ORDER BY r.created_at DESC`;
        } else if (report_type === 'income_expense') {
            // Новый тип отчета: доходы и расходы
            const incomeQuery = `
                SELECT 
                    receipt_number,
                    amount,
                    payment_date as date,
                    'Доход' as type,
                    'Чек' as source
                FROM receipts
                WHERE paid = true
            `;
            
            const expenseQuery = `
                SELECT 
                    contract_id::text as receipt_number,
                    amount,
                    created_at as date,
                    'Расход' as type,
                    'Договор' as source
                FROM contract
            `;
            
            query = `
                (${incomeQuery})
                UNION ALL
                (${expenseQuery})
                ORDER BY date DESC
            `;
        }

        const result = await db.query(query, params);

        // Создаем PDF документ
        const doc = new PDFDocument({ 
            margin: 50,
            bufferPages: true
        });
        
        // Регистрируем системный шрифт Windows с поддержкой кириллицы
        try {
            doc.registerFont('Arial', 'C:/Windows/Fonts/arial.ttf');
            doc.font('Arial');
        } catch (e) {
            console.log('Не удалось загрузить шрифт Arial, используем стандартный');
        }
        
        // Устанавливаем заголовки для скачивания
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=report_${Date.now()}.pdf`);
        
        // Передаем PDF в response
        doc.pipe(res);

        // Заголовок отчета
        doc.fontSize(20).text('Бухгалтерский отчет', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, { align: 'center' });
        
        if (start_date || end_date) {
            doc.text(`Период: ${start_date || 'начало'} - ${end_date || 'конец'}`, { align: 'center' });
        }
        
        doc.moveDown(2);

        // Данные отчета
        if (report_type === 'accounting') {
            doc.fontSize(14).text('Записи бухгалтерского учета:', { underline: true });
            doc.moveDown();
            
            let totalIncome = 0;
            let totalExpense = 0;
            
            result.rows.forEach((row, index) => {
                doc.fontSize(10);
                doc.text(`${index + 1}. ${row.supplier_name || 'Клиент'}`);
                doc.text(`   Сумма: ${row.contract_amount} руб.`);
                doc.text(`   Статус: ${row.payment_status}`);
                doc.text(`   Движение: ${row.movement}`);
                doc.text(`   Дата: ${new Date(row.created_at).toLocaleDateString('ru-RU')}`);
                doc.moveDown(0.5);
                
                if (row.movement === 'поступление') {
                    totalExpense += parseFloat(row.contract_amount);
                } else {
                    totalIncome += parseFloat(row.contract_amount);
                }
            });
            
            doc.moveDown();
            doc.fontSize(12).text(`Итого расходов: ${totalExpense.toFixed(2)} руб.`, { bold: true });
            doc.text(`Итого доходов: ${totalIncome.toFixed(2)} руб.`, { bold: true });
            const balance = totalIncome - totalExpense;
            doc.text(`Баланс: ${balance.toFixed(2)} руб. ${balance < 0 ? '(задолженность)' : ''}`, { bold: true });
            
        } else if (report_type === 'receipts') {
            doc.fontSize(14).text('Чеки:', { underline: true });
            doc.moveDown();
            
            let totalPaid = 0;
            let totalUnpaid = 0;
            
            result.rows.forEach((row, index) => {
                doc.fontSize(10);
                doc.text(`${index + 1}. Чек №${row.receipt_number}`);
                doc.text(`   Клиент: ${row.client_name || 'Не указан'}`);
                doc.text(`   Мастер: ${row.master_name || 'Не указан'}`);
                doc.text(`   Сумма: ${row.amount} руб.`);
                doc.text(`   Оплачен: ${row.paid ? 'Да' : 'Нет'}`);
                doc.text(`   Дата: ${new Date(row.created_at).toLocaleDateString('ru-RU')}`);
                doc.moveDown(0.5);
                
                if (row.paid) {
                    totalPaid += parseFloat(row.amount);
                } else {
                    totalUnpaid += parseFloat(row.amount);
                }
            });
            
            doc.moveDown();
            doc.fontSize(12).text(`Оплачено (доход): ${totalPaid.toFixed(2)} руб.`, { bold: true });
            doc.text(`Не оплачено: ${totalUnpaid.toFixed(2)} руб.`, { bold: true });
            doc.text(`Всего: ${(totalPaid + totalUnpaid).toFixed(2)} руб.`, { bold: true });
        } else if (report_type === 'income_expense') {
            doc.fontSize(14).text('Доходы и расходы:', { underline: true });
            doc.moveDown();
            
            let totalIncome = 0;
            let totalExpense = 0;
            
            result.rows.forEach((row, index) => {
                doc.fontSize(10);
                doc.text(`${index + 1}. ${row.type} - ${row.source}`);
                doc.text(`   Номер: ${row.receipt_number}`);
                doc.text(`   Сумма: ${parseFloat(row.amount).toFixed(2)} руб.`);
                doc.text(`   Дата: ${new Date(row.date).toLocaleDateString('ru-RU')}`);
                doc.moveDown(0.5);
                
                if (row.type === 'Доход') {
                    totalIncome += parseFloat(row.amount);
                } else {
                    totalExpense += parseFloat(row.amount);
                }
            });
            
            doc.moveDown();
            doc.fontSize(12).text(`Итого доходов: ${totalIncome.toFixed(2)} руб.`, { bold: true });
            doc.text(`Итого расходов: ${totalExpense.toFixed(2)} руб.`, { bold: true });
            const balance = totalIncome - totalExpense;
            doc.text(`Баланс: ${balance.toFixed(2)} руб. ${balance < 0 ? '(задолженность)' : ''}`, { bold: true });
        }

        // Завершаем документ
        doc.end();

    } catch (error) {
        console.error('Ошибка генерации PDF отчета:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
