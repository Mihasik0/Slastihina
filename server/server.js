const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы (HTML страницы)
app.use(express.static(path.join(__dirname, '..')));

// Маршруты авторизации
app.use('/api/auth', authRoutes);

// Проверка сервера
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Сервер авторизации работает',
    time: new Date().toISOString()
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api/health`);
});