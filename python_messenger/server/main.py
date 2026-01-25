import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Dict
from datetime import datetime
import json

from python_messenger.server.database import get_db, init_db
from python_messenger.server.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, decode_token
)
from python_messenger.server.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    ChatCreate, ChatResponse, MessageCreate, MessageResponse
)
from python_messenger.shared.models import User, Chat, ChatParticipant, Message
from python_messenger.shared.encryption import encrypt_message, decrypt_message

app = FastAPI(title="Messenger API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)

    async def broadcast_to_chat(self, message: dict, chat_id: str, db: Session):
        participants = db.query(ChatParticipant).filter(
            ChatParticipant.chat_id == chat_id
        ).all()
        for participant in participants:
            if participant.user_id in self.active_connections:
                await self.active_connections[participant.user_id].send_json(message)

manager = ConnectionManager()

@app.on_event("startup")
def startup_event():
    init_db()

@app.post("/api/auth/register", response_model=TokenResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    user = User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        display_name=user_data.display_name,
        is_online=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    access_token = create_access_token(data={"sub": user.id})
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user)
    )

@app.post("/api/auth/login", response_model=TokenResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.commit()
    
    access_token = create_access_token(data={"sub": user.id})
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user)
    )

@app.post("/api/auth/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.is_online = False
    current_user.last_seen = datetime.utcnow()
    db.commit()
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

@app.get("/api/users/search", response_model=List[UserResponse])
def search_users(
    query: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    users = db.query(User).filter(
        User.username.ilike(f"%{query}%"),
        User.id != current_user.id
    ).limit(20).all()
    return [UserResponse.model_validate(u) for u in users]

@app.get("/api/chats", response_model=List[ChatResponse])
def get_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat_ids = db.query(ChatParticipant.chat_id).filter(
        ChatParticipant.user_id == current_user.id
    ).subquery()
    
    chats = db.query(Chat).filter(Chat.id.in_(chat_ids)).order_by(desc(Chat.updated_at)).all()
    
    result = []
    for chat in chats:
        participants = [
            UserResponse.model_validate(p.user)
            for p in chat.participants
            if p.user_id != current_user.id
        ]
        
        last_message = db.query(Message).filter(
            Message.chat_id == chat.id
        ).order_by(desc(Message.created_at)).first()
        
        last_msg_response = None
        if last_message:
            last_msg_response = MessageResponse(
                id=last_message.id,
                chat_id=last_message.chat_id,
                sender_id=last_message.sender_id,
                content=decrypt_message(last_message.encrypted_content or last_message.content),
                is_read=last_message.is_read,
                created_at=last_message.created_at
            )
        
        unread_count = db.query(func.count(Message.id)).filter(
            Message.chat_id == chat.id,
            Message.sender_id != current_user.id,
            Message.is_read == False
        ).scalar()
        
        chat_name = chat.name
        chat_avatar = chat.avatar_url
        if not chat.is_group and participants:
            chat_name = participants[0].display_name
            chat_avatar = participants[0].avatar_url
        
        result.append(ChatResponse(
            id=chat.id,
            name=chat_name,
            is_group=chat.is_group,
            avatar_url=chat_avatar,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            participants=participants,
            last_message=last_msg_response,
            unread_count=unread_count or 0
        ))
    
    return result

@app.post("/api/chats", response_model=ChatResponse)
def create_chat(
    chat_data: ChatCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    other_user = db.query(User).filter(User.username == chat_data.participant_username).first()
    if not other_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    existing_chat = db.query(Chat).join(ChatParticipant).filter(
        ChatParticipant.user_id == current_user.id,
        Chat.is_group == False
    ).all()
    
    for chat in existing_chat:
        other_participants = [p for p in chat.participants if p.user_id != current_user.id]
        if len(other_participants) == 1 and other_participants[0].user_id == other_user.id:
            return ChatResponse(
                id=chat.id,
                name=other_user.display_name,
                is_group=False,
                avatar_url=other_user.avatar_url,
                created_at=chat.created_at,
                updated_at=chat.updated_at,
                participants=[UserResponse.model_validate(other_user)],
                last_message=None,
                unread_count=0
            )
    
    chat = Chat(is_group=False)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    
    participant1 = ChatParticipant(chat_id=chat.id, user_id=current_user.id)
    participant2 = ChatParticipant(chat_id=chat.id, user_id=other_user.id)
    db.add_all([participant1, participant2])
    db.commit()
    
    return ChatResponse(
        id=chat.id,
        name=other_user.display_name,
        is_group=False,
        avatar_url=other_user.avatar_url,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        participants=[UserResponse.model_validate(other_user)],
        last_message=None,
        unread_count=0
    )

@app.delete("/api/chats/{chat_id}")
def delete_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.chat_id == chat_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found"
        )
    
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat:
        db.delete(chat)
        db.commit()
    
    return {"message": "Chat deleted successfully"}

@app.get("/api/chats/{chat_id}/messages", response_model=List[MessageResponse])
def get_messages(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.chat_id == chat_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found"
        )
    
    messages = db.query(Message).filter(
        Message.chat_id == chat_id
    ).order_by(Message.created_at).all()
    
    result = []
    for msg in messages:
        sender = UserResponse.model_validate(msg.sender)
        result.append(MessageResponse(
            id=msg.id,
            chat_id=msg.chat_id,
            sender_id=msg.sender_id,
            content=decrypt_message(msg.encrypted_content or msg.content),
            is_read=msg.is_read,
            created_at=msg.created_at,
            sender=sender
        ))
    
    return result

@app.post("/api/chats/{chat_id}/messages", response_model=MessageResponse)
async def send_message(
    chat_id: str,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.chat_id == chat_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found"
        )
    
    encrypted_content = encrypt_message(message_data.content)
    
    message = Message(
        chat_id=chat_id,
        sender_id=current_user.id,
        content=message_data.content,
        encrypted_content=encrypted_content
    )
    db.add(message)
    
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat:
        chat.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(message)
    
    sender = UserResponse.model_validate(current_user)
    msg_response = MessageResponse(
        id=message.id,
        chat_id=message.chat_id,
        sender_id=message.sender_id,
        content=message_data.content,
        is_read=message.is_read,
        created_at=message.created_at,
        sender=sender
    )
    
    await manager.broadcast_to_chat(
        {"type": "new_message", "data": msg_response.model_dump(mode='json')},
        chat_id,
        db
    )
    
    return msg_response

@app.post("/api/chats/{chat_id}/read")
def mark_messages_read(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(Message).filter(
        Message.chat_id == chat_id,
        Message.sender_id != current_user.id,
        Message.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "Messages marked as read"}

@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return
    
    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001)
        return
    
    await manager.connect(websocket, user_id)
    
    from python_messenger.server.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = True
            db.commit()
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
