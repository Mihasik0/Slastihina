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

// Создание заявки
router.post('/', createRequestValidation, requestController.createRequest);

// Получение всех заявок пользователя
router.get('/my', requestController.getMyRequests);

// Получение статистики
router.get('/stats', requestController.getUserStats);

// Получение конкретной заявки
router.get('/:id', requestController.getRequestById);

module.exports = router;