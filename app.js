// API Configuration
const API_BASE_URL = 'https://iot-5wo.pages.dev'; // Your existing Pages Functions deployment

// Utility Functions
function showAuthSection() {
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('navLinks').innerHTML = '';
    // Default to registration view for initial onboarding
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('navLinks').innerHTML = '<a href="#" onclick="handleLogout()" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors">Cerrar Sesión</a>';
}

function switchToLogin(event) {
    event.preventDefault();
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('authMessage').textContent = '';
    document.getElementById('authMessage').classList.add('hidden');
}

function switchToRegister(event) {
    event.preventDefault();
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('authMessage').textContent = '';
    document.getElementById('authMessage').classList.add('hidden');
}

function showMessage(text, type) {
    const msgEl = document.getElementById('authMessage');
    msgEl.textContent = text;
    msgEl.classList.remove('hidden');
    if (type === 'success') {
        msgEl.className = 'message-success mt-6';
        setTimeout(() => {
            msgEl.classList.add('hidden');
        }, 3000);
    } else {
        msgEl.className = 'message-error mt-6';
    }
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.value;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '¡Copiado!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(() => {
        alert('Error al copiar al portapapeles');
    });
}

// Authentication Functions
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.error || '¡Inicio de sesión fallido!', 'error');
            return;
        }

        // Store token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('expiresIn', data.expiresIn);
        localStorage.setItem('loginTime', Date.now());

        showMessage('¡Inicio de sesión exitoso!', 'success');
        setTimeout(() => {
            loadDashboard();
            showDashboard();
        }, 1000);
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Error de red. Por favor intenta de nuevo.', 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const deviceId = document.getElementById('registerDeviceId').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, deviceId })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.error || '¡Registro fallido!', 'error');
            return;
        }

        showMessage('¡Registro exitoso! Por favor inicia sesión.', 'success');
        setTimeout(() => {
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerPassword').value = '';
            document.getElementById('registerDeviceId').value = '';
            switchToLogin(new Event('click'));
        }, 1500);
    } catch (error) {
        console.error('Register error:', error);
        showMessage('Error de red. Por favor intenta de nuevo.', 'error');
    }
}

async function handleLogout() {
    const token = localStorage.getItem('token');

    if (!token) {
        localStorage.clear();
        showAuthSection();
        return;
    }

    try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    localStorage.clear();
    showAuthSection();
    switchToLogin(new Event('click'));
}

async function generateMqttCredentials() {
    const token = localStorage.getItem('token');

    if (!token) {
        showMessage('No se encontró token. Por favor inicia sesión de nuevo.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/mqtt-credentials`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.error || 'Failed to get MQTT credentials', 'error');
            return;
        }

        // Display MQTT info
        document.getElementById('mqttUser').textContent = data.mqttUser;
        document.getElementById('mqttPassword').value = data.mqttPassword;
        document.getElementById('brokerUrl').textContent = data.brokerUrl;
        document.getElementById('topicPrefix').textContent = data.topicPrefix;
        document.getElementById('mqttInfo').classList.remove('hidden');
    } catch (error) {
        console.error('MQTT credentials error:', error);
        showMessage('Error de red. Por favor intenta de nuevo.', 'error');
    }
}

function loadDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));
    const loginTime = parseInt(localStorage.getItem('loginTime'));
    const expiresIn = parseInt(localStorage.getItem('expiresIn'));
    const expiresAt = new Date(loginTime + expiresIn * 1000);

    document.getElementById('userUsername').textContent = user.username;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userDeviceId').textContent = user.deviceId;
    document.getElementById('tokenExpiry').textContent = expiresAt.toLocaleString();
    
    // Reset MQTT info
    document.getElementById('mqttInfo').style.display = 'none';

    // You can add real device status endpoint later
    document.getElementById('deviceStatus').textContent = 'Connected';
    document.getElementById('deviceLastUpdate').textContent = new Date().toLocaleString();
}

// Initialize on page load
function init() {
    const token = localStorage.getItem('token');

    if (token) {
        loadDashboard();
        showDashboard();
    } else {
        showAuthSection();
        switchToLogin(new Event('click'));
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', init);
