const API_URL = 'http://localhost:3000/api';

// Проверка авторизации
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'sign.html';
}

// Глобальные переменные
let allRequests = [];
let currentFilter = 'all';

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
            
            document.getElementById('userFullName').textContent = 
                `${user.last_name} ${user.first_name}`;
            document.getElementById('userNameNav').textContent = 
                `${user.first_name} ${user.last_name}`;
            document.getElementById('userEmail').textContent = user.email;
            document.getElementById('userPhone').textContent = user.phone;
            
            if (user.created_at) {
                const regDate = new Date(user.created_at);
                document.getElementById('registrationDate').textContent = 
                    regDate.toLocaleDateString('ru-RU');
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
    }
}

// Загрузка заявок
async function loadRequests() {
    try {
        const response = await fetch(`${API_URL}/requests/my`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (data.success) {
            allRequests = data.data;
            updateStats();
            filterRequests('all');
        }
    } catch (error) {
        console.error('Ошибка загрузки заявок:', error);
        showError('Не удалось загрузить заявки');
    }
}

// Обновление статистики
function updateStats() {
    const stats = {
        total: allRequests.length,
        pending: allRequests.filter(r => r.status === 'Принят').length,
        diagnosed: allRequests.filter(r => r.status === 'Диагностика проведена').length,
        completed: allRequests.filter(r => r.status === 'Завершен').length
    };

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statPending').textContent = stats.pending;
    document.getElementById('statDiagnosed').textContent = stats.diagnosed;
    document.getElementById('statCompleted').textContent = stats.completed;
}

// Фильтрация заявок
function filterRequests(status) {
    currentFilter = status;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === status) {
            btn.classList.add('active');
        }
    });

    let filtered = allRequests;
    if (status !== 'all') {
        filtered = allRequests.filter(r => r.status === status);
    }

    displayRequests(filtered);
}

// Отображение заявок
function displayRequests(requests) {
    const container = document.getElementById('requestsContainer');
    
    if (requests.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="text-center py-5">
                    <i class="fas fa-inbox fa-4x text-muted mb-3"></i>
                    <h5 class="text-muted">Заявок не найдено</h5>
                    <p class="text-muted mb-3">
                        ${currentFilter === 'all' ? 'У вас пока нет заявок' : 'Нет заявок с выбранным статусом'}
                    </p>
                    <a href="zayavka_create.html" class="btn btn-success">
                        <i class="fas fa-plus-circle me-2"></i>Создать заявку
                    </a>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    requests.forEach(request => {
        const statusClass = `status-${request.status.replace(/\s+/g, '\\')}`;
        const createdDate = new Date(request.created_at).toLocaleDateString('ru-RU');
        
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        col.innerHTML = `
            <div class="card request-card shadow-sm" onclick="showRequestDetails(${request.request_id})">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <span class="badge bg-secondary">#${request.request_id}</span>
                        <span class="badge ${statusClass} status-badge">${request.status}</span>
                    </div>
                    
                    <h6 class="fw-bold mb-2">${request.brand} ${request.model}</h6>
                    <p class="text-muted small mb-2">
                        <i class="fas fa-microchip me-1"></i>${request.device_type}
                    </p>
                    
                    <p class="small text-muted mb-3">
                        <i class="fas fa-calendar-alt me-1"></i>
                        ${new Date(request.proposed_time).toLocaleDateString('ru-RU')}
                    </p>
                    
                    <p class="small text-truncate mb-0">${request.problem_description}</p>
                    
                    ${request.diagnosis_id ? 
                        '<div class="mt-2"><span class="badge bg-info text-white"><i class="fas fa-check-circle me-1"></i>Диагностика проведена</span></div>' : 
                        ''}
                </div>
            </div>
        `;
        container.appendChild(col);
    });
}

// Показ деталей заявки
window.showRequestDetails = async function(requestId) {
    const modal = new bootstrap.Modal(document.getElementById('requestModal'));
    
    try {
        const response = await fetch(`${API_URL}/requests/${requestId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (data.success) {
            const request = data.data;
            document.getElementById('modalRequestId').textContent = request.request_id;
            
            const createdDate = new Date(request.created_at).toLocaleString('ru-RU');
            const proposedDate = new Date(request.proposed_time).toLocaleString('ru-RU');
            
            let diagnosisHtml = '';
            if (request.diagnosis_id) {
                diagnosisHtml = `
                    <div class="card mb-3 border-warning">
                        <div class="card-header bg-warning bg-opacity-10">
                            <h6 class="mb-0"><i class="fas fa-tools me-2"></i>Диагностика</h6>
                        </div>
                        <div class="card-body">
                            <p><strong>Стоимость:</strong> ${request.diagnosis_cost || 'Не указана'} ₽</p>
                            <p><strong>Неисправность:</strong> ${request.fault_description || 'Не указана'}</p>
                            ${request.required_parts ? `<p><strong>Необходимые запчасти:</strong> ${request.required_parts}</p>` : ''}
                        </div>
                    </div>
                `;
            }
            
            let repairHtml = '';
            if (request.repair_id) {
                repairHtml = `
                    <div class="card mb-3 border-success">
                        <div class="card-header bg-success bg-opacity-10">
                            <h6 class="mb-0"><i class="fas fa-wrench me-2"></i>Ремонт</h6>
                        </div>
                        <div class="card-body">
                            <p><strong>Выполненные работы:</strong> ${request.services_rendered || 'Не указаны'}</p>
                            ${request.used_parts ? `<p><strong>Использованные запчасти:</strong> ${request.used_parts}</p>` : ''}
                        </div>
                    </div>
                `;
            }
            
            document.getElementById('modalContent').innerHTML = `
                <div class="mb-3">
                    <span class="badge ${`status-${request.status.replace(/\s+/g, '\\')}`} p-2 fs-6">
                        ${request.status}
                    </span>
                </div>
                
                <div class="card mb-3">
                    <div class="card-header bg-light">
                        <h6 class="mb-0"><i class="fas fa-info-circle me-2"></i>Информация о заявке</h6>
                    </div>
                    <div class="card-body">
                        <table class="table table-sm">
                            <tr>
                                <td class="detail-label">Устройство:</td>
                                <td>${request.brand} ${request.model}</td>
                            </tr>
                            <tr>
                                <td class="detail-label">Тип:</td>
                                <td>${request.device_type}</td>
                            </tr>
                            <tr>
                                <td class="detail-label">Желаемое время:</td>
                                <td>${proposedDate}</td>
                            </tr>
                            <tr>
                                <td class="detail-label">Дата создания:</td>
                                <td>${createdDate}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <div class="card mb-3">
                    <div class="card-header bg-light">
                        <h6 class="mb-0"><i class="fas fa-comment me-2"></i>Описание проблемы</h6>
                    </div>
                    <div class="card-body">
                        <p class="mb-0">${request.problem_description}</p>
                    </div>
                </div>
                
                ${diagnosisHtml}
                ${repairHtml}
            `;
        }
    } catch (error) {
        console.error('Ошибка:', error);
        document.getElementById('modalContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Ошибка загрузки деталей заявки
            </div>
        `;
    }
    
    modal.show();
};

// Поиск
document.getElementById('searchInput')?.addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    const filtered = allRequests.filter(request => 
        request.brand.toLowerCase().includes(searchTerm) ||
        request.model.toLowerCase().includes(searchTerm) ||
        request.device_type.toLowerCase().includes(searchTerm) ||
        request.problem_description.toLowerCase().includes(searchTerm)
    );
    
    displayRequests(filtered);
});

// Фильтры
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        filterRequests(this.dataset.filter);
    });
});

// Выход
window.logout = function() {
    localStorage.removeItem('token');
    window.location.href = 'sign.html';
};

// Показать ошибку
function showError(message) {
    const container = document.getElementById('requestsContainer');
    container.innerHTML = `
        <div class="col-12">
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                ${message}
            </div>
        </div>
    `;
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    loadUserData();
    loadRequests();
});