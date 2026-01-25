import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from python_messenger.shared.models import Base

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    engine = None
    SessionLocal = None

def init_db():
    if engine:
        Base.metadata.create_all(bind=engine)

def get_db():
    if SessionLocal is None:
        raise Exception("Database not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
