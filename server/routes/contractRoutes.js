const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const auth = require('../middleware/auth');

router.use(auth);

// Статусы (добавить перед /:id)
router.get('/statuses', contractController.getStatusList);
router.patch('/:id/status', contractController.updateContractStatus);

// Остальные маршруты
router.get('/stats', contractController.getStats);
router.get('/search', contractController.searchContracts);
router.get('/count', contractController.getContractsCount);
router.get('/supplier/:inn', contractController.getContractsBySupplier);
router.get('/product/:productId', contractController.getContractsByProduct);
router.get('/:id/history', contractController.getContractHistory);
router.post('/:id/history', contractController.addHistoryEntry);
router.get('/', contractController.getAllContracts);
router.get('/:id', contractController.getContract);
router.post('/', contractController.createContract);
router.put('/:id', contractController.updateContract);
router.delete('/:id', contractController.deleteContract);

module.exports = router;