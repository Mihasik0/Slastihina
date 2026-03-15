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

// Регистрация
async function registerUser(userData) {
    try {
        console.log('📤 Отправка данных:', userData);

        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();
        console.log('📥 Ответ сервера:', data);

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

// Вход
async function loginUser(login, password) {
    try {
        console.log('📤 Вход с логином:', login);

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ login, password })
        });

        const data = await response.json();
        console.log('📥 Ответ сервера:', data);

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

// Обновление интерфейса для авторизованного пользователя
function updateUIForAuthUser(user) {
    // Обновляем ссылки "Создать заявку" в прайслисте
    document.querySelectorAll('.price-card .btn-success').forEach(btn => {
        btn.href = 'html/zayavka_create.html';
        btn.innerHTML = '<i class="fas fa-plus-circle me-2"></i>Создать заявку';
    });

    // Обновляем мобильное меню, если оно существует
    const mobileAuthSection = document.querySelector('#mobileAuthSection');
    if (mobileAuthSection) {
        mobileAuthSection.innerHTML = `
            <p><i class="fas fa-map-marker-alt me-2"></i>Сыктывкар</p>
            <p><i class="fas fa-envelope me-2"></i>OOO_tmiv_deneg@mail.ru</p>
            <p><i class="fas fa-check-circle me-2 text-success"></i>0 выполненных заказов</p>
            <div class="alert alert-success py-2 mb-3">
                <i class="fas fa-user me-2"></i>${user.first_name} ${user.last_name}
            </div>
            <a href="html/profile.html"><button class="btn btn-outline-primary w-100 mb-2">
                <i class="fas fa-user me-2"></i>Мой профиль
            </button></a>
            <a href="html/zayavka_create.html"><button class="btn btn-success w-100 mb-2">
                <i class="fas fa-plus-circle me-2"></i>Создать заявку
            </button></a>
            <button class="btn btn-outline-danger w-100" onclick="logout()">
                <i class="fas fa-sign-out-alt me-2"></i>Выйти
            </button>
        `;
    }
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    // ФОРМА РЕГИСТРАЦИИ
    const registerForm = document.querySelector('.register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const emailInput = registerForm.querySelector('input[placeholder="Почта"]');
            const phoneInput = registerForm.querySelector('input[placeholder="Номер телефона"]');
            const fullNameInput = registerForm.querySelector('input[placeholder="Фамилия Имя"]');
            const addressInput = registerForm.querySelector('input[placeholder="Адрес"]');
            const passwordInput = registerForm.querySelector('input[placeholder="Пароль"]');

            if (!emailInput || !phoneInput || !fullNameInput || !addressInput || !passwordInput) {
                console.error('❌ Не найдены поля формы!');
                showNotification('❌ Ошибка формы', 'error');
                return;
            }

            const email = emailInput.value.trim();
            const phone = phoneInput.value.trim();
            const fullName = fullNameInput.value.trim();
            const address = addressInput.value.trim();
            const password = passwordInput.value;

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

            const nameParts = fullName.split(' ');
            const firstName = nameParts[1] || nameParts[0] || '';
            const lastName = nameParts[0] || '';

            const formData = {
                first_name: firstName,
                last_name: lastName,
                email: email,
                phone: phone,
                address: address,
                password: password
            };

            console.log('📦 Данные регистрации:', formData);
            registerUser(formData);
        });
    }

    // ФОРМА ВХОДА
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

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
            loginUser(login, password);
        });
    }

    // ОБРАБОТКА АВТОРИЗОВАННОГО ПОЛЬЗОВАТЕЛЯ
    if (isAuthenticated()) {
        // Скрываем ссылки на регистрацию и вход
        document.querySelectorAll('a[href="html/registration.html"]').forEach(el => {
            // Не скрываем если это внутри выпадающего меню
            if (!el.closest('.dropdown')) {
                el.style.display = 'none';
            }
        });
        document.querySelectorAll('a[href="html/sign.html"]').forEach(el => {
            if (!el.closest('.dropdown')) {
                el.style.display = 'none';
            }
        });

        getUserData().then(user => {
            if (user) {
                console.log('👤 Текущий пользователь:', user);
                const nav = document.querySelector('.second-nav .d-flex.align-items-center.gap-3.text-nowrap');
                
                if (nav) {
                    // Удаляем старую кнопку выхода, если есть
                    const oldLogoutBtn = document.getElementById('logout-btn');
                    if (oldLogoutBtn) oldLogoutBtn.remove();

                    // Удаляем старый span с именем, если есть
                    const oldGreeting = nav.querySelector('.user-greeting');
                    if (oldGreeting) oldGreeting.remove();

                    // Удаляем старый dropdown, если есть
                    const oldDropdown = nav.querySelector('.dropdown');
                    if (oldDropdown) oldDropdown.remove();

                    // Создаём контейнер dropdown
                    const dropdownDiv = document.createElement('div');
                    dropdownDiv.className = 'dropdown d-inline-block ms-2';

                    // Кнопка, открывающая меню (с именем и иконкой)
                    const dropdownBtn = document.createElement('button');
                    dropdownBtn.className = 'btn btn-link dropdown-toggle text-decoration-none p-0 border-0';
                    dropdownBtn.setAttribute('type', 'button');
                    dropdownBtn.setAttribute('data-bs-toggle', 'dropdown');
                    dropdownBtn.setAttribute('aria-expanded', 'false');
                    dropdownBtn.style.background = 'none';
                    dropdownBtn.style.boxShadow = 'none';
                    dropdownBtn.innerHTML = `
                        <span class="text-success fw-medium">${user.first_name} ${user.last_name}</span>
                        <img src="src/client.png" width="24" height="24" class="ms-1">
                    `;

                    // Меню с пунктами
                    const dropdownMenu = document.createElement('ul');
                    dropdownMenu.className = 'dropdown-menu dropdown-menu-end shadow-sm border-0 mt-2';
                    dropdownMenu.style.minWidth = '180px';

                    // Пункт "Мой профиль"
                    const profileItem = document.createElement('li');
                    const profileLink = document.createElement('a');
                    profileLink.className = 'dropdown-item py-2';
                    profileLink.href = 'html/profile.html';
                    profileLink.innerHTML = '<i class="fas fa-user me-2 text-primary"></i>Мой профиль';
                    profileItem.appendChild(profileLink);

                    // Пункт "Создать заявку"
                    const createItem = document.createElement('li');
                    const createLink = document.createElement('a');
                    createLink.className = 'dropdown-item py-2';
                    createLink.href = 'html/zayavka_create.html';
                    createLink.innerHTML = '<i class="fas fa-plus-circle me-2 text-success"></i>Создать заявку';
                    createItem.appendChild(createLink);

                    // Разделитель
                    const divider = document.createElement('li');
                    divider.innerHTML = '<hr class="dropdown-divider">';

                    // Пункт "Выйти"
                    const logoutItem = document.createElement('li');
                    const logoutLink = document.createElement('a');
                    logoutLink.className = 'dropdown-item py-2';
                    logoutLink.href = '#';
                    logoutLink.innerHTML = '<i class="fas fa-sign-out-alt me-2 text-danger"></i>Выйти';
                    logoutLink.onclick = (e) => {
                        e.preventDefault();
                        logout();
                    };
                    logoutItem.appendChild(logoutLink);

                    // Собираем меню
                    dropdownMenu.appendChild(profileItem);
                    dropdownMenu.appendChild(createItem);
                    dropdownMenu.appendChild(divider);
                    dropdownMenu.appendChild(logoutItem);

                    // Собираем структуру
                    dropdownDiv.appendChild(dropdownBtn);
                    dropdownDiv.appendChild(dropdownMenu);

                    // Вставляем перед первым дочерним элементом nav (чтобы имя оказалось слева)
                    nav.insertBefore(dropdownDiv, nav.firstChild);

                    // Инициализируем Bootstrap Dropdown
                    if (typeof bootstrap !== 'undefined' && bootstrap.Dropdown) {
                        new bootstrap.Dropdown(dropdownBtn);
                    }
                }

                // Обновляем остальной интерфейс
                updateUIForAuthUser(user);
            }
        });
    } else {
        // Для неавторизованных пользователей убедимся, что кнопки "Создать заявку" ведут на регистрацию
        document.querySelectorAll('.price-card .btn-success').forEach(btn => {
            btn.href = 'html/registration.html';
            btn.innerHTML = 'Создать заявку';
        });
    }
});

// Делаем функцию logout глобально доступной
window.logout = logout;