const Request = require('../models/Request');
const { validationResult } = require('express-validator');

// Создание заявки
exports.createRequest = async (req, res) => {
    try {
        console.log('📥 Создание заявки, пользователь:', req.user.id);
        console.log('📦 Данные:', req.body);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { device_type, brand, model, proposed_time, problem_description } = req.body;
        const client_id = req.user.id;

        // Проверка обязательных полей
        if (!device_type || !brand || !model || !proposed_time || !problem_description) {
            return res.status(400).json({
                success: false,
                message: 'Все поля обязательны для заполнения'
            });
        }

        const requestData = {
            client_id,
            device_type,
            brand,
            model,
            proposed_time,
            problem_description,
            status: 'Принят'
        };

        const request = await Request.create(requestData);

        res.status(201).json({
            success: true,
            message: 'Заявка успешно создана',
            data: request
        });

    } catch (error) {
        console.error('❌ Ошибка создания заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при создании заявки'
        });
    }
};

// Получение заявок текущего пользователя
exports.getMyRequests = async (req, res) => {
    try {
        console.log('📥 Запрос заявок пользователя:', req.user.id);
        
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Пользователь не авторизован'
            });
        }
        
        const requests = await Request.findByClientId(req.user.id);
        
        console.log(`✅ Найдено заявок: ${requests.length}`);
        
        res.json({
            success: true,
            data: requests
        });

    } catch (error) {
        console.error('❌ Ошибка получения заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении заявок'
        });
    }
};

// Получение конкретной заявки
exports.getRequestById = async (req, res) => {
    try {
        console.log(`📥 Запрос заявки ID: ${req.params.id}`);
        
        const request = await Request.findById(req.params.id, req.user.id);
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }

        res.json({
            success: true,
            data: request
        });

    } catch (error) {
        console.error('❌ Ошибка получения заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении заявки'
        });
    }
};

// Получение статистики пользователя
exports.getUserStats = async (req, res) => {
    try {
        console.log('📥 Запрос статистики для пользователя:', req.user.id);
        
        const stats = await Request.getUserStats(req.user.id);
        
        console.log('✅ Статистика:', stats);
        
        res.json({
            success: true,
            data: stats || { total: 0, accepted: 0, rejected: 0, completed: 0, diagnosed: 0 }
        });

    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении статистики'
        });
    }
};

// ========== НОВЫЙ МЕТОД ДЛЯ АДМИНА ==========
// Получение всех заявок (только для админа)
exports.getAllRequests = async (req, res) => {
    try {
        console.log('📥 Запрос всех заявок от пользователя:', req.user.id);

        // !!! Потом сделать
        // Здесь можно добавить проверку на роль администратора
        // Например, если у вас есть поле role в таблице users
        /*
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен. Требуются права администратора.'
            });
        }
        */
        
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const requests = await Request.findAll(limit, offset);
        const total = await Request.getCount();
        
        console.log(`✅ Найдено заявок: ${requests.length}, всего: ${total}`);
        
        res.json({
            success: true,
            data: requests,
            pagination: {
                total: total,
                limit: limit,
                offset: offset,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Ошибка получения всех заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при получении заявок: ' + error.message
        });
    }
};

// Обновление статуса заявки
exports.updateStatus = async (req, res) => {
    try {
        console.log(`📥 Обновление статуса заявки ID: ${req.params.id}`);
        console.log('📦 Новый статус:', req.body.status);
        
        const requestId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Статус не указан'
            });
        }
        
        // Проверяем, что статус допустимый
        const validStatuses = ['Принят', 'Не принят', 'Завершен', 'Диагностика проведена'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Недопустимый статус'
            });
        }
        
        const updatedRequest = await Request.updateStatus(requestId, status);
        
        if (!updatedRequest) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }
        
        console.log('✅ Статус обновлен:', updatedRequest);
        
        res.json({
            success: true,
            message: 'Статус успешно обновлен',
            data: updatedRequest
        });

    } catch (error) {
        console.error('❌ Ошибка обновления статуса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при обновлении статуса'
        });
    }
};