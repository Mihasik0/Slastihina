const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// Все маршруты требуют авторизации
router.use(auth);

// Получение уведомлений пользователя
router.get('/', notificationController.getUserNotifications);

// Получение количества непрочитанных уведомлений
router.get('/unread/count', notificationController.getUnreadCount);

// Отметить уведомление как прочитанное
router.put('/:id/read', notificationController.markAsRead);

// Отметить все уведомления как прочитанные
router.put('/read-all', notificationController.markAllAsRead);

// Удаление уведомления
router.delete('/:id', notificationController.deleteNotification);

// Создание уведомления (для админа)
router.post('/', notificationController.createNotification);

module.exports = router;
