import os
import json
import hashlib
import secrets
import logging
from datetime import datetime, timezone
from functools import wraps

import psycopg2
import psycopg2.extras
from flask import Flask, request, jsonify, make_response, render_template, Response
from flask_cors import CORS
from flask_sock import Sock

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
sock = Sock(app)

sessions = {}
ws_clients = {}

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set")


def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            is_online BOOLEAN DEFAULT FALSE,
            last_seen TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name TEXT,
            is_group BOOLEAN DEFAULT FALSE,
            avatar_url TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_participants (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            chat_id VARCHAR NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            joined_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS chat_participants_chat_id_idx ON chat_participants(chat_id)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS chat_participants_user_id_idx ON chat_participants(user_id)
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            chat_id VARCHAR NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            sender_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            encrypted_content TEXT,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages(chat_id)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id)
    """)
    cur.close()
    conn.close()
    logger.info("Database tables initialized")


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def generate_token():
    return secrets.token_hex(32)


def serialize_datetime(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def user_to_dict(row, keys=None):
    if keys is None:
        keys = ["id", "username", "password", "display_name", "avatar_url", "is_online", "last_seen", "created_at"]
    d = dict(zip(keys, row))
    for k in ["last_seen", "created_at", "joined_at", "updated_at"]:
        if k in d and isinstance(d[k], datetime):
            d[k] = d[k].isoformat()
    remap = {"display_name": "displayName", "avatar_url": "avatarUrl", "is_online": "isOnline",
             "last_seen": "lastSeen", "created_at": "createdAt", "chat_id": "chatId",
             "sender_id": "senderId", "encrypted_content": "encryptedContent",
             "is_read": "isRead", "is_group": "isGroup", "updated_at": "updatedAt",
             "user_id": "userId", "joined_at": "joinedAt"}
    return {remap.get(k, k): v for k, v in d.items()}


def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            cookie_token = request.cookies.get("token")
            if cookie_token:
                token = cookie_token
        if not token or token not in sessions:
            return jsonify({"error": "Unauthorized"}), 401
        request.user_id = sessions[token]
        request.token = token
        return f(*args, **kwargs)
    return decorated


def setup_cors():
    origins = set()
    replit_dev = os.environ.get("REPLIT_DEV_DOMAIN")
    if replit_dev:
        origins.add(f"https://{replit_dev}")
    replit_domains = os.environ.get("REPLIT_DOMAINS", "")
    for d in replit_domains.split(","):
        d = d.strip()
        if d:
            origins.add(f"https://{d}")

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        is_localhost = origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")
        if origin and (origin in origins or is_localhost):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    @app.before_request
    def handle_options():
        if request.method == "OPTIONS":
            resp = make_response()
            origin = request.headers.get("Origin", "")
            is_localhost = origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")
            if origin and (origin in origins or is_localhost):
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
                resp.headers["Access-Control-Allow-Credentials"] = "true"
            return resp


def broadcast_to_chat(chat_id, message_data, exclude_user_id=None):
    payload = json.dumps({"type": "message", "chatId": chat_id, "data": message_data})
    disconnected = []
    for uid, ws in ws_clients.items():
        if exclude_user_id and uid == exclude_user_id:
            continue
        try:
            ws.send(payload)
        except Exception:
            disconnected.append(uid)
    for uid in disconnected:
        ws_clients.pop(uid, None)


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/status", methods=["GET"])
def status():
    return jsonify({"status": "ok"})


@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.get_json()
        username = (data or {}).get("username", "")
        password = (data or {}).get("password", "")
        display_name = (data or {}).get("displayName", "")

        if len(username) < 3:
            return jsonify({"error": "Username must be at least 3 characters"}), 400
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        if not display_name:
            return jsonify({"error": "Display name is required"}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Username already exists"}), 400

        hashed = hash_password(password)
        cur.execute(
            "INSERT INTO users (username, password, display_name) VALUES (%s, %s, %s) RETURNING id, username, display_name",
            (username, hashed, display_name)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        token = generate_token()
        sessions[token] = row[0]

        resp = make_response(jsonify({
            "user": {"id": row[0], "username": row[1], "displayName": row[2]},
            "token": token
        }))
        resp.set_cookie("token", token, httponly=True, samesite="Lax")
        return resp
    except Exception as e:
        logger.error(f"Register error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        username = (data or {}).get("username", "")
        password = (data or {}).get("password", "")

        if len(username) < 3:
            return jsonify({"error": "Username must be at least 3 characters"}), 400
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, username, password, display_name, avatar_url FROM users WHERE username = %s", (username,))
        row = cur.fetchone()

        if not row or row[2] != hash_password(password):
            cur.close()
            conn.close()
            return jsonify({"error": "Invalid credentials"}), 401

        user_id = row[0]
        cur.execute("UPDATE users SET is_online = TRUE WHERE id = %s", (user_id,))
        cur.close()
        conn.close()

        token = generate_token()
        sessions[token] = user_id

        resp = make_response(jsonify({
            "user": {"id": row[0], "username": row[1], "displayName": row[3], "avatarUrl": row[4]},
            "token": token
        }))
        resp.set_cookie("token", token, httponly=True, samesite="Lax")
        return resp
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/auth/logout", methods=["POST"])
@auth_required
def logout():
    token = request.token
    user_id = request.user_id
    sessions.pop(token, None)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET is_online = FALSE WHERE id = %s", (user_id,))
    cur.close()
    conn.close()

    resp = make_response(jsonify({"success": True}))
    resp.delete_cookie("token")
    return resp


@app.route("/api/auth/me", methods=["GET"])
@auth_required
def get_me():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, username, display_name, avatar_url, is_online FROM users WHERE id = %s", (request.user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "id": row[0],
            "username": row[1],
            "displayName": row[2],
            "avatarUrl": row[3],
            "isOnline": row[4]
        })
    except Exception as e:
        logger.error(f"Get me error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/chats", methods=["GET"])
@auth_required
def get_chats():
    try:
        user_id = request.user_id
        conn = get_db()
        cur = conn.cursor()

        cur.execute("SELECT chat_id FROM chat_participants WHERE user_id = %s", (user_id,))
        chat_ids = [r[0] for r in cur.fetchall()]

        if not chat_ids:
            cur.close()
            conn.close()
            return jsonify([])

        cur.execute(
            "SELECT id, name, is_group, avatar_url, created_at, updated_at FROM chats WHERE id = ANY(%s) ORDER BY updated_at DESC",
            (chat_ids,)
        )
        chats_rows = cur.fetchall()

        result = []
        for chat_row in chats_rows:
            chat_id = chat_row[0]

            cur.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online
                FROM chat_participants cp
                JOIN users u ON cp.user_id = u.id
                WHERE cp.chat_id = %s
            """, (chat_id,))
            participants = []
            for p in cur.fetchall():
                participants.append({
                    "user": {
                        "id": p[0], "username": p[1], "displayName": p[2],
                        "avatarUrl": p[3], "isOnline": p[4]
                    }
                })

            cur.execute("""
                SELECT m.id, m.chat_id, m.sender_id, m.content, m.encrypted_content, m.is_read, m.created_at,
                       u.id, u.username, u.display_name, u.avatar_url, u.is_online
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.chat_id = %s
                ORDER BY m.created_at DESC
                LIMIT 1
            """, (chat_id,))
            last_msg_row = cur.fetchone()
            last_message = None
            if last_msg_row:
                last_message = {
                    "id": last_msg_row[0], "chatId": last_msg_row[1],
                    "senderId": last_msg_row[2], "content": last_msg_row[3],
                    "encryptedContent": last_msg_row[4], "isRead": last_msg_row[5],
                    "createdAt": last_msg_row[6].isoformat() if last_msg_row[6] else None,
                    "sender": {
                        "id": last_msg_row[7], "username": last_msg_row[8],
                        "displayName": last_msg_row[9], "avatarUrl": last_msg_row[10],
                        "isOnline": last_msg_row[11]
                    }
                }

            cur.execute("""
                SELECT COUNT(*) FROM messages
                WHERE chat_id = %s AND is_read = FALSE AND sender_id != %s
            """, (chat_id, user_id))
            unread_count = cur.fetchone()[0]

            chat = {
                "id": chat_row[0],
                "name": chat_row[1],
                "isGroup": chat_row[2],
                "avatarUrl": chat_row[3],
                "createdAt": chat_row[4].isoformat() if chat_row[4] else None,
                "updatedAt": chat_row[5].isoformat() if chat_row[5] else None,
                "participants": participants,
                "lastMessage": last_message,
                "unreadCount": unread_count
            }
            result.append(chat)

        cur.close()
        conn.close()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Get chats error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/chats", methods=["POST"])
@auth_required
def create_chat():
    try:
        user_id = request.user_id
        data = request.get_json()
        name = (data or {}).get("name")
        participant_ids = (data or {}).get("participantIds", [])
        is_group = (data or {}).get("isGroup", False)

        if not participant_ids or not isinstance(participant_ids, list) or len(participant_ids) == 0:
            return jsonify({"error": "At least one participant is required"}), 400

        all_ids = list(set([user_id] + participant_ids))

        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            "INSERT INTO chats (name, is_group) VALUES (%s, %s) RETURNING id",
            (name, is_group)
        )
        chat_id = cur.fetchone()[0]

        for pid in all_ids:
            cur.execute(
                "INSERT INTO chat_participants (chat_id, user_id) VALUES (%s, %s)",
                (chat_id, pid)
            )

        cur.close()
        conn.close()

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT chat_id FROM chat_participants WHERE user_id = %s", (user_id,))
        chat_ids = [r[0] for r in cur.fetchall()]

        cur.execute(
            "SELECT id, name, is_group, avatar_url, created_at, updated_at FROM chats WHERE id = %s",
            (chat_id,)
        )
        chat_row = cur.fetchone()

        cur.execute("""
            SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online
            FROM chat_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.chat_id = %s
        """, (chat_id,))
        participants = []
        for p in cur.fetchall():
            participants.append({
                "user": {
                    "id": p[0], "username": p[1], "displayName": p[2],
                    "avatarUrl": p[3], "isOnline": p[4]
                }
            })

        result = {
            "id": chat_row[0],
            "name": chat_row[1],
            "isGroup": chat_row[2],
            "avatarUrl": chat_row[3],
            "createdAt": chat_row[4].isoformat() if chat_row[4] else None,
            "updatedAt": chat_row[5].isoformat() if chat_row[5] else None,
            "participants": participants,
            "lastMessage": None,
            "unreadCount": 0
        }

        cur.close()
        conn.close()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Create chat error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
@auth_required
def delete_chat(chat_id):
    try:
        user_id = request.user_id
        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            "SELECT id FROM chat_participants WHERE chat_id = %s AND user_id = %s",
            (chat_id, user_id)
        )
        if cur.fetchone():
            cur.execute("DELETE FROM chats WHERE id = %s", (chat_id,))

        cur.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Delete chat error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/chats/<chat_id>/messages", methods=["GET"])
@auth_required
def get_messages(chat_id):
    try:
        limit = request.args.get("limit", 50, type=int)
        conn = get_db()
        cur = conn.cursor()

        cur.execute("""
            SELECT m.id, m.chat_id, m.sender_id, m.content, m.encrypted_content, m.is_read, m.created_at,
                   u.id, u.username, u.display_name, u.avatar_url, u.is_online
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = %s
            ORDER BY m.created_at DESC
            LIMIT %s
        """, (chat_id, limit))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        result = []
        for r in reversed(rows):
            result.append({
                "id": r[0], "chatId": r[1], "senderId": r[2], "content": r[3],
                "encryptedContent": r[4], "isRead": r[5],
                "createdAt": r[6].isoformat() if r[6] else None,
                "sender": {
                    "id": r[7], "username": r[8], "displayName": r[9],
                    "avatarUrl": r[10], "isOnline": r[11]
                }
            })

        return jsonify(result)
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/chats/<chat_id>/messages", methods=["POST"])
@auth_required
def create_message(chat_id):
    try:
        user_id = request.user_id
        data = request.get_json()
        content = (data or {}).get("content", "").strip()
        encrypted_content = (data or {}).get("encryptedContent")

        if not content:
            return jsonify({"error": "Message content is required"}), 400

        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            "INSERT INTO messages (chat_id, sender_id, content, encrypted_content) VALUES (%s, %s, %s, %s) RETURNING id, chat_id, sender_id, content, encrypted_content, is_read, created_at",
            (chat_id, user_id, content, encrypted_content)
        )
        msg = cur.fetchone()

        cur.execute("UPDATE chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

        cur.execute("SELECT id, username, display_name, avatar_url, is_online FROM users WHERE id = %s", (user_id,))
        sender = cur.fetchone()

        cur.close()
        conn.close()

        message_with_sender = {
            "id": msg[0], "chatId": msg[1], "senderId": msg[2], "content": msg[3],
            "encryptedContent": msg[4], "isRead": msg[5],
            "createdAt": msg[6].isoformat() if msg[6] else None,
            "sender": {
                "id": sender[0], "username": sender[1], "displayName": sender[2],
                "avatarUrl": sender[3], "isOnline": sender[4]
            }
        }

        broadcast_to_chat(chat_id, message_with_sender, exclude_user_id=user_id)

        return jsonify(message_with_sender)
    except Exception as e:
        logger.error(f"Create message error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/chats/<chat_id>/read", methods=["POST"])
@auth_required
def mark_read(chat_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "UPDATE messages SET is_read = TRUE WHERE chat_id = %s AND is_read = FALSE",
            (chat_id,)
        )
        cur.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Mark read error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/users/search", methods=["GET"])
@auth_required
def search_users():
    try:
        user_id = request.user_id
        query = request.args.get("q", "")

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, username, display_name, avatar_url, is_online FROM users WHERE id != %s AND (LOWER(username) LIKE %s OR LOWER(display_name) LIKE %s)",
            (user_id, f"%{query.lower()}%", f"%{query.lower()}%")
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()

        result = []
        for r in rows:
            result.append({
                "id": r[0], "username": r[1], "displayName": r[2],
                "avatarUrl": r[3], "isOnline": r[4]
            })

        return jsonify(result)
    except Exception as e:
        logger.error(f"Search users error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@sock.route("/ws")
def websocket_handler(ws):
    token = request.args.get("token")
    if not token or token not in sessions:
        ws.close(1008, "Unauthorized")
        return

    user_id = sessions[token]
    ws_clients[user_id] = ws

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET is_online = TRUE WHERE id = %s", (user_id,))
    cur.close()
    conn.close()

    try:
        while True:
            data = ws.receive()
            if data is None:
                break
            try:
                message = json.loads(data)
                if message.get("type") == "typing":
                    payload = json.dumps({
                        "type": "typing",
                        "chatId": message.get("chatId"),
                        "userId": user_id
                    })
                    for uid, client_ws in ws_clients.items():
                        if uid != user_id:
                            try:
                                client_ws.send(payload)
                            except Exception:
                                pass
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    finally:
        ws_clients.pop(user_id, None)
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("UPDATE users SET is_online = FALSE WHERE id = %s", (user_id,))
            cur.close()
            conn.close()
        except Exception:
            pass


setup_cors()
init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
