-- ============================================
-- ПОЛНЫЙ SQL СКРИПТ ДЛЯ СОЗДАНИЯ БАЗЫ ДАННЫХ
-- ============================================

-- 1. Удаление существующих таблиц (если нужно пересоздать)
DROP TABLE IF EXISTS accounting CASCADE;
DROP TABLE IF EXISTS repair_parts CASCADE;
DROP TABLE IF EXISTS diagnosis_parts CASCADE;
DROP TABLE IF EXISTS warehouse_movements CASCADE;
DROP TABLE IF EXISTS warehouse_items CASCADE;
DROP TABLE IF EXISTS repair CASCADE;
DROP TABLE IF EXISTS diagnosis CASCADE;
DROP TABLE IF EXISTS request CASCADE;
DROP TABLE IF EXISTS registration CASCADE;
DROP TABLE IF EXISTS contract_history CASCADE;
DROP TABLE IF EXISTS contract CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS supplier_info CASCADE;
DROP TABLE IF EXISTS supplier CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;

-- ============================================
-- 2. ФУНКЦИИ
-- ============================================

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Функция для обновления количества товара при движении
CREATE OR REPLACE FUNCTION update_item_quantity_on_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.movement_type = 'поступление' THEN
        UPDATE warehouse_items 
        SET current_quantity = current_quantity + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE item_id = NEW.item_id;
    ELSIF NEW.movement_type = 'выбытие' THEN
        UPDATE warehouse_items 
        SET current_quantity = current_quantity - NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE item_id = NEW.item_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Функция для проверки лимита склада
CREATE OR REPLACE FUNCTION check_warehouse_limit()
RETURNS TRIGGER AS $$
DECLARE
    total_quantity INTEGER;
    max_quantity INTEGER;
BEGIN
    IF NEW.movement_type = 'поступление' THEN
        -- Получаем текущее общее количество товаров
        SELECT COALESCE(SUM(current_quantity), 0) INTO total_quantity FROM warehouse_items;
        
        -- Получаем максимальный лимит
        SELECT max_total_quantity INTO max_quantity FROM warehouse_settings LIMIT 1;
        
        -- Проверяем, не превысит ли новое поступление лимит
        IF (total_quantity + NEW.quantity) > max_quantity THEN
            RAISE EXCEPTION 'Превышен лимит склада! Текущее: %, Лимит: %, Попытка добавить: %', 
                total_quantity, max_quantity, NEW.quantity;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. ТАБЛИЦЫ
-- ============================================

-- Поставщики
CREATE TABLE supplier (
    inn VARCHAR(12) PRIMARY KEY,
    contract_status INTEGER NOT NULL CHECK (contract_status IN (0, 1)),
    supplier_name VARCHAR(200) NOT NULL,
    delivery_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Дополнительная информация о поставщиках
CREATE TABLE supplier_info (
    inn VARCHAR(12) PRIMARY KEY,
    director_name VARCHAR(200) NOT NULL,
    chief_accountant_name VARCHAR(200) NOT NULL,
    payment_details TEXT NOT NULL,
    FOREIGN KEY (inn) REFERENCES supplier(inn) ON DELETE CASCADE
);

-- Товары (общая номенклатура)
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(200) NOT NULL,
    product_code VARCHAR(50) UNIQUE,
    description TEXT,
    unit VARCHAR(20) DEFAULT 'шт',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Настройки склада
CREATE TABLE warehouse_settings (
    setting_id SERIAL PRIMARY KEY,
    max_total_quantity INTEGER DEFAULT 10000,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Договоры
CREATE TABLE contract (
    contract_id SERIAL PRIMARY KEY,
    inn VARCHAR(12) NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    delivery_volume INTEGER NOT NULL CHECK (delivery_volume > 0),
    contract_terms TEXT NOT NULL,
    product_id INTEGER,
    product_name VARCHAR(200),
    unit VARCHAR(20) DEFAULT 'шт',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inn) REFERENCES supplier(inn) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL
);

-- История договоров
CREATE TABLE contract_history (
    history_id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('creation', 'amendment', 'prolongation', 'termination', 'execution', 'payment', 'delivery')),
    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT NOT NULL,
    amount NUMERIC(10,2),
    document_number VARCHAR(100),
    created_by INTEGER,
    FOREIGN KEY (contract_id) REFERENCES contract(contract_id) ON DELETE CASCADE
);

-- Регистрация клиентов и мастеров
CREATE TABLE registration (
    client_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('admin', 'master', 'client')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Заявки на ремонт
CREATE TABLE request (
    request_id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    master_id INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'Принят',
    proposed_time TIMESTAMP NOT NULL,
    problem_description TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    device_type VARCHAR(100) NOT NULL,
    is_warranty BOOLEAN DEFAULT FALSE,
    warranty_reason TEXT,
    original_request_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES registration(client_id) ON DELETE CASCADE,
    FOREIGN KEY (master_id) REFERENCES registration(client_id) ON DELETE SET NULL,
    FOREIGN KEY (original_request_id) REFERENCES request(request_id) ON DELETE SET NULL
);

-- Диагностика
CREATE TABLE diagnosis (
    diagnosis_id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL UNIQUE,
    master_id INTEGER,
    cost NUMERIC(10,2) NOT NULL CHECK (cost >= 0),
    fault_description TEXT NOT NULL,
    diagnosis_report TEXT,
    additional_materials TEXT,
    required_parts TEXT,
    estimated_repair_cost NUMERIC(10,2),
    repair_approved BOOLEAN DEFAULT NULL,
    repair_approved_at TIMESTAMP,
    client_comment TEXT,
    completed BOOLEAN DEFAULT TRUE,
    is_warranty BOOLEAN DEFAULT FALSE,
    warranty_end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE CASCADE,
    FOREIGN KEY (master_id) REFERENCES registration(client_id) ON DELETE SET NULL
);

-- Ремонт
CREATE TABLE repair (
    repair_id SERIAL PRIMARY KEY,
    diagnosis_id INTEGER NOT NULL UNIQUE,
    used_parts TEXT,
    used_materials TEXT,
    services_rendered TEXT NOT NULL,
    is_warranty BOOLEAN DEFAULT FALSE,
    warranty_end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis(diagnosis_id) ON DELETE CASCADE
);

-- Товары на складе
CREATE TABLE warehouse_items (
    item_id SERIAL PRIMARY KEY,
    item_name VARCHAR(200) NOT NULL,
    item_code VARCHAR(50) UNIQUE,
    unit VARCHAR(20) DEFAULT 'шт',
    min_quantity INTEGER DEFAULT 5,
    max_quantity INTEGER DEFAULT 1000,
    current_quantity INTEGER NOT NULL DEFAULT 0,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    supplier_inn VARCHAR(12),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_inn) REFERENCES supplier(inn) ON DELETE SET NULL
);

-- Движения товаров
CREATE TABLE warehouse_movements (
    movement_id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('поступление', 'выбытие')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10,2) NOT NULL,
    supplier_inn VARCHAR(12),
    request_id INTEGER,
    contract_id INTEGER,
    diagnosis_id INTEGER,
    document_number VARCHAR(100),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (item_id) REFERENCES warehouse_items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_inn) REFERENCES supplier(inn) ON DELETE SET NULL,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES contract(contract_id) ON DELETE SET NULL,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis(diagnosis_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES registration(client_id) ON DELETE SET NULL
);

-- Связь диагностики с запчастями
CREATE TABLE diagnosis_parts (
    diagnosis_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (diagnosis_id, item_id),
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis(diagnosis_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES warehouse_items(item_id) ON DELETE CASCADE
);

-- Связь ремонта с запчастями
CREATE TABLE repair_parts (
    repair_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (repair_id, item_id),
    FOREIGN KEY (repair_id) REFERENCES repair(repair_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES warehouse_items(item_id) ON DELETE CASCADE
);

-- Чеки
CREATE TABLE receipts (
    receipt_id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL,
    diagnosis_id INTEGER,
    repair_id INTEGER,
    master_id INTEGER,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    paid BOOLEAN DEFAULT FALSE,
    payment_date TIMESTAMP,
    receipt_number VARCHAR(100) UNIQUE,
    is_warranty BOOLEAN DEFAULT FALSE,
    warranty_end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE CASCADE,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis(diagnosis_id) ON DELETE SET NULL,
    FOREIGN KEY (repair_id) REFERENCES repair(repair_id) ON DELETE SET NULL,
    FOREIGN KEY (master_id) REFERENCES registration(client_id) ON DELETE SET NULL
);

-- Бухгалтерский учет
CREATE TABLE accounting (
    accounting_id SERIAL PRIMARY KEY,
    inn VARCHAR(12),
    contract_id INTEGER,
    request_id INTEGER,
    warehouse_id INTEGER,
    contract_amount NUMERIC(10,2) NOT NULL CHECK (contract_amount >= 0),
    payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('Оплачен', 'Не оплачен', 'Частично оплачен')),
    request_status VARCHAR(50) NOT NULL,
    movement VARCHAR(50) NOT NULL CHECK (movement IN ('поступление', 'выбытие')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inn) REFERENCES supplier(inn) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES contract(contract_id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouse_items(item_id) ON DELETE CASCADE
);

-- Отзывы
CREATE TABLE reviews (
    review_id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    master_id INTEGER,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES registration(client_id) ON DELETE CASCADE,
    FOREIGN KEY (master_id) REFERENCES registration(client_id) ON DELETE SET NULL,
    UNIQUE(request_id, client_id)
);

-- Уведомления
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('repair_completed', 'diagnosis_completed', 'repair_approved', 'repair_rejected', 'payment_received', 'warranty_expiring', 'general')),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    request_id INTEGER,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES registration(client_id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE CASCADE
);

-- ============================================
-- 4. ИНДЕКСЫ
-- ============================================

CREATE INDEX idx_registration_email ON registration(email);
CREATE INDEX idx_registration_phone ON registration(phone);
CREATE INDEX idx_registration_role ON registration(role);
CREATE INDEX idx_request_client_id ON request(client_id);
CREATE INDEX idx_request_master_id ON request(master_id);
CREATE INDEX idx_request_status ON request(status);
CREATE INDEX idx_diagnosis_request ON diagnosis(request_id);
CREATE INDEX idx_contract_inn ON contract(inn);
CREATE INDEX idx_contract_status ON contract(status);
CREATE INDEX idx_receipts_request ON receipts(request_id);
CREATE INDEX idx_receipts_paid ON receipts(paid);
CREATE INDEX idx_warehouse_items_supplier ON warehouse_items(supplier_inn);
CREATE INDEX idx_warehouse_items_code ON warehouse_items(item_code);
CREATE INDEX idx_warehouse_movements_item ON warehouse_movements(item_id);
CREATE INDEX idx_warehouse_movements_date ON warehouse_movements(created_at);
CREATE INDEX idx_accounting_inn ON accounting(inn);
CREATE INDEX idx_accounting_contract ON accounting(contract_id);
CREATE INDEX idx_accounting_request ON accounting(request_id);
CREATE INDEX idx_accounting_payment_status ON accounting(payment_status);
CREATE INDEX idx_request_is_warranty ON request(is_warranty);
CREATE INDEX idx_request_original ON request(original_request_id);
CREATE INDEX idx_reviews_request ON reviews(request_id);
CREATE INDEX idx_reviews_client ON reviews(client_id);
CREATE INDEX idx_reviews_master ON reviews(master_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================
-- 5. ТРИГГЕРЫ
-- ============================================

CREATE TRIGGER update_contract_updated_at 
    BEFORE UPDATE ON contract 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_registration_updated_at 
    BEFORE UPDATE ON registration 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_warehouse_items_updated_at 
    BEFORE UPDATE ON warehouse_items 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quantity_on_movement
    AFTER INSERT ON warehouse_movements
    FOR EACH ROW
    WHEN (NEW.document_number IS DISTINCT FROM 'INITIAL_STOCK')
    EXECUTE FUNCTION update_item_quantity_on_movement();

CREATE TRIGGER check_warehouse_limit_on_movement
    BEFORE INSERT ON warehouse_movements
    FOR EACH ROW
    EXECUTE FUNCTION check_warehouse_limit();

CREATE TRIGGER update_request_updated_at 
    BEFORE UPDATE ON request 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at 
    BEFORE UPDATE ON reviews 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Функция для автоматического расчета warranty_end_date при оплате чека
CREATE OR REPLACE FUNCTION set_warranty_end_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.paid = true AND (OLD.paid = false OR OLD.paid IS NULL) THEN
        NEW.warranty_end_date = (COALESCE(NEW.payment_date, CURRENT_TIMESTAMP) + INTERVAL '30 days')::DATE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_warranty_end_date
    BEFORE UPDATE ON receipts
    FOR EACH ROW
    EXECUTE FUNCTION set_warranty_end_date();

-- Функция для создания уведомления при завершении ремонта
CREATE OR REPLACE FUNCTION notify_repair_completed()
RETURNS TRIGGER AS $$
DECLARE
    client_id_var INTEGER;
    device_info TEXT;
BEGIN
    SELECT r.client_id, r.device_type || ' ' || r.brand || ' ' || r.model
    INTO client_id_var, device_info
    FROM request r
    WHERE r.request_id = NEW.request_id;
    
    INSERT INTO notifications (user_id, type, title, message, request_id)
    VALUES (
        client_id_var,
        'repair_completed',
        'Ремонт завершен!',
        'Ваш ' || device_info || ' отремонтирован и готов к выдаче. Заявка №' || NEW.request_id,
        NEW.request_id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_repair_completed
    AFTER UPDATE ON request
    FOR EACH ROW
    WHEN (OLD.status != 'Завершен' AND NEW.status = 'Завершен')
    EXECUTE FUNCTION notify_repair_completed();

-- Функция для создания уведомления при завершении диагностики
CREATE OR REPLACE FUNCTION notify_diagnosis_completed()
RETURNS TRIGGER AS $$
DECLARE
    client_id_var INTEGER;
    device_info TEXT;
BEGIN
    SELECT r.client_id, r.device_type || ' ' || r.brand || ' ' || r.model
    INTO client_id_var, device_info
    FROM request r
    WHERE r.request_id = NEW.request_id;
    
    INSERT INTO notifications (user_id, type, title, message, request_id)
    VALUES (
        client_id_var,
        'diagnosis_completed',
        'Диагностика завершена',
        'Диагностика вашего устройства ' || device_info || ' завершена. Ожидайте подтверждения ремонта. Заявка №' || NEW.request_id,
        NEW.request_id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_diagnosis_completed
    AFTER INSERT ON diagnosis
    FOR EACH ROW
    EXECUTE FUNCTION notify_diagnosis_completed();

-- ============================================
-- 6. ТЕСТОВЫЕ ДАННЫЕ
-- ============================================

-- Поставщики
INSERT INTO supplier (inn, contract_status, supplier_name, delivery_date) VALUES
('7701234567', 1, 'ООО "ТехноПоставка"', '2026-04-15'),
('7707654321', 1, 'АО "Запчасти Сервис"', '2026-04-20'),
('7712345678', 1, 'ИП Петров А.В.', '2026-04-10'),
('7723456789', 1, 'ООО "ЭлектроТех"', '2026-04-25'),
('7734567890', 0, 'АО "БытТехника"', '2026-05-01'),
('7745678901', 1, 'ООО "Климат-Сервис"', '2026-04-18'),
('7756789012', 1, 'ИП Сидоров В.В.', '2026-04-22'),
('7767890123', 0, 'ООО "Деталь-Снаб"', '2026-04-30');

-- Информация о поставщиках
INSERT INTO supplier_info (inn, director_name, chief_accountant_name, payment_details) VALUES
('7701234567', 'Иванов Иван Иванович', 'Петрова Анна Сергеевна', 'Банк: Сбербанк, БИК: 044525225, Р/с: 40702810123450000001'),
('7707654321', 'Смирнов Павел Андреевич', 'Козлова Елена Владимировна', 'Банк: ВТБ, БИК: 044525411, Р/с: 40702810765430000002'),
('7712345678', 'Петров Александр Владимирович', 'Петрова Мария Сергеевна', 'Банк: Тинькофф, БИК: 044525974, Р/с: 40802810678900000003'),
('7723456789', 'Козлов Дмитрий Иванович', 'Соколова Ирина Петровна', 'Банк: Альфа-Банк, БИК: 044525593, Р/с: 40702810456780000004'),
('7734567890', 'Морозов Алексей Петрович', 'Волкова Татьяна Николаевна', 'Банк: Райффайзен, БИК: 044525700, Р/с: 40702810345670000005'),
('7745678901', 'Васильев Андрей Сергеевич', 'Михайлова Ольга Александровна', 'Банк: Газпромбанк, БИК: 044525823, Р/с: 40702810234560000006'),
('7756789012', 'Сидоров Владимир Петрович', 'Сидорова Елена Владимировна', 'Банк: Россельхозбанк, БИК: 044525921, Р/с: 40802810456780000007'),
('7767890123', 'Федоров Николай Иванович', 'Андреева Светлана Юрьевна', 'Банк: МКБ, БИК: 044525964, Р/с: 40702810567890000008');

-- Настройки склада
INSERT INTO warehouse_settings (max_total_quantity) VALUES (10000);

-- Товары (номенклатура)
INSERT INTO products (product_name, product_code, description, unit) VALUES
('Стиральная машина', 'WM001', 'Бытовая техника для стирки белья', 'шт'),
('Холодильник', 'FR002', 'Бытовая техника для хранения продуктов', 'шт'),
('Посудомоечная машина', 'DW003', 'Бытовая техника для мытья посуды', 'шт'),
('Электроплита', 'ST004', 'Кухонная электрическая плита', 'шт'),
('Телевизор', 'TV005', 'ЖК телевизор', 'шт'),
('Кондиционер', 'AC006', 'Сплит-система', 'шт'),
('Микроволновая печь', 'MW007', 'Микроволновка', 'шт'),
('Пылесос', 'VC008', 'Бытовая техника для уборки', 'шт'),
('Двигатель для стиральной машины', 'P001', 'Запчасть для стиральной машины', 'шт'),
('Насос для посудомоечной машины', 'P002', 'Запчасть для посудомоечной машины', 'шт'),
('Плата управления', 'PCB001', 'Электронная плата для бытовой техники', 'шт'),
('ТЭН для стиральной машины', 'H001', 'Нагревательный элемент', 'шт');

-- Договоры
INSERT INTO contract (inn, amount, delivery_volume, contract_terms, product_id, status) VALUES
('7701234567', 450000, 15, 'Оплата в течение 30 дней после поставки', 1, 'active'),
('7707654321', 380000, 12, 'Предоплата 50%, остаток после поставки', 2, 'active'),
('7712345678', 120000, 8, 'Постоплата в течение 15 дней', 3, 'active'),
('7723456789', 520000, 20, 'Оплата по факту поставки', 4, 'active'),
('7745678901', 280000, 10, 'Оплата в течение 45 дней', 6, 'active'),
('7756789012', 95000, 25, 'Предоплата 30%', 5, 'pending'),
('7701234567', 150000, 30, 'Оплата по факту поставки', 9, 'active'),
('7707654321', 89000, 15, 'Постоплата 30 дней', 10, 'active'),
('7712345678', 210000, 40, 'Предоплата 100%', 11, 'expired');

-- История договоров
INSERT INTO contract_history (contract_id, action_type, description, amount, document_number) VALUES
(1, 'creation', 'Договор создан', 450000, 'ДОГ-001'),
(1, 'payment', 'Оплачен аванс', 225000, 'ПЛ-001'),
(2, 'creation', 'Договор создан', 380000, 'ДОГ-002'),
(3, 'creation', 'Договор создан', 120000, 'ДОГ-003'),
(4, 'creation', 'Договор создан', 520000, 'ДОГ-004'),
(1, 'delivery', 'Поставка выполнена', NULL, 'Н-001');

-- Пользователи (пароль: 123456 для всех)
INSERT INTO registration (first_name, last_name, email, phone, address, password_hash, role) VALUES
('Админ', 'Админов', 'admin@mservice.ru', '+7(900)111-11-11', 'г. Сыктывкар, ул. Административная, 1', '$2b$10$vD7AihCjmTj5WZyzPKZmCOfQbCwAgtx.RzOmPK86mkdKZ6ef80HjW', 'admin'),
('Иван', 'Петров', 'ivan.petrov@mservice.ru', '+7(912)123-45-67', 'г. Сыктывкар, ул. Советская, 10', '$2b$10$vD7AihCjmTj5WZyzPKZmCOfQbCwAgtx.RzOmPK86mkdKZ6ef80HjW', 'master'),
('Алексей', 'Смирнов', 'alexey.smirnov@mservice.ru', '+7(912)234-56-78', 'г. Сыктывкар, ул. Коммунистическая, 25', '$2b$10$vD7AihCjmTj5WZyzPKZmCOfQbCwAgtx.RzOmPK86mkdKZ6ef80HjW', 'master'),
('Дмитрий', 'Волков', 'dmitry.volkov@mservice.ru', '+7(912)345-67-89', 'г. Сыктывкар, ул. Октябрьская, 5', '$2b$10$vD7AihCjmTj5WZyzPKZmCOfQbCwAgtx.RzOmPK86mkdKZ6ef80HjW', 'master'),
('Клиент', 'Иванов', 'client@mail.ru', '+7(999)123-45-67', 'г. Сыктывкар, ул. Ленина, 1', '$2b$10$vD7AihCjmTj5WZyzPKZmCOfQbCwAgtx.RzOmPK86mkdKZ6ef80HjW', 'client'),
('Клиент', 'Петров', 'client2@mail.ru', '+7(999)234-56-78', 'г. Сыктывкар, ул. Мира, 15', '$2b$10$vD7AihCjmTj5WZyzPKZmCOfQbCwAgtx.RzOmPK86mkdKZ6ef80HjW', 'client');

-- Заявки
INSERT INTO request (client_id, master_id, status, proposed_time, problem_description, model, brand, device_type) VALUES
(5, 2, 'Завершен', '2026-03-20 10:00:00', 'Не включается, нет индикации', 'WW90T', 'Samsung', 'Стиральная машина'),
(5, 3, 'Диагностика проведена', '2026-03-21 14:00:00', 'Не сливает воду, ошибка на дисплее', 'GA-B459', 'LG', 'Холодильник'),
(6, 4, 'Принят', '2026-03-22 09:00:00', 'Не греет, вода холодная', 'SMS46', 'Bosch', 'Посудомоечная машина'),
(6, 2, 'Ожидает подтверждения', '2026-03-23 15:00:00', 'Не охлаждает, компрессор работает', 'MSZ-AP', 'Mitsubishi', 'Кондиционер'),
(5, NULL, 'Принят', '2026-03-24 11:00:00', 'Нет изображения, звук есть', 'KD-55XH', 'Sony', 'Телевизор'),
(6, 3, 'Ремонт одобрен', '2026-03-25 13:00:00', 'Сильно шумит при работе', 'XPS 15', 'Dell', 'Ноутбук');

-- Диагностики
INSERT INTO diagnosis (request_id, master_id, cost, fault_description, diagnosis_report, required_parts, estimated_repair_cost, completed) VALUES
(1, 2, 500, 'Сгорел блок питания', 'При диагностике выявлено: неисправен блок питания, требуется замена', 'Блок питания', 4500, true),
(2, 3, 600, 'Засор сливного патрубка', 'Сливной патрубок забит, требуется чистка', NULL, 1500, true),
(4, 2, 800, 'Утечка фреона', 'Обнаружена микротрещина в трубке, требуется заправка фреона', 'Фреон R410a', 5500, true),
(6, 3, 400, 'Износ подшипника вентилятора', 'Подшипник вентилятора изношен, требуется замена', 'Подшипник вентилятора', 2000, true);

-- Ремонты
INSERT INTO repair (diagnosis_id, used_parts, used_materials, services_rendered) VALUES
(1, 'Блок питания', 'Термопаста', 'Замена блока питания, проверка работоспособности'),
(2, NULL, 'Специальный ершик', 'Чистка сливного патрубка, тестирование'),
(4, 'Подшипник вентилятора', 'Смазка', 'Замена подшипника, сборка, тестирование');

-- Товары на складе
INSERT INTO warehouse_items (item_name, item_code, unit, min_quantity, current_quantity, price, supplier_inn, description) VALUES
('Двигатель для стиральной машины', 'MOT-WM-001', 'шт', 5, 15, 3500, '7701234567', 'Универсальный двигатель для стиральных машин'),
('Насос для посудомоечной машины', 'PMP-DW-001', 'шт', 5, 8, 2800, '7707654321', 'Циркуляционный насос'),
('Плата управления для холодильника', 'PCB-FR-001', 'шт', 3, 5, 4500, '7712345678', 'Модуль управления холодильником'),
('Ремень для стиральной машины', 'BELT-WM-001', 'шт', 10, 25, 450, '7701234567', 'Приводной ремень'),
('ТЭН для электроплиты', 'HEAT-ST-001', 'шт', 5, 12, 1200, '7707654321', 'Нагревательный элемент'),
('Компрессор для холодильника', 'COMP-FR-001', 'шт', 2, 3, 8500, '7712345678', 'Компрессор'),
('Дисплей для стиральной машины', 'DISP-WM-001', 'шт', 3, 4, 3200, '7701234567', 'LED дисплей'),
('Модуль питания', 'PSU-001', 'шт', 5, 10, 2100, '7712345678', 'Блок питания универсальный'),
('Вентилятор охлаждения', 'FAN-001', 'шт', 5, 18, 850, '7701234567', 'Вентилятор для холодильников'),
('Блок питания для телевизора', 'PSU-TV-001', 'шт', 3, 7, 2800, '7723456789', 'Блок питания для ЖК телевизоров'),
('Материнская плата для ноутбука', 'MB-LAP-001', 'шт', 2, 4, 12500, '7745678901', 'Системная плата'),
('Клапан сливной', 'VALVE-001', 'шт', 5, 22, 650, '7707654321', 'Сливной клапан'),
('Термостат', 'TSTAT-001', 'шт', 5, 15, 950, '7712345678', 'Терморегулятор'),
('Фреон R410a', 'FR-410A', 'кг', 3, 25, 350, '7745678901', 'Хладагент для кондиционеров');

-- Движения товаров (поступления)
INSERT INTO warehouse_movements (item_id, movement_type, quantity, price, supplier_inn, comment) VALUES
(1, 'поступление', 10, 3500, '7701234567', 'Основная поставка'),
(2, 'поступление', 8, 2800, '7707654321', 'Поставка насосов'),
(3, 'поступление', 5, 4500, '7712345678', 'Платы управления'),
(4, 'поступление', 20, 450, '7701234567', 'Ремни приводные'),
(5, 'поступление', 12, 1200, '7707654321', 'ТЭНы'),
(6, 'поступление', 3, 8500, '7712345678', 'Компрессоры'),
(7, 'поступление', 5, 3200, '7701234567', 'Дисплеи'),
(8, 'поступление', 10, 2100, '7712345678', 'Модули питания'),
(9, 'поступление', 15, 850, '7701234567', 'Вентиляторы'),
(10, 'поступление', 5, 2800, '7723456789', 'Блоки питания для ТВ'),
(11, 'поступление', 3, 12500, '7745678901', 'Материнские платы'),
(12, 'поступление', 20, 650, '7707654321', 'Клапаны сливные'),
(13, 'поступление', 15, 950, '7712345678', 'Термостаты'),
(14, 'поступление', 20, 350, '7745678901', 'Фреон');

-- Движения товаров (выбытия - использовано в ремонтах)
INSERT INTO warehouse_movements (item_id, movement_type, quantity, price, request_id, comment) VALUES
(8, 'выбытие', 1, 2100, 1, 'Использовано в ремонте заявки #1'),
(12, 'выбытие', 1, 650, 2, 'Использовано в ремонте заявки #2'),
(9, 'выбытие', 1, 850, 6, 'Использовано в ремонте заявки #6');

-- Чеки
INSERT INTO receipts (request_id, diagnosis_id, repair_id, master_id, amount, paid, receipt_number) VALUES
(1, 1, 1, 2, 5000, true, 'RCP-20260320-001'),
(2, 2, 2, 3, 2100, false, 'RCP-20260321-002'),
(4, 3, NULL, 2, 6300, false, 'RCP-20260322-003'),
(6, 4, 3, 3, 2400, false, 'RCP-20260323-004');

-- Бухгалтерский учет (примеры записей)
INSERT INTO accounting (inn, contract_id, request_id, warehouse_id, contract_amount, payment_status, request_status, movement) VALUES
('7701234567', 1, NULL, 1, 35000, 'Частично оплачен', 'Поставка выполнена', 'поступление'),
('7707654321', 2, NULL, 2, 22400, 'Не оплачен', 'Ожидает оплаты', 'поступление'),
('7712345678', 3, NULL, 3, 22500, 'Оплачен', 'Поставка выполнена', 'поступление'),
(NULL, NULL, 1, 8, 2100, 'Оплачен', 'Завершен', 'выбытие'),
(NULL, NULL, 2, 12, 650, 'Не оплачен', 'Диагностика проведена', 'выбытие'),
(NULL, NULL, 6, 9, 850, 'Не оплачен', 'Ремонт одобрен', 'выбытие');

-- ============================================
-- 7. НАСТРОЙКА ПОСЛЕДОВАТЕЛЬНОСТЕЙ
-- ============================================

SELECT setval('warehouse_items_item_id_seq', (SELECT MAX(item_id) FROM warehouse_items));
SELECT setval('warehouse_movements_movement_id_seq', (SELECT MAX(movement_id) FROM warehouse_movements));
SELECT setval('contract_contract_id_seq', (SELECT MAX(contract_id) FROM contract));
SELECT setval('products_product_id_seq', (SELECT MAX(product_id) FROM products));
SELECT setval('registration_client_id_seq', (SELECT MAX(client_id) FROM registration));
SELECT setval('request_request_id_seq', (SELECT MAX(request_id) FROM request));
SELECT setval('diagnosis_diagnosis_id_seq', (SELECT MAX(diagnosis_id) FROM diagnosis));
SELECT setval('repair_repair_id_seq', (SELECT MAX(repair_id) FROM repair));
SELECT setval('receipts_receipt_id_seq', (SELECT MAX(receipt_id) FROM receipts));
SELECT setval('accounting_accounting_id_seq', (SELECT MAX(accounting_id) FROM accounting));
SELECT setval('reviews_review_id_seq', (SELECT COALESCE(MAX(review_id), 1) FROM reviews));
SELECT setval('notifications_notification_id_seq', (SELECT COALESCE(MAX(notification_id), 1) FROM notifications));

-- ============================================
-- 8. ПРОВЕРКА СОЗДАНИЯ
-- ============================================

SELECT '✅ База данных успешно создана!' as message;
SELECT 'Таблицы:' as info;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
