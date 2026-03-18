const db = require('../config/database');

class Product {
    // Создание товара
    static async create(productData) {
        const { product_name, product_code, description, unit } = productData;
        const query = `
            INSERT INTO products (product_name, product_code, description, unit)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [product_name, product_code, description, unit || 'шт'];
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка в create:', error);
            throw error;
        }
    }

    // Получение всех товаров
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT * FROM products
            ORDER BY product_name
            LIMIT $1 OFFSET $2
        `;
        try {
            const result = await db.query(query, [limit, offset]);
            return result.rows;
        } catch (error) {
            console.error('Ошибка в findAll:', error);
            throw error;
        }
    }

    // Получение товара по ID
    static async findById(productId) {
        const query = 'SELECT * FROM products WHERE product_id = $1';
        try {
            const result = await db.query(query, [productId]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка в findById:', error);
            throw error;
        }
    }

    // Поиск товаров
    static async search(searchTerm, limit = 100, offset = 0) {
        const query = `
            SELECT * FROM products
            WHERE product_name ILIKE $1 OR product_code ILIKE $1 OR description ILIKE $1
            ORDER BY product_name
            LIMIT $2 OFFSET $3
        `;
        try {
            const result = await db.query(query, [`%${searchTerm}%`, limit, offset]);
            return result.rows;
        } catch (error) {
            console.error('Ошибка в search:', error);
            throw error;
        }
    }

    // Обновление товара
    static async update(productId, productData) {
        const { product_name, product_code, description, unit } = productData;
        const query = `
            UPDATE products
            SET product_name = $1, product_code = $2, description = $3, unit = $4
            WHERE product_id = $5
            RETURNING *
        `;
        const values = [product_name, product_code, description, unit, productId];
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка в update:', error);
            throw error;
        }
    }

    // Удаление товара
    static async delete(productId) {
        const query = 'DELETE FROM products WHERE product_id = $1 RETURNING product_id';
        try {
            const result = await db.query(query, [productId]);
            return result.rows[0];
        } catch (error) {
            console.error('Ошибка в delete:', error);
            throw error;
        }
    }
}

module.exports = Product;