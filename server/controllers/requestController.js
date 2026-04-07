const Request = require('../models/Request');
const db = require('../config/database');
const { validationResult } = require('express-validator');

// Создание заявки
exports.createRequest = async (req, res) => {
    try {
        console.log('📥 Создание заявки, пользователь:', req.user.id);
        console.log('📦 Данные:', req.body);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { device_type, brand, model, proposed_time, problem_description, is_warranty } = req.body;
        const client_id = req.user.id;

        // Проверка обязательных полей
        if (!device_type || !brand || !model || !proposed_time || !problem_description) {
            return res.status(400).json({
                success: false,
                message: 'Все поля обязательны для заполнения'
            });
        }

        const requestData = {
            client_id,
            device_type,
            brand,
            model,
            proposed_time,
            problem_description,
            status: 'Принят',
            is_warranty: is_warranty || false
        };

        const request = await Request.create(requestData);

        res.status(201).json({
            success: true,
            message: 'Заявка успешно создана',
            data: request
        });

    } catch (error) {
        console.error('❌ Ошибка создания заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при создании заявки'
        });
    }
};

// Получение заявок текущего пользователя
exports.getMyRequests = async (req, res) => {
    try {
        console.log('📥 Запрос заявок пользователя:', req.user.id);
        
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Пользователь не авторизован'
            });
        }
        
        const requests = await Request.findByClientId(req.user.id);
        
        console.log(`✅ Найдено заявок: ${requests.length}`);
        
        res.json({
            success: true,
            data: requests
        });

    } catch (error) {
        console.error('❌ Ошибка получения заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении заявок'
        });
    }
};

// Получение конкретной заявки (с данными диагностики)
exports.getRequestById = async (req, res) => {
    try {
        console.log(`📥 Запрос заявки ID: ${req.params.id} от пользователя: ${req.user.id}`);
        
        // Изменяем запрос, чтобы получать данные диагностики
        const query = `
            SELECT r.*, 
                   u.first_name, u.last_name, u.email, u.phone, u.address,
                   d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description, 
                   d.diagnosis_report, d.required_parts, d.estimated_repair_cost,
                   d.repair_approved, d.repair_approved_at, d.client_comment
            FROM request r
            LEFT JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            WHERE r.request_id = $1
        `;
        
        const result = await db.query(query, [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        const request = result.rows[0];
        
        // Проверяем права доступа (клиент может видеть только свои заявки, мастер/админ - любые)
        if (request.client_id !== req.user.id && req.user.role !== 'master' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен'
            });
        }
        
        console.log(`✅ Найдена заявка #${req.params.id}, diagnosis_id: ${request.diagnosis_id}`);
        
        res.json({
            success: true,
            data: request
        });
    } catch (error) {
        console.error('❌ Ошибка получения заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении заявки: ' + error.message
        });
    }
};

// Получение статистики пользователя
exports.getUserStats = async (req, res) => {
    try {
        console.log('📥 Запрос статистики для пользователя:', req.user.id);
        
        const stats = await Request.getUserStats(req.user.id);
        
        console.log('✅ Статистика:', stats);
        
        res.json({
            success: true,
            data: stats || { total: 0, accepted: 0, rejected: 0, completed: 0, diagnosed: 0 }
        });

    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении статистики'
        });
    }
};

// ========== НОВЫЙ МЕТОД ДЛЯ АДМИНА ==========
// Получение всех заявок (только для админа)
exports.getAllRequests = async (req, res) => {
    try {
        console.log('📥 Запрос всех заявок от пользователя:', req.user.id);

        // !!! Потом сделать
        // Здесь можно добавить проверку на роль администратора
        // Например, если у вас есть поле role в таблице users
        /*
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен. Требуются права администратора.'
            });
        }
        */
        
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const requests = await Request.findAll(limit, offset);
        const total = await Request.getCount();
        
        console.log(`✅ Найдено заявок: ${requests.length}, всего: ${total}`);
        
        res.json({
            success: true,
            data: requests,
            pagination: {
                total: total,
                limit: limit,
                offset: offset,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Ошибка получения всех заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении заявок: ' + error.message
        });
    }
};


// Обновление статуса заявки
exports.updateStatus = async (req, res) => {
    try {
        console.log(`📥 Обновление статуса заявки ID: ${req.params.id}`);
        console.log('📦 Новый статус:', req.body);
        
        const requestId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Статус не указан'
            });
        }
        
        // Проверяем, что статус допустимый
        const validStatuses = ['Принят', 'Не принят', 'Завершен', 'Диагностика проведена'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Недопустимый статус'
            });
        }
        
        // Используем модель Request для обновления
        const updatedRequest = await Request.updateStatus(requestId, status);
        
        if (!updatedRequest) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        console.log('✅ Статус обновлен:', updatedRequest);
        
        res.json({
            success: true,
            message: 'Статус успешно обновлен',
            data: updatedRequest
        });

    } catch (error) {
        console.error('❌ Ошибка обновления статуса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при обновлении статуса: ' + error.message
        });
    }
};

// Получение заявки с деталями (диагностика, ремонт, чек)
exports.getRequestWithDetails = async (req, res) => {
    try {
        const requestId = req.params.id;
        console.log(`📥 Запрос деталей заявки ID: ${requestId}`);
        
        const query = `
            SELECT 
                r.*,
                u.client_id, u.first_name, u.last_name, u.email, u.phone, u.address,
                d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description, d.diagnosis_report,
                d.additional_materials, d.required_parts, d.completed as diagnosis_completed,
                rep.repair_id, rep.services_rendered, rep.used_parts as repair_parts_text, rep.used_materials,
                rec.receipt_id, rec.amount, rec.paid, rec.payment_date, rec.receipt_number,
                COALESCE(
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
                    ),
                    (
                        SELECT json_agg(
                            json_build_object(
                                'item_name', wi.item_name,
                                'quantity', dp.quantity,
                                'price', dp.price,
                                'total', dp.quantity * dp.price
                            )
                        )
                        FROM diagnosis_parts dp
                        LEFT JOIN warehouse_items wi ON dp.item_id = wi.item_id
                        WHERE dp.diagnosis_id = d.diagnosis_id
                    ),
                    '[]'::json
                ) as used_parts_list
            FROM request r
            JOIN registration u ON r.client_id = u.client_id
            LEFT JOIN diagnosis d ON r.request_id = d.request_id
            LEFT JOIN repair rep ON d.diagnosis_id = rep.diagnosis_id
            LEFT JOIN receipts rec ON r.request_id = rec.request_id
            WHERE r.request_id = $1
        `;
        
        const result = await db.query(query, [requestId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        const data = result.rows[0];
        
        // Парсим used_parts_list
        if (data.used_parts_list && typeof data.used_parts_list === 'string') {
            try {
                data.used_parts_list = JSON.parse(data.used_parts_list);
            } catch (e) {
                data.used_parts_list = [];
            }
        }
        
        // Фильтруем null значения
        if (Array.isArray(data.used_parts_list)) {
            data.used_parts_list = data.used_parts_list.filter(p => p.item_name !== null);
        }
        
        console.log(`✅ Найдена заявка #${requestId}`);
        
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('❌ Ошибка получения заявки с деталями:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение доступных гарантийных заявок для клиента
exports.getWarrantyEligibleRequests = async (req, res) => {
    try {
        const clientId = req.user.id;
        
        const query = `
            SELECT DISTINCT ON (r.request_id)
                r.request_id,
                r.device_type,
                r.brand,
                r.model,
                r.problem_description,
                r.created_at,
                r.status,
                r.master_id,
                rec.warranty_end_date,
                rec.receipt_id,
                rec.paid,
                rec.amount,
                rec.payment_date,
                CASE 
                    WHEN rec.warranty_end_date >= CURRENT_DATE THEN true
                    ELSE false
                END as is_warranty_valid,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM request r2 
                        WHERE r2.original_request_id = r.request_id 
                        AND r2.is_warranty = true
                    ) THEN true
                    ELSE false
                END as warranty_used
            FROM request r
            JOIN receipts rec ON r.request_id = rec.request_id
            WHERE r.client_id = $1
            AND r.status = 'Завершен'
            AND rec.paid = true
            AND rec.warranty_end_date >= CURRENT_DATE
            ORDER BY r.request_id, rec.warranty_end_date DESC
        `;
        
        const result = await db.query(query, [clientId]);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения гарантийных заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Подача гарантийной заявки (обновление существующей заявки)
exports.submitWarrantyClaim = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const originalRequestId = req.params.id;
        const clientId = req.user.id;
        const { problem_description } = req.body;
        
        console.log(`📥 Подача гарантийной заявки для request_id: ${originalRequestId}`);
        
        await client.query('BEGIN');
        
        // Проверяем, что заявка принадлежит клиенту и имеет действующую гарантию
        const checkQuery = `
            SELECT 
                r.request_id,
                r.client_id,
                r.status,
                r.master_id,
                r.device_type,
                r.brand,
                r.model,
                rec.warranty_end_date,
                rec.paid,
                rec.receipt_id
            FROM request r
            JOIN receipts rec ON r.request_id = rec.request_id
            WHERE r.request_id = $1
        `;
        
        const checkResult = await client.query(checkQuery, [originalRequestId]);
        
        if (checkResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        const originalRequest = checkResult.rows[0];
        
        // Проверяем права доступа
        if (originalRequest.client_id !== clientId) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен'
            });
        }
        
        // Проверяем, что заявка оплачена
        if (!originalRequest.paid) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Заявка не оплачена'
            });
        }
        
        // Проверяем, что гарантия еще действует
        const warrantyEndDate = new Date(originalRequest.warranty_end_date);
        const currentDate = new Date();
        
        if (warrantyEndDate < currentDate) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Гарантийный срок истек'
            });
        }
        
        // Проверяем, не была ли уже создана гарантийная заявка
        const existingWarrantyQuery = `
            SELECT request_id FROM request 
            WHERE original_request_id = $1 AND is_warranty = true
        `;
        const existingWarranty = await client.query(existingWarrantyQuery, [originalRequestId]);
        
        if (existingWarranty.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'По этой заявке уже была создана гарантийная заявка',
                warranty_request_id: existingWarranty.rows[0].request_id
            });
        }
        
        // Создаем новую гарантийную заявку (связанную с оригинальной)
        const createWarrantyQuery = `
            INSERT INTO request (
                client_id,
                master_id,
                status,
                proposed_time,
                problem_description,
                model,
                brand,
                device_type,
                is_warranty,
                warranty_reason,
                original_request_id
            )
            VALUES ($1, $2, 'Принят', CURRENT_TIMESTAMP + INTERVAL '1 day', $3, $4, $5, $6, true, 'Гарантийное обслуживание', $7)
            RETURNING *
        `;
        
        const warrantyResult = await client.query(createWarrantyQuery, [
            clientId,
            originalRequest.master_id, // Назначаем того же мастера
            problem_description || 'Гарантийное обслуживание',
            originalRequest.model,
            originalRequest.brand,
            originalRequest.device_type,
            originalRequestId
        ]);
        
        await client.query('COMMIT');
        
        console.log(`✅ Гарантийная заявка успешно создана: request_id=${warrantyResult.rows[0].request_id}`);
        
        res.json({
            success: true,
            message: 'Гарантийная заявка успешно создана',
            data: warrantyResult.rows[0]
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка подачи гарантийной заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    } finally {
        client.release();
    }
};