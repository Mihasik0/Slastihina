const Diagnosis = require('../models/Diagnosis');

// Создание диагностики (БЕЗ списания запчастей)
exports.create = async (req, res) => {
    try {
        console.log('📥 Создание диагностики, данные:', req.body);
        
        const { 
            request_id, 
            cost, 
            fault_description, 
            diagnosis_report,
            required_parts,
            additional_materials,
            estimated_repair_cost,
            parts
        } = req.body;
        
        if (!request_id || !cost || !fault_description) {
            return res.status(400).json({
                success: false,
                message: 'Не все обязательные поля заполнены'
            });
        }
        
        const diagnosisData = {
            request_id,
            master_id: req.user.id,
            cost: parseFloat(cost),
            fault_description,
            diagnosis_report: diagnosis_report || null,
            required_parts: required_parts || null,
            additional_materials: additional_materials || null,
            estimated_repair_cost: estimated_repair_cost ? parseFloat(estimated_repair_cost) : null,
            parts: parts || []
        };
        
        const diagnosis = await Diagnosis.create(diagnosisData);
        
        console.log('✅ Диагностика создана (запчасти не списаны, будут списаны при ремонте)');
        
        res.status(201).json({
            success: true,
            message: 'Диагностика создана. Ожидайте подтверждения клиента.',
            data: diagnosis
        });
    } catch (error) {
        console.error('❌ Ошибка создания диагностики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// Обновление статуса подтверждения ремонта
exports.updateRepairApproval = async (req, res) => {
    try {
        const { diagnosisId } = req.params;
        const { approved, client_comment } = req.body;
        
        const diagnosis = await Diagnosis.updateRepairApproval(diagnosisId, approved, client_comment);
        
        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Диагностика не найдена'
            });
        }
        
        res.json({
            success: true,
            message: approved ? 'Ремонт одобрен' : 'Ремонт отклонен',
            data: diagnosis
        });
    } catch (error) {
        console.error('❌ Ошибка обновления подтверждения:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение диагностики по ID заявки
exports.getByRequestId = async (req, res) => {
    try {
        const diagnosis = await Diagnosis.findByRequestId(req.params.requestId);
        
        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Диагностика не найдена'
            });
        }
        
        res.json({
            success: true,
            data: diagnosis
        });
    } catch (error) {
        console.error('❌ Ошибка получения диагностики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение диагностики по ID
exports.getById = async (req, res) => {
    try {
        const diagnosis = await Diagnosis.findById(req.params.diagnosisId);
        
        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Диагностика не найдена'
            });
        }
        
        res.json({
            success: true,
            data: diagnosis
        });
    } catch (error) {
        console.error('❌ Ошибка получения диагностики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Добавление запчастей к диагностике
exports.addParts = async (req, res) => {
    try {
        const { diagnosisId } = req.params;
        const { parts } = req.body;
        
        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не указаны запчасти для добавления'
            });
        }
        
        // Получаем request_id из диагностики
        const diagnosis = await Diagnosis.findById(diagnosisId);
        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Диагностика не найдена'
            });
        }
        
        const result = await Diagnosis.addParts(
            diagnosisId, 
            parts, 
            diagnosis.request_id, 
            req.user.id
        );
        
        res.json({
            success: true,
            message: `Добавлено ${result.count} запчастей`,
            data: result
        });
    } catch (error) {
        console.error('❌ Ошибка добавления запчастей:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение запчастей диагностики
exports.getParts = async (req, res) => {
    try {
        const diagnosisId = req.params.diagnosisId;
        
        const query = `
            SELECT 
                dp.item_id,
                wi.item_name,
                dp.quantity,
                dp.price,
                wi.unit
            FROM diagnosis_parts dp
            LEFT JOIN warehouse_items wi ON dp.item_id = wi.item_id
            WHERE dp.diagnosis_id = $1
        `;
        
        const result = await db.query(query, [diagnosisId]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Ошибка получения запчастей диагностики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Отмена диагностики
exports.cancelDiagnosis = async (req, res) => {
    try {
        const { diagnosisId } = req.params;
        
        const result = await Diagnosis.cancelDiagnosis(diagnosisId);
        
        res.json({
            success: true,
            message: `Диагностика отменена, возвращено ${result.returned_parts} запчастей`,
            data: result
        });
    } catch (error) {
        console.error('❌ Ошибка отмены диагностики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Получение статистики диагностик мастера
exports.getMasterStats = async (req, res) => {
    try {
        const masterId = req.user.id;
        
        const stats = await Diagnosis.getMasterStats(masterId);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getParts = async (req, res) => {
    try {
        const parts = await Diagnosis.getRequiredParts(req.params.diagnosisId);
        res.json({
            success: true,
            data: parts
        });
    } catch (error) {
        console.error('Ошибка получения запчастей:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};