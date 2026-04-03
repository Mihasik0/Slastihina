const express = require('express');
const router = express.Router();
const accountingController = require('../controllers/accountingController');
const auth = require('../middleware/auth');

// Все маршруты требуют авторизации
router.use(auth);

// ========== СПЕЦИАЛЬНЫЕ МАРШРУТЫ (ДОЛЖНЫ БЫТЬ ПЕРЕД /:id) ==========

// Получение статистики
router.get('/stats', accountingController.getAccountingStats);

// Получение отчета по периоду
router.get('/report', accountingController.getReportByPeriod);

// Получение статистики по мастерам
router.get('/masters/stats', accountingController.getMastersStats);

// Получение статистики по договорам
router.get('/contracts/stats', accountingController.getContractsStats);

// Маршруты для чеков
router.get('/receipts', accountingController.getAllReceipts);
router.get('/receipts/stats', accountingController.getReceiptsStats);
router.put('/receipts/:id', accountingController.updateReceiptPayment);

// ========== ОСНОВНЫЕ МАРШРУТЫ CRUD ==========
router.get('/', accountingController.getAllAccounting);
router.post('/', accountingController.createAccounting);

// ========== МАРШРУТЫ С ПАРАМЕТРАМИ (ДОЛЖНЫ БЫТЬ В КОНЦЕ) ==========
router.get('/:id', accountingController.getAccountingById);
router.put('/:id', accountingController.updateAccounting);
router.delete('/:id', accountingController.deleteAccounting);

module.exports = router;
