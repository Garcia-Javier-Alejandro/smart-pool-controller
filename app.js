// API Configuration
const API_BASE_URL = 'https://iot-5wo.pages.dev'; // Your existing Pages Functions deployment

// Utility Functions
function showAuthSection() {
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('navLinks').innerHTML = '';
}

function showDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('navLinks').innerHTML = '<a href="#" onclick="handleLogout()" class="btn-logout">Logout</a>';
}

function switchToLogin(event) {
    event.preventDefault();
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');
    document.getElementById('authMessage').textContent = '';
    document.getElementById('authMessage').className = 'message';
}

function switchToRegister(event) {
    event.preventDefault();
    document.getElementById('registerForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('authMessage').textContent = '';
    document.getElementById('authMessage').className = 'message';
}

function showMessage(text, type) {
    const msgEl = document.getElementById('authMessage');
    msgEl.textContent = text;
    msgEl.className = `message ${type}`;
    if (type === 'success') {
        setTimeout(() => {
            msgEl.className = 'message';
        }, 3000);
    }
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    element.select();
    document.execCommand('copy');
    alert('Copied to clipboard!');
}

function toggleMqttPassword() {
    const input = document.getElementById('mqttPassword');
    const btn = event.target;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
    } else {
        input.type = 'password';
        btn.textContent = 'Show';
    }
}

// Authentication Functions
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.error || 'Login failed', 'error');
            return;
        }

        // Store token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('expiresIn', data.expiresIn);
        localStorage.setItem('loginTime', Date.now());

        showMessage('Login successful!', 'success');
        setTimeout(() => {
            loadDashboard();
            showDashboard();
        }, 1000);
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Network error. Please try again.', 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const deviceId = document.getElementById('registerDeviceId').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password, deviceId })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.error || 'Registration failed', 'error');
            return;
        }

        showMessage('Registration successful! Please login.', 'success');
        setTimeout(() => {
            document.getElementById('registerUsername').value = '';
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerPassword').value = '';
            document.getElementById('registerDeviceId').value = '';
            switchToLogin(new Event('click'));
        }, 1500);
    } catch (error) {
        console.error('Register error:', error);
        showMessage('Network error. Please try again.', 'error');
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
        showMessage('No token found. Please login again.', 'error');
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
        document.getElementById('mqttInfo').style.display = 'block';
    } catch (error) {
        console.error('MQTT credentials error:', error);
        showMessage('Network error. Please try again.', 'error');
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
