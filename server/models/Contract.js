const db = require('../config/database');

class Contract {
    // Создание договора
    static async create(contractData) {
        const { inn, amount, delivery_volume, contract_terms, product_id, product_name, unit } = contractData;
        
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Если указан product_id, но нет названия, получаем его из таблицы products
            let finalProductName = product_name;
            let finalUnit = unit || 'шт';
            
            if (product_id && !finalProductName) {
                const productQuery = 'SELECT product_name, unit FROM products WHERE product_id = $1';
                const productResult = await client.query(productQuery, [product_id]);
                if (productResult.rows[0]) {
                    finalProductName = productResult.rows[0].product_name;
                    finalUnit = productResult.rows[0].unit || finalUnit;
                }
            }
            
            const query = `
                INSERT INTO contract (inn, amount, delivery_volume, contract_terms, product_id, product_name, unit)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            const values = [inn, amount, delivery_volume, contract_terms, product_id || null, finalProductName || null, finalUnit];
            const result = await client.query(query, values);
            
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Ошибка в create:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Получение договоров по ИНН поставщика
    static async findByInn(inn) {
        const query = `
            SELECT c.*, s.supplier_name, p.product_name as product_detail_name
            FROM contract c
            JOIN supplier s ON c.inn = s.inn
            LEFT JOIN products p ON c.product_id = p.product_id
            WHERE c.inn = $1 
            ORDER BY c.created_at DESC
        `;
        const result = await db.query(query, [inn]);
        return result.rows;
    }

    // Получение всех договоров (с пагинацией)
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT c.*, s.supplier_name, p.product_name as product_detail_name
            FROM contract c
            JOIN supplier s ON c.inn = s.inn
            LEFT JOIN products p ON c.product_id = p.product_id
            ORDER BY c.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    }

    // Получение договора по ID
    static async findById(contractId) {
        const query = `
            SELECT c.*, s.supplier_name, p.product_name as product_detail_name
            FROM contract c
            JOIN supplier s ON c.inn = s.inn
            LEFT JOIN products p ON c.product_id = p.product_id
            WHERE c.contract_id = $1
        `;
        const result = await db.query(query, [contractId]);
        return result.rows[0];
    }

    // Обновление договора
    static async update(contractId, contractData) {
        const { amount, delivery_volume, contract_terms, product_id, product_name, unit } = contractData;
        
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Получаем старые данные
            const oldQuery = 'SELECT * FROM contract WHERE contract_id = $1';
            const oldResult = await client.query(oldQuery, [contractId]);
            const oldContract = oldResult.rows[0];
            
            let finalProductName = product_name;
            let finalUnit = unit || oldContract.unit;
            
            if (product_id && !finalProductName) {
                const productQuery = 'SELECT product_name, unit FROM products WHERE product_id = $1';
                const productResult = await client.query(productQuery, [product_id]);
                if (productResult.rows[0]) {
                    finalProductName = productResult.rows[0].product_name;
                    finalUnit = productResult.rows[0].unit || finalUnit;
                }
            }
            
            const query = `
                UPDATE contract
                SET amount = $1, delivery_volume = $2, contract_terms = $3, 
                    product_id = $4, product_name = $5, unit = $6
                WHERE contract_id = $7
                RETURNING *
            `;
            const values = [amount, delivery_volume, contract_terms, product_id || null, finalProductName || null, finalUnit, contractId];
            const result = await client.query(query, values);
            
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Ошибка в update:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Удаление договора
    static async delete(contractId) {
        const query = 'DELETE FROM contract WHERE contract_id = $1 RETURNING contract_id';
        const result = await db.query(query, [contractId]);
        return result.rows[0];
    }

    // Подсчёт количества договоров
    static async count() {
        const result = await db.query('SELECT COUNT(*) FROM contract');
        return parseInt(result.rows[0].count);
    }

    // ========== НОВЫЕ МЕТОДЫ ==========

    // Получение истории договора
    static async getHistory(contractId) {
        const query = `
            SELECT h.*, r.first_name, r.last_name
            FROM contract_history h
            LEFT JOIN registration r ON h.created_by = r.client_id
            WHERE h.contract_id = $1
            ORDER BY h.action_date DESC
        `;
        const result = await db.query(query, [contractId]);
        return result.rows;
    }

    // Добавление записи в историю
    static async addHistoryEntry(contractId, entryData) {
        const { action_type, description, amount, document_number, created_by } = entryData;
        const query = `
            INSERT INTO contract_history (contract_id, action_type, description, amount, document_number, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [contractId, action_type, description, amount, document_number, created_by];
        const result = await db.query(query, values);
        return result.rows[0];
    }

    // Поиск договоров
    static async search(searchTerm, limit = 100, offset = 0) {
        const query = `
            SELECT c.*, s.supplier_name, p.product_name as product_detail_name
            FROM contract c
            JOIN supplier s ON c.inn = s.inn
            LEFT JOIN products p ON c.product_id = p.product_id
            WHERE c.contract_id::text ILIKE $1 
               OR s.supplier_name ILIKE $1 
               OR c.product_name ILIKE $1
               OR p.product_name ILIKE $1
            ORDER BY c.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [`%${searchTerm}%`, limit, offset]);
        return result.rows;
    }

    // Получение статистики по договорам
    static async getStats() {
        const query = `
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(c.amount), 0) as total_amount,
                COALESCE(AVG(c.amount), 0) as avg_amount
            FROM contract c
        `;
        const result = await db.query(query);
        return result.rows[0];
    }

    // Получение договоров по продукту
    static async findByProduct(productId) {
        const query = `
            SELECT c.*, s.supplier_name
            FROM contract c
            JOIN supplier s ON c.inn = s.inn
            WHERE c.product_id = $1
            ORDER BY c.created_at DESC
        `;
        const result = await db.query(query, [productId]);
        return result.rows;
    }


    // Обновление статуса договора
static async updateStatus(contractId, status) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        
        // Проверяем допустимость статуса
        const validStatuses = ['active', 'pending', 'expired', 'completed'];
        if (!validStatuses.includes(status)) {
            throw new Error('Недопустимый статус');
        }
        
        // Получаем текущий договор для истории
        const contractQuery = 'SELECT * FROM contract WHERE contract_id = $1';
        const contractResult = await client.query(contractQuery, [contractId]);
        const contract = contractResult.rows[0];
        
        if (!contract) {
            throw new Error('Договор не найден');
        }
        
        // Обновляем статус
        const updateQuery = `
            UPDATE contract 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE contract_id = $2
            RETURNING *
        `;
        const updateResult = await client.query(updateQuery, [status, contractId]);
        
        // Добавляем запись в историю
        const historyQuery = `
            INSERT INTO contract_history (contract_id, action_type, description, action_date)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `;
        await client.query(historyQuery, [
            contractId,
            'amendment',
            `Статус изменен с ${contract.status || 'не указан'} на ${status}`
        ]);
        
        await client.query('COMMIT');
        return updateResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка при обновлении статуса:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Получение всех возможных статусов
static getValidStatuses() {
    return [
        { value: 'active', label: 'Активный', color: 'success' },
        { value: 'pending', label: 'В ожидании', color: 'warning' },
        { value: 'expired', label: 'Истек', color: 'danger' },
        { value: 'completed', label: 'Завершен', color: 'info' }
    ];
}
}

module.exports = Contract;