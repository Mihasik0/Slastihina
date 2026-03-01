const API_URL = 'http://localhost:3000/api';

// Сохранение токена
const setToken = (token) => {
    localStorage.setItem('token', token);
};

// Получение токена
const getToken = () => {
    return localStorage.getItem('token');
};

// Выход
const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/html/sign.html';
};

// Проверка авторизации
const isAuthenticated = () => {
    return !!getToken();
};

// Показать уведомление
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            animation: slideIn 0.3s ease;
        ">
            ${message}
            <button onclick="this.parentElement.remove()" style="
                float: right;
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                margin-left: 10px;
            ">&times;</button>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Регистрация (ИСПРАВЛЕНО)
async function registerUser(userData) {
    try {
        console.log('📤 Отправка данных:', userData); // Для отладки
        
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();
        console.log('📥 Ответ сервера:', data); // Для отладки

        if (data.success) {
            setToken(data.data.token);
            showNotification('✅ Регистрация успешна!', 'success');
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 2000);
        } else {
            showNotification('❌ ' + (data.message || 'Ошибка регистрации'), 'error');
        }
    } catch (error) {
        console.error('❌ Ошибка:', error);
        showNotification('❌ Ошибка соединения с сервером', 'error');
    }
}

// Вход (ИСПРАВЛЕНО - принимает login и password)
async function loginUser(login, password) {
    try {
        console.log('📤 Вход с логином:', login); // Для отладки
        
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ login, password })
        });

        const data = await response.json();
        console.log('📥 Ответ сервера:', data); // Для отладки

        if (data.success) {
            setToken(data.data.token);
            showNotification('✅ Вход выполнен успешно!', 'success');
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 2000);
        } else {
            showNotification('❌ ' + (data.message || 'Ошибка входа'), 'error');
        }
    } catch (error) {
        console.error('❌ Ошибка:', error);
        showNotification('❌ Ошибка соединения с сервером', 'error');
    }
}

// Получить данные пользователя
async function getUserData() {
    if (!isAuthenticated()) return null;

    try {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();
        return data.success ? data.data : null;
    } catch (error) {
        console.error('❌ Ошибка получения данных:', error);
        return null;
    }
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    // ФОРМА РЕГИСТРАЦИИ (ИСПРАВЛЕНО)
    const registerForm = document.querySelector('.register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Получаем все поля
            const emailInput = registerForm.querySelector('input[placeholder="Почта"]');
            const phoneInput = registerForm.querySelector('input[placeholder="Номер телефона"]');
            const fullNameInput = registerForm.querySelector('input[placeholder="Фамилия Имя"]');
            const addressInput = registerForm.querySelector('input[placeholder="Адрес"]');
            const passwordInput = registerForm.querySelector('input[placeholder="Пароль"]');
            
            // Проверяем, что все поля найдены
            if (!emailInput || !phoneInput || !fullNameInput || !addressInput || !passwordInput) {
                console.error('❌ Не найдены поля формы!');
                showNotification('❌ Ошибка формы', 'error');
                return;
            }
            
            // Получаем значения
            const email = emailInput.value.trim();
            const phone = phoneInput.value.trim();
            const fullName = fullNameInput.value.trim();
            const address = addressInput.value.trim();
            const password = passwordInput.value;
            
            // Проверяем заполнение
            if (!email) {
                showNotification('❌ Введите email', 'error');
                emailInput.focus();
                return;
            }
            
            if (!phone) {
                showNotification('❌ Введите номер телефона', 'error');
                phoneInput.focus();
                return;
            }
            
            if (!fullName) {
                showNotification('❌ Введите фамилию и имя', 'error');
                fullNameInput.focus();
                return;
            }
            
            if (!address) {
                showNotification('❌ Введите адрес', 'error');
                addressInput.focus();
                return;
            }
            
            if (!password || password.length < 4) {
                showNotification('❌ Пароль должен быть минимум 4 символа', 'error');
                passwordInput.focus();
                return;
            }
            
            // Разбираем Фамилию и Имя
            const nameParts = fullName.split(' ');
            const firstName = nameParts[1] || nameParts[0] || '';
            const lastName = nameParts[0] || '';
            
            // Формируем данные с EMAIL
            const formData = {
                first_name: firstName,
                last_name: lastName,
                email: email, // ВАЖНО: добавляем email
                phone: phone,
                address: address,
                password: password
            };
            
            console.log('📦 Данные регистрации:', formData);
            
            // Отправляем
            registerUser(formData);
        });
    }

    // ФОРМА ВХОДА (ИСПРАВЛЕНО)
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // В форме входа поле называется "Email или телефон"
            const loginInput = loginForm.querySelector('input[placeholder="Email или телефон"]');
            const passwordInput = loginForm.querySelector('input[placeholder="Пароль"]');
            
            if (!loginInput || !passwordInput) {
                console.error('❌ Не найдены поля формы входа!');
                showNotification('❌ Ошибка формы', 'error');
                return;
            }
            
            const login = loginInput.value.trim();
            const password = passwordInput.value;
            
            if (!login) {
                showNotification('❌ Введите email или телефон', 'error');
                loginInput.focus();
                return;
            }
            
            if (!password) {
                showNotification('❌ Введите пароль', 'error');
                passwordInput.focus();
                return;
            }
            
            console.log('📦 Данные входа:', { login, password });
            
            // Отправляем
            loginUser(login, password);
        });
    }

    // Обновляем интерфейс если пользователь авторизован
    if (isAuthenticated()) {
        // Получаем данные пользователя
        getUserData().then(user => {
            if (user) {
                console.log('👤 Текущий пользователь:', user);
                // Можно добавить приветствие
                const nav = document.querySelector('.d-flex.align-items-center.gap-3.text-nowrap');
                if (nav) {
                    const welcomeSpan = document.createElement('span');
                    welcomeSpan.className = 'text-success me-2';
                    welcomeSpan.innerHTML = `👋 ${user.first_name}`;
                    nav.insertBefore(welcomeSpan, nav.firstChild);
                }
            }
        });

        // Меняем кнопки в навигации
        document.querySelectorAll('.btn-outline-primary, .btn-primary').forEach(btn => {
            if (btn.textContent.includes('Стать клиентом') || btn.textContent.includes('Войти')) {
                btn.style.display = 'none';
            }
        });

        // Добавляем кнопку выхода
        const nav = document.querySelector('.d-flex.align-items-center.gap-3.text-nowrap');
        if (nav && !document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.className = 'btn btn-danger btn-sm';
            logoutBtn.innerHTML = 'Выйти';
            logoutBtn.onclick = logout;
            nav.appendChild(logoutBtn);
        }
    }
});