const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Создание нового пользователя
  static async create(userData) {
    const { first_name, last_name, email, phone, address, password } = userData;
    
    // Хешируем пароль
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO registration (first_name, last_name, email, phone, address, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING client_id, first_name, last_name, email, phone, address
    `;

    const values = [first_name, last_name, email, phone, address, hashedPassword];
    
    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Ошибка SQL:', error);
      throw error;
    }
  }

  // Поиск по email
  static async findByEmail(email) {
    const query = 'SELECT * FROM registration WHERE email = $1';
    const result = await db.query(query, [email]);
    return result.rows[0];
  }

  // Поиск по телефону
  static async findByPhone(phone) {
    const query = 'SELECT * FROM registration WHERE phone = $1';
    const result = await db.query(query, [phone]);
    return result.rows[0];
  }

  // Поиск по email или телефону (для входа)
  static async findByEmailOrPhone(login) {
    const query = 'SELECT * FROM registration WHERE email = $1 OR phone = $1';
    const result = await db.query(query, [login]);
    return result.rows[0];
  }

  // Поиск по ID
  static async findById(client_id) {
    const query = `
      SELECT client_id, first_name, last_name, email, phone, address 
      FROM registration WHERE client_id = $1
    `;
    const result = await db.query(query, [client_id]);
    return result.rows[0];
  }

  // Проверка пароля
  static async checkPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }
}

module.exports = User;