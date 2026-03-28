const express = require('express');
const router = express.Router();
const masterController = require('../controllers/masterController');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Все маршруты требуют авторизации
router.use(auth);

// Получение заявок мастера (доступно мастерам и админам)
router.get('/requests', checkRole(['master', 'admin']), masterController.getRequests);
router.get('/requests/stats', checkRole(['master', 'admin']), masterController.getStats);

// Назначение мастера (только для админа)
router.post('/assign/:requestId', checkRole(['admin']), masterController.assignMaster);

// Получение списка мастеров (только для админа)
router.get('/list', checkRole(['admin']), masterController.getMasters);

module.exports = router;