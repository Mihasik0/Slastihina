const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'test2',
    user: 'postgres',
    password: '2281'
});

async function applyUpdate() {
    const client = await pool.connect();
    try {
        console.log('🔄 Применение обновлений для гарантийной системы...');
        
        await client.query('BEGIN');
        
        // 1. Добавляем поля в request
        console.log('1. Добавление полей в таблицу request...');
        await client.query('ALTER TABLE request ADD COLUMN IF NOT EXISTS original_request_id INTEGER');
        await client.query('ALTER TABLE request ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        
        // 2. Добавляем внешний ключ
        console.log('2. Добавление внешнего ключа...');
        const fkCheck = await client.query(`
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_original_request'
        `);
        if (fkCheck.rows.length === 0) {
            await client.query(`
                ALTER TABLE request ADD CONSTRAINT fk_original_request 
                FOREIGN KEY (original_request_id) REFERENCES request(request_id) ON DELETE SET NULL
            `);
        }
        
        // 3. Добавляем индексы
        console.log('3. Добавление индексов...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_request_is_warranty ON request(is_warranty)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_request_original ON request(original_request_id)');
        
        // 4. Создаем триггер для updated_at
        console.log('4. Создание триггера для updated_at...');
        await client.query('DROP TRIGGER IF EXISTS update_request_updated_at ON request');
        await client.query(`
            CREATE TRIGGER update_request_updated_at 
            BEFORE UPDATE ON request 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column()
        `);
        
        // 5. Добавляем поле warranty_end_date в receipts
        console.log('5. Добавление поля warranty_end_date в таблицу receipts...');
        await client.query('ALTER TABLE receipts ADD COLUMN IF NOT EXISTS warranty_end_date DATE');
        
        // 6. Обновляем существующие чеки
        console.log('6. Обновление существующих чеков...');
        const updateResult = await client.query(`
            UPDATE receipts 
            SET warranty_end_date = (payment_date + INTERVAL '30 days')::DATE
            WHERE paid = true AND warranty_end_date IS NULL
        `);
        console.log(`   Обновлено чеков: ${updateResult.rowCount}`);
        
        // 7. Создаем функцию для автоматического расчета warranty_end_date
        console.log('7. Создание функции set_warranty_end_date...');
        await client.query(`
            CREATE OR REPLACE FUNCTION set_warranty_end_date()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.paid = true AND (OLD.paid = false OR OLD.paid IS NULL) THEN
                    NEW.warranty_end_date = (COALESCE(NEW.payment_date, CURRENT_TIMESTAMP) + INTERVAL '30 days')::DATE;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        
        // 8. Создаем триггер
        console.log('8. Создание триггера для автоматического расчета warranty_end_date...');
        await client.query('DROP TRIGGER IF EXISTS trigger_set_warranty_end_date ON receipts');
        await client.query(`
            CREATE TRIGGER trigger_set_warranty_end_date
            BEFORE UPDATE ON receipts
            FOR EACH ROW
            EXECUTE FUNCTION set_warranty_end_date()
        `);
        
        await client.query('COMMIT');
        
        console.log('✅ Обновления успешно применены!');
        process.exit(0);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка применения обновлений:', error);
        process.exit(1);
    } finally {
        client.release();
    }
}

applyUpdate();
