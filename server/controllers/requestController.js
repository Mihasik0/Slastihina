const Request = require('../models/Request');
const { validationResult } = require('express-validator');

// Создание заявки
exports.createRequest = async (req, res) => {
    try {
        console.log('📥 Получен запрос на создание заявки:', req.body);
        console.log('👤 Пользователь:', req.user);

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

        console.log('📦 Данные для сохранения:', requestData);

        const request = await Request.create(requestData);

        console.log('✅ Заявка создана:', request);

        res.status(201).json({
            success: true,
            message: 'Заявка успешно создана',
            data: request
        });

    } catch (error) {
        console.error('❌ Ошибка создания заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при создании заявки: ' + error.message
        });
    }
};

// Получение заявок текущего пользователя
exports.getMyRequests = async (req, res) => {
    try {
        console.log('📥 Запрос заявок пользователя:', req.user.id);
        
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
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение конкретной заявки
exports.getRequestById = async (req, res) => {
    try {
        console.log(`📥 Запрос заявки ID: ${req.params.id} для пользователя: ${req.user.id}`);
        
        const request = await Request.findById(req.params.id, req.user.id);
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Заявка не найдена'
            });
        }

        console.log('✅ Заявка найдена:', request.request_id);
        
        res.json({
            success: true,
            data: request
        });

    } catch (error) {
        console.error('❌ Ошибка получения заявки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};

// Получение статистики пользователя
exports.getUserStats = async (req, res) => {
    try {
        console.log('📥 Запрос статистики для пользователя:', req.user.id);
        
        const stats = await Request.getUserStats(req.user.id);
        
        console.log('✅ Статистика получена:', stats);
        
        res.json({
            success: true,
            data: stats || { total: 0, accepted: 0, rejected: 0, completed: 0, diagnosed: 0 }
        });

    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера: ' + error.message
        });
    }
};