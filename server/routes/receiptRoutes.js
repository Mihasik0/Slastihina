const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');
const auth = require('../middleware/auth');

// Все маршруты требуют авторизации
router.use(auth);

// Получение чеков по ID заявки
router.get('/request/:requestId', receiptController.getByRequestId);

// Получение чека по номеру
router.get('/number/:receiptNumber', receiptController.getByNumber);

// Оплата чека
router.post('/:receiptId/pay', receiptController.pay);

module.exports = router;