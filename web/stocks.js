// Authentication state
let isAuthenticated = false;
let currentUserEmail = '';
let isSignupMode = false;

document.addEventListener('DOMContentLoaded', () => {
    console.log('stocks.js loaded');
    checkAuthStatus();
});

// ===== AUTHENTICATION SECTION =====
function checkAuthStatus() {
    fetch('/api/admin/check-auth')
        .then(res => res.json())
        .then(data => {
            isAuthenticated = data.authenticated && data.is_admin;
            currentUserEmail = data.email || '';
            
            if (isAuthenticated && data.is_admin) {
                updateUIForLoggedIn();
                loadStocks();
                loadOrders();
                setInterval(() => {
                    loadStocks();
                    loadOrders();
                }, 10000);
            } else {
                updateUIForLoggedOut();
                showLoginModal();
            }
        })
        .catch(err => {
            console.error('Error checking auth:', err);
            updateUIForLoggedOut();
            showLoginModal();
        });
}

function updateUIForLoggedIn() {
    document.getElementById('profile-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('user-email-display').textContent = currentUserEmail;
    document.getElementById('login-modal').style.display = 'none';
}

function updateUIForLoggedOut() {
    document.getElementById('profile-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('stocks-body').innerHTML = `
        <tr>
            <td colspan="8" style="text-align:center;padding:20px;color:#666;">
                Please log in to view stocks.
            </td>
        </tr>
    `;
    const ordersList = document.getElementById('orders-list');
    if (ordersList) {
        ordersList.innerHTML = `
            <div style="text-align:center;padding:20px;color:#666;">
                Please log in to view orders.
            </div>
        `;
    }
}

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    isSignupMode = false;
    updateModalForMode();
}

function closeLoginModal() {
    // Only allow closing if authenticated
    if (isAuthenticated) {
        document.getElementById('login-modal').style.display = 'none';
        clearAuthForm();
    }
}

function handleModalClick(event) {
    // Don't allow closing modal by clicking outside if not authenticated
    // User must log in to access the admin panel
    if (event.target.id === 'login-modal' && isAuthenticated) {
        closeLoginModal();
    }
    // If not authenticated, clicking outside does nothing - user must log in
}

function toggleAuthMode() {
    isSignupMode = !isSignupMode;
    updateModalForMode();
}

function updateModalForMode() {
    const modalTitle = document.getElementById('modal-title');
    const submitText = document.getElementById('auth-submit-text');
    const switchText = document.getElementById('switch-text');
    const switchLink = document.getElementById('switch-link');
    const confirmSection = document.getElementById('confirm-password-section');
    const confirmInput = document.getElementById('auth-confirm-password');
    
    if (isSignupMode) {
        modalTitle.textContent = 'Create Admin Account';
        submitText.textContent = 'Sign Up';
        switchText.textContent = 'Already have an account?';
        switchLink.textContent = 'Login';
        confirmSection.style.display = 'block';
        confirmInput.required = true;
    } else {
        modalTitle.textContent = 'Login to Admin Panel';
        submitText.textContent = 'Login';
        switchText.textContent = "Don't have an account?";
        switchLink.textContent = 'Sign Up';
        confirmSection.style.display = 'none';
        confirmInput.required = false;
    }
    clearAuthMessages();
}

function clearAuthForm() {
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-confirm-password').value = '';
    clearAuthMessages();
}

function clearAuthMessages() {
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('success-message').style.display = 'none';
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    document.getElementById('success-message').style.display = 'none';
}

function showSuccess(message) {
    const successEl = document.getElementById('success-message');
    successEl.textContent = message;
    successEl.style.display = 'block';
    document.getElementById('error-message').style.display = 'none';
}

function handleAuth(event) {
    event.preventDefault();
    clearAuthMessages();
    
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    const confirmPassword = document.getElementById('auth-confirm-password').value;
    
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }
    
    if (isSignupMode) {
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        // Sign up
        fetch('/api/admin/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, confirm_password: confirmPassword })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showSuccess(data.message || 'Account created successfully!');
                setTimeout(() => {
                    isAuthenticated = true;
                    currentUserEmail = data.email;
                    updateUIForLoggedIn();
                    loadStocks();
                    loadOrders();
                    setInterval(() => {
                        loadStocks();
                        loadOrders();
                    }, 10000);
                    closeLoginModal();
                }, 1000);
            } else {
                showError(data.message || 'Signup failed. Please try again.');
            }
        })
        .catch(err => {
            console.error('Signup error:', err);
            showError('An error occurred. Please try again.');
        });
    } else {
        // Login
        fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showSuccess(data.message || 'Login successful!');
                setTimeout(() => {
                    isAuthenticated = true;
                    currentUserEmail = data.email;
                    updateUIForLoggedIn();
                    loadStocks();
                    loadOrders();
                    setInterval(() => {
                        loadStocks();
                        loadOrders();
                    }, 10000);
                    closeLoginModal();
                }, 1000);
            } else {
                showError(data.message || 'Invalid email or password');
            }
        })
        .catch(err => {
            console.error('Login error:', err);
            showError('An error occurred. Please try again.');
        });
    }
}

function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) {
        return;
    }
    
    fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            isAuthenticated = false;
            currentUserEmail = '';
            updateUIForLoggedOut();
            showLoginModal();
        }
    })
    .catch(err => {
        console.error('Logout error:', err);
        // Still update UI even if request fails
        isAuthenticated = false;
        currentUserEmail = '';
        updateUIForLoggedOut();
        showLoginModal();
    });
}

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close profile menu when clicking outside
document.addEventListener('click', (e) => {
    const profileSection = document.getElementById('profile-section');
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    
    if (profileSection && !profileSection.contains(e.target)) {
        profileMenu.style.display = 'none';
    }
});

// Image mapping from script.js
const imagesMap = {
    'Chapati': 'images/chapti.jpg',
    'Rice': 'images/rice.jpg',
    'Ndengu': 'images/ndengu.jpg',
    'Beef': 'images/beef.jpg',
    'Beans': 'images/beans.jpg',
    'Tea': 'images/coffee.jpg',
    'Coffee': 'images/kahawa.jpg',
    'Cabbage': 'images/cabbage.jpg',
    'Ugali': 'images/ugali.jpg',
    'Sukuma Wiki': 'images/sukuma-wiki.jpg',
    'Mandazi': 'images/mandazi.jpg',
    'Pilau': 'images/pilau.jpg',
    'Fries': 'images/fries.jpg'
};

// Hardcoded foods (same as script.js)
const FOODS = [
    { id: 1, name: 'Chapati', price: 30 },
    { id: 2, name: 'Rice', price: 50 },
    { id: 3, name: 'Ndengu', price: 40 },
    { id: 4, name: 'Beef', price: 150 },
    { id: 5, name: 'Beans', price: 60 },
    { id: 6, name: 'Tea', price: 30 },
    { id: 7, name: 'Coffee', price: 50 },
    { id: 8, name: 'Cabbage', price: 50 },
    { id: 9, name: 'Ugali', price: 40 },
    { id: 10, name: 'Sukuma Wiki', price: 50 },
    { id: 11, name: 'Mandazi', price: 20 },
    { id: 12, name: 'Pilau', price: 80 },
    { id: 13, name: 'Fries', price: 50 }
];

const MAX_UNITS_PER_FOOD = 30; // Each food has max 30 units

// ===== STOCKS SECTION =====
function loadStocks() {
    if (!isAuthenticated) {
        return;
    }
    
    console.log('Loading stocks from database...');
    fetch('/api/stocks')
        .then(res => {
            console.log('Stocks response status:', res.status);
            if (res.status === 401) {
                // Unauthorized - redirect to login
                isAuthenticated = false;
                updateUIForLoggedOut();
                showLoginModal();
                throw new Error('Unauthorized');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            console.log('Stocks data:', data);
            displayStocks(data.foods);
        })
        .catch(err => {
            console.error('Error loading stocks:', err);
            // Fallback: display with 0 units ordered
            const foodsWithZero = FOODS.map(f => ({
                ...f,
                units_completed: 0,
                units_pending: 0
            }));
            displayStocks(foodsWithZero);
        });
}

function displayStocks(foods) {
    const tbody = document.getElementById('stocks-body');
    
    if (!foods || foods.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:20px;color:#666;">
                    No foods available.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = foods.map((food, idx) => {
        // Get units from orders - both completed and pending subtract from available stock
        const completedUnits = food.units_completed || 0; // Units from completed orders
        const pendingUnits = food.units_pending || 0; // Units from pending orders (reserved)
        const adjustedUnits = food.units_adjusted || 0; // Positive = added stock, Negative = removed stock
        
        // Total units used = completed + pending (both subtract from available)
        const totalUnits = completedUnits + pendingUnits;
        
        // Total capacity includes adjustments: base capacity + adjustments
        const totalCapacity = MAX_UNITS_PER_FOOD + adjustedUnits;
        
        // Remaining = total capacity - units used (both completed and pending count as used)
        // When order moves from pending to completed, totalUnits stays same, so available stays same
        const remainingUnits = totalCapacity - totalUnits;
        const usedPercentage = totalCapacity > 0 ? (totalUnits / totalCapacity) * 100 : 0;

        // Stock color coding
        let stockColor = '#10b981';
        let stockBg = '#dcfce7';
        if (remainingUnits < 10) {
            stockColor = '#dc2626';
            stockBg = '#fee2e2';
        } else if (remainingUnits < 20) {
            stockColor = '#f59e0b';
            stockBg = '#fef3c7';
        }

        // Get image URL
        const imageUrl = imagesMap[food.name] || 'images/placeholder.jpg';

        return `
            <tr data-food-id="${food.id}" style="background:${idx % 2 === 0 ? '#ffffff' : '#f9f9f9'};">
                <!-- Image Column -->
                <td data-label="Image" style="padding:10px;text-align:center;">
                    <img src="${imageUrl}" alt="${food.name}" 
                         style="width:55px;height:55px;object-fit:cover;border-radius:8px;border:2px solid #ddd;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                </td>
                
                <!-- Food Name -->
                <td data-label="Food Item" style="padding:12px;">
                    <strong style="font-size:1rem;color:#1f2937;">${food.name}</strong>
                </td>
                
                <!-- Price -->
                <td data-label="Price (Ksh)" style="padding:12px;text-align:center;">
                    <div style="background:#e0f2fe;color:#0369a1;padding:8px 12px;border-radius:6px;font-weight:700;font-size:1.05rem;display:inline-block;">
                        Ksh ${food.price}
                    </div>
                </td>
                
                <!-- Completed Units -->
                <td data-label="Completed ✅" style="padding:12px;text-align:center;">
                    <span style="background:#dcfce7;color:#166534;padding:8px 12px;border-radius:6px;font-weight:700;display:inline-block;font-size:0.95rem;">
                        ${completedUnits}
                    </span>
                </td>
                
                <!-- Pending Units -->
                <td data-label="Pending ⏳" style="padding:12px;text-align:center;">
                    <span style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-weight:700;display:inline-block;font-size:0.95rem;">
                        ${pendingUnits}
                    </span>
                </td>
                
                <!-- Total / Remaining with Progress Bar -->
                <td data-label="Total / Remaining" style="padding:12px;text-align:center;min-width:140px;">
                    <div style="margin-bottom:8px;">
                        <span style="background:${stockBg};color:${stockColor};padding:8px 14px;border-radius:6px;font-weight:700;display:inline-block;font-size:0.95rem;">
                            ${totalUnits}/${totalCapacity}
                        </span>
                    </div>
                    <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;width:100%;margin-bottom:4px;">
                        <div style="background:${usedPercentage > 66.67 ? '#ef4444' : usedPercentage > 33.33 ? '#f59e0b' : '#10b981'};height:100%;width:${Math.min(100, Math.max(0, usedPercentage))}%;transition:width 0.3s ease;"></div>
                    </div>
                    <small style="color:#666;font-size:0.8rem;display:block;font-weight:600;">${remainingUnits} available</small>
                </td>
                
                <!-- Adjust Units Input Box -->
                <td data-label="Adjust Units" style="padding:12px;text-align:center;">
                    <div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;">
                        <button onclick="adjustUnits('${food.id}', -1)" title="Decrease" 
                                style="background:#ef4444;color:white;border:none;width:32px;height:32px;border-radius:6px;cursor:pointer;font-weight:700;font-size:1.1rem;transition:all 0.2s;">
                            −
                        </button>
                        <input type="number" id="units-input-${food.id}" value="0" min="-30" max="30" 
                               placeholder="0"
                               style="width:50px;padding:6px;border:2px solid #ddd;border-radius:6px;text-align:center;font-weight:600;font-size:0.95rem;">
                        <button onclick="adjustUnits('${food.id}', 1)" title="Increase"
                                style="background:#10b981;color:white;border:none;width:32px;height:32px;border-radius:6px;cursor:pointer;font-weight:700;font-size:1.1rem;transition:all 0.2s;">
                            +
                        </button>
                    </div>
                </td>
                
                <!-- Save Button -->
                <td data-label="Action" style="padding:12px;text-align:center;">
                    <button onclick="submitAdjustment('${food.name}', ${food.id})" 
                            style="padding:8px 14px;background:#007bff;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem;white-space:nowrap;transition:all 0.2s;">
                        <i class="fas fa-save"></i> Save
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function adjustUnits(foodId, change) {
    const input = document.getElementById(`units-input-${foodId}`);
    let currentValue = parseInt(input.value) || 0;
    let newValue = currentValue + change;
    
    if (newValue < -30) newValue = -30;
    if (newValue > 30) newValue = 30;
    
    input.value = newValue;
}

function submitAdjustment(foodName, foodId) {
    if (!isAuthenticated) {
        alert('⚠️ Please log in to adjust stock');
        showLoginModal();
        return;
    }
    
    const input = document.getElementById(`units-input-${foodId}`);
    const adjustment = parseInt(input.value) || 0;
    
    if (adjustment === 0) {
        alert('⚠️ Please enter a number to adjust');
        return;
    }
    
    fetch('/api/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            food_id: foodId, 
            food_name: foodName, 
            adjustment: adjustment 
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const sign = adjustment > 0 ? '+' : '';
            alert(`✅ ${foodName}: ${sign}${adjustment} units`);
            input.value = 0;
            loadStocks();
        } else {
            alert(`❌ Error: ${data.message}`);
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('❌ Error adjusting stock');
    });
}

// ===== ORDERS SECTION =====
function loadOrders() {
    if (!isAuthenticated) {
        return;
    }
    
    console.log('Fetching /api/orders...');
    fetch('/api/orders')
        .then(res => {
            console.log('Orders response status:', res.status);
            if (res.status === 401) {
                // Unauthorized - redirect to login
                isAuthenticated = false;
                updateUIForLoggedOut();
                showLoginModal();
                throw new Error('Unauthorized');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            console.log('Orders data:', data);
            displayOrders(data.orders);
        })
        .catch(err => {
            console.error('Error loading orders:', err);
            const ordersList = document.getElementById('orders-list');
            if (ordersList) {
                ordersList.innerHTML = `
                    <div style="text-align:center;color:red;padding:20px;">
                        ❌ Error: ${err.message}
                    </div>
                `;
            }
        });
}

function displayOrders(orders) {
    const list = document.getElementById('orders-list');
    if (!list) return;
    
    if (!orders || orders.length === 0) {
        list.innerHTML = `
            <div style="text-align:center;padding:20px;color:#666;">
                No orders yet.
            </div>
        `;
        return;
    }
    
    const itemsHtml = orders.map((order, idx) => {
        let itemsHtml = '-';
        if (order.items && order.items.length > 0) {
            itemsHtml = order.items.map(item => 
                `${item.name} x${item.quantity}`
            ).join(', ');
        }

        const statusBg = order.status === 'completed' ? '#dcfce7' : 
                        order.status === 'cancelled' ? '#fee2e2' : '#fef3c7';
        const statusColor = order.status === 'completed' ? '#166534' : 
                           order.status === 'cancelled' ? '#991b1b' : '#92400e';
        const statusLabel = order.status === 'completed' ? '✅ Paid' : 
                           order.status === 'cancelled' ? '❌ Cancelled' : '⏳ Pending';

        return `
            <li class="order-card" data-order-id="${order.id}" style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,0.06); list-style: decimal; list-style-position: inside;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                    <div style="font-weight:700;color:#111827;">#${order.id}</div>
                    <div style="background:${statusBg};color:${statusColor};padding:6px 10px;border-radius:999px;font-weight:600;font-size:0.85rem;">
                        ${statusLabel}
                    </div>
                </div>
                <div style="margin-top:8px;color:#374151;font-weight:600;">${order.reference_name || '-'}</div>
                <div style="margin-top:4px;color:#6b7280;font-size:0.9rem;">Phone: ${order.phone || '-'}</div>
                <div style="margin-top:6px;color:#374151;font-size:0.95rem;">Items: ${itemsHtml}</div>
                <div style="margin-top:6px;color:#111827;font-weight:700;">Amount: Ksh ${order.amount}</div>
                <div style="margin-top:4px;color:#6b7280;font-size:0.9rem;">Txn: ${order.mpesa_receipt || '-'}</div>
                <div style="margin-top:4px;color:#6b7280;font-size:0.85rem;">Date: ${formatDate(order.created_at)}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                    ${order.status !== 'completed' ? `
                        <button onclick="markOrderAsDone(${order.id})" 
                                style="padding:8px 12px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;transition:all 0.2s;">
                            <i class="fas fa-check"></i> Done
                        </button>
                    ` : ''}
                    <button onclick="removeOrder(${order.id})" 
                            style="padding:8px 12px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;transition:all 0.2s;">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </li>
        `;
    }).join('');

    list.innerHTML = `
        <ol style="padding-left:0; margin:0;">
            ${itemsHtml}
        </ol>
    `;
}

function markOrderAsDone(orderId) {
    if (!isAuthenticated) {
        alert('⚠️ Please log in to update orders');
        showLoginModal();
        return;
    }
    
    if (!confirm(`Mark order #${orderId} as completed?`)) {
        return;
    }
    
    fetch('/api/update-order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            order_id: orderId,
            status: 'completed'
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(`✅ Order #${orderId} marked as completed`);
            loadOrders();
            loadStocks(); // Refresh stocks to update completed units
        } else {
            alert(`❌ Error: ${data.message}`);
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('❌ Error updating order status');
    });
}

function removeOrder(orderId) {
    if (!isAuthenticated) {
        alert('⚠️ Please log in to delete orders');
        showLoginModal();
        return;
    }
    
    if (!confirm(`Are you sure you want to delete order #${orderId}? This action cannot be undone.`)) {
        return;
    }
    
    fetch('/api/delete-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            order_id: orderId
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(`✅ Order #${orderId} deleted`);
            loadOrders();
            loadStocks(); // Refresh stocks to update counts
        } else {
            alert(`❌ Error: ${data.message}`);
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('❌ Error deleting order');
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}