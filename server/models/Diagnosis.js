const db = require('../config/database');

class Diagnosis {
    // Создание диагностики (БЕЗ списания запчастей)
    static async create(diagnosisData) {
        const { 
            request_id, 
            master_id, 
            cost, 
            fault_description, 
            diagnosis_report,
            additional_materials,
            required_parts,
            estimated_repair_cost,
            parts
        } = diagnosisData;
        
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Проверяем существование диагностики
            const checkQuery = 'SELECT diagnosis_id FROM diagnosis WHERE request_id = $1';
            const checkResult = await client.query(checkQuery, [request_id]);
            if (checkResult.rows.length > 0) {
                throw new Error('Диагностика для этой заявки уже существует');
            }
            
            // Получаем информацию о заявке, чтобы проверить гарантию
            const requestQuery = 'SELECT is_warranty FROM request WHERE request_id = $1';
            const requestResult = await client.query(requestQuery, [request_id]);
            const isWarranty = requestResult.rows[0]?.is_warranty || false;
            
            // Если гарантия, стоимость диагностики = 0
            const finalCost = isWarranty ? 0 : cost;
            
            // Создаем диагностику
            const query = `
                INSERT INTO diagnosis (
                    request_id, master_id, cost, fault_description, 
                    diagnosis_report, additional_materials, required_parts,
                    estimated_repair_cost, completed, is_warranty
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
                RETURNING *
            `;
            
            const values = [
                request_id, master_id, finalCost, fault_description,
                diagnosis_report, additional_materials, required_parts,
                estimated_repair_cost, isWarranty
            ];
            
            const result = await client.query(query, values);
            const diagnosis = result.rows[0];
            
            // ========== СОХРАНЯЕМ ЗАПЧАСТИ В diagnosis_parts (БЕЗ СПИСАНИЯ СО СКЛАДА) ==========
            if (parts && parts.length > 0) {
                console.log(`📦 Сохранение ${parts.length} запчастей для диагностики #${diagnosis.diagnosis_id} (без списания)`);
                
                for (const part of parts) {
                    // Получаем информацию о запчасти
                    const stockQuery = `
                        SELECT item_name, price 
                        FROM warehouse_items 
                        WHERE item_id = $1
                    `;
                    const stockResult = await client.query(stockQuery, [part.id]);
                    
                    if (stockResult.rows.length === 0) {
                        throw new Error(`Запчасть с ID ${part.id} не найдена на складе`);
                    }
                    
                    const stock = stockResult.rows[0];
                    
                    // Сохраняем в diagnosis_parts (только для информации, без списания)
                    const partQuery = `
                        INSERT INTO diagnosis_parts (diagnosis_id, item_id, quantity, price)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (diagnosis_id, item_id) 
                        DO UPDATE SET quantity = diagnosis_parts.quantity + EXCLUDED.quantity,
                                      price = EXCLUDED.price
                    `;
                    await client.query(partQuery, [diagnosis.diagnosis_id, part.id, part.quantity, part.price]);
                    
                    console.log(`📝 Запчасть "${stock.item_name}" (${part.quantity} шт.) добавлена в список необходимых (не списана)`);
                }
                console.log(`✅ Сохранено ${parts.length} запчастей в diagnosis_parts (списание будет при ремонте)`);
            }
            
            // ========== СОЗДАЕМ ЧЕК ЗА ДИАГНОСТИКУ ==========
            const receiptNumber = `D-${request_id}-${diagnosis.diagnosis_id}-${Date.now().toString().slice(-6)}`;
            const receiptQuery = `
                INSERT INTO receipts (request_id, diagnosis_id, master_id, amount, receipt_number, is_warranty, paid)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            // Если гарантия, чек автоматически помечается как оплаченный (бесплатно)
            const receiptResult = await client.query(receiptQuery, [
                request_id, 
                diagnosis.diagnosis_id, 
                master_id, 
                finalCost, 
                receiptNumber, 
                isWarranty,
                isWarranty // Если гарантия, сразу помечаем как оплаченный
            ]);
            console.log(`✅ Создан чек #${receiptResult.rows[0].receipt_number} на сумму ${finalCost} ₽${isWarranty ? ' (ГАРАНТИЯ - бесплатно)' : ''}`);
            
            // ========== ОБНОВЛЯЕМ СТАТУС ЗАЯВКИ ==========
            const updateRequestQuery = `
                UPDATE request 
                SET status = 'Ожидает подтверждения' 
                WHERE request_id = $1
                RETURNING *
            `;
            const updatedRequest = await client.query(updateRequestQuery, [request_id]);
            console.log(`✅ Статус заявки #${request_id} обновлен на "Ожидает подтверждения"`);
            
            await client.query('COMMIT');
            
            return {
                ...diagnosis,
                receipt: receiptResult.rows[0],
                request: updatedRequest.rows[0],
                parts_used: parts ? parts.length : 0
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Ошибка создания диагностики:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Обновление статуса подтверждения ремонта клиентом
    static async updateRepairApproval(diagnosisId, approved, clientComment = null) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            const diagnosisQuery = 'SELECT request_id, cost FROM diagnosis WHERE diagnosis_id = $1';
            const diagnosisResult = await client.query(diagnosisQuery, [diagnosisId]);
            
            if (diagnosisResult.rows.length === 0) {
                throw new Error('Диагностика не найдена');
            }
            
            const diagnosis = diagnosisResult.rows[0];
            
            const query = `
                UPDATE diagnosis 
                SET repair_approved = $1, 
                    repair_approved_at = CURRENT_TIMESTAMP,
                    client_comment = COALESCE($2, client_comment)
                WHERE diagnosis_id = $3
                RETURNING *
            `;
            
            const result = await client.query(query, [approved, clientComment, diagnosisId]);
            const updatedDiagnosis = result.rows[0];
            
            const newStatus = approved ? 'Ремонт одобрен' : 'Ремонт отклонен';
            const requestQuery = `
                UPDATE request 
                SET status = $1 
                WHERE request_id = $2
                RETURNING *
            `;
            const requestResult = await client.query(requestQuery, [newStatus, diagnosis.request_id]);
            
            if (!approved) {
                const receiptCheckQuery = `
                    SELECT receipt_id, paid FROM receipts 
                    WHERE diagnosis_id = $1 AND repair_id IS NULL
                `;
                const receiptCheck = await client.query(receiptCheckQuery, [diagnosisId]);
                
                if (receiptCheck.rows.length === 0) {
                    const receiptNumber = `D-${diagnosis.request_id}-${diagnosisId}-${Date.now().toString().slice(-6)}`;
                    const receiptQuery = `
                        INSERT INTO receipts (request_id, diagnosis_id, master_id, amount, receipt_number)
                        VALUES ($1, $2, $3, $4, $5)
                    `;
                    await client.query(receiptQuery, [diagnosis.request_id, diagnosisId, updatedDiagnosis.master_id, diagnosis.cost, receiptNumber]);
                    console.log(`✅ Создан чек на диагностику #${receiptNumber}`);
                }
            }
            
            await client.query('COMMIT');
            
            return {
                ...updatedDiagnosis,
                request: requestResult.rows[0],
                approved: approved
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Ошибка обновления статуса подтверждения:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Получение диагностики по ID заявки
        static async findByRequestId(requestId) {
            try {
                const query = `
                    SELECT d.*, 
                        m.first_name as master_first_name, 
                        m.last_name as master_last_name,
                        rec.receipt_id, rec.amount, rec.paid, rec.payment_date, rec.receipt_number,
                        (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'item_id', dp.item_id,
                                    'item_name', wi.item_name,
                                    'quantity', dp.quantity,
                                    'price', dp.price,
                                    'total', dp.quantity * dp.price
                                )
                            ), '[]'::json)
                            FROM diagnosis_parts dp
                            LEFT JOIN warehouse_items wi ON dp.item_id = wi.item_id
                            WHERE dp.diagnosis_id = d.diagnosis_id
                        ) as used_parts
                    FROM diagnosis d
                    LEFT JOIN registration m ON d.master_id = m.client_id
                    LEFT JOIN receipts rec ON d.diagnosis_id = rec.diagnosis_id
                    WHERE d.request_id = $1
                `;
                
                const result = await db.query(query, [requestId]);
                
                if (result.rows[0]) {
                    // Парсим used_parts, если это строка JSON
                    if (result.rows[0].used_parts && typeof result.rows[0].used_parts === 'string') {
                        try {
                            result.rows[0].used_parts = JSON.parse(result.rows[0].used_parts);
                        } catch (e) {
                            result.rows[0].used_parts = [];
                        }
                    }
                }
                
                return result.rows[0];
            } catch (error) {
                console.error('❌ Ошибка получения диагностики:', error);
                throw error;
            }
        }
    
    // Получение диагностики по ID
    static async findById(diagnosisId) {
        try {
            const query = `
                SELECT d.*, 
                    m.first_name as master_first_name, 
                    m.last_name as master_last_name,
                    req.client_id, req.device_type, req.brand, req.model, req.problem_description,
                    u.first_name as client_first_name, 
                    u.last_name as client_last_name,
                    u.email, u.phone, u.address,
                    rec.receipt_id, rec.amount, rec.paid, rec.payment_date, rec.receipt_number,
                    (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'item_id', dp.item_id,
                                'item_name', wi.item_name,
                                'quantity', dp.quantity,
                                'price', dp.price,
                                'total', dp.quantity * dp.price
                            )
                        ), '[]'::json)
                        FROM diagnosis_parts dp
                        LEFT JOIN warehouse_items wi ON dp.item_id = wi.item_id
                        WHERE dp.diagnosis_id = d.diagnosis_id
                    ) as used_parts
                FROM diagnosis d
                LEFT JOIN registration m ON d.master_id = m.client_id
                LEFT JOIN request req ON d.request_id = req.request_id
                LEFT JOIN registration u ON req.client_id = u.client_id
                LEFT JOIN receipts rec ON d.diagnosis_id = rec.diagnosis_id
                WHERE d.diagnosis_id = $1
            `;
            
            const result = await db.query(query, [diagnosisId]);
            
            if (result.rows[0]) {
                // Парсим used_parts, если это строка JSON
                if (result.rows[0].used_parts && typeof result.rows[0].used_parts === 'string') {
                    try {
                        result.rows[0].used_parts = JSON.parse(result.rows[0].used_parts);
                    } catch (e) {
                        result.rows[0].used_parts = [];
                    }
                }
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('❌ Ошибка получения диагностики:', error);
            throw error;
        }
    }
    
    // Получение необходимых запчастей для диагностики
    static async getRequiredParts(diagnosisId) {
        try {
            const query = `
                SELECT 
                    dp.item_id,
                    wi.item_name,
                    wi.unit,
                    dp.quantity,
                    dp.price,
                    (dp.quantity * dp.price) as total,
                    wi.supplier_inn,
                    s.supplier_name
                FROM diagnosis_parts dp
                LEFT JOIN warehouse_items wi ON dp.item_id = wi.item_id
                LEFT JOIN supplier s ON wi.supplier_inn = s.inn
                WHERE dp.diagnosis_id = $1
                ORDER BY wi.item_name
            `;
            
            const result = await db.query(query, [diagnosisId]);
            return result.rows;
        } catch (error) {
            console.error('❌ Ошибка получения необходимых запчастей:', error);
            throw error;
        }
    }
}

module.exports = Diagnosis;