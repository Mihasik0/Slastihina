const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'test2',
    user: 'postgres',
    password: '2281'
});

async function applyReviewsNotifications() {
    const client = await pool.connect();
    try {
        console.log('🔄 Создание таблиц для отзывов и уведомлений...');
        
        await client.query('BEGIN');
        
        // 1. Создаем таблицу reviews
        console.log('1. Создание таблицы reviews...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS reviews (
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
            )
        `);
        
        // 2. Создаем таблицу notifications
        console.log('2. Создание таблицы notifications...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
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
            )
        `);
        
        // 3. Создаем индексы
        console.log('3. Создание индексов...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reviews_request ON reviews(request_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reviews_client ON reviews(client_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reviews_master ON reviews(master_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)');
        
        // 4. Создаем триггер для updated_at в reviews
        console.log('4. Создание триггера для reviews...');
        await client.query('DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews');
        await client.query(`
            CREATE TRIGGER update_reviews_updated_at 
            BEFORE UPDATE ON reviews 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column()
        `);
        
        // 5. Создаем функцию для уведомления о завершении ремонта
        console.log('5. Создание функции notify_repair_completed...');
        await client.query(`
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
            $$ LANGUAGE plpgsql
        `);
        
        // 6. Создаем триггер для уведомления о завершении ремонта
        console.log('6. Создание триггера для уведомления о завершении ремонта...');
        await client.query('DROP TRIGGER IF EXISTS trigger_notify_repair_completed ON request');
        await client.query(`
            CREATE TRIGGER trigger_notify_repair_completed
            AFTER UPDATE ON request
            FOR EACH ROW
            WHEN (OLD.status != 'Завершен' AND NEW.status = 'Завершен')
            EXECUTE FUNCTION notify_repair_completed()
        `);
        
        // 7. Создаем функцию для уведомления о завершении диагностики
        console.log('7. Создание функции notify_diagnosis_completed...');
        await client.query(`
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
            $$ LANGUAGE plpgsql
        `);
        
        // 8. Создаем триггер для уведомления о завершении диагностики
        console.log('8. Создание триггера для уведомления о завершении диагностики...');
        await client.query('DROP TRIGGER IF EXISTS trigger_notify_diagnosis_completed ON diagnosis');
        await client.query(`
            CREATE TRIGGER trigger_notify_diagnosis_completed
            AFTER INSERT ON diagnosis
            FOR EACH ROW
            EXECUTE FUNCTION notify_diagnosis_completed()
        `);
        
        await client.query('COMMIT');
        
        console.log('✅ Таблицы для отзывов и уведомлений успешно созданы!');
        process.exit(0);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка создания таблиц:', error);
        process.exit(1);
    } finally {
        client.release();
    }
}

applyReviewsNotifications();
