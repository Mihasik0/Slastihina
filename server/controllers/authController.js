const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
require('dotenv').config();

// Создание токена
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.client_id, 
      email: user.email,
      phone: user.phone 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Регистрация
exports.register = async (req, res) => {
  try {
    console.log('Получены данные:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { first_name, last_name, email, phone, address, password } = req.body;

    // Проверяем обязательные поля
    if (!first_name || !last_name || !email || !phone || !address || !password) {
      return res.status(400).json({
        success: false,
        message: 'Все поля обязательны для заполнения'
      });
    }

    // Проверяем, есть ли уже такой пользователь по email
    const existingByEmail = await User.findByEmail(email);
    if (existingByEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Этот email уже зарегистрирован' 
      });
    }

    // Проверяем по телефону
    const existingByPhone = await User.findByPhone(phone);
    if (existingByPhone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Этот номер телефона уже зарегистрирован' 
      });
    }

    // Создаем пользователя
    const newUser = await User.create({
      first_name,
      last_name,
      email,
      phone,
      address,
      password
    });

    console.log('Создан пользователь:', newUser);

    // Создаем токен
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Регистрация прошла успешно',
      data: {
        user: newUser,
        token
      }
    });

  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера при регистрации: ' + error.message 
    });
  }
};

// Вход
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { login, password } = req.body;

    // Ищем пользователя по email или телефону
    const user = await User.findByEmailOrPhone(login);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Неверный email/телефон или пароль' 
      });
    }

    // Проверяем пароль
    const isPasswordValid = await User.checkPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Неверный email/телефон или пароль' 
      });
    }

    // Создаем токен
    const token = generateToken(user);

    // Убираем пароль из ответа
    delete user.password_hash;

    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера при входе' 
    });
  }
};

// Получение данных текущего пользователя
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
};