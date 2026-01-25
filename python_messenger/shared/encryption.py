from cryptography.fernet import Fernet
import base64
import hashlib

ENCRYPTION_KEY = b"messenger_secret_key_2024_secure"

def get_fernet_key():
    key = hashlib.sha256(ENCRYPTION_KEY).digest()
    return base64.urlsafe_b64encode(key)

fernet = Fernet(get_fernet_key())

def encrypt_message(message: str) -> str:
    try:
        encrypted = fernet.encrypt(message.encode())
        return encrypted.decode()
    except Exception:
        return message

def decrypt_message(encrypted_message: str) -> str:
    try:
        decrypted = fernet.decrypt(encrypted_message.encode())
        return decrypted.decode()
    except Exception:
        return encrypted_message
