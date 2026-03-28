const jwt = require('jsonwebtoken');
const db = require('../config/database');
require('dotenv').config();

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      message: 'Требуется авторизация' 
    });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Неверный формат токена' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Получаем роль пользователя из базы данных
    try {
      const query = 'SELECT role FROM registration WHERE client_id = $1';
      const result = await db.query(query, [decoded.id]);
      
      if (result.rows[0]) {
        decoded.role = result.rows[0].role || 'client';
      } else {
        decoded.role = 'client';
      }
    } catch (dbError) {
      console.error('Ошибка получения роли пользователя:', dbError);
      decoded.role = 'client';
    }
    
    req.user = decoded;
    next();

  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Недействительный токен' 
    });
  }
};