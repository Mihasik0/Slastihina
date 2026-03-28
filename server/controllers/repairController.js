const Repair = require('../models/Repair');
const db = require('../config/database');

// Создание ремонта (СО СПИСАНИЕМ запчастей - ТОЛЬКО ОДИН РАЗ)
exports.create = async (req, res) => {
    const client = await db.pool.connect();
    try {
        console.log('📥 Создание ремонта, данные:', req.body);
        
        const { diagnosis_id, services_rendered, used_parts, used_materials, total_cost, parts } = req.body;
        
        if (!diagnosis_id) {
            return res.status(400).json({
                success: false,
                message: 'Не указан ID диагностики'
            });
        }
        
        await client.query('BEGIN');
        
        // ========== ДОБАВЬТЕ ЭТУ ПРОВЕРКУ ==========
        // Проверяем, не было ли уже ремонта для этой диагностики
        const checkRepairExistsQuery = `
            SELECT repair_id FROM repair WHERE diagnosis_id = $1
        `;
        const repairExists = await client.query(checkRepairExistsQuery, [diagnosis_id]);
        
        if (repairExists.rows.length > 0) {
            console.log(`⚠️ Ремонт для диагностики #${diagnosis_id} уже существует!`);
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                message: 'Ремонт для этой диагностики уже создан',
                data: { repair_id: repairExists.rows[0].repair_id }
            });
        }
        
        // ========== ПРОВЕРКА НА ДУБЛИРОВАНИЕ СПИСАНИЙ ==========
        // Проверяем, не было ли уже списаний для этой диагностики
        const checkMovementsQuery = `
            SELECT COUNT(*) as count FROM warehouse_movements 
            WHERE diagnosis_id = $1 AND movement_type = 'выбытие'
        `;
        const existingMovements = await client.query(checkMovementsQuery, [diagnosis_id]);
        
        if (parseInt(existingMovements.rows[0].count) > 0) {
            console.log(`⚠️ Для диагностики #${diagnosis_id} уже есть списания (${existingMovements.rows[0].count} шт.)`);
            // Если списания уже есть, но ремонта нет - это ошибка
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                message: `Для этой диагностики уже были списаны запчасти. Количество: ${existingMovements.rows[0].count}`
            });
        }
        
        // Получаем информацию о диагностике
        const diagnosisQuery = `
            SELECT d.request_id, d.cost, d.required_parts
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
        
        // ========== ОПРЕДЕЛЯЕМ, КАКИЕ ЗАПЧАСТИ СПИСЫВАТЬ ==========
        let partsToConsume = [];
        
        // Если переданы parts в запросе - используем их
        if (parts && parts.length > 0) {
            console.log('📦 Используем запчасти из запроса для списания');
            partsToConsume = parts;
        } else {
            // Иначе получаем запчасти из diagnosis_parts
            const diagnosisPartsQuery = `
                SELECT dp.item_id, dp.quantity, dp.price, wi.item_name
                FROM diagnosis_parts dp
                LEFT JOIN warehouse_items wi ON dp.item_id = wi.item_id
                WHERE dp.diagnosis_id = $1
            `;
            const diagnosisParts = await client.query(diagnosisPartsQuery, [diagnosis_id]);
            
            if (diagnosisParts.rows.length > 0) {
                console.log(`📦 Используем запчасти из diagnosis_parts (${diagnosisParts.rows.length} шт.)`);
                partsToConsume = diagnosisParts.rows.map(p => ({
                    id: p.item_id,
                    quantity: p.quantity,
                    price: p.price,
                    name: p.item_name
                }));
            }
        }
        
        // ========== СПИСЫВАЕМ ЗАПЧАСТИ СО СКЛАДА (ТОЛЬКО ОДИН РАЗ) ==========
        const movements = [];
        
        for (const part of partsToConsume) {
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
            const currentQuantity = parseInt(stock.current_quantity);
            const requiredQuantity = parseInt(part.quantity);
            
            if (currentQuantity < requiredQuantity) {
                throw new Error(`Недостаточно запчасти "${stock.item_name}". Доступно: ${currentQuantity}, требуется: ${requiredQuantity}`);
            }
            
            // Создаем движение списания
            const movementQuery = `
                INSERT INTO warehouse_movements (
                    item_id, movement_type, quantity, price, request_id, diagnosis_id, comment, created_by
                )
                VALUES ($1, 'выбытие', $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            
            const movementResult = await client.query(movementQuery, [
                part.id,
                requiredQuantity,
                part.price || stock.price,
                diagnosis.request_id,
                diagnosis_id,
                `Списано при ремонте (диагностика #${diagnosis_id})`,
                req.user.id
            ]);
            
            movements.push(movementResult.rows[0]);
            
            console.log(`✅ Списано ${requiredQuantity} шт. "${stock.item_name}" со склада (ремонт)`);
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
        
        // Создаем чек за ремонт
        const timestamp = Date.now().toString().slice(-8);
        const receiptNumber = `R-${diagnosis.request_id}-${timestamp}`;
        
        const finalTotal = total_cost || diagnosis.cost;
        
        const receiptQuery = `
            INSERT INTO receipts (request_id, repair_id, amount, receipt_number)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const receiptResult = await client.query(receiptQuery, [
            diagnosis.request_id, 
            repair.repair_id, 
            finalTotal, 
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
        
        console.log(`✅ Ремонт создан, списано ${movements.length} позиций запчастей`);
        
        res.status(201).json({
            success: true,
            message: `Ремонт завершен, списано ${movements.length} позиций запчастей`,
            data: {
                ...repair,
                receipt: receiptResult.rows[0],
                request: updatedRequest.rows[0],
                movements: movements
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка создания ремонта:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        client.release();
    }
};

// Остальные методы остаются без изменений
exports.getByRequestId = async (req, res) => {
    try {
        const repair = await Repair.findByRequestId(req.params.requestId);
        
        if (!repair) {
            return res.status(404).json({
                success: false,
                message: 'Ремонт не найден'
            });
        }
        
        res.json({
            success: true,
            data: repair
        });
    } catch (error) {
        console.error('Ошибка получения ремонта:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getById = async (req, res) => {
    try {
        const repair = await Repair.findById(req.params.repairId);
        
        if (!repair) {
            return res.status(404).json({
                success: false,
                message: 'Ремонт не найден'
            });
        }
        
        res.json({
            success: true,
            data: repair
        });
    } catch (error) {
        console.error('Ошибка получения ремонта:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.update = async (req, res) => {
    try {
        res.json({ 
            success: true, 
            message: 'Функция обновления ремонта в разработке' 
        });
    } catch (error) {
        console.error('Ошибка обновления ремонта:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.addParts = async (req, res) => {
    try {
        const { repairId } = req.params;
        const { parts } = req.body;
        
        res.json({ 
            success: true, 
            message: `Добавлено ${parts?.length || 0} запчастей к ремонту #${repairId}` 
        });
    } catch (error) {
        console.error('Ошибка добавления запчастей:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getParts = async (req, res) => {
    try {
        const { repairId } = req.params;
        
        res.json({ 
            success: true, 
            data: [] 
        });
    } catch (error) {
        console.error('Ошибка получения запчастей:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};