const express = require('express');
const router = express.Router();
const diagnosisController = require('../controllers/diagnosisController');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Все маршруты требуют авторизации
router.use(auth);

// Получение диагностики по ID заявки
router.get('/request/:requestId', diagnosisController.getByRequestId);

// Получение диагностики по ID
router.get('/:diagnosisId', diagnosisController.getById);

// Получение запчастей диагностики
router.get('/:diagnosisId/parts', diagnosisController.getParts);

// Статистика диагностик мастера
router.get('/stats/master', checkRole(['master', 'admin']), diagnosisController.getMasterStats);

// Создание диагностики (только мастер)
router.post('/', checkRole(['master', 'admin']), diagnosisController.create);

// Добавление запчастей к диагностике (только мастер)
router.post('/:diagnosisId/parts', checkRole(['master', 'admin']), diagnosisController.addParts);

// Обновление статуса подтверждения ремонта (клиент)
router.put('/:diagnosisId/approval', diagnosisController.updateRepairApproval);

// Отмена диагностики (только мастер)
router.delete('/:diagnosisId', checkRole(['master', 'admin']), diagnosisController.cancelDiagnosis);

module.exports = router;