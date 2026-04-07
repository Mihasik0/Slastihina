const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function applyUpdate() {
    try {
        console.log('🔄 Применение обновлений для гарантийной системы...');
        
        // Читаем SQL скрипт
        const sqlPath = path.join(__dirname, 'update_warranty.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Выполняем SQL
        await db.query(sql);
        
        console.log('✅ Обновления успешно применены!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка применения обновлений:', error);
        process.exit(1);
    }
}

applyUpdate();
