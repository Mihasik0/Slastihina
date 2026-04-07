const db = require('../config/database');

// Получение всех товаров на складе (текущие остатки)
exports.getAllItems = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search || '';
        const supplier = req.query.supplier || 'all';

        let query = `
            SELECT 
                wi.item_id as id,
                wi.item_name,
                wi.current_quantity as quantity,
                wi.price,
                wi.supplier_inn,
                wi.created_at,
                s.supplier_name,
                wi.min_quantity,
                CASE 
                    WHEN wi.current_quantity <= 0 THEN 'Нет в наличии'
                    WHEN wi.current_quantity < wi.min_quantity THEN 'Мало'
                    ELSE 'Норма'
                END as status_text
            FROM warehouse_items wi
            LEFT JOIN supplier s ON wi.supplier_inn = s.inn
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND wi.item_name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (supplier !== 'all') {
            query += ` AND wi.supplier_inn = $${paramIndex}`;
            params.push(supplier);
            paramIndex++;
        }

        query += ` ORDER BY wi.item_name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Получаем общее количество
        let countQuery = `SELECT COUNT(*) as total FROM warehouse_items wi WHERE 1=1`;
        const countParams = [];
        let countParamIndex = 1;

        if (search) {
            countQuery += ` AND wi.item_name ILIKE $${countParamIndex}`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }

        if (supplier !== 'all') {
            countQuery += ` AND wi.supplier_inn = $${countParamIndex}`;
            countParams.push(supplier);
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
        console.error('Ошибка получения товаров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики склада
exports.getStats = async (req, res) => {
    try {
        const itemsQuery = `
            SELECT 
                COUNT(*) as total_items,
                SUM(current_quantity) as total_quantity,
                SUM(current_quantity * price) as total_value,
                COUNT(CASE WHEN current_quantity > 0 AND current_quantity < min_quantity THEN 1 END) as low_stock,
                COUNT(CASE WHEN current_quantity = 0 THEN 1 END) as out_of_stock
            FROM warehouse_items
        `;
        
        const itemsResult = await db.query(itemsQuery);
        
        const movementsQuery = `
            SELECT 
                COUNT(CASE WHEN movement_type = 'поступление' THEN 1 END) as receipts_30d,
                COUNT(CASE WHEN movement_type = 'выбытие' THEN 1 END) as issues_30d
            FROM warehouse_movements
            WHERE created_at >= NOW() - INTERVAL '30 days'
        `;
        
        const movementsResult = await db.query(movementsQuery);
        
        res.json({
            success: true,
            data: {
                total_items: parseInt(itemsResult.rows[0].total_items) || 0,
                total_quantity: parseInt(itemsResult.rows[0].total_quantity) || 0,
                total_value: parseFloat(itemsResult.rows[0].total_value) || 0,
                low_stock: parseInt(itemsResult.rows[0].low_stock) || 0,
                out_of_stock: parseInt(itemsResult.rows[0].out_of_stock) || 0,
                receipts_30d: parseInt(movementsResult.rows[0].receipts_30d) || 0,
                issues_30d: parseInt(movementsResult.rows[0].issues_30d) || 0
            }
        });

    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение товара по ID
exports.getItemById = async (req, res) => {
    try {
        const query = `
            SELECT 
                wi.item_id as id,
                wi.item_name,
                wi.current_quantity as quantity,
                wi.price,
                wi.supplier_inn,
                wi.created_at,
                wi.min_quantity,
                wi.unit,
                wi.item_code,
                wi.description,
                s.supplier_name
            FROM warehouse_items wi
            LEFT JOIN supplier s ON wi.supplier_inn = s.inn
            WHERE wi.item_id = $1
        `;
        const result = await db.query(query, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Товар не найден' });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('Ошибка получения товара:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание нового товара
exports.createItem = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { item_name, item_code, unit, min_quantity, current_quantity, price, supplier_inn, description } = req.body;

        console.log('Создание товара:', req.body);

        if (!item_name || !price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Название и цена обязательны' 
            });
        }

        await client.query('BEGIN');

        const query = `
            INSERT INTO warehouse_items (
                item_name, item_code, unit, min_quantity, current_quantity, price, supplier_inn, description
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const result = await client.query(query, [
            item_name,
            item_code || null,
            unit || 'шт',
            min_quantity || 5,
            current_quantity || 0,
            price,
            supplier_inn || null,
            description || null
        ]);

        if (current_quantity && current_quantity > 0) {
            const movementQuery = `
                INSERT INTO warehouse_movements (
                    item_id, movement_type, quantity, price, supplier_inn, comment, created_by, document_number
                )
                VALUES ($1, 'поступление', $2, $3, $4, 'Начальный остаток', $5, 'INITIAL_STOCK')
            `;
            await client.query(movementQuery, [
                result.rows[0].item_id,
                current_quantity,
                price,
                supplier_inn || null,
                req.user.id
            ]);
        }

        await client.query('COMMIT');

        console.log('Товар создан:', result.rows[0]);

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Товар успешно создан'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка создания товара:', error);
        
        if (error.code === '23505') {
            return res.status(400).json({ 
                success: false, 
                message: 'Товар с таким артикулом уже существует' 
            });
        }
        
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
};

// Обновление товара
exports.updateItem = async (req, res) => {
    try {
        const { item_name, item_code, unit, min_quantity, price, supplier_inn, description } = req.body;

        console.log('Обновление товара ID:', req.params.id);

        const currentItem = await db.query(
            'SELECT * FROM warehouse_items WHERE item_id = $1',
            [req.params.id]
        );

        if (currentItem.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Товар не найден' 
            });
        }

        const query = `
            UPDATE warehouse_items 
            SET item_name = $1,
                item_code = $2,
                unit = $3,
                min_quantity = $4,
                price = $5,
                supplier_inn = $6,
                description = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE item_id = $8
            RETURNING *
        `;

        const result = await db.query(query, [
            item_name !== undefined && item_name !== '' ? item_name : currentItem.rows[0].item_name,
            item_code !== undefined ? item_code : currentItem.rows[0].item_code,
            unit !== undefined && unit !== '' ? unit : currentItem.rows[0].unit,
            min_quantity !== undefined && min_quantity !== null ? min_quantity : currentItem.rows[0].min_quantity,
            price !== undefined && price !== null ? price : currentItem.rows[0].price,
            supplier_inn !== undefined ? supplier_inn : currentItem.rows[0].supplier_inn,
            description !== undefined ? description : currentItem.rows[0].description,
            req.params.id
        ]);

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Товар успешно обновлен'
        });

    } catch (error) {
        console.error('Ошибка обновления товара:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Удаление товара
exports.deleteItem = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('DELETE FROM warehouse_movements WHERE item_id = $1', [req.params.id]);
        
        const query = 'DELETE FROM warehouse_items WHERE item_id = $1 RETURNING item_id';
        const result = await client.query(query, [req.params.id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                message: 'Товар не найден' 
            });
        }

        await client.query('COMMIT');

        res.json({ success: true, message: 'Товар удален' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка удаления товара:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
};

// Получение всех движений
exports.getAllMovements = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const query = `
            SELECT 
                wm.movement_id as id,
                wm.item_id,
                wi.item_name as part_name,
                wm.quantity,
                wm.price,
                wm.movement_type as movement,
                wm.supplier_inn,
                wm.request_id,
                wm.contract_id,
                wm.comment,
                wm.created_at,
                wm.created_by,
                s.supplier_name
            FROM warehouse_movements wm
            LEFT JOIN warehouse_items wi ON wm.item_id = wi.item_id
            LEFT JOIN supplier s ON wm.supplier_inn = s.inn
            ORDER BY wm.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await db.query(query, [limit, offset]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Ошибка получения движений:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание движения
exports.createMovement = async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        console.log('Создание движения:', req.body);

        const { item_id, movement_type, quantity, price, supplier_inn, request_id, contract_id, comment } = req.body;

        if (!item_id || !movement_type || !quantity || !price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Не все обязательные поля заполнены' 
            });
        }

        if (!['поступление', 'выбытие'].includes(movement_type)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Некорректный тип движения' 
            });
        }

        await client.query('BEGIN');

        const itemQuery = 'SELECT * FROM warehouse_items WHERE item_id = $1';
        const itemResult = await client.query(itemQuery, [item_id]);
        
        if (itemResult.rows.length === 0) {
            throw new Error('Товар не найден');
        }

        const currentItem = itemResult.rows[0];

        if (movement_type === 'выбытие' && currentItem.current_quantity < quantity) {
            throw new Error(`Недостаточно товара. Доступно: ${currentItem.current_quantity} шт.`);
        }

        if (movement_type === 'поступление') {
            // Проверка индивидуального лимита товара
            const maxQuantity = currentItem.max_quantity || 1000;
            const newQuantity = currentItem.current_quantity + quantity;
            if (newQuantity > maxQuantity) {
                throw new Error(`Превышен лимит хранения для товара "${currentItem.item_name}". Максимум: ${maxQuantity} шт., текущее количество: ${currentItem.current_quantity} шт., попытка добавить: ${quantity} шт.`);
            }
            
            // Проверка общего лимита склада
            const totalQuery = 'SELECT COALESCE(SUM(current_quantity), 0) as total FROM warehouse_items';
            const totalResult = await client.query(totalQuery);
            const currentTotal = parseInt(totalResult.rows[0].total);
            const newTotal = currentTotal + quantity;
            
            // Получаем максимальный лимит из настроек склада
            const settingsQuery = 'SELECT max_total_quantity FROM warehouse_settings LIMIT 1';
            const settingsResult = await client.query(settingsQuery);
            const maxTotal = settingsResult.rows[0]?.max_total_quantity || 10000;
            
            if (newTotal > maxTotal) {
                throw new Error(`Превышен общий лимит склада! Текущее общее количество: ${currentTotal} шт., лимит: ${maxTotal} шт., попытка добавить: ${quantity} шт.`);
            }
        }

        let validRequestId = null;
        if (request_id) {
            const requestCheck = await client.query(
                'SELECT request_id FROM request WHERE request_id = $1',
                [request_id]
            );
            if (requestCheck.rows.length > 0) {
                validRequestId = request_id;
            }
        }

        const movementQuery = `
            INSERT INTO warehouse_movements (
                item_id, movement_type, quantity, price, supplier_inn, request_id, contract_id, comment, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;

        const values = [
            item_id,
            movement_type,
            quantity,
            price,
            supplier_inn || null,
            validRequestId,
            contract_id || null,
            comment || null,
            req.user.id
        ];

        const movementResult = await client.query(movementQuery, values);
        
        if (movement_type === 'поступление') {
            await client.query(
                `UPDATE warehouse_items 
                 SET current_quantity = current_quantity + $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE item_id = $2`,
                [quantity, item_id]
            );
        } else {
            await client.query(
                `UPDATE warehouse_items 
                 SET current_quantity = current_quantity - $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE item_id = $2`,
                [quantity, item_id]
            );
        }

        await client.query('COMMIT');
        
        console.log('Движение создано:', movementResult.rows[0]);

        res.status(201).json({
            success: true,
            data: movementResult.rows[0],
            message: 'Движение успешно зарегистрировано'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка создания движения:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        client.release();
    }
};

// Списание запчастей
exports.consumeParts = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { parts, request_id, comment } = req.body;
        
        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не указаны запчасти для списания'
            });
        }
        
        await client.query('BEGIN');
        
        const movements = [];
        
        for (const part of parts) {
            const checkQuery = `
                SELECT current_quantity, price, item_name 
                FROM warehouse_items 
                WHERE item_id = $1
            `;
            const checkResult = await client.query(checkQuery, [part.item_id]);
            
            if (checkResult.rows.length === 0) {
                throw new Error(`Запчасть ID ${part.item_id} не найдена`);
            }
            
            const currentItem = checkResult.rows[0];
            const currentQuantity = parseInt(currentItem.current_quantity);
            const requiredQuantity = parseInt(part.quantity);
            
            if (currentQuantity < requiredQuantity) {
                throw new Error(`Недостаточно запчасти "${currentItem.item_name}". Доступно: ${currentQuantity}, требуется: ${requiredQuantity}`);
            }
            
            const price = part.price || parseFloat(currentItem.price);
            
            const movementQuery = `
                INSERT INTO warehouse_movements (
                    item_id, movement_type, quantity, price, request_id, comment, created_by
                )
                VALUES ($1, 'выбытие', $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const movementResult = await client.query(movementQuery, [
                part.item_id,
                requiredQuantity,
                price,
                request_id || null,
                comment || 'Списание запчастей',
                req.user.id
            ]);
            
            movements.push(movementResult.rows[0]);
            
            await client.query(`
                UPDATE warehouse_items 
                SET current_quantity = current_quantity - $1, updated_at = CURRENT_TIMESTAMP
                WHERE item_id = $2
            `, [requiredQuantity, part.item_id]);
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: `Списано ${parts.length} позиций запчастей`,
            data: movements
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка списания запчастей:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        client.release();
    }
};

// Получение доступных запчастей
exports.getAvailableParts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search || '';
        
        let query = `
            SELECT 
                wi.item_id as id,
                wi.item_name,
                wi.current_quantity as quantity,
                wi.price,
                wi.unit,
                wi.item_code,
                wi.supplier_inn,
                s.supplier_name
            FROM warehouse_items wi
            LEFT JOIN supplier s ON wi.supplier_inn = s.inn
            WHERE wi.current_quantity > 0
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (search) {
            query += ` AND (wi.item_name ILIKE $${paramIndex} OR wi.item_code ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        query += ` ORDER BY wi.item_name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Ошибка получения доступных запчастей:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение счетчиков для виджетов
exports.getCounters = async (req, res) => {
    try {
        const countersQuery = `
            SELECT 
                (SELECT COUNT(*) FROM warehouse_items) as total_items,
                (SELECT COUNT(*) FROM warehouse_movements WHERE movement_type = 'поступление' 
                 AND created_at >= NOW() - INTERVAL '30 days') as receipts_30d,
                (SELECT COUNT(*) FROM warehouse_movements WHERE movement_type = 'выбытие' 
                 AND created_at >= NOW() - INTERVAL '30 days') as issues_30d,
                (SELECT COUNT(*) FROM warehouse_items 
                 WHERE current_quantity > 0 AND current_quantity < min_quantity) as low_stock,
                (SELECT COUNT(*) FROM warehouse_items WHERE current_quantity = 0) as out_of_stock,
                (SELECT COALESCE(SUM(current_quantity * price), 0) FROM warehouse_items) as total_value,
                (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_movements WHERE movement_type = 'поступление' 
                 AND created_at >= NOW() - INTERVAL '30 days') as total_receipts_quantity,
                (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_movements WHERE movement_type = 'выбытие' 
                 AND created_at >= NOW() - INTERVAL '30 days') as total_issues_quantity
        `;
        
        const result = await db.query(countersQuery);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Ошибка получения счетчиков:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение товаров с низким остатком
exports.getLowStockItems = async (req, res) => {
    try {
        const query = `
            SELECT 
                wi.item_id as id,
                wi.item_name,
                wi.current_quantity as quantity,
                wi.min_quantity,
                wi.price,
                s.supplier_name,
                (wi.min_quantity - wi.current_quantity) as need_to_order
            FROM warehouse_items wi
            LEFT JOIN supplier s ON wi.supplier_inn = s.inn
            WHERE wi.current_quantity > 0 
                AND wi.current_quantity < wi.min_quantity
            ORDER BY (wi.current_quantity::float / wi.min_quantity) ASC
            LIMIT 20
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Ошибка получения товаров с низким остатком:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Генерация PDF отчета для склада
exports.generateWarehousePDFReport = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const path = require('path');
        const { start_date, end_date, report_type } = req.query;

        let query = '';
        let params = [];
        
        if (report_type === 'inventory') {
            // Отчет по остаткам
            query = `
                SELECT 
                    wi.item_name,
                    wi.item_code,
                    wi.current_quantity,
                    wi.min_quantity,
                    wi.max_quantity,
                    wi.price,
                    wi.unit,
                    s.supplier_name,
                    (wi.current_quantity * wi.price) as total_value
                FROM warehouse_items wi
                LEFT JOIN supplier s ON wi.supplier_inn = s.inn
                ORDER BY wi.item_name
            `;
        } else if (report_type === 'movements') {
            // Отчет по движениям
            query = `
                SELECT 
                    wm.movement_id,
                    wm.movement_type,
                    wm.quantity,
                    wm.price,
                    wm.created_at,
                    wm.comment,
                    wi.item_name,
                    s.supplier_name
                FROM warehouse_movements wm
                JOIN warehouse_items wi ON wm.item_id = wi.item_id
                LEFT JOIN supplier s ON wm.supplier_inn = s.inn
                WHERE 1=1
            `;
            
            if (start_date) {
                query += ` AND wm.created_at >= $1`;
                params.push(start_date);
            }
            if (end_date) {
                query += ` AND wm.created_at <= $${params.length + 1}`;
                params.push(end_date);
            }
            
            query += ` ORDER BY wm.created_at DESC`;
        }

        const result = await db.query(query, params);

        // Создаем PDF документ
        const doc = new PDFDocument({ 
            margin: 50,
            bufferPages: true
        });
        
        // Регистрируем шрифт с поддержкой кириллицы
        const fontPath = path.join(__dirname, '../fonts/DejaVuSans.ttf');
        try {
            doc.registerFont('DejaVu', fontPath);
            doc.font('DejaVu');
        } catch (e) {
            console.log('Не удалось загрузить шрифт DejaVu, пробуем Arial');
            try {
                doc.registerFont('Arial', 'C:/Windows/Fonts/arial.ttf');
                doc.font('Arial');
            } catch (e2) {
                console.log('Не удалось загрузить шрифт Arial');
            }
        }
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=warehouse_report_${Date.now()}.pdf`);
        
        doc.pipe(res);

        // Заголовок
        doc.fontSize(20).text('Отчет по складу', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, { align: 'center' });
        
        if (start_date || end_date) {
            doc.text(`Период: ${start_date || 'начало'} - ${end_date || 'конец'}`, { align: 'center' });
        }
        
        doc.moveDown(2);

        if (report_type === 'inventory') {
            doc.fontSize(14).text('Остатки на складе:', { underline: true });
            doc.moveDown();
            
            let totalValue = 0;
            
            result.rows.forEach((item, index) => {
                doc.fontSize(10);
                doc.text(`${index + 1}. ${item.item_name} (${item.item_code || 'N/A'})`);
                doc.text(`   Количество: ${item.current_quantity} ${item.unit}`);
                doc.text(`   Мин/Макс: ${item.min_quantity}/${item.max_quantity} ${item.unit}`);
                doc.text(`   Цена: ${parseFloat(item.price).toFixed(2)} руб.`);
                doc.text(`   Стоимость: ${parseFloat(item.total_value).toFixed(2)} руб.`);
                doc.text(`   Поставщик: ${item.supplier_name || 'Не указан'}`);
                doc.moveDown(0.5);
                
                totalValue += parseFloat(item.total_value);
            });
            
            doc.moveDown();
            doc.fontSize(12).text(`Общая стоимость товаров: ${totalValue.toFixed(2)} руб.`, { bold: true });
            
        } else if (report_type === 'movements') {
            doc.fontSize(14).text('Движения товаров:', { underline: true });
            doc.moveDown();
            
            let totalIncome = 0;
            let totalExpense = 0;
            
            result.rows.forEach((movement, index) => {
                doc.fontSize(10);
                const movementType = movement.movement_type === 'поступление' ? 'Поступление' : 'Выбытие';
                doc.text(`${index + 1}. ${movementType} - ${movement.item_name}`);
                doc.text(`   Количество: ${movement.quantity}`);
                doc.text(`   Цена: ${parseFloat(movement.price).toFixed(2)} руб.`);
                doc.text(`   Сумма: ${(movement.quantity * parseFloat(movement.price)).toFixed(2)} руб.`);
                doc.text(`   Дата: ${new Date(movement.created_at).toLocaleDateString('ru-RU')}`);
                if (movement.supplier_name) {
                    doc.text(`   Поставщик: ${movement.supplier_name}`);
                }
                if (movement.comment) {
                    doc.text(`   Комментарий: ${movement.comment}`);
                }
                doc.moveDown(0.5);
                
                const sum = movement.quantity * parseFloat(movement.price);
                if (movement.movement_type === 'поступление') {
                    totalIncome += sum;
                } else {
                    totalExpense += sum;
                }
            });
            
            doc.moveDown();
            doc.fontSize(12);
            doc.text(`Итого поступлений: ${totalIncome.toFixed(2)} руб.`);
            doc.text(`Итого выбытий: ${totalExpense.toFixed(2)} руб.`);
        }

        doc.end();
        
    } catch (error) {
        console.error('Ошибка генерации PDF отчета:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};