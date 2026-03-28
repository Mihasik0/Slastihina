module.exports = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Требуется авторизация'
            });
        }
        
        // Если у пользователя нет роли, считаем его клиентом
        const userRole = req.user.role || 'client';
        
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен. Недостаточно прав.'
            });
        }
        
        next();
    };
};