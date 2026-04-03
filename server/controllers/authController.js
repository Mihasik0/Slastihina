const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const db = require("../config/database");
require("dotenv").config();

// Создание токена (ДОБАВЛЯЕМ РОЛЬ)
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.client_id || user.user_id,
      email: user.email,
      phone: user.phone,
      role: user.role, // ВАЖНО: добавляем роль в токен
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE },
  );
};

// Регистрация
exports.register = async (req, res) => {
  try {
    console.log("Получены данные:", req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { first_name, last_name, email, phone, address, password } = req.body;

    // Проверяем обязательные поля
    if (
      !first_name ||
      !last_name ||
      !email ||
      !phone ||
      !address ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Все поля обязательны для заполнения",
      });
    }

    // Проверяем, есть ли уже такой пользователь по email
    const existingByEmail = await User.findByEmail(email);
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: "Этот email уже зарегистрирован",
      });
    }

    // Проверяем по телефону
    const existingByPhone = await User.findByPhone(phone);
    if (existingByPhone) {
      return res.status(400).json({
        success: false,
        message: "Этот номер телефона уже зарегистрирован",
      });
    }

    // Создаем пользователя с ролью 'client' по умолчанию
    const newUser = await User.create({
      first_name,
      last_name,
      email,
      phone,
      address,
      password,
      role: "client",
    });

    console.log("Создан пользователь:", newUser);

    // Создаем токен
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: "Регистрация прошла успешно",
      data: {
        user: newUser,
        token,
      },
    });
  } catch (error) {
    console.error("Ошибка регистрации:", error);
    res.status(500).json({
      success: false,
      message: "Ошибка сервера при регистрации: " + error.message,
    });
  }
};

// Вход (ИСПРАВЛЕННЫЙ - возвращает роль)
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { login, password } = req.body;

    // Ищем пользователя по email или телефону
    const user = await User.findByEmailOrPhone(login);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Неверный email/телефон или пароль",
      });
    }

    // Проверяем пароль
    const isPasswordValid = await User.checkPassword(
      password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Неверный email/телефон или пароль",
      });
    }

    // Получаем роль пользователя из базы данных (если её нет в user объекте)
    let userRole = user.role;
    if (!userRole) {
      try {
        const roleQuery = "SELECT role FROM registration WHERE client_id = $1";
        const roleResult = await db.query(roleQuery, [
          user.client_id || user.user_id,
        ]);
        if (roleResult.rows[0]) {
          userRole = roleResult.rows[0].role;
        } else {
          userRole = "client";
        }
      } catch (error) {
        console.error("Ошибка получения роли:", error);
        userRole = "client";
      }
    }

    // Создаем токен с ролью
    const token = generateToken({
      ...user,
      role: userRole,
    });

    // Убираем пароль из ответа
    delete user.password_hash;

    // ВОЗВРАЩАЕМ РОЛЬ В ОТВЕТЕ
    res.json({
      success: true,
      message: "Вход выполнен успешно",
      data: {
        user: {
          client_id: user.client_id || user.user_id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          role: userRole, // ВАЖНО: добавляем роль в ответ
        },
        token: token,
      },
    });
  } catch (error) {
    console.error("Ошибка входа:", error);
    res.status(500).json({
      success: false,
      message: "Ошибка сервера при входе: " + error.message,
    });
  }
};

// Получение данных текущего пользователя (ИСПРАВЛЕННЫЙ)
exports.getMe = async (req, res) => {
  try {
    // Получаем пользователя из базы по id из токена
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Пользователь не найден",
      });
    }

    // Получаем роль пользователя
    let userRole = user.role;
    if (!userRole) {
      try {
        const roleQuery = "SELECT role FROM registration WHERE client_id = $1";
        const roleResult = await db.query(roleQuery, [req.user.id]);
        if (roleResult.rows[0]) {
          userRole = roleResult.rows[0].role;
        } else {
          userRole = "client";
        }
      } catch (error) {
        console.error("Ошибка получения роли:", error);
        userRole = "client";
      }
    }

    // Убираем пароль из ответа
    delete user.password_hash;

    res.json({
      success: true,
      data: {
        client_id: user.client_id || user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: userRole, // ВАЖНО: возвращаем роль
      },
    });
  } catch (error) {
    console.error("Ошибка получения профиля:", error);
    res.status(500).json({
      success: false,
      message: "Ошибка сервера: " + error.message,
    });
  }
<<<<<<< HEAD
};
=======
};
>>>>>>> 24ac416860cf1cc0e262a2ba0dc5c6e9a56b6622
