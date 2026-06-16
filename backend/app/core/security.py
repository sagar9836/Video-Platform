from passlib.hash import pbkdf2_sha256
from datetime import datetime, timedelta
from jose import jwt

from app.core.config import settings

def hash_password(password: str) -> str:
    return pbkdf2_sha256.hash(password)

def verify_password(plain_password:str, hashed_password:str)->bool:
    return pbkdf2_sha256.verify(plain_password, hashed_password)
    
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode.update({"exp": expire})

    return jwt.encode(
        to_encode,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
