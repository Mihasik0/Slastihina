const db = require('../config/database');

class Supplier {
    // Создание нового поставщика (с дополнительной информацией)
    static async create(supplierData) {
        const {
            inn,
            supplier_name,
            contract_status,
            delivery_date,
            director_name,
            chief_accountant_name,
            payment_details
        } = supplierData;

        // Начинаем транзакцию, чтобы гарантировать целостность
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Вставка в supplier
            const supplierQuery = `
                INSERT INTO supplier (inn, supplier_name, contract_status, delivery_date)
                VALUES ($1, $2, $3, $4)
                RETURNING inn, supplier_name, contract_status, delivery_date
            `;
            const supplierValues = [inn, supplier_name, contract_status, delivery_date];
            const supplierResult = await client.query(supplierQuery, supplierValues);

            // Вставка в supplier_info
            const infoQuery = `
                INSERT INTO supplier_info (inn, director_name, chief_accountant_name, payment_details)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const infoValues = [inn, director_name, chief_accountant_name, payment_details];
            await client.query(infoQuery, infoValues);

            await client.query('COMMIT');
            return supplierResult.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Получение всех поставщиков с доп. информацией (с пагинацией)
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT s.*, si.director_name, si.chief_accountant_name, si.payment_details
            FROM supplier s
            LEFT JOIN supplier_info si ON s.inn = si.inn
            ORDER BY s.supplier_name
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    }

    // Получение общего количества поставщиков
    static async count() {
        const result = await db.query('SELECT COUNT(*) FROM supplier');
        return parseInt(result.rows[0].count);
    }

    // Получение поставщика по ИНН
    static async findByInn(inn) {
        const query = `
            SELECT s.*, si.director_name, si.chief_accountant_name, si.payment_details
            FROM supplier s
            LEFT JOIN supplier_info si ON s.inn = si.inn
            WHERE s.inn = $1
        `;
        const result = await db.query(query, [inn]);
        return result.rows[0];
    }

    // Обновление поставщика
    static async update(inn, supplierData) {
        const {
            supplier_name,
            contract_status,
            delivery_date,
            director_name,
            chief_accountant_name,
            payment_details
        } = supplierData;

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Обновление supplier
            const supplierQuery = `
                UPDATE supplier
                SET supplier_name = $1, contract_status = $2, delivery_date = $3
                WHERE inn = $4
                RETURNING *
            `;
            await client.query(supplierQuery, [supplier_name, contract_status, delivery_date, inn]);

            // Обновление supplier_info (если запись есть – обновляем, иначе вставляем)
            const infoQuery = `
                INSERT INTO supplier_info (inn, director_name, chief_accountant_name, payment_details)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (inn) DO UPDATE
                SET director_name = EXCLUDED.director_name,
                    chief_accountant_name = EXCLUDED.chief_accountant_name,
                    payment_details = EXCLUDED.payment_details
                RETURNING *
            `;
            await client.query(infoQuery, [inn, director_name, chief_accountant_name, payment_details]);

            await client.query('COMMIT');
            return await Supplier.findByInn(inn);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Удаление поставщика
    static async delete(inn) {
        const query = 'DELETE FROM supplier WHERE inn = $1 RETURNING inn';
        const result = await db.query(query, [inn]);
        return result.rows[0];
    }

    // Поиск по названию, ИНН, директору
    static async search(term, limit, offset) {
        const query = `
            SELECT s.*, si.director_name, si.chief_accountant_name, si.payment_details
            FROM supplier s
            LEFT JOIN supplier_info si ON s.inn = si.inn
            WHERE s.supplier_name ILIKE $1 OR s.inn ILIKE $1 OR si.director_name ILIKE $1
            ORDER BY s.supplier_name
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [`%${term}%`, limit, offset]);
        return result.rows;
    }

    // Фильтрация по статусу договора
    static async filterByStatus(status, limit = 100, offset = 0) {
        const query = `
            SELECT s.*, si.director_name, si.chief_accountant_name, si.payment_details
            FROM supplier s
            LEFT JOIN supplier_info si ON s.inn = si.inn
            WHERE s.contract_status = $1
            ORDER BY s.supplier_name
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [status, limit, offset]);
        return result.rows;
    }

    // Подсчет результатов поиска
    static async countBySearch(term) {
        const query = `
            SELECT COUNT(*)
            FROM supplier s
            LEFT JOIN supplier_info si ON s.inn = si.inn
            WHERE s.supplier_name ILIKE $1 OR s.inn ILIKE $1 OR si.director_name ILIKE $1
        `;
        const result = await db.query(query, [`%${term}%`]);
        return parseInt(result.rows[0].count);
    }

    // Подсчет по статусу
    static async countByStatus(status) {
        const result = await db.query('SELECT COUNT(*) FROM supplier WHERE contract_status = $1', [status]);
        return parseInt(result.rows[0].count);
    }

    // Получение поставщиков с активными договорами
    static async getActiveSuppliers() {
        const query = `
            SELECT DISTINCT s.*, si.director_name, si.chief_accountant_name, si.payment_details
            FROM supplier s
            LEFT JOIN supplier_info si ON s.inn = si.inn
            WHERE s.contract_status = 1
            ORDER BY s.supplier_name
        `;
        const result = await db.query(query);
        return result.rows;
    }

    // Получение поставщиков по товару
    static async getSuppliersByProduct(productId) {
        const query = `
            SELECT DISTINCT s.*, si.director_name, si.chief_accountant_name, si.payment_details
            FROM supplier s
            JOIN contract c ON s.inn = c.inn
            WHERE c.product_id = $1 AND s.contract_status = 1
            ORDER BY s.supplier_name
        `;
        const result = await db.query(query, [productId]);
        return result.rows;
    }
}

module.exports = Supplier;