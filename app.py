from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import sqlite3
import requests
import base64
from datetime import datetime
import os
from dotenv import load_dotenv

#load the API keys from .env file.
load_dotenv()
# 1.'web' folder
app = Flask(__name__, template_folder='web', static_folder='web', static_url_path='')
app.secret_key = "must_catering_secret_key"

# 2. M-PESA API Keys
CONSUMER_KEY = os.getenv("CONSUMER_KEY")
CONSUMER_SECRET = os.getenv("CONSUMER_SECRET")
PASSKEY = os.getenv("PASSKEY")
BUSINESS_SHORTCODE = os.getenv("BUSINESS_SHORTCODE")

DB_PATH = os.path.join(os.path.dirname(__file__), 'catering.db')

# --- DATABASE SETUP ---
# table to track pending STK requests (so callback can match phone)
def init_db():
    """Initialize database tables"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Create users table (updated to use email)
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            email TEXT UNIQUE,
            password TEXT,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP
        )
    ''')
    
    # Migrate old username column to email if it exists
    try:
        c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
        table_info = c.fetchone()
        if table_info:
            # Check existing columns
            c.execute("PRAGMA table_info(users)")
            columns = [col[1] for col in c.fetchall()]
            
            # Add email column if it doesn't exist
            if 'email' not in columns:
                c.execute('ALTER TABLE users ADD COLUMN email TEXT')
                c.execute('UPDATE users SET email = username WHERE email IS NULL AND username IS NOT NULL')
            
            # Add is_admin column if it doesn't exist
            if 'is_admin' not in columns:
                c.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0')
            
            # Add created_at if it doesn't exist
            if 'created_at' not in columns:
                c.execute('ALTER TABLE users ADD COLUMN created_at TIMESTAMP')
    except Exception as e:
        print(f"Migration note: {e}")
    
    # Create stk_requests table
    c.execute('''
        CREATE TABLE IF NOT EXISTS stk_requests (
            id INTEGER PRIMARY KEY,
            phone TEXT,
            amount REAL,
            created_at TIMESTAMP
        )
    ''')
    
    # Create transactions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            phone TEXT,
            amount REAL,
            status TEXT,
            mpesa_receipt TEXT,
            created_at TIMESTAMP
        )
    ''')
    
    # Create orders table 
    c.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY,
            reference_name TEXT,
            phone TEXT,
            items TEXT,
            amount REAL,
            status TEXT DEFAULT 'pending',
            mpesa_receipt TEXT,
            created_at TIMESTAMP
        )
    ''')
    
    # Create stock_adjustments table
    c.execute('''
        CREATE TABLE IF NOT EXISTS stock_adjustments (
            id INTEGER PRIMARY KEY,
            food_id INTEGER,
            food_name TEXT,
            adjustment INTEGER,
            created_at TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized")

# --- M-PESA HELPER ---
def lipa_na_mpesa(phone, amount):
    # A. Get Access Token
    auth_url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    try:
        auth_response = requests.get(auth_url, auth=(CONSUMER_KEY, CONSUMER_SECRET))
        access_token = auth_response.json().get('access_token')
    except Exception as e:
        return {"error": f"Connection Error: {str(e)}"}

    if not access_token:
        return {"error": "Invalid Keys - Could not get Token"}

    # B. Prepare Password
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    password_str = BUSINESS_SHORTCODE + PASSKEY + timestamp
    password_b64 = base64.b64encode(password_str.encode()).decode('utf-8')

    # C. Send STK Push
    api_url = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
    headers = { "Authorization": f"Bearer {access_token}" }
    payload = {
        "BusinessShortCode": BUSINESS_SHORTCODE,
        "Password": password_b64,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount,
        "PartyA": phone,
        "PartyB": BUSINESS_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": "https://electrotactic-valrie-perverse.ngrok-free.dev/callback",
        "AccountReference": "MUST Catering",
        "TransactionDesc": "Food Payment"
    }
    
    response = requests.post(api_url, json=payload, headers=headers)
    return response.json()

def digits_only(s):
    return ''.join(ch for ch in (s or '') if ch.isdigit())

@app.route('/')
def home():
    init_db()
    is_logged_in = 'user' in session
    user_email = session.get('user', '')
    return render_template('mustcatering.html', is_logged_in=is_logged_in, user_email=user_email)

@app.route('/mustcatering.html')
def home_redirect():
    return redirect(url_for('home'))

@app.route('/cart.html')
def cart_page():
    # if user is admin/if not redirect to stocks page
    if 'user' in session and session.get('is_admin', False):
        return redirect(url_for('stocks_page'))
    
    # Pass login status and user email to HTML
    is_logged_in = 'user' in session
    user_email = session.get('user', '')
    return render_template('cart.html', is_logged_in=is_logged_in, user_email=user_email)

@app.route('/stocks.html')
def stocks_page():
    # if user is logged in and is admin
    if 'user' not in session or not session.get('is_admin', False):
        flash('Access denied. Admin login required.', 'error')
        return redirect(url_for('cart_page'))
    
    is_logged_in = 'user' in session
    user_email = session.get('user', '')
    return render_template('stocks.html', is_logged_in=is_logged_in, user_email=user_email)

@app.route('/login', methods=['POST'])
def login():
    email = request.form.get('email', '').strip().lower()
    password = request.form.get('password', '').strip()
    is_admin_login = request.form.get('is_admin', '').strip() == 'on'  # Checkbox value

    if not email or not password:
        flash('Please enter both email and password', 'error')
        return redirect(url_for('cart_page'))

    # Basic email validation
    if '@' not in email or '.' not in email.split('@')[1]:
        flash('Please enter a valid email address', 'error')
        return redirect(url_for('cart_page'))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # if user exists and get admin status
    c.execute("SELECT email, is_admin FROM users WHERE (email=? OR username=?) AND password=?", (email, email, password))
    user = c.fetchone()
    
    if user:
        user_email, is_admin = user
        # If trying to login as admin, verify admin status
        if is_admin_login and not is_admin:
            conn.close()
            flash('Access denied. This account is not an admin account.', 'error')
            return redirect(url_for('cart_page'))
        
        session['user'] = user_email
        session['user_email'] = user_email
        session['is_admin'] = bool(is_admin)
        
        conn.close()
        
        if is_admin_login and is_admin:
            flash('Admin login successful!', 'success')
            return redirect(url_for('stocks_page'))
        else:
            flash('Login successful!', 'success')
            return redirect(url_for('cart_page'))
    else:
        conn.close()
        flash('Invalid email or password', 'error')
        return redirect(url_for('cart_page'))

@app.route('/signup', methods=['POST'])
def signup():
    email = request.form.get('email', '').strip().lower()
    password = request.form.get('password', '').strip()
    confirm_password = request.form.get('confirm_password', '').strip()
    is_admin_signup = request.form.get('is_admin', '').strip() == 'on'  # Checkbox value

    if not email or not password:
        flash('Please enter both email and password', 'error')
        return redirect(url_for('cart_page'))

    # Basic email validation
    if '@' not in email or '.' not in email.split('@')[1]:
        flash('Please enter a valid email address', 'error')
        return redirect(url_for('cart_page'))

    # Password validation
    if len(password) < 6:
        flash('Password must be at least 6 characters long', 'error')
        return redirect(url_for('cart_page'))

    if password != confirm_password:
        flash('Passwords do not match', 'error')
        return redirect(url_for('cart_page'))

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Check if email already exists
        c.execute("SELECT email FROM users WHERE email=?", (email,))
        existing_user = c.fetchone()
        
        if existing_user:
            conn.close()
            flash('An account with this email already exists', 'error')
            return redirect(url_for('cart_page'))
        
        # Create new user (admin accounts can only be created by existing admins or manually)
        # For now, regular signup creates regular users only
        is_admin = 1 if is_admin_signup else 0
        
        # Create new user
        c.execute("INSERT INTO users (email, password, is_admin, created_at) VALUES (?, ?, ?, ?)",
                  (email, password, is_admin, datetime.now()))
        conn.commit()
        conn.close()
        
        flash('Account created successfully! Please log in.', 'success')
        return redirect(url_for('cart_page'))
    except sqlite3.IntegrityError:
        flash('An account with this email already exists', 'error')
        return redirect(url_for('cart_page'))
    except Exception as e:
        print(f'Error creating account: {e}')
        flash('An error occurred. Please try again.', 'error')
        return redirect(url_for('cart_page'))

# --- NEW: PAYMENT ROUTE ---
@app.route('/pay', methods=['POST'])
def pay():
    if 'user' not in session:
        return redirect(url_for('cart_page'))
        
    phone = request.form.get('phone')
    amount = request.form.get('amount', '1')
    items = request.form.get('items', '[]')
    reference_name = request.form.get('reference_name', '').strip()
    
    try:
        amount = int(float(amount))
        if amount < 1:
            return "Error: Amount must be at least 1 KES", 400
    except (ValueError, TypeError):
        return "Error: Invalid amount", 400
    
    # Clean phone number
    original_phone = phone  # Store original for STK request tracking
    if phone.startswith('0'):
        phone = '254' + phone[1:]
    elif not phone.startswith('254'):
        phone = '254' + phone
    
    # STORE STK REQUEST (so callback can find the phone later)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''INSERT INTO stk_requests (phone, amount, created_at) VALUES (?, ?, ?)''',
              (phone, amount, datetime.now()))
    
    # SAVE ORDER TO DATABASE (with pending status)
    import json
    c.execute('''
        INSERT INTO orders (reference_name, phone, items, amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (reference_name, phone, items, amount, 'pending', datetime.now()))
    order_id = c.lastrowid
    conn.commit()
    conn.close()
    
    print(f"✅ Order {order_id} saved: {reference_name}, {phone}, Ksh {amount}")
    
    # Trigger STK push
    result = lipa_na_mpesa(phone, amount)
    
    print(f"M-PESA Result: {result}")
    print(f"Amount: {amount}, Phone: {phone}, Items: {items}")
    print(f"STK request stored in DB for matching callback")
    
    if 'ResponseCode' in result and result['ResponseCode'] == '0':
        return f"STK Push Sent! Check your phone for Ksh {amount}."
    else:
        return f"Error: {result.get('errorMessage', 'Unknown error')}", 400

@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('user_email', None)
    session.pop('is_admin', None)
    flash('You have been logged out', 'success')
    return redirect(url_for('home'))

@app.route('/check-payment-status', methods=['POST'])
def check_payment_status():
    """Check if payment has been received via callback - checks orders table"""
    data = request.get_json() or {}
    phone_raw = data.get('phone', '')
    phone_digits = digits_only(phone_raw)

    # Normalize phone number format
    if phone_digits:
        if phone_digits.startswith('0'):
            phone_digits = '254' + phone_digits[1:]
        elif not phone_digits.startswith('254'):
            phone_digits = '254' + phone_digits

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Check orders table for the most recent order with this phone
    order_row = None
    if phone_digits:
        # Try exact match first
        c.execute('''
            SELECT id, reference_name, phone, amount, status, mpesa_receipt, created_at
            FROM orders
            WHERE phone = ?
            ORDER BY created_at DESC
            LIMIT 1
        ''', (phone_digits,))
        order_row = c.fetchone()
        
        # If no exact match, try with last 9 digits
        if not order_row:
            short = phone_digits[-9:]
            c.execute('''
                SELECT id, reference_name, phone, amount, status, mpesa_receipt, created_at
                FROM orders
                WHERE phone LIKE ?
                ORDER BY created_at DESC
                LIMIT 1
            ''', ('%' + short,))
            order_row = c.fetchone()

    # FALLBACK: Get most recent pending order
    if not order_row:
        print(f"No phone match for {phone_digits}. Using most recent order...")
        c.execute('''
            SELECT id, reference_name, phone, amount, status, mpesa_receipt, created_at
            FROM orders
            ORDER BY created_at DESC
            LIMIT 1
        ''')
        order_row = c.fetchone()

    conn.close()

    if order_row:
        order = {
            'id': order_row[0],
            'reference_name': order_row[1],
            'phone': order_row[2],
            'amount': order_row[3],
            'status': order_row[4],
            'mpesa_receipt': order_row[5],
            'created_at': order_row[6]
        }
        print(f"Returning order status: {order['status']} for order {order['id']}")
        
        # Map status to response
        status = order['status']
        paid = (status == 'completed')
        
        return jsonify({
            'paid': paid,
            'status': status,
            'order': order
        })
    
    print(f"No order found for phone {phone_digits}")
    return jsonify({'paid': False, 'status': None})

@app.route('/callback', methods=['POST'])
def mpesa_callback():
    """M-PESA STK callback receiver"""
    try:
        data = request.get_json() or {}
        print("=== M-PESA CALLBACK RECEIVED ===")
        print(f"Raw payload: {data}")
        
        body = data.get('Body', {})
        stk = body.get('stkCallback', {})

        # Normalize result code (handle '0' as string or 0 as int)
        result_code_raw = stk.get('ResultCode', None)
        try:
            result_code = int(result_code_raw) if result_code_raw is not None else None
        except Exception:
            result_code = None

        result_desc = stk.get('ResultDesc', '') or ''
        print(f"ResultCode: {result_code}, ResultDesc: {result_desc}")
        
        # Extract items safely
        callback_metadata = stk.get('CallbackMetadata') or {}
        items = []
        if isinstance(callback_metadata, dict):
            items = callback_metadata.get('Item') or []
        elif isinstance(callback_metadata, list):
            items = callback_metadata

        phone = None
        amount = None
        receipt = None

        for item in items:
            if not isinstance(item, dict):
                continue
            name = item.get('Name')
            value = item.get('Value')
            print(f"  Item: {name} = {value}")
            
            if name == 'PhoneNumber' and value is not None:
                phone = digits_only(str(value))
            elif name == 'Amount' and value is not None:
                try:
                    amount = float(value)
                except Exception:
                    amount = None
            elif name == 'MpesaReceiptNumber' and value is not None:
                receipt = str(value)

        # If phone missing, try to match by recent STK request amount
        if not phone:
            print("Phone missing from callback. Attempting to match by amount from recent STK request...")
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute('''
                SELECT phone FROM stk_requests 
                WHERE amount = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            ''', (amount,))
            result = c.fetchone()
            if result:
                phone = result[0]
                print(f"Matched phone from STK request: {phone}")
            conn.close()

        # Determine status based on ResultCode
        # ResultCode 0 = Success
        # ResultCode 1 = User cancelled or insufficient balance
        # Other codes = Various failures
        if result_code == 0:
            status = 'completed'
        elif result_code is not None and result_code != 0:
            # Check ResultDesc to distinguish between cancelled and failed
            result_desc_lower = result_desc.lower()
            if 'cancel' in result_desc_lower or result_code == 1:
                status = 'cancelled'
            else:
                status = 'failed'
        else:
            # No result code = pending (waiting for callback or user didn't confirm)
            status = 'pending'

        phone_to_store = phone if phone else ''

        print(f"Storing transaction: phone={phone_to_store}, amount={amount}, status={status}, receipt={receipt}")

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # First, try to find order by phone and amount (most reliable)
        order_result = None
        if phone_to_store and amount:
            c.execute('''
                SELECT id, status FROM orders 
                WHERE phone = ? AND amount = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            ''', (phone_to_store, amount))
            order_result = c.fetchone()
        
        # If no match by phone+amount, try matching by amount from recent STK request
        if not order_result and amount:
            c.execute('''
                SELECT o.id, o.status 
                FROM orders o
                JOIN stk_requests s ON o.amount = s.amount
                WHERE s.amount = ? AND o.status = 'pending'
                ORDER BY o.created_at DESC 
                LIMIT 1
            ''', (amount,))
            order_result = c.fetchone()
        
        # If still no match, get most recent pending order
        if not order_result:
            c.execute('''
                SELECT id, status FROM orders 
                WHERE status = 'pending'
                ORDER BY created_at DESC 
                LIMIT 1
            ''')
            order_result = c.fetchone()

        if order_result:
            order_id, existing_status = order_result
            # Update order status
            if existing_status == 'pending' and status in ('completed', 'cancelled', 'failed'):
                c.execute('UPDATE orders SET status = ?, mpesa_receipt = ? WHERE id = ?',
                         (status, receipt or '', order_id))
                print(f"✅ Updated order {order_id}: {existing_status} → {status}")
            else:
                print(f"ℹ️ Order {order_id} already has status: {existing_status}, keeping it")
        else:
            print(f"⚠️ No matching order found for callback - phone: {phone_to_store}, amount: {amount}")
        
        # Also create/update transaction record for tracking
        c.execute('''
            INSERT INTO transactions (phone, amount, status, mpesa_receipt, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (phone_to_store, amount or 0.0, status, receipt or '', datetime.now()))
        print(f"✅ Created transaction record with status: {status}")

        conn.commit()
        conn.close()

        return {'ResultCode': 0, 'ResultDesc': 'Received successfully'}, 200

    except Exception as e:
        print(f'❌ Callback error: {e}')
        import traceback
        traceback.print_exc()
        return {'ResultCode': 1, 'ResultDesc': str(e)}, 500

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """Admin login endpoint for stocks page"""
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'success': False, 'message': 'Please enter both email and password'}), 400

    # Basic email validation
    if '@' not in email or '.' not in email.split('@')[1]:
        return jsonify({'success': False, 'message': 'Please enter a valid email address'}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Get email and is_admin status
    c.execute("SELECT email, is_admin FROM users WHERE (email=? OR username=?) AND password=?", (email, email, password))
    user = c.fetchone()
    conn.close()

    if user:
        user_email, is_admin = user
        # Only allow admin login
        if not is_admin:
            return jsonify({'success': False, 'message': 'Access denied. Admin account required.'}), 403
        
        session['user'] = user_email
        session['user_email'] = user_email
        session['is_admin'] = bool(is_admin)
        return jsonify({'success': True, 'message': 'Admin login successful!', 'email': user_email})
    else:
        return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

@app.route('/api/admin/signup', methods=['POST'])
def admin_signup():
    """Admin signup endpoint for stocks page"""
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    confirm_password = data.get('confirm_password', '').strip()

    if not email or not password:
        return jsonify({'success': False, 'message': 'Please enter both email and password'}), 400

    # Basic email validation
    if '@' not in email or '.' not in email.split('@')[1]:
        return jsonify({'success': False, 'message': 'Please enter a valid email address'}), 400

    # Password validation
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters long'}), 400

    if password != confirm_password:
        return jsonify({'success': False, 'message': 'Passwords do not match'}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Check if email already exists
        c.execute("SELECT email FROM users WHERE email=?", (email,))
        existing_user = c.fetchone()
        
        if existing_user:
            conn.close()
            return jsonify({'success': False, 'message': 'An account with this email already exists'}), 400
        
        # Create new admin user (admin signup creates admin accounts)
        c.execute("INSERT INTO users (email, password, is_admin, created_at) VALUES (?, ?, ?, ?)",
                  (email, password, 1, datetime.now()))
        conn.commit()
        conn.close()
        
        # Auto-login after signup
        session['user'] = email
        session['user_email'] = email
        session['is_admin'] = True
        return jsonify({'success': True, 'message': 'Admin account created successfully!', 'email': email})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'An account with this email already exists'}), 400
    except Exception as e:
        print(f'Error creating account: {e}')
        return jsonify({'success': False, 'message': 'An error occurred. Please try again.'}), 500

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    """Admin logout endpoint"""
    session.pop('user', None)
    session.pop('user_email', None)
    return jsonify({'success': True, 'message': 'Logged out successfully'})

@app.route('/api/admin/check-auth', methods=['GET'])
def check_admin_auth():
    """Check if admin is authenticated"""
    is_logged_in = 'user' in session
    user_email = session.get('user', '')
    is_admin = session.get('is_admin', False)
    return jsonify({'authenticated': is_logged_in, 'email': user_email, 'is_admin': is_admin})

@app.route('/api/food-availability')
def api_food_availability():
    """Return food availability counts for public menu display"""
    foods_menu = [
        {'id': 1, 'name': 'Chapati', 'price': 30},
        {'id': 2, 'name': 'Rice', 'price': 50},
        {'id': 3, 'name': 'Ndengu', 'price': 40},
        {'id': 4, 'name': 'Beef', 'price': 150},
        {'id': 5, 'name': 'Beans', 'price': 60},
        {'id': 6, 'name': 'Tea', 'price': 30},
        {'id': 7, 'name': 'Coffee', 'price': 50},
        {'id': 8, 'name': 'Cabbage', 'price': 50},
        {'id': 9, 'name': 'Ugali', 'price': 40},
        {'id': 10, 'name': 'Sukuma Wiki', 'price': 50},
        {'id': 11, 'name': 'Mandazi', 'price': 20},
        {'id': 12, 'name': 'Pilau', 'price': 80},
        {'id': 13, 'name': 'Fries', 'price': 50}
    ]
    
    MAX_UNITS_PER_FOOD = 30
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    for food in foods_menu:
        # Count completed units
        c.execute('''
            SELECT COALESCE(SUM(json_extract(json_each.value, '$.quantity')), 0)
            FROM orders, json_each(orders.items)
            WHERE json_extract(json_each.value, '$.name') = ? AND orders.status = 'completed'
        ''', (food['name'],))
        food['units_completed'] = int(c.fetchone()[0])
        
        # Count pending units
        c.execute('''
            SELECT COALESCE(SUM(json_extract(json_each.value, '$.quantity')), 0)
            FROM orders, json_each(orders.items)
            WHERE json_extract(json_each.value, '$.name') = ? AND orders.status = 'pending'
        ''', (food['name'],))
        food['units_pending'] = int(c.fetchone()[0])
        
        # Sum adjustments
        c.execute('''
            SELECT COALESCE(SUM(adjustment), 0)
            FROM stock_adjustments
            WHERE food_id = ? OR food_name = ?
        ''', (food['id'], food['name']))
        food['units_adjusted'] = int(c.fetchone()[0])
        
        # Calculate remaining
        total_capacity = MAX_UNITS_PER_FOOD + food['units_adjusted']
        total_used = food['units_completed'] + food['units_pending']
        food['units_remaining'] = max(0, total_capacity - total_used)
    
    conn.close()
    return jsonify({'foods': foods_menu})

@app.route('/api/stocks')
def api_stocks():
    """Return available foods with units ordered breakdown"""
    # Check authentication and admin status
    if 'user' not in session or not session.get('is_admin', False):
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 401
    foods_menu = [
        {'id': 1, 'name': 'Chapati', 'price': 30},
        {'id': 2, 'name': 'Rice', 'price': 50},
        {'id': 3, 'name': 'Ndengu', 'price': 40},
        {'id': 4, 'name': 'Beef', 'price': 150},
        {'id': 5, 'name': 'Beans', 'price': 60},
        {'id': 6, 'name': 'Tea', 'price': 30},
        {'id': 7, 'name': 'Coffee', 'price': 50},
        {'id': 8, 'name': 'Cabbage', 'price': 50},
        {'id': 9, 'name': 'Ugali', 'price': 40},
        {'id': 10, 'name': 'Sukuma Wiki', 'price': 50},
        {'id': 11, 'name': 'Mandazi', 'price': 20},
        {'id': 12, 'name': 'Pilau', 'price': 80},
        {'id': 13, 'name': 'Fries', 'price': 50}
    ]
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    for food in foods_menu:
        # Count completed units - these subtract from available stock
        # Only count orders with status 'completed' (cancelled/failed orders don't count)
        c.execute('''
            SELECT COALESCE(SUM(json_extract(json_each.value, '$.quantity')), 0)
            FROM orders, json_each(orders.items)
            WHERE json_extract(json_each.value, '$.name') = ? AND orders.status = 'completed'
        ''', (food['name'],))
        food['units_completed'] = int(c.fetchone()[0])
        
        # Count pending units - these also subtract from available stock (reserved)
        # Only count orders with status 'pending' (cancelled/failed orders don't count)
        c.execute('''
            SELECT COALESCE(SUM(json_extract(json_each.value, '$.quantity')), 0)
            FROM orders, json_each(orders.items)
            WHERE json_extract(json_each.value, '$.name') = ? AND orders.status = 'pending'
        ''', (food['name'],))
        food['units_pending'] = int(c.fetchone()[0])
        
        # Sum all adjustments for this food (positive = add stock, negative = remove stock)
        c.execute('''
            SELECT COALESCE(SUM(adjustment), 0)
            FROM stock_adjustments
            WHERE food_id = ? OR food_name = ?
        ''', (food['id'], food['name']))
        food['units_adjusted'] = int(c.fetchone()[0])
        
        # Note: Available units = (MAX_UNITS_PER_FOOD + adjustments) - (completed + pending)
        # Both completed and pending orders subtract from available stock
        # When order moves from pending to completed, total units used stays same
    
    conn.close()
    return jsonify({'foods': foods_menu})

@app.route('/api/orders')
def api_orders():
    """Return orders as JSON"""
    # Check authentication and admin status
    if 'user' not in session or not session.get('is_admin', False):
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 401
    import json
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT id, reference_name, phone, items, amount, status, mpesa_receipt, created_at
        FROM orders
        ORDER BY created_at DESC
    ''')
    rows = c.fetchall()
    conn.close()

    orders = []
    for r in rows:
        orders.append({
            'id': r[0],
            'reference_name': r[1],
            'phone': r[2],
            'items': json.loads(r[3]) if r[3] else [],
            'amount': r[4],
            'status': r[5],
            'mpesa_receipt': r[6],
            'created_at': r[7]
        })
    
    return jsonify({'orders': orders})

@app.route('/save-order', methods=['POST'])
def save_order():
    """Save order to database when user submits checkout"""
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    import json
    data = request.get_json() or {}
    
    reference_name = data.get('reference_name', '').strip()
    phone = data.get('phone', '').strip()
    amount = float(data.get('amount', 0))
    items = data.get('items', [])
    
    if not reference_name or not phone or amount < 1:
        return jsonify({'success': False, 'message': 'Invalid data'}), 400
    
    # Normalize phone
    if phone.startswith('0'):
        phone = '254' + phone[1:]
    elif not phone.startswith('254'):
        phone = '254' + phone
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO orders (reference_name, phone, items, amount, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (reference_name, phone, json.dumps(items), amount, 'pending', datetime.now()))
        conn.commit()
        order_id = c.lastrowid
        conn.close()
        
        print(f"✅ Order {order_id} saved as PENDING: {reference_name}, {phone}, {amount}")
        return jsonify({'success': True, 'order_id': order_id})
    except Exception as e:
        print(f'❌ Error saving order: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/adjust-stock', methods=['POST'])
def adjust_stock():
    """Save stock adjustment to database"""
    # Check authentication and admin status
    if 'user' not in session or not session.get('is_admin', False):
        return jsonify({'success': False, 'message': 'Unauthorized. Admin access required.'}), 401
    data = request.get_json() or {}
    
    food_id = data.get('food_id')
    food_name = data.get('food_name', '').strip()
    adjustment = data.get('adjustment', 0)
    
    try:
        adjustment = int(adjustment)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'Invalid adjustment value'}), 400
    
    if not food_id or not food_name:
        return jsonify({'success': False, 'message': 'Missing food_id or food_name'}), 400
    
    if adjustment == 0:
        return jsonify({'success': False, 'message': 'Adjustment cannot be zero'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO stock_adjustments (food_id, food_name, adjustment, created_at)
            VALUES (?, ?, ?, ?)
        ''', (food_id, food_name, adjustment, datetime.now()))
        conn.commit()
        conn.close()
        
        print(f"✅ Stock adjustment saved: {food_name} (ID: {food_id}), adjustment: {adjustment:+d}")
        return jsonify({'success': True, 'message': f'Stock adjusted: {adjustment:+d} units'})
    except Exception as e:
        print(f'❌ Error adjusting stock: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/update-order-status', methods=['POST'])
def update_order_status():
    """Update order status (e.g., mark as completed)"""
    # Check authentication and admin status
    if 'user' not in session or not session.get('is_admin', False):
        return jsonify({'success': False, 'message': 'Unauthorized. Admin access required.'}), 401
    data = request.get_json() or {}
    order_id = data.get('order_id')
    new_status = data.get('status', '').strip()
    
    if not order_id:
        return jsonify({'success': False, 'message': 'Missing order_id'}), 400
    
    if new_status not in ['pending', 'completed', 'cancelled', 'failed']:
        return jsonify({'success': False, 'message': 'Invalid status'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Check if order exists
        c.execute('SELECT id, status FROM orders WHERE id = ?', (order_id,))
        order = c.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'success': False, 'message': 'Order not found'}), 404
        
        # Update status
        c.execute('UPDATE orders SET status = ? WHERE id = ?', (new_status, order_id))
        conn.commit()
        conn.close()
        
        print(f"✅ Order {order_id} status updated: {order[1]} → {new_status}")
        return jsonify({'success': True, 'message': f'Order status updated to {new_status}'})
    except Exception as e:
        print(f'❌ Error updating order status: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/delete-order', methods=['POST'])
def delete_order():
    """Delete an order from the database"""
    # Check authentication and admin status
    if 'user' not in session or not session.get('is_admin', False):
        return jsonify({'success': False, 'message': 'Unauthorized. Admin access required.'}), 401
    data = request.get_json() or {}
    order_id = data.get('order_id')
    
    if not order_id:
        return jsonify({'success': False, 'message': 'Missing order_id'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Check if order exists
        c.execute('SELECT id FROM orders WHERE id = ?', (order_id,))
        order = c.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'success': False, 'message': 'Order not found'}), 404
        
        # Delete order
        c.execute('DELETE FROM orders WHERE id = ?', (order_id,))
        conn.commit()
        conn.close()
        
        print(f"✅ Order {order_id} deleted")
        return jsonify({'success': True, 'message': 'Order deleted successfully'})
    except Exception as e:
        print(f'❌ Error deleting order: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

# Call init_db at startup
if __name__ == '__main__':
    init_db()
    app.run(debug=True)
