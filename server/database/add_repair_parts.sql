-- Добавление тестовых данных в repair_parts

-- Сначала проверим, есть ли ремонты
SELECT repair_id, diagnosis_id FROM repair LIMIT 5;

-- Добавляем использованные запчасти для существующих ремонтов
INSERT INTO repair_parts (repair_id, item_id, quantity, price)
SELECT 
    r.repair_id,
    wi.item_id,
    FLOOR(RANDOM() * 3 + 1)::INTEGER as quantity,
    wi.price
FROM repair r
CROSS JOIN LATERAL (
    SELECT item_id, price 
    FROM warehouse_items 
    WHERE current_quantity > 0
    ORDER BY RANDOM()
    LIMIT 2
) wi
WHERE NOT EXISTS (
    SELECT 1 FROM repair_parts rp 
    WHERE rp.repair_id = r.repair_id AND rp.item_id = wi.item_id
)
LIMIT 20;

-- Проверяем результат
SELECT 
    r.repair_id,
    wi.item_name,
    rp.quantity,
    rp.price
FROM repair_parts rp
JOIN repair r ON rp.repair_id = r.repair_id
JOIN warehouse_items wi ON rp.item_id = wi.item_id
LIMIT 10;

SELECT COUNT(*) as total_repair_parts FROM repair_parts;
