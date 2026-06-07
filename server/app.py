import os
import re
import json
import uuid
import hashlib
import secrets
import sqlite3
import datetime
from functools import wraps
from my_lib import Log

from flask import (
    Flask,
    request,
    jsonify,
    make_response,
    render_template,
    send_from_directory,
    Response,
)
from flask_sock import Sock
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    func,
    Index,
    event,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.engine import Engine

logging = Log(r"server\Messager.log")
logger = Log(r"server\Server.log")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
AVATARS_DIR = os.path.join(STATIC_DIR, "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
sock = Sock(app)

sessions = {}
ws_clients = {}

# ─── База данных (SQLite + SQLAlchemy) ────────────────────────────────────────

DB_PATH = os.path.join(BASE_DIR, "messenger.db")
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

@event.listens_for(Engine, "connect")
def enable_foreign_keys(dbapi_conn, _):
    if isinstance(dbapi_conn, sqlite3.Connection):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# ─── Модели ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    recovery_code = Column(String)
    display_name = Column(String, nullable=False)
    avatar_url = Column(String)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=datetime.datetime.now())
    created_at = Column(DateTime, default=datetime.datetime.now())

class Chat(Base):
    __tablename__ = "chats"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String)
    is_group = Column(Boolean, default=False)
    avatar_url = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.now())
    updated_at = Column(DateTime, default=datetime.datetime.now())
    creator_id = Column(String)

    participants = relationship(
        "ChatParticipant", back_populates="chat", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="chat", cascade="all, delete-orphan"
    )

class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = Column(String, ForeignKey(
        "chats.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    joined_at = Column(DateTime, default=datetime.datetime.now())

    chat = relationship("Chat", back_populates="participants")
    user = relationship("User")

class Message(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = Column(String, ForeignKey(
        "chats.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content = Column(Text, nullable=False)
    encrypted_content = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.now())

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User")

Index("ix_cp_chat_id", ChatParticipant.chat_id)
Index("ix_cp_user_id", ChatParticipant.user_id)
Index("ix_msg_chat_id", Message.chat_id)
Index("ix_msg_sender_id", Message.sender_id)

def init_db():
    Base.metadata.create_all(engine)
    # Миграция: добавить столбец recovery_code если ещё нет
    with engine.connect() as conn:
        try:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN recovery_code VARCHAR"))
            conn.commit()
            logger.log(
                f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Migration: added recovery_code column"'
            )
        except Exception:
            pass  # Столбец уже существует
    logger.log(
        f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Database initialized: {DB_PATH}"'
    )

# ─── Вспомогательные функции ──────────────────────────────────────────────────

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token():
    return secrets.token_hex(32)

def dt_iso(dt):
    return f'{dt.isoformat()}+03:00' if isinstance(dt, datetime.datetime) else dt

def user_dict(u):
    return {
        "id": u.id,
        "username": u.username,
        "displayName": u.display_name,
        "avatarUrl": u.avatar_url,
        "isOnline": u.is_online,
    }

def message_dict(m):
    return {
        "id": m.id,
        "chatId": m.chat_id,
        "senderId": m.sender_id,
        "content": m.content,
        "encryptedContent": m.encrypted_content,
        "isRead": m.is_read,
        "createdAt": dt_iso(m.created_at),
        "sender": user_dict(m.sender),
    }

def chat_dict(chat, current_user_id, db):
    participants = [user_dict(cp.user) for cp in chat.participants]

    last_msg_obj = (
        db.query(Message)
        .filter_by(chat_id=chat.id)
        .order_by(Message.created_at.desc())
        .first()
    )
    last_message = message_dict(last_msg_obj) if last_msg_obj else None

    unread_count = (
        db.query(func.count(Message.id))
        .filter(
            Message.chat_id == chat.id,
            Message.is_read == False,  # noqa: E712
            Message.sender_id != current_user_id,
        )
        .scalar()
    )

    return {
        "id": chat.id,
        "name": chat.name,
        "isGroup": chat.is_group,
        "avatarUrl": chat.avatar_url,
        "createdAt": dt_iso(chat.created_at),
        "updatedAt": dt_iso(chat.updated_at),
        "participants": participants,
        "lastMessage": last_message,
        "unreadCount": unread_count,
        "creatorId": chat.creator_id,
    }

# ─── Auth декоратор ───────────────────────────────────────────────────────────

def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            token = request.cookies.get("token")
        if not token or token not in sessions:
            return jsonify({"error": "Unauthorized"}), 401
        request.user_id = sessions[token]
        request.token = token
        return f(*args, **kwargs)

    return decorated

# ─── CORS ─────────────────────────────────────────────────────────────────────

def setup_cors():
    origins = set()
    replit_dev = os.environ.get("REPLIT_DEV_DOMAIN")
    if replit_dev:
        origins.add(f"https://{replit_dev}")
    for d in os.environ.get("REPLIT_DOMAINS", "").split(","):
        d = d.strip()
        if d:
            origins.add(f"https://{d}")

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        is_local = origin.startswith("http://localhost:") or origin.startswith(
            "http://127.0.0.1:"
        )
        if origin and (origin in origins or is_local):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, DELETE, OPTIONS"
            )
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization"
            )
            response.headers["Access-Control-Allow-Credentials"] = "true"

        logging.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] {request.headers.get("x-real-ip")} "{request.method} {request.path}" {response.status[:3]}'
        )
        return response

    @app.before_request
    def handle_options():
        if request.method == "OPTIONS":
            resp = make_response()
            origin = request.headers.get("Origin", "")
            is_local = origin.startswith("http://localhost:") or origin.startswith(
                "http://127.0.0.1:"
            )
            if origin and (origin in origins or is_local):
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Access-Control-Allow-Methods"] = (
                    "GET, POST, PUT, DELETE, OPTIONS"
                )
                resp.headers["Access-Control-Allow-Headers"] = (
                    "Content-Type, Authorization"
                )
                resp.headers["Access-Control-Allow-Credentials"] = "true"
            return resp

# ─── WebSocket broadcast ──────────────────────────────────────────────────────

def broadcast_to_chat(chat_id, message_data, exclude_user_id=None):
    payload = json.dumps(
        {"type": "message", "chatId": chat_id, "data": message_data})
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

# ─── Маршруты ─────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html", name='Alexis')

@app.route("/status", methods=["GET"])
def status():
    return jsonify({"status": "ok"})

@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.get_json() or {}
        username = data.get("username", "")
        password = data.get("password", "")
        display_name = data.get("displayName", "")
        recovery_code = str(data.get("recoveryCode", "")).strip()

        if len(username) < 3:
            return jsonify({"error": "Username must be at least 3 characters"}), 400
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        if not display_name:
            return jsonify({"error": "Display name is required"}), 400
        if not recovery_code.isdigit() or len(recovery_code) != 8:
            return jsonify({"error": "Recovery code must be exactly 8 digits"}), 400

        db = SessionLocal()
        try:
            if db.query(User).filter_by(username=username).first():
                return jsonify({"error": "Username already exists"}), 400

            user = User(
                username=username,
                password=hash_password(password),
                recovery_code=hash_password(recovery_code),
                display_name=display_name,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            token = generate_token()
            sessions[token] = user.id

            resp = make_response(
                jsonify(
                    {
                        "user": {
                            "id": user.id,
                            "username": user.username,
                            "displayName": user.display_name,
                        },
                        "token": token,
                    }
                )
            )
            resp.set_cookie("token", token, httponly=True, samesite="Lax")
            return resp
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Register error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    try:
        data = request.get_json() or {}
        username = data.get("username", "")
        recovery_code = str(data.get("recoveryCode", "")).strip()
        new_password = data.get("newPassword", "")

        if not username:
            return jsonify({"error": "Username is required"}), 400
        if not recovery_code.isdigit() or len(recovery_code) != 8:
            return jsonify({"error": "Recovery code must be exactly 8 digits"}), 400
        if len(new_password) < 6:
            return jsonify({"error": "New password must be at least 6 characters"}), 400

        db = SessionLocal()
        try:
            user = db.query(User).filter_by(username=username).first()
            if not user or not user.recovery_code:
                return jsonify(
                    {"error": "User not found or recovery code not set"}
                ), 400
            if user.recovery_code != hash_password(recovery_code):
                return jsonify({"error": "Invalid recovery code"}), 400

            user.password = hash_password(new_password)
            db.commit()

            return jsonify({"success": True})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Reset password error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.get_json() or {}
        username = data.get("username", "")
        password = data.get("password", "")

        if len(username) < 3:
            return jsonify({"error": "Username must be at least 3 characters"}), 400
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        db = SessionLocal()
        try:
            user = db.query(User).filter_by(username=username).first()
            if not user or user.password != hash_password(password):
                return jsonify({"error": "Invalid credentials"}), 401

            user.is_online = True
            user.last_seen = datetime.datetime.now()
            db.commit()

            token = generate_token()
            sessions[token] = user.id

            resp = make_response(
                jsonify(
                    {
                        "user": {
                            "id": user.id,
                            "username": user.username,
                            "displayName": user.display_name,
                            "avatarUrl": user.avatar_url,
                        },
                        "token": token,
                    }
                )
            )
            resp.set_cookie("token", token, httponly=True, samesite="Lax")
            return resp
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Login error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/auth/logout", methods=["POST"])
@auth_required
def logout():
    sessions.pop(request.token, None)
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=request.user_id).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.datetime.now()
            db.commit()
    finally:
        db.close()

    resp = make_response(jsonify({"success": True}))
    resp.delete_cookie("token")
    return resp

@app.route("/api/auth/me", methods=["GET"])
@auth_required
def get_me():
    try:
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(id=request.user_id).first()
            if not user:
                return jsonify({"error": "User not found"}), 404
            return jsonify(user_dict(user))
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Get me error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats", methods=["GET"])
@auth_required
def get_chats():
    try:
        user_id = request.user_id
        db = SessionLocal()
        try:
            chat_ids = [
                r.chat_id
                for r in db.query(ChatParticipant.chat_id)
                .filter_by(user_id=user_id)
                .all()
            ]
            if not chat_ids:
                return jsonify([])

            chats = (
                db.query(Chat)
                .filter(Chat.id.in_(chat_ids))
                .order_by(Chat.updated_at.desc())
                .all()
            )
            return jsonify([chat_dict(c, user_id, db) for c in chats])
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Get chats error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats", methods=["POST"])
@auth_required
def create_chat():
    try:
        user_id = request.user_id
        data = request.get_json() or {}
        name = data.get("name")
        participant_ids = data.get("participantIds", [])
        is_group = data.get("isGroup", False)

        if not participant_ids or not isinstance(participant_ids, list):
            return jsonify({"error": "At least one participant is required"}), 400

        all_ids = list(set([user_id] + participant_ids))

        db = SessionLocal()
        try:
            chat = Chat(name=name, is_group=is_group, creator_id=user_id)
            db.add(chat)
            db.flush()

            for pid in all_ids:
                db.add(ChatParticipant(chat_id=chat.id, user_id=pid))

            db.commit()
            db.refresh(chat)

            for cp in chat.participants:
                _ = cp.user  # eager-load для сериализации

            return jsonify(chat_dict(chat, user_id, db))
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Create chat error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats/<chat_id>", methods=["DELETE"])
@auth_required
def delete_chat(chat_id):
    try:
        user_id = request.user_id
        db = SessionLocal()
        try:
            cp = (
                db.query(ChatParticipant)
                .filter_by(chat_id=chat_id, user_id=user_id)
                .first()
            )
            if cp:
                chat = db.query(Chat).filter_by(id=chat_id).first()
                if chat:
                    db.delete(chat)
                    db.commit()
            return jsonify({"success": True})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Delete chat error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats/<chat_id>/messages", methods=["GET"])
@auth_required
def get_messages(chat_id):
    try:
        limit = request.args.get("limit", 50, type=int)
        db = SessionLocal()
        try:
            msgs = (
                db.query(Message)
                .filter_by(chat_id=chat_id)
                .order_by(Message.created_at.desc())
                .limit(limit)
                .all()
            )
            return jsonify([message_dict(m) for m in reversed(msgs)])
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Get messages error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats/<chat_id>/messages", methods=["POST"])
@auth_required
def create_message(chat_id):
    try:
        user_id = request.user_id
        data = request.get_json() or {}
        content = data.get("content", "").strip()
        encrypted_content = data.get("encryptedContent")

        if not content:
            return jsonify({"error": "Message content is required"}), 400

        db = SessionLocal()
        try:
            msg = Message(
                chat_id=chat_id,
                sender_id=user_id,
                content=content,
                encrypted_content=encrypted_content,
                created_at=datetime.datetime.now(),
            )
            db.add(msg)

            chat = db.query(Chat).filter_by(id=chat_id).first()
            if chat:
                chat.updated_at = datetime.datetime.now()

            db.commit()
            db.refresh(msg)
            _ = msg.sender  # eager-load

            result = message_dict(msg)
            broadcast_to_chat(chat_id, result, exclude_user_id=user_id)
            return jsonify(result)
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Create message error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats/<chat_id>/read", methods=["POST"])
@auth_required
def mark_read(chat_id):
    try:
        db = SessionLocal()
        try:
            db.query(Message).filter(
                Message.chat_id == chat_id,
                Message.is_read == False,  # noqa: E712
            ).update({"is_read": True})
            db.commit()
            return jsonify({"success": True})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Mark read error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/auth/profile", methods=["PATCH"])
@auth_required
def update_profile():
    try:
        user_id = request.user_id
        data = request.get_json() or {}
        new_display_name = (
            data.get("displayName", "").strip(
            ) if "displayName" in data else None
        )
        new_username = data.get("username", "").strip(
        ) if "username" in data else None

        if new_display_name is not None and not new_display_name:
            return jsonify({"error": "Имя не может быть пустым"}), 400
        if new_username is not None:
            if len(new_username) < 3:
                return jsonify({"error": "Минимум 3 символа"}), 400
            if not re.match(r"^[a-zA-Z0-9_]+$", new_username):
                return jsonify({"error": "Только буквы, цифры и подчёркивание"}), 400

        db = SessionLocal()
        try:
            user = db.query(User).filter_by(id=user_id).first()
            if not user:
                return jsonify({"error": "User not found"}), 404
            if new_username is not None and new_username != user.username:
                if db.query(User).filter_by(username=new_username).first():
                    return jsonify({"error": "Имя пользователя уже занято"}), 409
                user.username = new_username
            if new_display_name is not None:
                user.display_name = new_display_name
            db.commit()
            return jsonify({"user": user_dict(user)})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Update profile error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/auth/avatar", methods=["POST"])
@auth_required
def upload_avatar():
    try:
        user_id = request.user_id
        if "avatar" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files["avatar"]
        if not file or not file.filename:
            return jsonify({"error": "Invalid file"}), 400
        content_type = file.content_type or ""
        if not content_type.startswith("image/"):
            return jsonify({"error": "File must be an image"}), 400
        ext = "jpg"
        if "png" in content_type:
            ext = "png"
        elif "gif" in content_type:
            ext = "gif"
        elif "webp" in content_type:
            ext = "webp"
        filename = f"{user_id}.{ext}"
        filepath = os.path.join(AVATARS_DIR, filename)
        file.save(filepath)
        avatar_url = f"/static/avatars/{filename}"
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(id=user_id).first()
            if not user:
                return jsonify({"error": "User not found"}), 404
            user.avatar_url = avatar_url
            db.commit()
            return jsonify({"avatarUrl": avatar_url, "user": user_dict(user)})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Avatar upload error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/chats/<chat_id>/avatar", methods=["POST"])
@auth_required
def upload_chat_avatar(chat_id):
    """Загрузка аватара группового чата. Доступно только создателю чата."""
    try:
        user_id = request.user_id
        db = SessionLocal()
        try:
            chat = db.query(Chat).filter_by(id=chat_id).first()
            if not chat:
                return jsonify({"error": "Chat not found"}), 404
            
            # Проверка: только создатель может менять аватар группы
            if chat.creator_id != user_id:
                return jsonify({"error": "Access denied. Only chat creator can change avatar"}), 403
            
            if not chat.is_group:
                return jsonify({"error": "Only group chats can have custom avatars"}), 400
            
            if "avatar" not in request.files:
                return jsonify({"error": "No file provided"}), 400
            
            file = request.files["avatar"]
            if not file or not file.filename:
                return jsonify({"error": "Invalid file"}), 400
            
            content_type = file.content_type or ""
            if not content_type.startswith("image/"):
                return jsonify({"error": "File must be an image"}), 400
            
            ext = "jpg"
            if "png" in content_type:
                ext = "png"
            elif "gif" in content_type:
                ext = "gif"
            elif "webp" in content_type:
                ext = "webp"
            
            filename = f"chat_{chat_id}.{ext}"
            filepath = os.path.join(AVATARS_DIR, filename)
            file.save(filepath)
            avatar_url = f"/static/avatars/{filename}"
            
            chat.avatar_url = avatar_url
            chat.updated_at = datetime.datetime.now()
            db.commit()
            
            return jsonify({"avatarUrl": avatar_url, "chatId": chat_id})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Chat avatar upload error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/messages/<msg_id>", methods=["DELETE"])
@auth_required
def delete_message(msg_id):
    try:
        user_id = request.user_id
        db = SessionLocal()
        try:
            msg = db.query(Message).filter_by(id=msg_id).first()
            if not msg:
                return jsonify({"error": "Message not found"}), 404
            if msg.sender_id != user_id:
                return jsonify({"error": "Access denied"}), 403
            chat_id = msg.chat_id
            db.delete(msg)
            db.commit()
            payload = json.dumps(
                {
                    "type": "delete_message",
                    "chatId": chat_id,
                    "messageId": msg_id,
                }
            )
            disconnected = []
            for uid, ws in ws_clients.items():
                try:
                    ws.send(payload)
                except Exception:
                    disconnected.append(uid)
            for uid in disconnected:
                ws_clients.pop(uid, None)
            return jsonify({"success": True})
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Delete message error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/users/search", methods=["GET"])
@auth_required
def search_users():
    try:
        user_id = request.user_id
        query = request.args.get("q", "").lower()
        db = SessionLocal()
        try:
            pattern = f"%{query}%"
            users = (
                db.query(User)
                .filter(
                    User.id != user_id,
                    (func.lower(User.username).like(pattern))
                    | (func.lower(User.display_name).like(pattern)),
                )
                .limit(20)
                .all()
            )
            return jsonify([user_dict(u) for u in users])
        finally:
            db.close()
    except Exception as e:
        logger.log(
            f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Search users error: {e}"'
        )
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/weather')
def sr():
	import json
	data: dict[str, dict[str, str]] = json.loads(open('C:/Users/Alex/Desktop/JetBr/Python/WebPython/Trird/Site/data', 'r').read())
	return jsonify(data)

# ─── WebSocket ────────────────────────────────────────────────────────────────

@sock.route("/ws")
def websocket_handler(ws):
    token = request.args.get("token")
    if not token or token not in sessions:
        ws.close(1008, "Unauthorized")
        return

    user_id = sessions[token]
    ws_clients[user_id] = ws

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if user:
            user.is_online = True
            db.commit()
    finally:
        db.close()

    try:
        while True:
            data = ws.receive()
            if data is None:
                break
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    ws.send(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except Exception:
        pass
    finally:
        ws_clients.pop(user_id, None)
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(id=user_id).first()
            if user:
                user.is_online = False
                user.last_seen = datetime.datetime.now()
                db.commit()
        finally:
            db.close()

# ─── Инициализация ────────────────────────────────────────────────────────────

setup_cors()
init_db()

if __name__ == "__main__":
    logging.log(
        f'[{datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S")}] "Server restarted."'
    )
    app.run(host="0.0.0.0", port=5000, debug=True)
