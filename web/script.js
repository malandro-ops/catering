const CART_KEY = 'cart';
const ORDERS_KEY = 'orders';

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

let cart = [];
let originalCheckoutHTML = null;

/*load/save cart*/
function normalizeCart(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') return Object.values(parsed);
  return [];
}

function loadCartFromStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    cart = normalizeCart(parsed).map(item => ({
      name: item.name,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0)
    }));
  } catch (e) {
    cart = [];
  }
  return cart;
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

/* Add item to cart*/
function addToCart(name, price) {
  loadCartFromStorage(); 
  const existing = cart.find(i => i.name === name);
  if (existing) {
    existing.quantity = (existing.quantity || 0) + 1;
  } else {
    cart.push({ name, price: Number(price), quantity: 1 });
  }
  saveCart();
  updateCartCount();
}

/* Update badge count*/
function updateCartCount() {
  const stored = normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'));
  const count = stored.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const el = document.getElementById('cart-count') || document.querySelector('.cart-count');
  if (el) el.textContent = count;
}

/* Render cart page items */
function displayCartItems() {
  loadCartFromStorage();

  const container = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  if (!container) return;

  container.innerHTML = '';

  if (!cart || cart.length === 0) {
    if (emptyEl) {
      emptyEl.style.display = 'block';
    } else {
      container.innerHTML = '<p>Your cart is empty.</p>';
    }
    updateCartCount();
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  // visual container 
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';

  let total = 0;

  cart.forEach((item, idx) => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.background = '#fff';
    row.style.padding = '12px';
    row.style.borderRadius = '12px';
    row.style.boxShadow = '0 6px 18px rgba(240, 233, 233, 0.95)';

    // left: thumb + info
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '12px';
    left.style.flex = '1';
    left.style.borderRadius = '12px';

    const img = document.createElement('img');
    img.src = imagesMap[item.name] || 'images/placeholder.png';
    img.alt = item.name;
    img.style.width = '72px';
    img.style.height = '72px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '12px';

    const info = document.createElement('div');
    info.style.textAlign = 'left';
    info.style.flex = '1';

    const title = document.createElement('h3');
    title.textContent = `${item.name} ×${item.quantity}`;
    title.style.margin = '0';
    title.style.fontSize = '1.18rem';
    title.style.fontWeight = '700';

    const sub = document.createElement('p');
    sub.textContent = `Ksh ${item.price} each — Subtotal: Ksh ${itemTotal}`;
    sub.style.margin = '4px 0 0 0';
    sub.style.color = '#4b5563';

    info.appendChild(title);
    info.appendChild(sub);

    left.appendChild(img);
    left.appendChild(info);

    // actions
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.alignItems = 'center';

    const dec = document.createElement('button');
    dec.textContent = '−';
    dec.onclick = () => { decreaseQuantity(idx); };
    dec.style.padding = '8px 10px';
    dec.style.borderRadius = '8px';
    dec.style.border = '1px solid #e5e7eb';
    dec.style.background = '#f3f4f6';
    dec.style.outline = 'none';
    dec.style.cursor = 'pointer';

    const inc = document.createElement('button');
    inc.textContent = '+';
    inc.onclick = () => { increaseQuantity(idx); };
    inc.style.padding = '8px 10px';
    inc.style.borderRadius = '8px';
    inc.style.border = 'none';
    inc.style.background = '#148f41ff';
    inc.style.color = '#fff';
    inc.style.outline = 'none';
    inc.style.cursor = 'pointer';

    const rem = document.createElement('button');
    rem.textContent = 'Remove';
    rem.onclick = () => { removeFromCart(idx); };
    rem.style.padding = '8px 10px';
    rem.style.borderRadius = '8px';
    rem.style.border = 'none';
    rem.style.background = '#cf1d1dff';
    rem.style.color = '#fff';            
    rem.style.outline = 'none';
    rem.style.cursor = 'pointer';

    actions.appendChild(dec);
    actions.appendChild(inc);
    actions.appendChild(rem);

    row.appendChild(left);
    row.appendChild(actions);

    container.appendChild(row);
  });

  const totalDiv = document.createElement('div');
  totalDiv.className = 'cart-total';
  totalDiv.style.textAlign = 'right';
  totalDiv.style.fontSize = '1.15rem';
  totalDiv.style.fontWeight = '700';
  totalDiv.textContent = `Total: Ksh ${total}`;
  container.appendChild(totalDiv);

  updateCartCount();
}


function increaseQuantity(index) {
  loadCartFromStorage();
  if (!cart[index]) return;
  cart[index].quantity = Number(cart[index].quantity || 0) + 1;
  saveCart();
  displayCartItems();
  updateCartCount();
}

function decreaseQuantity(index) {
  loadCartFromStorage();
  if (!cart[index]) return;
  if (cart[index].quantity > 1) {
    cart[index].quantity -= 1;
  } else {
    cart.splice(index, 1);
  }
  saveCart();
  displayCartItems();
  updateCartCount();
}

function removeFromCart(index) {
  loadCartFromStorage();
  cart.splice(index, 1);
  saveCart();
  displayCartItems();
  updateCartCount();
}

/*Payment*/

function checkout() {
  loadCartFromStorage();
  
  // Check if user is logged in
  if (!userIsLoggedIn) {
    // Show login modal instead of checkout
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.style.display = 'flex';
    return;
  }

  // User is logged in, show checkout form
  if (!document.getElementById('checkout-modal')) return;
  if (!cart || cart.length === 0) {
    alert('Your cart is empty. Add items before checkout.');
    return;
  }
  const modal = document.getElementById('checkout-modal');
  if (originalCheckoutHTML) {
    const content = modal.querySelector('.checkout-content');
    content.innerHTML = originalCheckoutHTML;
  }
  modal.style.display = 'flex';
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (!modal) return;
  if (originalCheckoutHTML) {
    const content = modal.querySelector('.checkout-content');
    content.innerHTML = originalCheckoutHTML;
  }
  modal.style.display = 'none';
}

/* 1. MODIFIED SUBMIT FUNCTION */
function submitCheckout(e) {
  e.preventDefault();
  loadCartFromStorage();

  const referenceEl = document.getElementById('reference');
  const phoneEl = document.getElementById('phone');

  // Basic Validation
  if (!referenceEl || !phoneEl) { alert('Form error'); return; }
  
  const reference = referenceEl.value.trim();
  const phone = phoneEl.value.trim();
  
  // 1. Clean Phone Number (Remove spaces, ensure digits)
  const phoneDigits = phone.replace(/\D/g, ''); 

  if (!reference) { alert('Enter a name'); return; }
  if (phoneDigits.length < 10) { alert('Invalid Phone Number'); return; }

  // 2. Calculate Total
  const total = cart.reduce((s, it) => s + (it.price * it.quantity), 0);

  // 3. Show "Confirm" Screen inside the Modal
  const content = document.querySelector('.checkout-content');
  if (!content) return;

  content.innerHTML = `
    <h2 style="text-align:center;color:#16a34a;">Confirm Payment</h2>
    <p style="text-align:center;">
        Order Total: <strong>Ksh ${total}</strong><br>
        M-PESA Number: <strong>${phoneDigits}</strong>
    </p>
    
    <div style="display:flex;gap:12px;justify-content:center;margin-top:15px;">
      <button id="proceed-btn" style="background:#16a34a;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;">
        Pay Now (STK Push)
      </button>
      
      <button onclick="closeCheckoutModal()" style="background:#ef4444;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;">
        Cancel
      </button>
    </div>
  `;

  // Add Listener to the new "Pay Now" button
  document.getElementById('proceed-btn').addEventListener('click', function() {
      sendStkToBackend(phoneDigits, total, reference);
  });
}

function formatPhone(digits) {
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{2})/, '$1 $2 $3 $4');
  return digits;
}

function simulateStkPush(orderId) {
  const content = document.querySelector('.checkout-content');
  if (!content) return;
  content.innerHTML = `
    <h2 style="text-align:center;color:#16a34a;">Sending STK Push...</h2>
    <p style="text-align:center;color:#555;">Please confirm on your phone to complete payment.</p>
  `;

  setTimeout(() => {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.status = 'paid';
      order.paidAt = new Date().toISOString();
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }

    // clear cart on success
    cart = [];
    saveCart();

    content.innerHTML = `
      <h2 style="text-align:center;color:#16a34a;">Payment Successful</h2>
      <p style="text-align:center;color:#333;">Thank you, <strong>${order ? sanitize(order.reference) : ''}</strong>! Your payment of <strong>Ksh ${order ? order.total : ''}</strong> was successful.</p>
      <div style="text-align:center;margin-top:12px;">
        <button id="close-success" style="background:#16a34a;color:#fff;border:none;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:600;">Close</button>
      </div>
    `;

    document.getElementById('close-success').addEventListener('click', () => {
      closeCheckoutModal();
      updateCartCount();
      displayCartItems();
    });

    updateCartCount();
    displayCartItems();
  }, 1400);
}

function sanitize(str) {
  return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

/* 2. NEW FUNCTION: TALK TO PYTHON */
function sendStkToBackend(phone, amount, referenceName) {
    const content = document.querySelector('.checkout-content');
    
    // A. Show "Loading" state
    content.innerHTML = `
        <h2 style="text-align:center;color:#16a34a;">Processing Payment...</h2>
        <div style="text-align:center; margin: 20px;">
            <i class="fas fa-spinner fa-spin" style="font-size:40px; color:#16a34a;"></i>
        </div>
        <p style="text-align:center;">Please wait...</p>
    `;

    // B. Prepare Data for Python (include cart items, total, and reference name)
    const formData = new FormData();
    formData.append('phone', phone);
    formData.append('amount', amount);
    formData.append('items', JSON.stringify(cart));
    formData.append('reference_name', referenceName);

    // C. Send to Python Route '/pay'
    fetch('/pay', {
        method: 'POST',
        body: formData
    })
    .then(response => response.text())
    .then(data => {
        // D. Show STK Sent Message (waiting for callback)
        content.innerHTML = `
            <h2 style="text-align:center;color:#16a34a;">Check Your Phone! 📲</h2>
            <p style="text-align:center; font-size: 1.1rem; margin: 15px 0;">
                We have sent an M-PESA request to <strong>${phone}</strong> for <strong>Ksh ${amount}</strong>.
            </p>
            <p style="text-align:center; color:#555;">
                Enter your M-PESA PIN to complete the transaction.
            </p>
            
            <div style="text-align:center; margin: 20px;">
                <i class="fas fa-spinner fa-spin" style="font-size:30px; color:#16a34a;"></i>
            </div>
            <p style="text-align:center; color:#666; font-size:0.9rem;">
                Waiting for payment confirmation...
            </p>
        `;

        // E. Poll for payment status every 3 seconds (max 5 minutes)
        pollPaymentStatus(phone, amount);
    })
    .catch(error => {
        content.innerHTML = `
            <h2 style="color:red;text-align:center;">Connection Failed</h2>
            <p style="text-align:center;">Could not reach the server.</p>
            <div style="text-align:center;margin-top:12px;">
              <button onclick="closeCheckoutModal()" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;">Close</button>
            </div>
        `;
        console.error('Error:', error);
    });
}

/* NEW: POLL FOR PAYMENT STATUS (updated to handle cancelled state) */
function pollPaymentStatus(phone, amount) {
  const content = document.querySelector('.checkout-content');
  let pollCount = 0;
  const maxPolls = 100; // ~5 minutes

  const pollInterval = setInterval(() => {
    pollCount++;

    fetch('/check-payment-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone })
    })
    .then(res => {
      console.log('check-payment-status HTTP:', res.status);
      
      // Handle non-200 responses
      if (res.status === 403) {
        console.warn('403 Forbidden — session expired or check failed');
        // still try to parse JSON
        return res.json().then(data => ({ ...data, httpStatus: 403 }));
      }
      if (!res.ok) {
        console.warn(`HTTP ${res.status}`);
        return res.json().then(data => ({ ...data, httpStatus: res.status }));
      }
      return res.json().then(data => ({ ...data, httpStatus: 200 }));
    })
    .then(data => {
      console.log('Payment status response:', data);

      // SUCCESS: payment went through
      if (data.paid === true || data.status === 'completed') {
        clearInterval(pollInterval);
        const receipt = data.order && data.order.mpesa_receipt ? ` (Receipt: ${data.order.mpesa_receipt})` : '';
        content.innerHTML = `
          <h2 style="text-align:center;color:#16a34a;">✅ Payment Successful!</h2>
          <p style="text-align:center; font-size: 1.05rem; margin: 12px 0;">
            Thank you — payment of <strong>Ksh ${amount}</strong> confirmed.${receipt}
          </p>
          <p style="text-align:center; color:#555;">Your order has been placed.</p>
          <div style="text-align:center;margin-top:12px;">
            <button id="close-success-btn" style="padding:10px 20px;background:#16a34a;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Close</button>
          </div>
        `;
        document.getElementById('close-success-btn').addEventListener('click', () => {
          finishOrder();
        });
        return;
      }

      // CANCELLED: user rejected payment
      if (data.status === 'cancelled') {
        clearInterval(pollInterval);
        content.innerHTML = `
          <h2 style="text-align:center;color:#ef4444;">❌ Payment Cancelled</h2>
          <p style="text-align:center; font-size: 1rem; margin: 12px 0;">
            You cancelled the payment. Please try again if you wish to proceed.
          </p>
          <div style="text-align:center;margin-top:12px;">
            <button onclick="closeCheckoutModal()" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;">Close</button>
          </div>
        `;
        return;
      }

      // FAILED: other failure
      if (data.status === 'failed') {
        clearInterval(pollInterval);
        content.innerHTML = `
          <h2 style="text-align:center;color:#ef4444;">❌ Payment Failed</h2>
          <p style="text-align:center;">The payment could not be processed. Please try again.</p>
          <div style="text-align:center;margin-top:12px;">
            <button onclick="closeCheckoutModal()" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;">Close</button>
          </div>
        `;
        return;
      }

      // TIMEOUT: no response after 5 minutes
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        content.innerHTML = `
          <h2 style="color:orange;text-align:center;">⏱️ Payment Timeout</h2>
          <p style="text-align:center;">No confirmation received within 5 minutes.</p>
          <p style="text-align:center; color:#666; font-size:0.9rem;">Please check your phone or try again.</p>
          <div style="text-align:center;margin-top:12px;">
            <button onclick="closeCheckoutModal()" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;">Close</button>
          </div>
        `;
        return;
      }

      // Still waiting (no status yet) — continue polling
      console.log('Still waiting for payment confirmation...');
    })
    .catch(err => {
      console.error('Poll error:', err);
      // Continue polling — don't break on network errors
    });

  }, 3000); // Poll every 3 seconds
}

/* 3. CLEANUP FUNCTION */
function finishOrder() {
    // Clear the cart since they paid
    cart = [];
    saveCart();
    updateCartCount();
    displayCartItems();
    closeCheckoutModal();
}

/* Load and display food availability counts */
function loadFoodAvailability() {
  fetch('/api/food-availability')
    .then(res => res.json())
    .then(data => {
      if (data.foods && Array.isArray(data.foods)) {
        data.foods.forEach(food => {
          const card = document.querySelector(`[data-food-name="${food.name}"]`);
          if (card) {
            const stockCountEl = card.querySelector('.stock-count');
            if (stockCountEl) {
              const remaining = food.units_remaining || 0;
              stockCountEl.textContent = `${remaining} left`;
              
              // Color coding based on stock level
              const stockEl = card.querySelector('.food-stock');
              if (stockEl) {
                if (remaining === 0) {
                  stockEl.style.color = '#dc2626';
                  stockCountEl.textContent = 'Out of stock';
                } else if (remaining < 10) {
                  stockEl.style.color = '#f59e0b';
                } else {
                  stockEl.style.color = '#10b981';
                }
              }
            }
          }
        });
      }
    })
    .catch(err => {
      console.error('Error loading food availability:', err);
      // Set all to "N/A" on error
      document.querySelectorAll('.stock-count').forEach(el => {
        el.textContent = 'N/A';
        el.parentElement.style.color = '#9ca3af';
      });
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  // cache original modal content
  const content = document.querySelector('.checkout-content');
  if (content && !originalCheckoutHTML) originalCheckoutHTML = content.innerHTML;

  updateCartCount();
  displayCartItems();
  loadFoodAvailability(); // Load food availability counts
  
  // Refresh food counts every 30 seconds
  setInterval(loadFoodAvailability, 30000);

  const checkoutBtn = document.querySelector('.checkout-button');
  if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);

  const form = document.getElementById('checkout-form');
  if (form && !form.hasAttribute('onsubmit')) {
    form.addEventListener('submit', submitCheckout);
  }
});
