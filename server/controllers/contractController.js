const Contract = require('../models/Contract');
const db = require('../config/database');

// Получение всех договоров (с пагинацией)
exports.getAllContracts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const contracts = await Contract.findAll(limit, offset);
        const total = await Contract.count();

        res.json({
            success: true,
            data: contracts,
            pagination: { total, limit, offset, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Ошибка получения договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение договоров конкретного поставщика
exports.getContractsBySupplier = async (req, res) => {
    try {
        const contracts = await Contract.findByInn(req.params.inn);
        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Ошибка получения договоров поставщика:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение договора по ID
exports.getContract = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        res.json({ success: true, data: contract });
    } catch (error) {
        console.error('Ошибка получения договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение количества договоров
exports.getContractsCount = async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) FROM contract');
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Ошибка получения количества договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Создание договора
exports.createContract = async (req, res) => {
    try {
        const contract = await Contract.create(req.body);
        
        // Добавляем запись в историю о создании
        try {
            await Contract.addHistoryEntry(contract.contract_id, {
                action_type: 'creation',
                description: `Договор создан на сумму ${contract.amount} ₽`,
                amount: contract.amount,
                document_number: `ДОГ-${contract.contract_id}`,
                created_by: req.user.id
            });
        } catch (historyError) {
            console.error('Ошибка добавления записи в историю:', historyError);
        }
        
        res.status(201).json({ success: true, data: contract });
    } catch (error) {
        console.error('Ошибка создания договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление договора
exports.updateContract = async (req, res) => {
    try {
        const contract = await Contract.update(req.params.id, req.body);
        
        // Добавляем запись в историю об изменении
        try {
            await Contract.addHistoryEntry(req.params.id, {
                action_type: 'amendment',
                description: `Договор обновлен`,
                amount: contract.amount,
                created_by: req.user.id
            });
        } catch (historyError) {
            console.error('Ошибка добавления записи в историю:', historyError);
        }
        
        res.json({ success: true, data: contract });
    } catch (error) {
        console.error('Ошибка обновления договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Удаление договора
exports.deleteContract = async (req, res) => {
    try {
        const result = await Contract.delete(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        res.json({ success: true, message: 'Договор удалён' });
    } catch (error) {
        console.error('Ошибка удаления договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ========== НОВЫЕ МЕТОДЫ ==========

// Получение истории договора
exports.getContractHistory = async (req, res) => {
    try {
        // Проверяем существование договора
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        
        // Получаем историю
        const history = await Contract.getHistory(req.params.id);
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Ошибка получения истории договора:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Добавление записи в историю
exports.addHistoryEntry = async (req, res) => {
    try {
        // Проверяем существование договора
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Договор не найден' });
        }
        
        const entryData = {
            ...req.body,
            created_by: req.user ? req.user.id : null
        };
        
        // Проверяем обязательные поля
        if (!entryData.action_type || !entryData.description) {
            return res.status(400).json({ 
                success: false, 
                message: 'Не указаны тип действия или описание' 
            });
        }
        
        const entry = await Contract.addHistoryEntry(req.params.id, entryData);
        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        console.error('Ошибка добавления записи в историю:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Поиск договоров
exports.searchContracts = async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const contracts = await Contract.search(searchTerm, limit, offset);
        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Ошибка поиска договоров:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение статистики
exports.getStats = async (req, res) => {
    try {
        const stats = await Contract.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Получение договоров по продукту
exports.getContractsByProduct = async (req, res) => {
    try {
        const contracts = await Contract.findByProduct(req.params.productId);
        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Ошибка получения договоров по продукту:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Обновление статуса договора
exports.updateContractStatus = async (req, res) => {
    try {
        console.log('📥 Обновление статуса договора ID:', req.params.id);
        console.log('📦 Новый статус:', req.body.status);
        
        const contractId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Статус не указан'
            });
        }
        
        // Проверяем допустимость статуса
        const validStatuses = ['active', 'pending', 'expired', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Недопустимый статус. Допустимые значения: active, pending, expired, completed'
            });
        }
        
        const updatedContract = await Contract.updateStatus(contractId, status);
        
        if (!updatedContract) {
            return res.status(404).json({
                success: false,
                message: 'Договор не найден'
            });
        }
        
        console.log('✅ Статус обновлен:', updatedContract);
        
        res.json({
            success: true,
            message: 'Статус успешно обновлен',
            data: updatedContract
        });
    } catch (error) {
        console.error('❌ Ошибка обновления статуса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при обновлении статуса: ' + error.message
        });
    }
};

// Получение списка возможных статусов
exports.getStatusList = (req, res) => {
    const statuses = Contract.getValidStatuses();
    res.json({
        success: true,
        data: statuses
    });
};