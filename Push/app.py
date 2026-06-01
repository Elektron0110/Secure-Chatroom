from flask import Flask, request, jsonify, render_template, send_from_directory
import json
import os
import threading
import base64
from pywebpush import webpush

app = Flask(__name__, static_folder='static')

# --- Генерация VAPID-ключей ---
vapid_file = 'vapid_keys.json'

if not os.path.exists(vapid_file):
    print("Генерация VAPID-ключей...")
    from py_vapid import Vapid
    vapid = Vapid()
    vapid.generate_keys()

    # Извлекаем координаты X и Y и формируем 65-байтовый ключ (сжатый ECDSA)
    pub_nums = vapid.public_key.public_numbers()
    x = pub_nums.x
    y = pub_nums.y
    pub_key_bytes = b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")
    public_key = base64.urlsafe_b64encode(pub_key_bytes).decode('utf8')

    # Приватный ключ — строка Base64 (как в vapid_keys.json)
    private_bytes = vapid.private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    private_key = base64.urlsafe_b64encode(private_bytes).decode('utf8')

    with open(vapid_file, 'w') as f:
        json.dump({"public_key": public_key, "private_key": private_key}, f)
else:
    with open(vapid_file, 'r') as f:
        keys = json.load(f)
        public_key = keys["public_key"]
        private_key = keys["private_key"]

# Импортируем здесь, чтобы не было конфликта при первом запуске
from cryptography.hazmat.primitives import serialization

vapid_claims = {"sub": "mailto:test@example.com"}

# Хранилище подписок {uid: subscription}
subscriptions = {}

def generate_uid():
    """Генерирует уникальный ID для нового пользователя."""
    import uuid
    return str(uuid.uuid4())

@app.route('/')
def index():
    """Главная страница: отдаёт HTML и устанавливает UID в cookie."""
    user_id = request.cookies.get('uid')
    if not user_id:
        user_id = generate_uid()

    from flask import make_response
    resp = make_response(render_template('index.html', vapid_public_key=public_key))
    resp.set_cookie('uid', user_id)
    return resp

@app.route('/subscribe', methods=['POST'])
def subscribe_user():
    """Сохраняет подписку пользователя по его UID из cookie."""
    data = request.json
    uid = request.cookies.get('uid')
    if uid:
        subscriptions[uid] = data['subscription']
        print(f"DEBUG: Сохранена подписка для UID {uid}")
    else:
        print("UID не найден в куках.")
    return jsonify({'success': True})

def send_push_to_user(uid, message):
    """
    Отправляет пуш-уведомление конкретному пользователю по UID.
    """
    print(f"DEBUG: Ищем UID '{uid}' в {list(subscriptions.keys())}")
    subscription = subscriptions.get(uid)
    if not subscription:
        print(f"Ошибка: UID {uid} не найден или не подписан.")
        return

    # Формируем тело уведомления (в виде JSON)
    payload = json.dumps({
        "title": "Уведомление",
        "body": message,
        "icon": "/static/icon.png"
    })

    # Отправляем пуш через pywebpush
    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=private_key,  # Передаём строку Base64
            vapid_claims=vapid_claims
        )
        print(f"✅ Уведомление отправлено пользователю {uid}")
    except Exception as e:
        print(f"❌ Ошибка при отправке: {e}")

def listen_for_commands():
    """
    Бесконечный цикл ввода команд в формате 'UID | ТЕКСТ'.
    Выполняется в отдельном потоке.
    """
    print("\nВведите сообщение в формате: UID | ТЕКСТ\n")
    while True:
        try:
            cmd = input("Введите 'UID | ТЕКСТ': ")
            parts = cmd.split(' | ', 1)
            if len(parts) == 2:
                uid, text = parts
                send_push_to_user(uid.strip(), text.strip())
            else:
                print("⚠️ Неверный формат. Пример: a1b2c3d4-e5f6 | Привет!")
        except KeyboardInterrupt:
            print("\nЗавершение работы...")
            break

@app.route('/static/service-worker.js')
def serve_sw():
    """Обслуживание SW с разрешением scope: '/'"""
    response = send_from_directory(app.static_folder, 'service-worker.js')
    response.headers['Service-Worker-Allowed'] = '/'
    return response

if __name__ == '__main__':
    # Запускаем ввод команд в фоновом потоке
    thread = threading.Thread(target=listen_for_commands, daemon=True)
    thread.start()

    # --- УБРАЛИ debug=True ---
    app.run(host='127.0.0.1', port=5000)
