const express = require('express');
const router = express.Router();
const repairController = require('../controllers/repairController');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Все маршруты требуют авторизации
router.use(auth);

// Получение ремонта по ID заявки
router.get('/request/:requestId', repairController.getByRequestId);

// Получение ремонта по ID
router.get('/:repairId', repairController.getById);

// Создание ремонта (только мастер)
router.post('/', checkRole(['master', 'admin']), repairController.create);

module.exports = router;