const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth = require('../middleware/auth');

// Все маршруты защищены авторизацией
router.use(auth);

// GET /api/products - получение всех товаров
router.get('/', productController.getAllProducts);

// GET /api/products/search - поиск товаров
router.get('/search', productController.searchProducts);

// GET /api/products/:id - получение товара по ID
router.get('/:id', productController.getProduct);

// POST /api/products - создание товара
router.post('/', productController.createProduct);

// PUT /api/products/:id - обновление товара
router.put('/:id', productController.updateProduct);

// DELETE /api/products/:id - удаление товара
router.delete('/:id', productController.deleteProduct);

module.exports = router;