const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const auth = require('../middleware/auth');

// Получение всех отзывов (для главной страницы) - ПУБЛИЧНЫЙ
router.get('/', reviewController.getAllReviews);

// Получение отзыва по заявке - ПУБЛИЧНЫЙ
router.get('/request/:request_id', reviewController.getReviewByRequest);

// Получение отзывов мастера - ПУБЛИЧНЫЙ
router.get('/master/:master_id', reviewController.getMasterReviews);

// Создание отзыва - ТРЕБУЕТ АВТОРИЗАЦИИ
router.post('/', auth, reviewController.createReview);

module.exports = router;
