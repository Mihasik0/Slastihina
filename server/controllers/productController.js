const Product = require('../models/Product');

// Получение всех товаров
exports.getAllProducts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const products = await Product.findAll(limit, offset);
        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Ошибка получения товаров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение товара по ID
exports.getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Товар не найден' });
        }
        res.json({ success: true, data: product });
    } catch (error) {
        console.error('Ошибка получения товара:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Поиск товаров
exports.searchProducts = async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const products = await Product.search(searchTerm, limit, offset);
        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Ошибка поиска товаров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание товара
exports.createProduct = async (req, res) => {
    try {
        const product = await Product.create(req.body);
        res.status(201).json({ success: true, data: product });
    } catch (error) {
        console.error('Ошибка создания товара:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление товара
exports.updateProduct = async (req, res) => {
    try {
        const product = await Product.update(req.params.id, req.body);
        res.json({ success: true, data: product });
    } catch (error) {
        console.error('Ошибка обновления товара:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Удаление товара
exports.deleteProduct = async (req, res) => {
    try {
        const result = await Product.delete(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Товар не найден' });
        }
        res.json({ success: true, message: 'Товар удалён' });
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};