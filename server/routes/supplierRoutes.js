const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const auth = require('../middleware/auth');

// Все маршруты защищены авторизацией (если требуется)
router.use(auth);

router.get('/upcoming-week', supplierController.getUpcomingWeekCount);
router.get('/', supplierController.getSuppliers);
router.get('/:inn', supplierController.getSupplier);
router.post('/', supplierController.createSupplier);
router.put('/:inn', supplierController.updateSupplier);
router.delete('/:inn', supplierController.deleteSupplier);

module.exports = router;