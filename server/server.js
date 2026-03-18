const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const requestRoutes = require('./routes/requestRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const contractRoutes = require('./routes/contractRoutes');
const productRoutes = require('./routes/productRoutes'); // Добавьте эту строку

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы
app.use(express.static(path.join(__dirname, '..')));

// Маршруты
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/products', productRoutes); // Добавьте эту строку

// Проверка сервера
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Сервер работает',
    time: new Date().toISOString()
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api/health`);
});