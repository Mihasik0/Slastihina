const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Валидация регистрации
const registerValidation = [
  body('first_name').notEmpty().withMessage('Имя обязательно'),
  body('last_name').notEmpty().withMessage('Фамилия обязательна'),
  body('email').isEmail().withMessage('Введите корректный email'),
  body('phone').notEmpty().withMessage('Телефон обязателен'),
  body('address').notEmpty().withMessage('Адрес обязателен'),
  body('password').isLength({ min: 4 }).withMessage('Пароль минимум 4 символа')
];

// Валидация входа
const loginValidation = [
  body('login').notEmpty().withMessage('Введите email или телефон'),
  body('password').notEmpty().withMessage('Введите пароль')
];

// Публичные маршруты
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);

// Защищенный маршрут (нужен токен)
router.get('/me', auth, authController.getMe);

module.exports = router;
