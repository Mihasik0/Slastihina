const API_URL = 'http://localhost:3000/api';

// Проверка авторизации
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'sign.html';
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (data.success) {
            const user = data.data;
            
            // 1. Заполняем поле "Автор заявки" (ФИО пользователя)
            const authorField = document.querySelector('input[value="Иванов Иван Иванович (администратор)"]');
            if (authorField) {
                authorField.value = `${user.last_name} ${user.first_name}`;
            }
            
            // 2. Заполняем поле "Клиент (ФИО)" (тоже ФИО пользователя)
            const clientFioField = document.getElementById('clientFio');
            if (clientFioField) {
                clientFioField.value = `${user.last_name} ${user.first_name}`;
                clientFioField.readOnly = true;
                clientFioField.classList.add('bg-light');
            }
            
            // 3. Скрываем кнопку "Новый клиент"
            const newClientBtn = document.querySelector('button[data-bs-target="#newClientModal"]');
            if (newClientBtn) {
                newClientBtn.style.display = 'none';
            }
            
            // 4. Сохраняем ID пользователя
            const form = document.querySelector('form');
            const userIdInput = document.createElement('input');
            userIdInput.type = 'hidden';
            userIdInput.name = 'client_id';
            userIdInput.id = 'clientId';
            userIdInput.value = user.client_id;
            form.appendChild(userIdInput);
            
            // 5. Обновляем информацию о статусе
            const statusInfo = document.querySelector('.alert-info');
            if (statusInfo) {
                statusInfo.innerHTML = '<i class="bi bi-info-circle"></i> Статус заявки по умолчанию: <strong>Принят</strong>. После создания заявки с вами свяжется мастер.';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
    }
}

// Установка минимальной даты (сегодня)
function setMinDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const minDate = `${year}-${month}-${day}`;
    
    const dateInput = document.getElementById('proposedDate');
    if (dateInput) {
        dateInput.min = minDate;
    }
}

// Установка времени по умолчанию (текущее время + 2 часа)
function setDefaultTime() {
    const now = new Date();
    now.setHours(now.getHours() + 2);
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const timeInput = document.getElementById('proposedTime');
    if (timeInput && !timeInput.value) {
        timeInput.value = `${hours}:${minutes}`;
    }
}

// Обновление даты и времени
function updateDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const formattedDateTime = `${day}.${month}.${year} ${hours}:${minutes}`;
    const dateTimeField = document.getElementById('currentDateTime');
    if (dateTimeField) {
        dateTimeField.value = formattedDateTime;
    }
}

// Показать уведомление
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'success' ? 'success' : 'danger'} position-fixed top-0 end-0 m-3`;
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2"></i>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Обработка отправки формы
document.addEventListener('DOMContentLoaded', function() {
    // Загружаем данные пользователя
    loadUserData();
    setMinDate();
    setDefaultTime();
    updateDateTime();
    setInterval(updateDateTime, 60000);
    
    // Делаем ID заявки только для чтения
    const requestIdField = document.getElementById('requestId');
    if (requestIdField) {
        requestIdField.readOnly = true;
        requestIdField.classList.add('bg-light');
        requestIdField.value = 'Автоматически';
    }
    
    // Обработка отправки формы
    const form = document.querySelector('form');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = document.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Создание...';

        // Получаем ID пользователя
        const clientId = document.getElementById('clientId')?.value;
        if (!clientId) {
            showNotification('Ошибка: пользователь не авторизован', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            return;
        }

        // Собираем данные из формы
        const deviceType = document.getElementById('deviceType').value;
        const brand = document.getElementById('brand').value.trim();
        const model = document.getElementById('model').value.trim();
        const proposedDate = document.getElementById('proposedDate').value;
        const proposedTime = document.getElementById('proposedTime').value;
        const problemDescription = document.getElementById('problemDescription').value.trim();

        // Валидация
        if (!deviceType) {
            showNotification('Выберите тип устройства', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            document.getElementById('deviceType').focus();
            return;
        }

        if (!brand) {
            showNotification('Введите марку устройства', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            document.getElementById('brand').focus();
            return;
        }

        if (!model) {
            showNotification('Введите модель устройства', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            document.getElementById('model').focus();
            return;
        }

        if (!proposedDate) {
            showNotification('Выберите желаемую дату', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            document.getElementById('proposedDate').focus();
            return;
        }

        if (!proposedTime) {
            showNotification('Выберите желаемое время', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            document.getElementById('proposedTime').focus();
            return;
        }

        if (!problemDescription) {
            showNotification('Опишите проблему', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            document.getElementById('problemDescription').focus();
            return;
        }

        // Формируем proposed_time в формате ISO
        const proposedDateTime = `${proposedDate}T${proposedTime}:00`;

        const requestData = {
            device_type: deviceType,
            brand: brand,
            model: model,
            proposed_time: proposedDateTime,
            problem_description: problemDescription
        };

        console.log('Отправка данных:', requestData);

        try {
            const response = await fetch(`${API_URL}/requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestData)
            });

            const data = await response.json();

            if (data.success) {
                showNotification('✅ Заявка успешно создана!', 'success');
                setTimeout(() => {
                    window.location.href = 'profile.html';
                }, 2000);
            } else {
                showNotification('❌ ' + (data.message || 'Ошибка создания заявки'), 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        } catch (error) {
            console.error('Ошибка:', error);
            showNotification('❌ Ошибка соединения с сервером', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
});