const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const auth = require('../middleware/auth');

// Все маршруты требуют авторизации
router.use(auth);

// ========== СПЕЦИАЛЬНЫЕ МАРШРУТЫ (ДОЛЖНЫ БЫТЬ ПЕРЕД /:id) ==========

// Получение счетчиков и статистики
router.get('/counters', warehouseController.getCounters);
router.get('/stats', warehouseController.getStats);
router.get('/available', warehouseController.getAvailableParts);
router.get('/movements', warehouseController.getAllMovements);
router.get('/low-stock', warehouseController.getLowStockItems);

// ========== ОСНОВНЫЕ МАРШРУТЫ CRUD ==========
router.get('/', warehouseController.getAllItems);
router.post('/', warehouseController.createItem);
router.post('/movements', warehouseController.createMovement);
router.post('/consume', warehouseController.consumeParts);

// ========== МАРШРУТЫ С ПАРАМЕТРАМИ (ДОЛЖНЫ БЫТЬ В КОНЦЕ) ==========
router.get('/:id', warehouseController.getItemById);
router.put('/:id', warehouseController.updateItem);
router.delete('/:id', warehouseController.deleteItem);

module.exports = router;