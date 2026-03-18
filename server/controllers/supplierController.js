const Supplier = require('../models/Supplier');
// В начале файла добавить импорт db, если ещё нет
const db = require('../config/database');

exports.getUpcomingWeekCount = async (req, res) => {
    try {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = вс, 1 = пн, ..., 6 = сб

        // Вычисляем понедельник текущей недели
        // Если сегодня воскресенье (0), то понедельник был 6 дней назад
        const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - startOffset);
        startDate.setHours(0, 0, 0, 0);

        // Воскресенье = понедельник + 6 дней
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);

        const query = `
            SELECT COUNT(*) FROM supplier
            WHERE delivery_date BETWEEN $1 AND $2
        `;
        const result = await db.query(query, [startDate, endDate]);
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Ошибка получения количества поставок на неделе:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение списка поставщиков с пагинацией и фильтрацией
exports.getSuppliers = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search || '';
        const status = req.query.status;

        let suppliers, total;

        if (search) {
            suppliers = await Supplier.search(search, limit, offset);
            // Для пагинации нужно также получить общее количество с учётом поиска
            total = await Supplier.countBySearch(search); // реализовать отдельно
        } else if (status && status !== 'all') {
            const statusValue = status === 'active' ? 1 : 0;
            suppliers = await Supplier.filterByStatus(statusValue, limit, offset);
            total = await Supplier.countByStatus(statusValue);
        } else {
            suppliers = await Supplier.findAll(limit, offset);
            total = await Supplier.count();
        }

        res.json({ success: true, data: suppliers, pagination: { total, limit, offset } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение одного поставщика по ИНН
exports.getSupplier = async (req, res) => {
    try {
        const supplier = await Supplier.findByInn(req.params.inn);
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Поставщик не найден' });
        }
        res.json({ success: true, data: supplier });
    } catch (error) {
        console.error('Ошибка получения поставщика:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание поставщика
exports.createSupplier = async (req, res) => {
    try {
        const supplier = await Supplier.create(req.body);
        res.status(201).json({ success: true, data: supplier });
    } catch (error) {
        console.error('Ошибка создания поставщика:', error);
        // Проверка на дубликат ИНН
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'Поставщик с таким ИНН уже существует' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление поставщика
exports.updateSupplier = async (req, res) => {
    try {
        const supplier = await Supplier.update(req.params.inn, req.body);
        res.json({ success: true, data: supplier });
    } catch (error) {
        console.error('Ошибка обновления поставщика:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Удаление поставщика
exports.deleteSupplier = async (req, res) => {
    try {
        const result = await Supplier.delete(req.params.inn);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Поставщик не найден' });
        }
        res.json({ success: true, message: 'Поставщик удалён' });
    } catch (error) {
        console.error('Ошибка удаления поставщика:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};