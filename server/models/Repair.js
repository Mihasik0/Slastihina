const db = require('../config/database');

class Repair {
    // Создание ремонта (с сохранением деталей запчастей в чек)
    static async create(repairData) {
        const { diagnosis_id, services_rendered, used_parts, used_materials, total_cost, parts } = repairData;
        
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Получаем информацию о диагностике
            const diagnosisQuery = `
                SELECT d.request_id, d.cost, d.required_parts, d.fault_description
                FROM diagnosis d
                WHERE d.diagnosis_id = $1
            `;
            const diagnosisResult = await client.query(diagnosisQuery, [diagnosis_id]);
            const diagnosis = diagnosisResult.rows[0];
            
            if (!diagnosis) {
                throw new Error('Диагностика не найдена');
            }
            
            // Проверяем, не было ли уже ремонта
            const checkRepairQuery = `
                SELECT repair_id FROM repair WHERE diagnosis_id = $1
            `;
            const existingRepair = await client.query(checkRepairQuery, [diagnosis_id]);
            
            if (existingRepair.rows.length > 0) {
                throw new Error('Ремонт для этой диагностики уже создан');
            }
            
            // Сохраняем использованные запчасти в repair_parts
            if (parts && parts.length > 0) {
                for (const part of parts) {
                    // Проверяем наличие на складе
                    const stockQuery = `
                        SELECT current_quantity, price, item_name 
                        FROM warehouse_items 
                        WHERE item_id = $1
                    `;
                    const stockResult = await client.query(stockQuery, [part.id]);
                    
                    if (stockResult.rows.length === 0) {
                        throw new Error(`Запчасть ID ${part.id} не найдена на складе`);
                    }
                    
                    const stock = stockResult.rows[0];
                    const requiredQuantity = parseInt(part.quantity);
                    
                    if (stock.current_quantity < requiredQuantity) {
                        throw new Error(`Недостаточно запчасти "${stock.item_name}". Доступно: ${stock.current_quantity}, требуется: ${requiredQuantity}`);
                    }
                    
                    // Сохраняем в repair_parts
                    const partQuery = `
                        INSERT INTO repair_parts (repair_id, item_id, quantity, price)
                        VALUES ($1, $2, $3, $4)
                    `;
                    // repair_id пока неизвестен, сохраним после создания ремонта
                    
                    // Создаем движение списания
                    const movementQuery = `
                        INSERT INTO warehouse_movements (
                            item_id, movement_type, quantity, price, request_id, diagnosis_id, comment, created_by
                        )
                        VALUES ($1, 'выбытие', $2, $3, $4, $5, $6, $7)
                        RETURNING *
                    `;
                    
                    await client.query(movementQuery, [
                        part.id,
                        requiredQuantity,
                        part.price || stock.price,
                        diagnosis.request_id,
                        diagnosis_id,
                        `Списано при ремонте (диагностика #${diagnosis_id})`,
                        req.user ? req.user.id : null
                    ]);
                    
                    // Обновляем количество на складе
                    await client.query(`
                        UPDATE warehouse_items 
                        SET current_quantity = current_quantity - $1, updated_at = CURRENT_TIMESTAMP
                        WHERE item_id = $2
                    `, [requiredQuantity, part.id]);
                    
                    console.log(`✅ Списано ${requiredQuantity} шт. "${stock.item_name}" со склада (ремонт)`);
                }
            }
            
            // Создаем запись ремонта
            const query = `
                INSERT INTO repair (diagnosis_id, used_parts, used_materials, services_rendered)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            
            const values = [diagnosis_id, used_parts, used_materials, services_rendered];
            const result = await client.query(query, values);
            const repair = result.rows[0];
            
            // Теперь сохраняем запчасти в repair_parts с правильным repair_id
            if (parts && parts.length > 0) {
                for (const part of parts) {
                    const partQuery = `
                        INSERT INTO repair_parts (repair_id, item_id, quantity, price)
                        VALUES ($1, $2, $3, $4)
                    `;
                    await client.query(partQuery, [
                        repair.repair_id,
                        part.id,
                        part.quantity,
                        part.price
                    ]);
                }
                console.log(`✅ Сохранено ${parts.length} запчастей в repair_parts`);
            }
            
            // Создаем чек за ремонт с детальным описанием запчастей
            const timestamp = Date.now().toString().slice(-8);
            const receiptNumber = `R-${diagnosis.request_id}-${timestamp}`;
            
            // Формируем детальное описание запчастей для чека
            let partsDescription = '';
            if (parts && parts.length > 0) {
                const partsDetails = parts.map(p => {
                    const partName = p.name || `Запчасть #${p.id}`;
                    return `${partName} - ${p.quantity} шт. × ${p.price} ₽ = ${p.quantity * p.price} ₽`;
                }).join('\n');
                partsDescription = `\n\nИспользованные запчасти:\n${partsDetails}`;
            }
            
            const receiptQuery = `
                INSERT INTO receipts (request_id, repair_id, amount, receipt_number)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const receiptResult = await client.query(receiptQuery, [
                diagnosis.request_id, 
                repair.repair_id, 
                total_cost, 
                receiptNumber
            ]);
            
            // Обновляем статус заявки
            const updateRequestQuery = `
                UPDATE request 
                SET status = 'Завершен' 
                WHERE request_id = $1
                RETURNING *
            `;
            const updatedRequest = await client.query(updateRequestQuery, [diagnosis.request_id]);
            
            await client.query('COMMIT');
            
            console.log(`✅ Ремонт создан, списано ${parts?.length || 0} позиций запчастей`);
            
            return {
                ...repair,
                receipt: receiptResult.rows[0],
                request: updatedRequest.rows[0],
                parts_used: parts || []
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Ошибка создания ремонта:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Получение ремонта по ID заявки с деталями запчастей
    static async findByRequestId(requestId) {
        const query = `
            SELECT r.*, 
                   d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description,
                   rec.receipt_id, rec.amount, rec.paid, rec.payment_date, rec.receipt_number,
                   (
                       SELECT json_agg(
                           json_build_object(
                               'item_id', rp.item_id,
                               'item_name', wi.item_name,
                               'quantity', rp.quantity,
                               'price', rp.price,
                               'total', rp.quantity * rp.price
                           )
                       )
                       FROM repair_parts rp
                       LEFT JOIN warehouse_items wi ON rp.item_id = wi.item_id
                       WHERE rp.repair_id = r.repair_id
                   ) as used_parts
            FROM repair r
            JOIN diagnosis d ON r.diagnosis_id = d.diagnosis_id
            LEFT JOIN receipts rec ON r.repair_id = rec.repair_id
            WHERE d.request_id = $1
        `;
        
        const result = await db.query(query, [requestId]);
        
        if (result.rows[0] && result.rows[0].used_parts && typeof result.rows[0].used_parts === 'string') {
            try {
                result.rows[0].used_parts = JSON.parse(result.rows[0].used_parts);
            } catch (e) {
                result.rows[0].used_parts = [];
            }
        }
        
        return result.rows[0];
    }
    
    // Получение ремонта по ID с деталями запчастей
    static async findById(repairId) {
        const query = `
            SELECT r.*, 
                   d.diagnosis_id, d.cost as diagnosis_cost, d.fault_description, d.diagnosis_report,
                   d.additional_materials, d.required_parts,
                   req.request_id, req.client_id, req.device_type, req.brand, req.model,
                   rec.receipt_id, rec.amount, rec.paid, rec.payment_date, rec.receipt_number,
                   (
                       SELECT json_agg(
                           json_build_object(
                               'item_id', rp.item_id,
                               'item_name', wi.item_name,
                               'quantity', rp.quantity,
                               'price', rp.price,
                               'total', rp.quantity * rp.price
                           )
                       )
                       FROM repair_parts rp
                       LEFT JOIN warehouse_items wi ON rp.item_id = wi.item_id
                       WHERE rp.repair_id = r.repair_id
                   ) as used_parts
            FROM repair r
            JOIN diagnosis d ON r.diagnosis_id = d.diagnosis_id
            JOIN request req ON d.request_id = req.request_id
            LEFT JOIN receipts rec ON r.repair_id = rec.repair_id
            WHERE r.repair_id = $1
        `;
        
        const result = await db.query(query, [repairId]);
        
        if (result.rows[0] && result.rows[0].used_parts && typeof result.rows[0].used_parts === 'string') {
            try {
                result.rows[0].used_parts = JSON.parse(result.rows[0].used_parts);
            } catch (e) {
                result.rows[0].used_parts = [];
            }
        }
        
        return result.rows[0];
    }
}

module.exports = Repair;