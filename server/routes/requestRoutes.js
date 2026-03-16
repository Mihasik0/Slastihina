const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const requestController = require('../controllers/requestController');
const auth = require('../middleware/auth');

// Валидация создания заявки
const createRequestValidation = [
    body('device_type').notEmpty().withMessage('Тип устройства обязателен'),
    body('brand').notEmpty().withMessage('Марка обязательна'),
    body('model').notEmpty().withMessage('Модель обязательна'),
    body('proposed_time').notEmpty().withMessage('Желаемое время обязательно'),
    body('problem_description').notEmpty().withMessage('Описание проблемы обязательно')
];

// Все маршруты требуют авторизации
router.use(auth);

// Получение всех заявок (для админа) - ЭТОТ МАРШРУТ ДОЛЖЕН БЫТЬ ПЕРВЫМ
router.get('/all', requestController.getAllRequests);

// Получение статистики пользователя
router.get('/stats', requestController.getUserStats);

// Получение заявок текущего пользователя
router.get('/my', requestController.getMyRequests);

// Создание заявки
router.post('/', createRequestValidation, requestController.createRequest);

// Обновление статуса заявки
router.put('/:id/status', requestController.updateStatus);

// Получение конкретной заявки - ЭТОТ МАРШРУТ ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ
router.get('/:id', requestController.getRequestById);


module.exports = router;