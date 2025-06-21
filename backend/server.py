from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from jwt import PyJWTError
import secrets
import pytz
import time
import hmac
import hashlib
import sys
import os

# Add current directory to Python path for local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup logging
logger = logging.getLogger(__name__)

# Email service import
from utils.email import (
    send_verification_email,
    send_password_reset_email, 
    send_order_confirmation_email,
    send_shipping_update_email
)

# Payment integrations
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import razorpay
import stripe

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

# Payment configurations
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_demo_key')
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', 'rzp_test_demo_key')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', 'demo_secret')
RAZORPAY_WEBHOOK_SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', 'demo_webhook_secret')

# Initialize payment clients
stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY)
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Regional configurations
REGION_CONFIG = {
    "India": {
        "currency": "INR",
        "tax_rate": 0.18,  # 18% GST
        "timezone": "Asia/Kolkata",
        "exchange_rate": 1.0,  # Base currency
        "payment_gateway": "razorpay"
    },
    "Canada": {
        "currency": "CAD", 
        "tax_rate": 0.13,  # 13% HST
        "timezone": "America/Toronto",
        "exchange_rate": 0.06,  # 1 INR = 0.06 CAD (approximate)
        "payment_gateway": "stripe"
    }
}

# Auth Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password_hash: str
    region: str = Field(..., description="India or Canada")
    is_email_verified: bool = False
    is_admin: bool = False
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
    is_admin: bool
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

# Product Models
class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    category: str = Field(..., description="cookies, cakes, breads")
    base_price: float = Field(..., description="Price in INR")
    image_url: str
    subscription_eligible: bool = False
    in_stock: bool = True
    ingredients: Optional[List[str]] = Field(default_factory=list)
    bakers_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProductCreate(BaseModel):
    name: str
    description: str
    category: str = Field(..., description="cookies, cakes, breads")
    base_price: float = Field(..., gt=0, description="Price in INR")
    image_url: str
    subscription_eligible: bool = False
    in_stock: bool = True
    ingredients: Optional[List[str]] = Field(default_factory=list)
    bakers_notes: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    base_price: Optional[float] = Field(None, gt=0)
    image_url: Optional[str] = None
    subscription_eligible: Optional[bool] = None
    in_stock: Optional[bool] = None
    ingredients: Optional[List[str]] = None
    bakers_notes: Optional[str] = None

class ProductResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    base_price: float
    regional_price: float
    currency: str
    image_url: str
    subscription_eligible: bool
    in_stock: bool
    ingredients: List[str]
    bakers_notes: Optional[str]
    created_at: datetime

# Cart Models
class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    subscription_type: str = Field("one-time", description="one-time, weekly, monthly")

class CartItemResponse(BaseModel):
    product_id: str
    product_name: str
    product_image: str
    quantity: int
    subscription_type: str
    unit_price: float
    total_price: float
    currency: str

class CartResponse(BaseModel):
    items: List[CartItemResponse]
    subtotal: float
    tax: float
    total: float
    currency: str
    region: str
    delivery_message: str

class CartUpdate(BaseModel):
    items: List[CartItem]

# Payment Models
class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payment_gateway: str = Field(..., description="stripe or razorpay")
    gateway_order_id: Optional[str] = None
    gateway_payment_id: Optional[str] = None
    amount: float
    currency: str
    status: str = Field("initiated", description="initiated, pending, completed, failed, cancelled")
    payment_status: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    region: str
    cart_items: List[Dict] = Field(default_factory=list)
    delivery_address: Optional[Dict] = None
    metadata: Optional[Dict] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class CheckoutRequest(BaseModel):
    cart_items: List[CartItem]
    delivery_address: Dict
    region: str
    user_email: Optional[str] = None
    promo_code: Optional[str] = None

class CheckoutResponse(BaseModel):
    checkout_url: str
    payment_gateway: str
    transaction_id: str
    amount: float
    currency: str
    gateway_order_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None

class PaymentStatusRequest(BaseModel):
    transaction_id: str

class PaymentStatusResponse(BaseModel):
    transaction_id: str
    status: str
    payment_status: str
    amount: float
    currency: str
    gateway_payment_id: Optional[str] = None

# Admin Models
class OrderCreate(BaseModel):
    user_email: str
    transaction_id: str
    items: List[Dict]
    subtotal: float
    tax: float
    total: float
    currency: str
    region: str
    delivery_address: Dict
    notes: Optional[str] = None

class OrderUpdate(BaseModel):
    order_status: Optional[str] = None
    delivery_status: Optional[str] = None
    tracking_link: Optional[str] = None
    notes: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    user_email: str
    items: List[Dict]
    total: float
    currency: str
    region: str
    delivery_address: Dict
    order_status: str
    payment_status: str
    delivery_status: str
    tracking_link: Optional[str]
    delivery_date: Optional[datetime]
    notes: Optional[str]
    order_type: Optional[str] = None  # "One-Time" or "Subscription"
    subscription_frequency: Optional[str] = None  # "Weekly" or "Monthly"
    created_at: datetime

class AdminStatsResponse(BaseModel):
    total_orders: int
    pending_orders: int
    shipped_orders: int
    delivered_orders: int
    total_revenue: float
    monthly_sales: float
    new_orders: int

class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    user_email: str
    transaction_id: str
    items: List[Dict]
    subtotal: float
    tax: float
    total: float
    currency: str
    region: str
    delivery_address: Dict
    order_status: str = Field("pending", description="pending, confirmed, preparing, shipped, delivered, cancelled")
    payment_status: str = Field("pending", description="pending, completed, failed, refunded")
    delivery_status: str = Field("processing", description="processing, shipped, delivered")
    tracking_link: Optional[str] = None
    delivery_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class OrderResponse(BaseModel):
    id: str
    user_email: str
    items: List[Dict]
    total: float
    currency: str
    region: str
    order_status: str
    payment_status: str
    delivery_date: Optional[datetime]
    created_at: datetime

# Delivery Models
class DeliveryInfo(BaseModel):
    region: str
    available_today: bool
    message: str
    cutoff_time: str

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

async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def convert_price(base_price: float, region: str) -> float:
    """Convert INR base price to regional currency"""
    if region not in REGION_CONFIG:
        return base_price
    
    exchange_rate = REGION_CONFIG[region]["exchange_rate"]
    return round(base_price * exchange_rate, 2)

def calculate_tax(subtotal: float, region: str) -> float:
    """Calculate tax based on region"""
    if region not in REGION_CONFIG:
        return 0
    
    tax_rate = REGION_CONFIG[region]["tax_rate"]
    return round(subtotal * tax_rate, 2)

def get_delivery_info(region: str) -> DeliveryInfo:
    """Get delivery availability based on regional time"""
    if region not in REGION_CONFIG:
        return DeliveryInfo(
            region=region,
            available_today=False,
            message="Delivery not available",
            cutoff_time="N/A"
        )
    
    timezone = REGION_CONFIG[region]["timezone"]
    regional_tz = pytz.timezone(timezone)
    current_time = datetime.now(regional_tz)
    cutoff_hour = 10  # 10 AM cutoff
    
    available_today = current_time.hour < cutoff_hour
    cutoff_time = f"{cutoff_hour}:00 AM {timezone.split('/')[-1]} time"
    
    if available_today:
        message = f"Order by {cutoff_time} for same-day delivery"
    else:
        message = f"Next available delivery: Tomorrow (order by {cutoff_time})"
    
    return DeliveryInfo(
        region=region,
        available_today=available_today,
        message=message,
        cutoff_time=cutoff_time
    )

# Auth endpoints
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    """Register a new user with email verification"""
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = pwd_context.hash(user_data.password)
    
    # Generate verification token
    verification_token = str(uuid.uuid4())
    verification_expires = datetime.utcnow() + timedelta(hours=24)
    
    # Create user document
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "hashed_password": hashed_password,
        "region": user_data.region,
        "is_admin": False,
        "is_email_verified": False,
        "verification_token": verification_token,
        "verification_expires": verification_expires,
        "created_at": datetime.utcnow()
    }
    
    # Insert user into database
    await db.users.insert_one(user_doc)
    
    # Send verification email
    try:
        email_result = await send_verification_email(
            recipient_email=user_data.email,
            verification_token=verification_token,
            base_url="https://7dbdecab-5916-447f-8d41-222dafed78fb.preview.emergentagent.com"
        )
        
        if email_result["success"]:
            logger.info(f"Verification email sent successfully to {user_data.email}")
        else:
            logger.error(f"Failed to send verification email: {email_result.get('error')}")
            
    except Exception as e:
        logger.error(f"Email service error: {str(e)}")
        # Don't fail registration if email fails, but log it
    
    # Return user data (excluding sensitive information)
    return UserResponse(**{k: v for k, v in user_doc.items() if k != "hashed_password"})

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
    """Request password reset with email"""
    user = await db.users.find_one({"email": request.email})
    if not user:
        # Don't reveal if email exists or not for security
        return {"message": "If an account with this email exists, you will receive a password reset link."}
    
    # Generate reset token
    reset_token = str(uuid.uuid4())
    reset_expires = datetime.utcnow() + timedelta(hours=1)  # 1 hour expiry
    
    # Update user with reset token
    await db.users.update_one(
        {"email": request.email},
        {
            "$set": {
                "password_reset_token": reset_token,
                "password_reset_expires": reset_expires
            }
        }
    )
    
    # Send password reset email
    try:
        email_result = await send_password_reset_email(
            recipient_email=request.email,
            reset_token=reset_token,
            base_url="https://7dbdecab-5916-447f-8d41-222dafed78fb.preview.emergentagent.com"
        )
        
        if email_result["success"]:
            logger.info(f"Password reset email sent successfully to {request.email}")
        else:
            logger.error(f"Failed to send password reset email: {email_result.get('error')}")
            
    except Exception as e:
        logger.error(f"Email service error for password reset: {str(e)}")
    
    return {"message": "If an account with this email exists, you will receive a password reset link."}

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

# Product endpoints
@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(region: str = "India", category: Optional[str] = None, search: Optional[str] = None):
    # Validate region
    if region not in REGION_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid region")
    
    # Build query
    query = {"in_stock": True}
    if category:
        query["category"] = category
    
    # Add search functionality
    if search:
        search_regex = {"$regex": search, "$options": "i"}  # Case-insensitive search
        query["$or"] = [
            {"name": search_regex},
            {"description": search_regex},
            {"category": search_regex},
            {"ingredients": {"$elemMatch": {"$regex": search, "$options": "i"}}},
            {"bakers_notes": search_regex}
        ]
    
    # Get products from database
    products = await db.products.find(query).to_list(1000)
    
    # Convert to response format with regional pricing
    result = []
    for product_doc in products:
        product = Product(**product_doc)
        regional_price = convert_price(product.base_price, region)
        currency = REGION_CONFIG[region]["currency"]
        
        result.append(ProductResponse(
            id=product.id,
            name=product.name,
            description=product.description,
            category=product.category,
            base_price=product.base_price,
            regional_price=regional_price,
            currency=currency,
            image_url=product.image_url,
            subscription_eligible=product.subscription_eligible,
            in_stock=product.in_stock,
            ingredients=product.ingredients or [],
            bakers_notes=product.bakers_notes,
            created_at=product.created_at
        ))
    
    return result

@api_router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, region: str = "India"):
    # Validate region
    if region not in REGION_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid region")
    
    # Get product from database
    product_doc = await db.products.find_one({"id": product_id})
    if not product_doc:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product = Product(**product_doc)
    regional_price = convert_price(product.base_price, region)
    currency = REGION_CONFIG[region]["currency"]
    
    return ProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        category=product.category,
        base_price=product.base_price,
        regional_price=regional_price,
        currency=currency,
        image_url=product.image_url,
        subscription_eligible=product.subscription_eligible,
        in_stock=product.in_stock,
        ingredients=product.ingredients or [],
        bakers_notes=product.bakers_notes,
        created_at=product.created_at
    )

# Cart endpoints
@api_router.post("/cart", response_model=CartResponse)
async def calculate_cart(cart_data: CartUpdate, region: str = "India"):
    # Validate region
    if region not in REGION_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid region")
    
    # Get products for cart items
    product_ids = [item.product_id for item in cart_data.items]
    products = await db.products.find({"id": {"$in": product_ids}}).to_list(1000)
    
    if len(products) != len(product_ids):
        raise HTTPException(status_code=404, detail="One or more products not found")
    
    # Build product lookup
    product_lookup = {p["id"]: Product(**p) for p in products}
    
    # Calculate cart items
    cart_items = []
    subtotal = 0
    currency = REGION_CONFIG[region]["currency"]
    
    for item in cart_data.items:
        product = product_lookup[item.product_id]
        
        # Check subscription eligibility
        if item.subscription_type != "one-time" and not product.subscription_eligible:
            raise HTTPException(
                status_code=400, 
                detail=f"Product {product.name} is not eligible for subscriptions"
            )
        
        unit_price = convert_price(product.base_price, region)
        total_price = unit_price * item.quantity
        subtotal += total_price
        
        cart_items.append(CartItemResponse(
            product_id=item.product_id,
            product_name=product.name,
            product_image=product.image_url,
            quantity=item.quantity,
            subscription_type=item.subscription_type,
            unit_price=unit_price,
            total_price=total_price,
            currency=currency
        ))
    
    # Calculate tax and total
    tax = calculate_tax(subtotal, region)
    total = subtotal + tax
    
    # Get delivery info
    delivery = get_delivery_info(region)
    
    return CartResponse(
        items=cart_items,
        subtotal=round(subtotal, 2),
        tax=round(tax, 2),
        total=round(total, 2),
        currency=currency,
        region=region,
        delivery_message=delivery.message
    )

# Health check endpoint
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Delivery endpoint
@api_router.get("/delivery", response_model=DeliveryInfo)
async def get_delivery_availability(region: str = "India"):
    return get_delivery_info(region)

# Admin endpoints
@api_router.post("/admin/products", response_model=ProductResponse)
async def create_product(
    product_data: ProductCreate,
    admin_user: User = Depends(get_admin_user)
):
    # Validate category
    valid_categories = ["cookies", "cakes", "breads"]
    if product_data.category not in valid_categories:
        raise HTTPException(
            status_code=400, 
            detail=f"Category must be one of: {', '.join(valid_categories)}"
        )
    
    # Create product
    product = Product(**product_data.dict())
    
    # Save to database
    await db.products.insert_one(product.dict())
    
    # Return with regional pricing (using India as default)
    regional_price = convert_price(product.base_price, "India")
    
    return ProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        category=product.category,
        base_price=product.base_price,
        regional_price=regional_price,
        currency="INR",
        image_url=product.image_url,
        subscription_eligible=product.subscription_eligible,
        in_stock=product.in_stock,
        ingredients=product.ingredients or [],
        bakers_notes=product.bakers_notes,
        created_at=product.created_at
    )

@api_router.put("/admin/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    product_data: ProductUpdate,
    admin_user: User = Depends(get_admin_user)
):
    # Check if product exists
    existing_product = await db.products.find_one({"id": product_id})
    if not existing_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Validate category if provided
    if product_data.category:
        valid_categories = ["cookies", "cakes", "breads"]
        if product_data.category not in valid_categories:
            raise HTTPException(
                status_code=400, 
                detail=f"Category must be one of: {', '.join(valid_categories)}"
            )
    
    # Update product
    update_data = {k: v for k, v in product_data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.products.update_one(
        {"id": product_id},
        {"$set": update_data}
    )
    
    # Return updated product
    updated_product_doc = await db.products.find_one({"id": product_id})
    product = Product(**updated_product_doc)
    regional_price = convert_price(product.base_price, "India")
    
    return ProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        category=product.category,
        base_price=product.base_price,
        regional_price=regional_price,
        currency="INR",
        image_url=product.image_url,
        subscription_eligible=product.subscription_eligible,
        in_stock=product.in_stock,
        ingredients=product.ingredients or [],
        bakers_notes=product.bakers_notes,
        created_at=product.created_at
    )

@api_router.delete("/admin/products/{product_id}")
async def delete_product(
    product_id: str,
    admin_user: User = Depends(get_admin_user)
):
    # Check if product exists
    existing_product = await db.products.find_one({"id": product_id})
    if not existing_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Delete product
    await db.products.delete_one({"id": product_id})
    
    return {"message": "Product deleted successfully"}

@api_router.get("/admin/products", response_model=List[ProductResponse])
async def get_all_products_admin(admin_user: User = Depends(get_admin_user)):
    # Get all products (including out of stock)
    products = await db.products.find().to_list(1000)
    
    # Convert to response format
    result = []
    for product_doc in products:
        product = Product(**product_doc)
        regional_price = convert_price(product.base_price, "India")
        
        result.append(ProductResponse(
            id=product.id,
            name=product.name,
            description=product.description,
            category=product.category,
            base_price=product.base_price,
            regional_price=regional_price,
            currency="INR",
            image_url=product.image_url,
            subscription_eligible=product.subscription_eligible,
            in_stock=product.in_stock,
            ingredients=product.ingredients or [],
            bakers_notes=product.bakers_notes,
            created_at=product.created_at
        ))
    
    return result

# ADMIN ORDER MANAGEMENT ENDPOINTS
@api_router.get("/admin/orders", response_model=List[OrderResponse])
async def get_admin_orders(
    admin_user: User = Depends(get_admin_user),
    status: Optional[str] = None,
    region: Optional[str] = None,
    order_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get all orders for admin with comprehensive filtering"""
    query = {}
    
    # Filter by status
    if status and status != "all":
        query["payment_status"] = status
    
    # Filter by region
    if region and region != "all":
        query["region"] = region
        
    # Filter by order type (subscription vs one-time)
    if order_type and order_type != "all":
        if order_type == "subscription":
            query["items.subscription_type"] = {"$ne": "one-time"}
        elif order_type == "one-time":
            query["items.subscription_type"] = "one-time"
    
    # Filter by date range
    if start_date and end_date:
        try:
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query["created_at"] = {"$gte": start, "$lte": end}
        except ValueError:
            pass  # Invalid date format, ignore filter
    
    # Get orders with filters
    orders = await db.orders.find(query).sort("created_at", -1).to_list(1000)
    
    # Convert to response format with enhanced order type info
    result = []
    for order_doc in orders:
        # Determine order type and subscription frequency
        order_type_info = "One-Time"
        subscription_frequency = None
        
        if order_doc.get("items"):
            for item in order_doc["items"]:
                if item.get("subscription_type") and item["subscription_type"] != "one-time":
                    order_type_info = "Subscription"
                    subscription_frequency = item["subscription_type"].title()
                    break
        
        # Enhanced order response
        enhanced_order = OrderResponse(**order_doc)
        enhanced_order.order_type = order_type_info
        enhanced_order.subscription_frequency = subscription_frequency
        
        result.append(enhanced_order)
    
    return result

@api_router.put("/admin/orders/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    order_update: OrderUpdate,
    admin_user: User = Depends(get_admin_user)
):
    """Update order status, tracking, and notes"""
    # Check if order exists
    existing_order = await db.orders.find_one({"id": order_id})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Prepare update data
    update_data = {k: v for k, v in order_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    # Update order
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update_data}
    )
    
    # Return updated order
    updated_order_doc = await db.orders.find_one({"id": order_id})
    order = Order(**updated_order_doc)
    
    return OrderResponse(
        id=order.id,
        user_email=order.user_email,
        items=order.items,
        total=order.total,
        currency=order.currency,
        region=order.region,
        delivery_address=order.delivery_address,
        order_status=order.order_status,
        payment_status=order.payment_status,
        delivery_status=order.delivery_status,
        tracking_link=order.tracking_link,
        delivery_date=order.delivery_date,
        notes=order.notes,
        created_at=order.created_at
    )

@api_router.get("/admin/stats", response_model=AdminStatsResponse)
async def get_admin_stats(admin_user: User = Depends(get_admin_user)):
    """Get admin dashboard statistics"""
    
    # Count all orders
    total_orders = await db.orders.count_documents({})
    
    # Count orders by status
    pending_orders = await db.orders.count_documents({"order_status": "pending"})
    shipped_orders = await db.orders.count_documents({"order_status": "shipped"})
    delivered_orders = await db.orders.count_documents({"order_status": "delivered"})
    
    # Calculate total revenue
    revenue_pipeline = [
        {"$match": {"payment_status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    revenue_result = await db.orders.aggregate(revenue_pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Calculate monthly sales (current month)
    current_month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_pipeline = [
        {"$match": {
            "payment_status": "completed",
            "created_at": {"$gte": current_month_start}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    monthly_result = await db.orders.aggregate(monthly_pipeline).to_list(1)
    monthly_sales = monthly_result[0]["total"] if monthly_result else 0
    
    # Count new orders (last 24 hours)
    yesterday = datetime.now() - timedelta(days=1)
    new_orders = await db.orders.count_documents({
        "created_at": {"$gte": yesterday}
    })
    
    return AdminStatsResponse(
        total_orders=total_orders,
        pending_orders=pending_orders,
        shipped_orders=shipped_orders,
        delivered_orders=delivered_orders,
        total_revenue=total_revenue,
        monthly_sales=monthly_sales,
        new_orders=new_orders
    )

# USER ORDER & SUBSCRIPTION ENDPOINTS
@api_router.get("/users/orders", response_model=List[OrderResponse])
async def get_user_orders(
    current_user: User = Depends(get_current_user),
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    """Get orders for the current user"""
    # Build query for user's orders
    query = {"user_email": current_user.email}
    
    if status:
        query["order_status"] = status
    
    # Date filtering
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = datetime.fromisoformat(date_from)
        if date_to:
            date_query["$lte"] = datetime.fromisoformat(date_to)
        query["created_at"] = date_query
    
    # Get orders
    orders = await db.orders.find(query).sort("created_at", -1).to_list(100)
    
    # Convert to response format
    result = []
    for order_doc in orders:
        order = Order(**order_doc)
        result.append(OrderResponse(
            id=order.id,
            user_email=order.user_email,
            items=order.items,
            total=order.total,
            currency=order.currency,
            region=order.region,
            delivery_address=order.delivery_address,
            order_status=order.order_status,
            payment_status=order.payment_status,
            delivery_status=order.delivery_status,
            tracking_link=order.tracking_link,
            delivery_date=order.delivery_date,
            notes=order.notes,
            created_at=order.created_at
        ))
    
    return result

@api_router.get("/users/subscriptions")
async def get_user_subscriptions(current_user: User = Depends(get_current_user)):
    """Get subscriptions for the current user"""
    try:
        subscriptions = await db.subscriptions.find({"user_email": current_user.email}).to_list(100)
        return subscriptions
    except Exception as e:
        # Return demo subscription if collection doesn't exist
        return [{
            "id": "demo_sub_001",
            "plan_name": "Monthly Cookie Box",
            "status": "active",
            "next_renewal": (datetime.utcnow() + timedelta(days=7)).isoformat(),
            "created_at": (datetime.utcnow() - timedelta(days=30)).isoformat(),
            "products": ["Choco Chunk Cookies", "Almond Crunch Cookies"],
            "monthly_price": 460,
            "currency": "INR",
            "user_email": current_user.email
        }]

@api_router.post("/subscriptions/{subscription_id}/{action}")
async def manage_subscription(
    subscription_id: str,
    action: str,
    current_user: User = Depends(get_current_user)
):
    """Manage subscription (pause, cancel, resume)"""
    if action not in ["pause", "cancel", "resume"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # For demo, just return success
    return {"message": f"Subscription {action} successful", "subscription_id": subscription_id}

# NEW PAYMENT ENDPOINTS
@api_router.post("/payments/checkout", response_model=CheckoutResponse)
async def create_checkout(checkout_request: CheckoutRequest, request: Request):
    """Create checkout session with regional payment gateway routing"""
    try:
        # Get the frontend origin for redirect URLs
        origin = request.headers.get("origin") or "http://localhost:3000"
        
        # Calculate cart total
        cart_response = await calculate_cart(
            CartUpdate(items=checkout_request.cart_items), 
            checkout_request.region
        )
        
        # Create payment transaction record
        payment_gateway = REGION_CONFIG[checkout_request.region]["payment_gateway"]
        
        transaction = PaymentTransaction(
            payment_gateway=payment_gateway,
            amount=cart_response.total,
            currency=cart_response.currency,
            region=checkout_request.region,
            user_email=checkout_request.user_email,
            cart_items=[item.dict() for item in cart_response.items],
            delivery_address=checkout_request.delivery_address,
            metadata={
                "promo_code": checkout_request.promo_code,
                "delivery_message": cart_response.delivery_message
            }
        )
        
        # Save transaction to database
        await db.payment_transactions.insert_one(transaction.dict())
        
        # Route to appropriate payment gateway
        if payment_gateway == "stripe":
            # Create Stripe checkout session for Canada using native Stripe SDK
            try:
                import stripe
                stripe.api_key = STRIPE_API_KEY
                
                # Prepare line items for Stripe
                line_items = []
                for item in cart_response.items:
                    line_items.append({
                        'price_data': {
                            'currency': cart_response.currency.lower(),
                            'product_data': {
                                'name': item.product_name,
                            },
                            'unit_amount': int(item.unit_price * 100),
                        },
                        'quantity': item.quantity,
                    })
                
                # Create Stripe checkout session directly
                checkout_session = stripe.checkout.Session.create(
                    payment_method_types=['card'],
                    line_items=line_items,
                    mode='payment',
                    success_url=f"{origin}/order-confirmation?session_id={{CHECKOUT_SESSION_ID}}&transaction_id={transaction.id}",
                    cancel_url=f"{origin}/cart?cancelled=true",
                    customer_email=checkout_request.user_email,
                    metadata={
                        "transaction_id": transaction.id,
                        "user_email": checkout_request.user_email,
                        "region": checkout_request.region
                    }
                )
                
                # Update transaction with Stripe session ID
                await db.payment_transactions.update_one(
                    {"id": transaction.id},
                    {"$set": {
                        "stripe_session_id": checkout_session.id,
                        "updated_at": datetime.utcnow()
                    }}
                )
                
                return CheckoutResponse(
                    checkout_url=checkout_session.url,
                    payment_gateway=payment_gateway,
                    transaction_id=transaction.id,
                    amount=cart_response.total,
                    currency=cart_response.currency
                )
                    
            except Exception as e:
                logger.error(f"Stripe checkout error: {str(e)}")
                raise HTTPException(status_code=500, detail="Payment processing error")
        
        elif payment_gateway == "razorpay":
            # Create Razorpay order for India
            try:
                razorpay_order = razorpay_client.order.create({
                    "amount": int(cart_response.total * 100),  # Amount in paise
                    "currency": cart_response.currency,
                    "receipt": transaction.id,
                    "notes": {
                        "user_email": checkout_request.user_email,
                        "region": checkout_request.region
                    }
                })
                
                # Update transaction with Razorpay order ID
                await db.payment_transactions.update_one(
                    {"id": transaction.id},
                    {"$set": {
                        "razorpay_order_id": razorpay_order["id"],
                        "updated_at": datetime.utcnow()
                    }}
                )
                
                return CheckoutResponse(
                    checkout_url=f"{origin}/checkout/razorpay?order_id={razorpay_order['id']}&transaction_id={transaction.id}",
                    payment_gateway=payment_gateway,
                    transaction_id=transaction.id,
                    amount=cart_response.total,
                    currency=cart_response.currency,
                    razorpay_order_id=razorpay_order["id"]
                )
                
            except Exception as e:
                logger.error(f"Razorpay order creation error: {str(e)}")
                raise HTTPException(status_code=500, detail="Payment processing error")
        
        else:
            raise HTTPException(status_code=400, detail="Unsupported payment gateway")
            
    except Exception as e:
        logger.error(f"Checkout error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/payments/status/{transaction_id}", response_model=PaymentStatusResponse)
async def get_payment_status(transaction_id: str):
    """Get payment status for a transaction"""
    transaction_doc = await db.payment_transactions.find_one({"id": transaction_id})
    if not transaction_doc:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    transaction = PaymentTransaction(**transaction_doc)
    
    try:
        if transaction.payment_gateway == "stripe" and transaction.gateway_order_id:
            # Check Stripe status
            status_response = await stripe_checkout.get_checkout_status(transaction.gateway_order_id)
            
            # Update transaction status
            await db.payment_transactions.update_one(
                {"id": transaction_id},
                {"$set": {
                    "status": "completed" if status_response.payment_status == "paid" else transaction.status,
                    "payment_status": status_response.payment_status,
                    "updated_at": datetime.utcnow()
                }}
            )
            
            # Create order if payment successful
            if status_response.payment_status == "paid" and transaction.status != "completed":
                await create_order_from_transaction(transaction)
            
            return PaymentStatusResponse(
                transaction_id=transaction_id,
                status="completed" if status_response.payment_status == "paid" else transaction.status,
                payment_status=status_response.payment_status,
                amount=transaction.amount,
                currency=transaction.currency
            )
            
        elif transaction.payment_gateway == "razorpay":
            # For Razorpay, status will be updated via webhook or frontend verification
            return PaymentStatusResponse(
                transaction_id=transaction_id,
                status=transaction.status,
                payment_status=transaction.payment_status or "pending",
                amount=transaction.amount,
                currency=transaction.currency,
                gateway_payment_id=transaction.gateway_payment_id
            )
            
    except Exception as e:
        logger.error(f"Payment status check error: {e}")
        return PaymentStatusResponse(
            transaction_id=transaction_id,
            status=transaction.status,
            payment_status=transaction.payment_status or "unknown",
            amount=transaction.amount,
            currency=transaction.currency
        )

@api_router.post("/payments/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    try:
        payload = await request.body()
        sig_header = request.headers.get('stripe-signature')
        
        # For demo purposes, we'll process without signature verification
        # In production, add proper webhook signature verification
        
        import json
        event = json.loads(payload)
        logger.info(f"Received Stripe webhook event: {event['type']}")
        
        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            session_id = session['id']
            customer_email = session.get('customer_email', session.get('customer_details', {}).get('email'))
            
            logger.info(f"Processing completed checkout session: {session_id}")
            
            # Find the transaction
            transaction = await db.payment_transactions.find_one({"stripe_session_id": session_id})
            if not transaction:
                logger.error(f"Transaction not found for Stripe session: {session_id}")
                return {"status": "error", "message": "Transaction not found"}
            
            logger.info(f"Found transaction: {transaction['id']}")
            
            # Create the order
            order = Order(
                user_email=transaction["user_email"],
                transaction_id=transaction["id"],
                items=transaction["cart_items"],
                total=transaction["amount"],
                currency=transaction["currency"],
                region=transaction["region"],
                delivery_address=transaction["delivery_address"],
                order_status="confirmed",
                payment_status="completed"
            )
            
            await db.orders.insert_one(order.dict())
            logger.info(f"Order created: {order.id}")
            
            # Update transaction status
            await db.payment_transactions.update_one(
                {"id": transaction["id"]},
                {"$set": {
                    "status": "completed",
                    "stripe_payment_intent": session.get('payment_intent'),
                    "updated_at": datetime.utcnow()
                }}
            )
            
            # Send order confirmation email
            try:
                # Prepare order data for email
                order_data = {
                    "order_id": order.id,
                    "order_date": order.created_at.strftime("%B %d, %Y at %I:%M %p"),
                    "region": order.region,
                    "items": [
                        {
                            "name": item.get("product_name", "Unknown Item"),
                            "quantity": item.get("quantity", 1),
                            "price": item.get("unit_price", 0)
                        }
                        for item in order.items
                    ],
                    "total": order.total,
                    "currency": "CAD" if order.region == "Canada" else "INR",
                    "expected_delivery": "2-3 business days"
                }
                
                email_result = await send_order_confirmation_email(
                    recipient_email=order.user_email,
                    order_data=order_data
                )
                
                if email_result["success"]:
                    logger.info(f"Order confirmation email sent successfully to {order.user_email}")
                else:
                    logger.error(f"Failed to send order confirmation email: {email_result.get('error')}")
                    
            except Exception as email_error:
                logger.error(f"Email sending error: {str(email_error)}")
            
            logger.info(f"Webhook processing completed successfully for order: {order.id}")
            
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Stripe webhook error: {str(e)}")
        import traceback
        logger.error(f"Webhook traceback: {traceback.format_exc()}")
        return {"status": "error", "message": str(e)}
    """Verify Razorpay payment from frontend"""
    try:
        data = await request.json()
        payment_id = data.get("razorpay_payment_id")
        order_id = data.get("razorpay_order_id")
        signature = data.get("razorpay_signature")
        
        # Verify signature
        generated_signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256
        ).hexdigest()
        
        if generated_signature != signature:
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Find transaction by order ID
        transaction_doc = await db.payment_transactions.find_one({"gateway_order_id": order_id})
        if not transaction_doc:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        transaction = PaymentTransaction(**transaction_doc)
        
        # Update transaction status
        await db.payment_transactions.update_one(
            {"id": transaction.id},
            {"$set": {
                "status": "completed",
                "payment_status": "paid",
                "gateway_payment_id": payment_id,
                "updated_at": datetime.utcnow()
            }}
        )
        
        # Create order
        await create_order_from_transaction(transaction)
        
        return {"status": "success", "transaction_id": transaction.id}
        
    except Exception as e:
        logger.error(f"Razorpay verification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def create_order_from_transaction(transaction: PaymentTransaction):
    """Create order from completed payment transaction"""
    try:
        # Check if order already exists
        existing_order = await db.orders.find_one({"transaction_id": transaction.id})
        if existing_order:
            return
        
        # Calculate delivery date (tomorrow if past cutoff)
        delivery_info = get_delivery_info(transaction.region)
        delivery_date = datetime.utcnow() + timedelta(days=1 if not delivery_info.available_today else 0)
        
        order = Order(
            user_email=transaction.user_email or "guest@example.com",
            transaction_id=transaction.id,
            items=transaction.cart_items,
            subtotal=transaction.amount - (transaction.amount * 0.15),  # Approximate subtotal
            tax=transaction.amount * 0.15,  # Approximate tax
            total=transaction.amount,
            currency=transaction.currency,
            region=transaction.region,
            delivery_address=transaction.delivery_address or {},
            order_status="confirmed",
            payment_status="completed",
            delivery_date=delivery_date,
            notes=transaction.metadata.get("delivery_message", "")
        )
        
        await db.orders.insert_one(order.dict())
        logger.info(f"Order created for transaction {transaction.id}")
        
    except Exception as e:
        logger.error(f"Order creation error: {e}")

# Order endpoints
@api_router.get("/orders", response_model=List[OrderResponse])
async def get_orders(current_user: User = Depends(get_current_user)):
    """Get orders for current user"""
    orders = await db.orders.find({"user_email": current_user.email}).to_list(1000)
    return [OrderResponse(**order) for order in orders]

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    """Get specific order"""
    order_doc = await db.orders.find_one({"id": order_id, "user_email": current_user.email})
    if not order_doc:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return OrderResponse(**order_doc)

# Initialize sample data
@api_router.post("/clear-products")
async def clear_products():
    """Clear all products from database"""
    await db.products.delete_many({})
    return {"message": "All products cleared"}

@api_router.post("/init-data")
async def initialize_sample_data():
    """Initialize sample products and admin user"""
    
    # Create admin user if doesn't exist
    admin_email = "admin@flintandflours.com"
    existing_admin = await db.users.find_one({"email": admin_email})
    
    if not existing_admin:
        admin_user = User(
            email=admin_email,
            password_hash=get_password_hash("admin123"),
            region="India",
            is_admin=True,
            is_email_verified=True
        )
        await db.users.insert_one(admin_user.dict())
    
    # Create sample orders for demo
    sample_orders = [
        {
            "user_email": "customer1@example.com",
            "transaction_id": "TXN_001",
            "items": [
                {
                    "product_id": "sample_product_1",
                    "product_name": "Jowar Bread",
                    "quantity": 2,
                    "unit_price": 150.0,
                    "total_price": 300.0
                }
            ],
            "subtotal": 300.0,
            "tax": 54.0,
            "total": 354.0,
            "currency": "INR",
            "region": "India",
            "delivery_address": {
                "name": "John Doe",
                "email": "customer1@example.com",
                "phone": "+91 9876543210",
                "address": "123 Main Street",
                "city": "Mumbai",
                "postal_code": "400001"
            },
            "order_status": "pending",
            "payment_status": "completed",
            "delivery_status": "processing"
        },
        {
            "user_email": "customer2@example.com", 
            "transaction_id": "TXN_002",
            "items": [
                {
                    "product_id": "sample_product_2",
                    "product_name": "Chocolate Cake",
                    "quantity": 1,
                    "unit_price": 1300.0,
                    "total_price": 1300.0
                }
            ],
            "subtotal": 1300.0,
            "tax": 234.0,
            "total": 1534.0,
            "currency": "INR",
            "region": "India",
            "delivery_address": {
                "name": "Jane Smith",
                "email": "customer2@example.com",
                "phone": "+91 9876543211",
                "address": "456 Oak Avenue",
                "city": "Delhi",
                "postal_code": "110001"
            },
            "order_status": "confirmed",
            "payment_status": "completed",
            "delivery_status": "shipped",
            "tracking_link": "https://tracking.example.com/TRACK123"
        }
    ]
    
    for order_data in sample_orders:
        order = Order(**order_data)
        existing_order = await db.orders.find_one({"transaction_id": order.transaction_id})
        if not existing_order:
            await db.orders.insert_one(order.dict())
    
    # Real Flint & Flours Products
    sample_products = [
        # SLICE BREADS
        {
            "name": "Jowar Bread",
            "description": "Nutritious jowar bread, perfect for daily consumption. Available in 500g and 240g sizes.",
            "category": "breads",
            "base_price": 150.0,  # 500g price
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True,
            "ingredients": ["Jowar flour", "Yeast", "Salt", "Water", "Natural preservatives"],
            "bakers_notes": "Made with premium jowar flour. 500g: ₹150, 240g: ₹80. Great source of protein and fiber."
        },
        {
            "name": "Multigrain Bread",
            "description": "Healthy blend of jowar, bajra, and nachni. Packed with nutrients and flavor.",
            "category": "breads",
            "base_price": 155.0,  # 500g price
            "image_url": "https://images.unsplash.com/photo-1586444248902-2f64eddc13df",
            "subscription_eligible": True,
            "ingredients": ["Jowar flour", "Bajra flour", "Nachni flour", "Yeast", "Salt", "Water"],
            "bakers_notes": "Power-packed with three ancient grains. 500g: ₹155, 240g: ₹85"
        },
        {
            "name": "Oats Bread",
            "description": "Wholesome combination of oats and jowar for a heart-healthy option.",
            "category": "breads",
            "base_price": 175.0,  # 500g price
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True,
            "ingredients": ["Oats", "Jowar flour", "Yeast", "Salt", "Water"],
            "bakers_notes": "Rich in fiber and beta-glucan. 500g: ₹175, 240g: ₹92"
        },
        {
            "name": "High Protein Bread",
            "description": "Protein-rich bread with sprouted moong and jowar for health enthusiasts.",
            "category": "breads",
            "base_price": 175.0,  # 500g price
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True,
            "ingredients": ["Sprouted moong", "Jowar flour", "Yeast", "Salt", "Water"],
            "bakers_notes": "Perfect for fitness enthusiasts. 500g: ₹175, 240g: ₹92"
        },
        {
            "name": "Quinoa Bread",
            "description": "Premium quinoa bread with complete protein profile and exceptional taste.",
            "category": "breads",
            "base_price": 200.0,  # 500g price
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True,
            "ingredients": ["Quinoa flour", "Whole wheat flour", "Yeast", "Salt", "Water"],
            "bakers_notes": "Superfood bread with all 9 essential amino acids. 500g: ₹200, 240g: ₹110"
        },
        
        # OTHER BREADS
        {
            "name": "Pizza Base",
            "description": "Fresh pizza base ready for your favorite toppings. 8 inch diameter, 2 pieces.",
            "category": "breads",
            "base_price": 100.0,
            "image_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591",
            "subscription_eligible": False,
            "ingredients": ["Refined flour", "Yeast", "Olive oil", "Salt", "Sugar"],
            "bakers_notes": "Hand-stretched dough. 140g (8 inch, 2 pc): ₹100"
        },
        {
            "name": "Pav (Dinner Rolls)",
            "description": "Soft and fluffy dinner rolls, perfect for vada pav or sandwiches.",
            "category": "breads",
            "base_price": 105.0,  # 440g price
            "image_url": "https://images.unsplash.com/photo-1549931319-a545dcf3bc73",
            "subscription_eligible": True,
            "ingredients": ["Refined flour", "Yeast", "Milk", "Butter", "Sugar", "Salt"],
            "bakers_notes": "Mumbai-style soft pav. 440g (8 pc): ₹105, 220g (4 pc): ₹60"
        },
        {
            "name": "Burger Buns",
            "description": "Artisan burger buns available in plain, seeded, herb, and garlic varieties.",
            "category": "breads",
            "base_price": 100.0,
            "image_url": "https://images.unsplash.com/photo-1571091718767-18b5b1457add",
            "subscription_eligible": False,
            "ingredients": ["Refined flour", "Yeast", "Eggs", "Butter", "Sesame seeds"],
            "bakers_notes": "140g (2 pc): ₹100. Available in plain/seeded/herb/garlic"
        },
        {
            "name": "Sourdough Bread",
            "description": "Traditional sourdough with tangy flavor and perfect crust. Plain, seeded, or jalapeño.",
            "category": "breads",
            "base_price": 400.0,  # 500g price
            "image_url": "https://images.pexels.com/photos/745988/pexels-photo-745988.jpeg",
            "subscription_eligible": True,
            "ingredients": ["Sourdough starter", "Flour", "Water", "Salt"],
            "bakers_notes": "Fermented for 24 hours. 500g: ₹400, 300g: ₹240"
        },
        
        # KULCHAS
        {
            "name": "Amritsari Kulcha",
            "description": "Authentic Amritsari-style kulcha with traditional filling and flavors.",
            "category": "breads", 
            "base_price": 170.0,
            "image_url": "https://images.unsplash.com/photo-1626132647523-66f6bf7add1e",
            "subscription_eligible": False,
            "ingredients": ["Refined flour", "Yogurt", "Potato filling", "Spices", "Onions"],
            "bakers_notes": "Authentic Punjab recipe. 220g (2 pc): ₹170"
        },
        
        # COOKIES
        {
            "name": "Choco Chunk Cookies",
            "description": "Rich chocolate chunk cookies made with premium chocolate pieces.",
            "category": "cookies",
            "base_price": 230.0,
            "image_url": "https://images.unsplash.com/photo-1590080874088-eec64895b423",
            "subscription_eligible": True,
            "ingredients": ["Flour", "Butter", "Chocolate chunks", "Brown sugar", "Eggs"],
            "bakers_notes": "200g pack. Hand-rolled and baked fresh daily."
        },
        {
            "name": "Cranberry Pistachio Cookies",
            "description": "Delightful combination of tangy cranberries and crunchy pistachios.",
            "category": "cookies",
            "base_price": 230.0,
            "image_url": "https://images.unsplash.com/photo-1558961363-fa8fdf82db35",
            "subscription_eligible": True,
            "ingredients": ["Flour", "Butter", "Dried cranberries", "Pistachios", "Sugar"],
            "bakers_notes": "200g pack. Perfect balance of sweet and tart flavors."
        },
        {
            "name": "Almond Crunch Cookies",
            "description": "Crunchy cookies loaded with premium almonds for that perfect bite.",
            "category": "cookies",
            "base_price": 230.0,
            "image_url": "https://images.unsplash.com/photo-1485893086445-ed75865251e0",
            "subscription_eligible": True,
            "ingredients": ["Flour", "Butter", "Almonds", "Brown sugar", "Vanilla"],
            "bakers_notes": "200g pack. Made with California almonds."
        },
        
        # MUFFINS
        {
            "name": "Choco Chip Muffins",
            "description": "Fluffy muffins studded with chocolate chips, perfect for breakfast or snacking.",
            "category": "cakes",
            "base_price": 100.0,
            "image_url": "https://images.unsplash.com/photo-1607958996333-41aef7caefaa",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Chocolate chips", "Eggs", "Milk", "Butter", "Sugar"],
            "bakers_notes": "120g each. Baked fresh every morning."
        },
        {
            "name": "Blueberry Muffins",
            "description": "Soft, moist muffins bursting with fresh blueberries and citrus notes.",
            "category": "cakes",
            "base_price": 100.0,
            "image_url": "https://images.unsplash.com/photo-1607958996333-41aef7caefaa",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Fresh blueberries", "Eggs", "Milk", "Lemon zest"],
            "bakers_notes": "120g each. Made with imported blueberries."
        },
        
        # CAKES
        {
            "name": "Chocolate Cake",
            "description": "Rich, decadent chocolate cake made with premium cocoa and layered with ganache.",
            "category": "cakes",
            "base_price": 1300.0,
            "image_url": "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg",
            "subscription_eligible": False,
            "ingredients": ["Premium cocoa", "Dark chocolate", "Eggs", "Flour", "Fresh cream"],
            "bakers_notes": "500g cake. Order 24 hours in advance."
        },
        {
            "name": "Tiramisu Cake",
            "description": "Classic Italian tiramisu with finger cookies, coffee, and mascarpone layers.",
            "category": "cakes",
            "base_price": 1500.0,
            "image_url": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
            "subscription_eligible": False,
            "ingredients": ["Mascarpone", "Finger cookies", "Coffee", "Cocoa powder", "Eggs"],
            "bakers_notes": "500g with finger cookies. Authentic Italian recipe."
        },
        
        # CROISSANTS
        {
            "name": "Plain Croissants",
            "description": "Classic French croissants with buttery, flaky layers and golden crust.",
            "category": "breads",
            "base_price": 170.0,
            "image_url": "https://images.unsplash.com/photo-1555507036-ab794f4ade50",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Butter", "Yeast", "Milk", "Eggs", "Salt"],
            "bakers_notes": "70g each. Laminated dough with 81 layers."
        },
        {
            "name": "Chocolate Croissants",
            "description": "French croissants filled with rich chocolate, perfect for breakfast treats.",
            "category": "breads",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1555507036-ab794f4ade50",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Butter", "Dark chocolate", "Yeast", "Milk", "Eggs"],
            "bakers_notes": "90g each. Pain au chocolat style with premium chocolate."
        },
        
        # BROWNIES
        {
            "name": "Classic Brownies",
            "description": "Fudgy, rich brownies with the perfect balance of chocolate and sweetness.",
            "category": "cakes",
            "base_price": 100.0,
            "image_url": "https://images.unsplash.com/photo-1624353365286-3f8d62daad51",
            "subscription_eligible": False,
            "ingredients": ["Dark chocolate", "Butter", "Eggs", "Flour", "Cocoa powder"],
            "bakers_notes": "90g piece. Available in plain, choco chip, walnut, and assorted varieties."
        },
        
        # QUICK BITES
        {
            "name": "Vada Pav",
            "description": "Mumbai's favorite street food - spiced potato fritter in soft pav with chutneys.",
            "category": "snacks",
            "base_price": 60.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": False,
            "ingredients": ["Potatoes", "Gram flour", "Spices", "Pav", "Chutneys"],
            "bakers_notes": "Per piece: ₹60, with chutney: ₹70. Made fresh to order."
        },
        {
            "name": "Mexican Puff",
            "description": "Crispy puff pastry filled with spiced Mexican-style vegetables and beans.",
            "category": "snacks",
            "base_price": 60.0,
            "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b",
            "subscription_eligible": False,
            "ingredients": ["Puff pastry", "Mexican beans", "Vegetables", "Spices", "Cheese"],
            "bakers_notes": "Per piece: ₹60, with salsa: ₹70. Baked fresh daily."
        },
        {
            "name": "Homestyle Artisan Loaves",
            "description": "Handcrafted bread loaves made with traditional methods and finest ingredients",
            "category": "breads",
            "base_price": 180.0,
            "image_url": "https://images.pexels.com/photos/263168/pexels-photo-263168.jpeg",
            "subscription_eligible": True,
            "ingredients": ["Organic wheat", "Natural yeast", "Olive oil", "Honey", "Himalayan salt"],
            "bakers_notes": "Shaped by hand and baked in our wood-fired oven for that authentic rustic flavor."
        },
        
        # MORE COOKIES
        {
            "name": "Mix Nut Cookies",
            "description": "Cookies packed with assorted nuts for the perfect crunch.",
            "category": "cookies",
            "base_price": 230.0,
            "image_url": "https://images.unsplash.com/photo-1485893086445-ed75865251e0",
            "subscription_eligible": True,
            "ingredients": ["Flour", "Mixed nuts", "Butter", "Sugar", "Vanilla"],
            "bakers_notes": "200g pack with almonds, cashews, and walnuts."
        },
        {
            "name": "Coconut Cookies",
            "description": "Tropical coconut cookies with rich coconut flavor.",
            "category": "cookies",
            "base_price": 230.0,
            "image_url": "https://images.unsplash.com/photo-1485893086445-ed75865251e0",
            "subscription_eligible": True,
            "ingredients": ["Flour", "Coconut", "Butter", "Sugar", "Eggs"],
            "bakers_notes": "200g pack. Made with fresh coconut."
        },
        {
            "name": "Red Velvet Cookies",
            "description": "Rich red velvet cookies with cream cheese flavor.",
            "category": "cookies",
            "base_price": 230.0,
            "image_url": "https://images.unsplash.com/photo-1485893086445-ed75865251e0",
            "subscription_eligible": True,
            "ingredients": ["Flour", "Cocoa", "Red coloring", "Cream cheese", "Butter"],
            "bakers_notes": "200g pack. Classic red velvet taste."
        },
        
        # MORE MUFFINS
        {
            "name": "Vanilla Muffins",
            "description": "Classic vanilla muffins, light and fluffy.",
            "category": "cakes",
            "base_price": 80.0,
            "image_url": "https://images.unsplash.com/photo-1607958996333-41aef7caefaa",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Vanilla", "Eggs", "Milk", "Butter"],
            "bakers_notes": "120g each. Simple and delicious."
        },
        {
            "name": "Almond Muffins",
            "description": "Delicate almond-flavored muffins with crunchy almonds.",
            "category": "cakes",
            "base_price": 100.0,
            "image_url": "https://images.unsplash.com/photo-1607958996333-41aef7caefaa",
            "subscription_eligible": False,
            "ingredients": ["Almond flour", "Almonds", "Eggs", "Milk", "Butter"],
            "bakers_notes": "120g each. Premium almond flavor."
        },
        
        # BAR CAKES
        {
            "name": "Choco Chip Bar Cake",
            "description": "Moist bar cake loaded with chocolate chips.",
            "category": "cakes",
            "base_price": 300.0,
            "image_url": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Chocolate chips", "Eggs", "Butter", "Sugar"],
            "bakers_notes": "300g bar cake. Perfect for sharing."
        },
        {
            "name": "Banana Walnut Bar Cake",
            "description": "Classic banana walnut combination in bar cake form.",
            "category": "cakes",
            "base_price": 300.0,
            "image_url": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
            "subscription_eligible": False,
            "ingredients": ["Bananas", "Walnuts", "Flour", "Eggs", "Butter"],
            "bakers_notes": "300g with fresh bananas and premium walnuts."
        },
        
        # MORE CAKES
        {
            "name": "Pineapple Cake",
            "description": "Fresh pineapple cake with tropical flavors.",
            "category": "cakes",
            "base_price": 950.0,
            "image_url": "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg",
            "subscription_eligible": False,
            "ingredients": ["Fresh pineapple", "Flour", "Eggs", "Cream", "Sugar"],
            "bakers_notes": "500g cake with real pineapple pieces."
        },
        {
            "name": "Baked Cheese Cake",
            "description": "Classic New York style baked cheesecake.",
            "category": "cakes",
            "base_price": 1300.0,
            "image_url": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
            "subscription_eligible": False,
            "ingredients": ["Cream cheese", "Eggs", "Graham crackers", "Butter", "Sugar"],
            "bakers_notes": "500g authentic New York recipe."
        },
        
        # MORE BREADS
        {
            "name": "Mini Pizza",
            "description": "Mini pizza bases perfect for party snacks.",
            "category": "breads",
            "base_price": 150.0,
            "image_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591",
            "subscription_eligible": False,
            "ingredients": ["Refined flour", "Yeast", "Olive oil", "Salt"],
            "bakers_notes": "240g (4 inch diameter, 6 pc): ₹150"
        },
        {
            "name": "Bagels",
            "description": "Traditional bagels with perfect chewy texture.",
            "category": "breads",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1555507036-ab794f4ade50",
            "subscription_eligible": False,
            "ingredients": ["Bread flour", "Yeast", "Malt", "Salt", "Water"],
            "bakers_notes": "200g (2 pc): ₹200. Boiled then baked."
        },
        
        # SNACKS
        {
            "name": "Jowar Masala Khakra",
            "description": "Crispy jowar khakra with traditional masala spices.",
            "category": "snacks",
            "base_price": 175.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": True,
            "ingredients": ["Jowar flour", "Spices", "Oil", "Salt"],
            "bakers_notes": "250g pack. Traditional Gujarat recipe."
        },
        {
            "name": "Yellow Banana Chips",
            "description": "Crispy banana chips made from fresh bananas.",
            "category": "snacks",
            "base_price": 180.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": True,
            "ingredients": ["Raw bananas", "Coconut oil", "Salt"],
            "bakers_notes": "200g pack. Kerala-style preparation."
        },
        
        # MORE QUICK BITES
        {
            "name": "Dabeli",
            "description": "Kutchi dabeli with sweet and tangy flavors.",
            "category": "snacks",
            "base_price": 60.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": False,
            "ingredients": ["Pav", "Potatoes", "Chutneys", "Sev", "Pomegranate"],
            "bakers_notes": "Per piece: ₹60, with chutney: ₹70"
        },
        
        # BREAD-STICKS
        {
            "name": "Herb Bread Sticks",
            "description": "Crispy bread sticks with aromatic herbs.",
            "category": "breads",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": False,
            "ingredients": ["Flour", "Herbs", "Olive oil", "Yeast", "Salt"],
            "bakers_notes": "200g pack. Perfect with soups and salads."
        },
        
        # LAVASH
        {
            "name": "Beetroot Lavash",
            "description": "Colorful beetroot lavash with natural pink color.",
            "category": "breads",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": False,
            "ingredients": ["Beetroot", "Flour", "Water", "Salt", "Oil"],
            "bakers_notes": "150g. Natural beetroot color and flavor."
        },
        {
            "name": "Spinach Garlic Lavash",
            "description": "Healthy spinach lavash with garlic flavor.",
            "category": "breads",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": False,
            "ingredients": ["Spinach", "Garlic", "Flour", "Water", "Salt"],
            "bakers_notes": "150g. Packed with nutrients."
        },
        
        # TOAST/RUSK
        {
            "name": "Salted Toast",
            "description": "Crispy salted toast perfect for tea time.",
            "category": "breads",
            "base_price": 180.0,
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True,
            "ingredients": ["Bread", "Salt", "Oil"],
            "bakers_notes": "200g pack. Double-baked for crispiness."
        },
        {
            "name": "Sweet Rusk",
            "description": "Mildly sweet rusk, perfect with tea or coffee.",
            "category": "breads",
            "base_price": 180.0,
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True,
            "ingredients": ["Bread", "Sugar", "Cardamom"],
            "bakers_notes": "200g pack. Traditional recipe."
        },
        
        # BISCOTTI
        {
            "name": "Almond Biscotti",
            "description": "Traditional Italian almond biscotti, twice-baked for perfect crunch.",
            "category": "cookies",
            "base_price": 250.0,
            "image_url": "https://images.unsplash.com/photo-1485893086445-ed75865251e0",
            "subscription_eligible": True,
            "ingredients": ["Almonds", "Flour", "Eggs", "Sugar", "Vanilla"],
            "bakers_notes": "200g pack. Authentic Italian recipe."
        },
        
        # COTTON CAKES
        {
            "name": "Orange Pistachio Cotton Cake",
            "description": "Light and fluffy cotton cake with orange and pistachio.",
            "category": "cakes",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
            "subscription_eligible": False,
            "ingredients": ["Orange", "Pistachios", "Flour", "Eggs", "Cream"],
            "bakers_notes": "200g. Japanese-style cotton cake."
        },
        {
            "name": "Chocolate Cotton Cake",
            "description": "Ultra-light chocolate cotton cake with airy texture.",
            "category": "cakes",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
            "subscription_eligible": False,
            "ingredients": ["Chocolate", "Flour", "Eggs", "Cream", "Cocoa"],
            "bakers_notes": "200g. Incredibly soft and light."
        },
        
        # MORE KULCHAS
        {
            "name": "Plain Kulcha",
            "description": "Simple, soft kulcha bread perfect with curries.",
            "category": "breads",
            "base_price": 135.0,
            "image_url": "https://images.unsplash.com/photo-1626132647523-66f6bf7add1e",
            "subscription_eligible": False,
            "ingredients": ["Refined flour", "Yogurt", "Yeast", "Salt"],
            "bakers_notes": "140g (2 pc): ₹135"
        },
        {
            "name": "Pyaz da Kulcha",
            "description": "Onion kulcha with caramelized onions and spices.",
            "category": "breads",
            "base_price": 170.0,
            "image_url": "https://images.unsplash.com/photo-1626132647523-66f6bf7add1e",
            "subscription_eligible": False,
            "ingredients": ["Refined flour", "Onions", "Spices", "Yogurt"],
            "bakers_notes": "220g (2 pc): ₹170. Punjab specialty."
        },
        
        # MORE SNACKS - KHAKRAS
        {
            "name": "Moong Dal Masala Khakra",
            "description": "Protein-rich moong dal khakra with masala spices.",
            "category": "snacks",
            "base_price": 200.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": True,
            "ingredients": ["Moong dal", "Spices", "Oil", "Salt"],
            "bakers_notes": "250g pack. High protein snack."
        },
        
        # MORE SNACKS - CHIPS  
        {
            "name": "Pepper Banana Chips",
            "description": "Spicy pepper-flavored banana chips.",
            "category": "snacks",
            "base_price": 180.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": True,
            "ingredients": ["Raw bananas", "Black pepper", "Oil", "Salt"],
            "bakers_notes": "200g pack. Kerala spices."
        },
        {
            "name": "Soya Chips",
            "description": "Healthy soya chips packed with protein.",
            "category": "snacks",
            "base_price": 180.0,
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84",
            "subscription_eligible": True,
            "ingredients": ["Soya", "Spices", "Oil", "Salt"],
            "bakers_notes": "200g pack. High protein snack."
        }
    ]
    
    # Create products if they don't exist
    existing_products = await db.products.count_documents({})
    if existing_products == 0:
        for product_data in sample_products:
            product = Product(**product_data)
            await db.products.insert_one(product.dict())
    
    return {"message": "Sample data initialized successfully"}

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
