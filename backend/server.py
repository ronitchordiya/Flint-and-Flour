from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from jwt import PyJWTError
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# JWT and Password configurations
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-this-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Define Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password_hash: str
    region: str = Field(..., description="India or Canada")
    is_email_verified: bool = False
    email_verification_token: Optional[str] = None
    password_reset_token: Optional[str] = None
    password_reset_expires: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    region: str = Field(..., description="Must be 'India' or 'Canada'")

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    region: str
    is_email_verified: bool
    created_at: datetime

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class EmailVerificationRequest(BaseModel):
    token: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)

class UserUpdateProfile(BaseModel):
    region: Optional[str] = None

# Utility functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str, token_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != token_type:
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    token = credentials.credentials
    payload = verify_token(token, "access")
    user_id = payload.get("sub")
    
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_doc = await db.users.find_one({"id": user_id})
    if user_doc is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user_doc)

# Auth endpoints
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Validate region
    if user_data.region not in ["India", "Canada"]:
        raise HTTPException(status_code=400, detail="Region must be 'India' or 'Canada'")
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    password_hash = get_password_hash(user_data.password)
    email_verification_token = secrets.token_urlsafe(32)
    
    user = User(
        email=user_data.email,
        password_hash=password_hash,
        region=user_data.region,
        email_verification_token=email_verification_token
    )
    
    # Save to database
    await db.users.insert_one(user.dict())
    
    # Log simulated email verification
    logger.info(f"SIMULATED EMAIL: Please verify your email by visiting: /api/auth/verify-email?token={email_verification_token}")
    
    return UserResponse(**user.dict())

@api_router.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin):
    # Find user
    user_doc = await db.users.find_one({"email": user_credentials.email})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user = User(**user_doc)
    
    # Verify password
    if not verify_password(user_credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create tokens
    access_token = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})
    
    return Token(access_token=access_token, refresh_token=refresh_token)

@api_router.post("/auth/refresh", response_model=Token)
async def refresh_token(refresh_request: RefreshTokenRequest):
    payload = verify_token(refresh_request.refresh_token, "refresh")
    user_id = payload.get("sub")
    
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    # Verify user still exists
    user_doc = await db.users.find_one({"id": user_id})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Create new tokens
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    
    return Token(access_token=access_token, refresh_token=refresh_token)

@api_router.post("/auth/verify-email")
async def verify_email(request: EmailVerificationRequest):
    # Find user by verification token
    user_doc = await db.users.find_one({"email_verification_token": request.token})
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    
    # Update user verification status
    await db.users.update_one(
        {"id": user_doc["id"]},
        {
            "$set": {
                "is_email_verified": True,
                "email_verification_token": None,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return {"message": "Email verified successfully"}

@api_router.post("/auth/reset-password")
async def request_password_reset(request: PasswordResetRequest):
    # Find user
    user_doc = await db.users.find_one({"email": request.email})
    if not user_doc:
        # Don't reveal if email exists or not for security
        return {"message": "If the email exists, a reset link has been sent"}
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    reset_expires = datetime.utcnow() + timedelta(hours=1)
    
    # Update user with reset token
    await db.users.update_one(
        {"id": user_doc["id"]},
        {
            "$set": {
                "password_reset_token": reset_token,
                "password_reset_expires": reset_expires,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # Log simulated password reset email
    logger.info(f"SIMULATED EMAIL: Password reset link: /reset-password?token={reset_token}")
    
    return {"message": "If the email exists, a reset link has been sent"}

@api_router.post("/auth/reset-password-confirm")
async def confirm_password_reset(request: PasswordResetConfirm):
    # Find user by reset token
    user_doc = await db.users.find_one({
        "password_reset_token": request.token,
        "password_reset_expires": {"$gt": datetime.utcnow()}
    })
    
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Update password
    new_password_hash = get_password_hash(request.new_password)
    await db.users.update_one(
        {"id": user_doc["id"]},
        {
            "$set": {
                "password_hash": new_password_hash,
                "password_reset_token": None,
                "password_reset_expires": None,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return {"message": "Password reset successful"}

# User profile endpoints
@api_router.get("/user/profile", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    return UserResponse(**current_user.dict())

@api_router.put("/user/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserUpdateProfile,
    current_user: User = Depends(get_current_user)
):
    update_data = {"updated_at": datetime.utcnow()}
    
    if profile_data.region:
        if profile_data.region not in ["India", "Canada"]:
            raise HTTPException(status_code=400, detail="Region must be 'India' or 'Canada'")
        update_data["region"] = profile_data.region
    
    # Update user in database
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": update_data}
    )
    
    # Return updated user
    updated_user_doc = await db.users.find_one({"id": current_user.id})
    return UserResponse(**updated_user_doc)

# Health check endpoint
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
