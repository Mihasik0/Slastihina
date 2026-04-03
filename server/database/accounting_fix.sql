-- ============================================
-- ИСПРАВЛЕНИЯ ДЛЯ БУХГАЛТЕРСКОГО УЧЕТА
-- ============================================

-- 1. Удаляем старую таблицу accounting если есть проблемы
DROP TABLE IF EXISTS accounting CASCADE;

-- 2. Создаем улучшенную таблицу accounting
CREATE TABLE accounting (
    accounting_id SERIAL PRIMARY KEY,
    inn VARCHAR(12),
    contract_id INTEGER,
    request_id INTEGER,
    receipt_id INTEGER,
    warehouse_id INTEGER,
    contract_amount NUMERIC(10,2) NOT NULL CHECK (contract_amount >= 0),
    payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('Оплачен', 'Не оплачен', 'Частично оплачен')),
    request_status VARCHAR(50) NOT NULL,
    movement VARCHAR(50) NOT NULL CHECK (movement IN ('поступление', 'выбытие')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inn) REFERENCES supplier(inn) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES contract(contract_id) ON DELETE SET NULL,
    FOREIGN KEY (request_id) REFERENCES request(request_id) ON DELETE SET NULL,
    FOREIGN KEY (receipt_id) REFERENCES receipts(receipt_id) ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouse_items(item_id) ON DELETE SET NULL,
    -- Уникальное ограничение для предотвращения дублирования
    UNIQUE(receipt_id, request_id, contract_id)
);

-- 3. Создаем индексы для быстрого поиска
CREATE INDEX idx_accounting_inn ON accounting(inn);
CREATE INDEX idx_accounting_contract ON accounting(contract_id);
CREATE INDEX idx_accounting_request ON accounting(request_id);
CREATE INDEX idx_accounting_receipt ON accounting(receipt_id);
CREATE INDEX idx_accounting_payment_status ON accounting(payment_status);
CREATE INDEX idx_accounting_movement ON accounting(movement);
CREATE INDEX idx_accounting_created_at ON accounting(created_at);

-- 4. Создаем триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_accounting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_updated_at_trigger
    BEFORE UPDATE ON accounting
    FOR EACH ROW
    EXECUTE FUNCTION update_accounting_updated_at();

-- 5. Заполняем таблицу данными из существующих договоров
INSERT INTO accounting (inn, contract_id, warehouse_id, contract_amount, payment_status, request_status, movement)
SELECT 
    c.inn,
    c.contract_id,
    wm.item_id,
    c.amount,
    'Не оплачен',
    'Договор заключен',
    'поступление'
FROM contract c
LEFT JOIN warehouse_movements wm ON wm.contract_id = c.contract_id AND wm.movement_type = 'поступление'
WHERE NOT EXISTS (
    SELECT 1 FROM accounting a WHERE a.contract_id = c.contract_id
)
ORDER BY c.created_at;

-- 6. Заполняем таблицу данными из выбытий материалов (НЕ из чеков!)
-- Чеки отображаются отдельно, в учете только движения материалов
INSERT INTO accounting (request_id, warehouse_id, contract_amount, payment_status, request_status, movement)
SELECT 
    wm.request_id,
    wm.item_id,
    wm.quantity * wm.price,
    'Не оплачен',
    'Выбытие материалов',
    'выбытие'
FROM warehouse_movements wm
WHERE wm.movement_type = 'выбытие' 
    AND wm.request_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM accounting a 
        WHERE a.request_id = wm.request_id 
        AND a.warehouse_id = wm.item_id
        AND a.movement = 'выбытие'
    )
ORDER BY wm.created_at;

-- 7. Создаем представление для удобного просмотра (БЕЗ чеков)
CREATE OR REPLACE VIEW v_accounting_full AS
SELECT 
    a.accounting_id,
    a.inn,
    a.contract_id,
    a.request_id,
    a.warehouse_id,
    a.contract_amount,
    a.payment_status,
    a.request_status,
    a.movement,
    a.created_at,
    a.updated_at,
    s.supplier_name,
    c.contract_terms,
    c.delivery_volume,
    r.status as request_current_status,
    r.problem_description,
    wi.item_name as warehouse_item_name,
    reg.first_name || ' ' || reg.last_name as client_name
FROM accounting a
LEFT JOIN supplier s ON a.inn = s.inn
LEFT JOIN contract c ON a.contract_id = c.contract_id
LEFT JOIN request r ON a.request_id = r.request_id
LEFT JOIN warehouse_items wi ON a.warehouse_id = wi.item_id
LEFT JOIN registration reg ON r.client_id = reg.client_id
WHERE a.receipt_id IS NULL;

-- 8. УДАЛЯЕМ триггер для чеков - чеки НЕ должны попадать в accounting
DROP TRIGGER IF EXISTS receipt_accounting_trigger ON receipts;
DROP FUNCTION IF EXISTS create_accounting_for_receipt();

-- 9. Проверка и вывод статистики
SELECT 
    'Всего записей в accounting (БЕЗ чеков)' as info,
    COUNT(*) as count
FROM accounting
WHERE receipt_id IS NULL
UNION ALL
SELECT 
    'Записей по договорам (поступление)',
    COUNT(*)
FROM accounting
WHERE contract_id IS NOT NULL AND receipt_id IS NULL
UNION ALL
SELECT 
    'Записей по выбытию материалов',
    COUNT(*)
FROM accounting
WHERE movement = 'выбытие' AND receipt_id IS NULL
UNION ALL
SELECT 
    'Оплаченных записей',
    COUNT(*)
FROM accounting
WHERE payment_status = 'Оплачен' AND receipt_id IS NULL;

SELECT '✅ Таблица accounting успешно обновлена!' as message;
SELECT '📋 Чеки отображаются отдельно в своей таблице' as note;
SELECT '📦 В учете только договоры (поступление) и выбытие материалов' as note2;
