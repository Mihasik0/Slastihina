const Contract = require('../models/Contract');
const db = require('../config/database');

// Получение всех договоров (с пагинацией)
exports.getAllContracts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const contracts = await Contract.findAll(limit, offset);
        const total = await Contract.count();

        res.json({
            success: true,
            data: contracts,
            pagination: { total, limit, offset, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Ошибка получения договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение договоров конкретного поставщика
exports.getContractsBySupplier = async (req, res) => {
    try {
        const contracts = await Contract.findByInn(req.params.inn);
        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Ошибка получения договоров поставщика:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение договора по ID
exports.getContract = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        res.json({ success: true, data: contract });
    } catch (error) {
        console.error('Ошибка получения договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение количества договоров
exports.getContractsCount = async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) FROM contract');
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Ошибка получения количества договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание договора
// Создание договора - исправленная версия (без ручного обновления количества)
exports.createContract = async (req, res) => {
    const client = await db.pool.connect();
    try {
        console.log('📝 Создание договора:', req.body);
        
        const { inn, amount, delivery_volume, contract_terms, product_id, product_name, unit, price_per_unit } = req.body;
        
        // Проверяем обязательные поля
        if (!inn || !amount || !delivery_volume || !contract_terms) {
            return res.status(400).json({
                success: false,
                message: 'Не все обязательные поля заполнены'
            });
        }
        
        await client.query('BEGIN');
        
        // ПОЛУЧАЕМ ИНФОРМАЦИЮ О ТОВАРЕ
        let productInfo = null;
        let finalProductName = '';
        let finalUnit = 'шт';
        
        if (product_id) {
            const productQuery = 'SELECT product_id, product_name, unit FROM products WHERE product_id = $1';
            const productResult = await client.query(productQuery, [product_id]);
            if (productResult.rows.length > 0) {
                productInfo = productResult.rows[0];
                finalProductName = productInfo.product_name;
                finalUnit = productInfo.unit || 'шт';
                console.log(`📦 Найден товар в каталоге: "${finalProductName}" (ID: ${product_id})`);
            } else {
                finalProductName = product_name || `Товар по договору`;
            }
        } else if (product_name) {
            finalProductName = product_name;
        } else {
            finalProductName = `Товар по договору #${Date.now()}`;
        }
        
        finalProductName = finalProductName.trim();
        
        // Создаем договор
        const contractQuery = `
            INSERT INTO contract (inn, amount, delivery_volume, contract_terms, product_id, product_name, unit)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const contractValues = [inn, amount, delivery_volume, contract_terms, product_id || null, finalProductName, finalUnit];
        const contractResult = await client.query(contractQuery, contractValues);
        const contract = contractResult.rows[0];
        
        const itemPrice = price_per_unit || (amount / delivery_volume);
        
        // Ищем существующий товар на складе
        let existingItem = null;
        const searchQuery = `
            SELECT * FROM warehouse_items 
            WHERE TRIM(item_name) = TRIM($1)
        `;
        const searchResult = await client.query(searchQuery, [finalProductName]);
        
        if (searchResult.rows.length > 0) {
            existingItem = searchResult.rows[0];
            console.log(`✅ Найден существующий товар: ID=${existingItem.item_id}, Количество=${existingItem.current_quantity}`);
        }
        
        let warehouseItem = null;
        
        if (existingItem) {
            // Товар есть - используем его
            warehouseItem = existingItem;
            console.log(`📦 Используем существующий товар: ${warehouseItem.item_name}`);
        } else {
            // Товара нет - создаем новый
            const itemCode = product_id ? `PRD-${product_id}` : `CON-${contract.contract_id}`;
            const minQuantity = Math.max(5, Math.floor(delivery_volume * 0.2));
            
            const insertQuery = `
                INSERT INTO warehouse_items (
                    item_name, item_code, unit, min_quantity, current_quantity, price, supplier_inn, product_id, description
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;
            
            const insertResult = await client.query(insertQuery, [
                finalProductName,
                itemCode,
                finalUnit,
                minQuantity,
                0,  // Начальное количество 0, триггер добавит при движении
                itemPrice,
                inn,
                product_id || null,
                `Поставка по договору #${contract.contract_id}`
            ]);
            warehouseItem = insertResult.rows[0];
            console.log(`📦 Создан новый товар: ${warehouseItem.item_name}`);
        }
        
        // Создаем движение поступления (триггер сам обновит количество!)
        const movementQuery = `
            INSERT INTO warehouse_movements (
                item_id, movement_type, quantity, price, supplier_inn, contract_id, comment, created_by, document_number
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const movementResult = await client.query(movementQuery, [
            warehouseItem.item_id,
            'поступление',
            delivery_volume,
            itemPrice,
            inn,
            contract.contract_id,
            `Поступление по договору #${contract.contract_id}. Товар: ${warehouseItem.item_name}`,
            req.user.id,
            `ДОГ-${contract.contract_id}`
        ]);
        
        console.log(`✅ Создано движение #${movementResult.rows[0].movement_id}`);
        
        // Получаем актуальное количество после триггера
        const updatedItem = await client.query(
            'SELECT * FROM warehouse_items WHERE item_id = $1',
            [warehouseItem.item_id]
        );
        warehouseItem = updatedItem.rows[0];
        
        console.log(`📦 После триггера: товар ${warehouseItem.item_name}, количество: ${warehouseItem.current_quantity} шт.`);
        
        // Добавляем запись в историю договора
        const historyQuery = `
            INSERT INTO contract_history (contract_id, action_type, description, amount, document_number, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(historyQuery, [
            contract.contract_id,
            'creation',
            `Договор создан. Добавлено ${delivery_volume} шт. товара "${warehouseItem.item_name}". Теперь на складе: ${warehouseItem.current_quantity} шт.`,
            amount,
            `ДОГ-${contract.contract_id}`,
            req.user.id
        ]);
        
        // Создаем запись в бухгалтерском учете
        const accountingQuery = `
            INSERT INTO accounting (
                inn, contract_id, warehouse_id, contract_amount, 
                payment_status, request_status, movement
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await client.query(accountingQuery, [
            inn,
            contract.contract_id,
            warehouseItem.item_id,
            amount,
            'Не оплачен',
            'Договор заключен',
            'поступление'
        ]);
        
        console.log(`📊 Создана запись в бухгалтерском учете для договора #${contract.contract_id}`);
        
        await client.query('COMMIT');
        
        console.log('✅ Договор создан, товар добавлен на склад');
        
        res.status(201).json({
            success: true,
            message: `Договор создан. Товар "${warehouseItem.item_name}" добавлен в количестве ${delivery_volume} шт. Теперь на складе: ${warehouseItem.current_quantity} шт.`,
            data: {
                contract: contract,
                warehouse_item: warehouseItem,
                movement: movementResult.rows[0],
                was_existing: !!existingItem,
                new_quantity: warehouseItem.current_quantity
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка создания договора:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        client.release();
    }
};

// Обновление договора
exports.updateContract = async (req, res) => {
    try {
        const contract = await Contract.update(req.params.id, req.body);
        
        // Добавляем запись в историю об изменении
        try {
            await Contract.addHistoryEntry(req.params.id, {
                action_type: 'amendment',
                description: `Договор обновлен`,
                amount: contract.amount,
                created_by: req.user.id
            });
        } catch (historyError) {
            console.error('Ошибка добавления записи в историю:', historyError);
        }
        
        res.json({ success: true, data: contract });
    } catch (error) {
        console.error('Ошибка обновления договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Удаление договора
exports.deleteContract = async (req, res) => {
    try {
        const result = await Contract.delete(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        res.json({ success: true, message: 'Договор удалён' });
    } catch (error) {
        console.error('Ошибка удаления договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение истории договора
exports.getContractHistory = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        
        const history = await Contract.getHistory(req.params.id);
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Ошибка получения истории договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Добавление записи в историю
exports.addHistoryEntry = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        
        const entryData = {
            ...req.body,
            created_by: req.user ? req.user.id : null
        };
        
        if (!entryData.action_type || !entryData.description) {
            return res.status(400).json({ 
                success: false, 
                message: 'Не указаны тип действия или описание' 
            });
        }
        
        const entry = await Contract.addHistoryEntry(req.params.id, entryData);
        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        console.error('Ошибка добавления записи в историю:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Поиск договоров
exports.searchContracts = async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const contracts = await Contract.search(searchTerm, limit, offset);
        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Ошибка поиска договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики
exports.getStats = async (req, res) => {
    try {
        const stats = await Contract.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение договоров по продукту
exports.getContractsByProduct = async (req, res) => {
    try {
        const contracts = await Contract.findByProduct(req.params.productId);
        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Ошибка получения договоров по продукту:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление статуса договора
exports.updateContractStatus = async (req, res) => {
    try {
        console.log('📥 Обновление статуса договора ID:', req.params.id);
        console.log('📦 Новый статус:', req.body.status);
        
        const contractId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Статус не указан'
            });
        }
        
        const validStatuses = ['active', 'pending', 'expired', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Недопустимый статус. Допустимые значения: active, pending, expired, completed'
            });
        }
        
        const updatedContract = await Contract.updateStatus(contractId, status);
        
        if (!updatedContract) {
            return res.status(404).json({
                success: false,
                message: 'Договор не найден'
            });
        }
        
        console.log('✅ Статус обновлен:', updatedContract);
        
        res.json({
            success: true,
            message: 'Статус успешно обновлен',
            data: updatedContract
        });
    } catch (error) {
        console.error('❌ Ошибка обновления статуса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при обновлении статуса: ' + error.message
        });
    }
};

// Получение списка возможных статусов
exports.getStatusList = (req, res) => {
    const statuses = Contract.getValidStatuses();
    res.json({
        success: true,
        data: statuses
    });
};