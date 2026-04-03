# ИНСТРУКЦИЯ ПО ПРИМЕНЕНИЮ ИСПРАВЛЕНИЙ

## Что было исправлено:

1. **Таблица accounting**:
   - Добавлено поле `receipt_id` для связи с чеками
   - Добавлено поле `updated_at` для отслеживания изменений
   - Добавлено уникальное ограничение для предотвращения дублирования
   - Созданы индексы для быстрого поиска

2. **Триггеры**:
   - Автоматическое обновление `updated_at` при изменении записи
   - Автоматическое создание записи учета при оплате чека

3. **Представление v_accounting_full**:
   - Удобный просмотр всех данных учета с JOIN всех связанных таблиц

4. **Контроллеры**:
   - Убран `ON CONFLICT DO NOTHING` (вызывал ошибку 500)
   - Добавлена проверка существования записи перед вставкой
   - Правильная обработка обновления и создания записей

## Как применить исправления:

### Вариант 1: Через psql (рекомендуется)

```bash
cd server/database
psql -U postgres -d your_database_name -f accounting_fix.sql
```

### Вариант 2: Через pgAdmin
1. Откройте pgAdmin
2. Подключитесь к вашей базе данных
3. Откройте Query Tool
4. Скопируйте содержимое файла accounting_fix.sql
5. Выполните запрос

### Вариант 3: Через Node.js

```bash
cd server
node -e "const fs = require('fs'); const db = require('./config/database'); const sql = fs.readFileSync('./database/accounting_fix.sql', 'utf8'); db.query(sql).then(() => console.log('Done')).catch(e => console.error(e));"
```

## После применения:

1. Перезапустите сервер:
   ```bash
   cd server
   node server.js
   ```

2. Откройте страницу бухгалтерии:
   ```
   http://localhost:3000/html/accounting.html
   ```

3. Проверьте:
   - Графики отображаются корректно
   - Чеки можно оплачивать без ошибок 500
   - Записи автоматически создаются в таблице учета

## Что теперь работает:

✅ Автоматическое создание записей учета при заключении договора
✅ Автоматическое создание записей учета при оплате чека
✅ Графики заполняются данными
✅ Нет дублирования записей
✅ Нет ошибок 500 при оплате чеков

## Структура улучшенной таблицы accounting:

- accounting_id (PK)
- inn (FK -> supplier)
- contract_id (FK -> contract)
- request_id (FK -> request)
- receipt_id (FK -> receipts) ← НОВОЕ
- warehouse_id (FK -> warehouse_items)
- contract_amount
- payment_status
- request_status
- movement
- created_at
- updated_at ← НОВОЕ

## Уникальное ограничение:

UNIQUE(receipt_id, request_id, contract_id)

Это предотвращает создание дубликатов для одного и того же чека/заявки/договора.
