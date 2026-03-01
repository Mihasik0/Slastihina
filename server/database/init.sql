CREATE DATABASE repair_service;

-- Подключение к базе
\c repair_service;

-- Таблица пользователей
CREATE TABLE registration (
    email VARCHAR(100) NOT NULL UNIQUE,
    client_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- индексы для быстрого поиска
CREATE INDEX idx_registration_phone ON registration(phone);
CREATE INDEX idx_registration_email ON registration(email);