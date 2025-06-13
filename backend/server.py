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

# Payment integrations
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import razorpay

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
    checkout_url: Optional[str] = None
    payment_gateway: str
    transaction_id: str
    amount: float
    currency: str
    gateway_order_id: Optional[str] = None
    razorpay_key_id: Optional[str] = None

class PaymentStatusRequest(BaseModel):
    transaction_id: str

class PaymentStatusResponse(BaseModel):
    transaction_id: str
    status: str
    payment_status: str
    amount: float
    currency: str
    gateway_payment_id: Optional[str] = None

# Order Models
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
    order_status: str = Field("pending", description="pending, confirmed, preparing, out_for_delivery, delivered, cancelled")
    payment_status: str = Field("pending", description="pending, completed, failed, refunded")
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

# Product endpoints
@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(region: str = "India", category: Optional[str] = None):
    # Validate region
    if region not in REGION_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid region")
    
    # Build query
    query = {"in_stock": True}
    if category:
        query["category"] = category
    
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
            # Use Stripe for Canada
            success_url = f"{origin}/order-confirmation?session_id={{CHECKOUT_SESSION_ID}}"
            cancel_url = f"{origin}/cart"
            
            checkout_session_request = CheckoutSessionRequest(
                amount=float(cart_response.total),
                currency=cart_response.currency.lower(),
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "transaction_id": transaction.id,
                    "user_email": checkout_request.user_email or "guest",
                    "region": checkout_request.region
                }
            )
            
            session = await stripe_checkout.create_checkout_session(checkout_session_request)
            
            # Update transaction with Stripe session ID
            await db.payment_transactions.update_one(
                {"id": transaction.id},
                {"$set": {
                    "gateway_order_id": session.session_id,
                    "status": "pending",
                    "updated_at": datetime.utcnow()
                }}
            )
            
            return CheckoutResponse(
                checkout_url=session.url,
                payment_gateway="stripe",
                transaction_id=transaction.id,
                amount=cart_response.total,
                currency=cart_response.currency,
                gateway_order_id=session.session_id
            )
            
        elif payment_gateway == "razorpay":
            # Use Razorpay for India
            amount_in_paise = int(cart_response.total * 100)
            
            order_data = {
                "amount": amount_in_paise,
                "currency": cart_response.currency,
                "receipt": f"receipt_{transaction.id}",
                "notes": {
                    "transaction_id": transaction.id,
                    "user_email": checkout_request.user_email or "guest",
                    "region": checkout_request.region
                }
            }
            
            razorpay_order = razorpay_client.order.create(data=order_data)
            
            # Update transaction with Razorpay order ID
            await db.payment_transactions.update_one(
                {"id": transaction.id},
                {"$set": {
                    "gateway_order_id": razorpay_order["id"],
                    "status": "pending",
                    "updated_at": datetime.utcnow()
                }}
            )
            
            return CheckoutResponse(
                payment_gateway="razorpay",
                transaction_id=transaction.id,
                amount=cart_response.total,
                currency=cart_response.currency,
                gateway_order_id=razorpay_order["id"],
                razorpay_key_id=RAZORPAY_KEY_ID
            )
            
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

@api_router.post("/payments/razorpay/verify")
async def verify_razorpay_payment(request: Request):
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
    
    # Sample products data
    sample_products = [
        # Cookies
        {
            "name": "Artisan Chocolate Chip Cookies",
            "description": "Hand-crafted chocolate chip cookies made with premium Belgian chocolate and organic flour",
            "category": "cookies",
            "base_price": 250.0,
            "image_url": "https://images.unsplash.com/photo-1590080874088-eec64895b423",
            "subscription_eligible": False,
            "ingredients": ["Organic flour", "Belgian chocolate chips", "Farm butter", "Brown sugar", "Vanilla extract"],
            "bakers_notes": "Each cookie is hand-rolled and baked in small batches. The secret is in our 24-hour dough fermentation process."
        },
        {
            "name": "Handmade Butter Cookies",
            "description": "Traditional butter cookies made fresh daily with authentic artisan techniques",
            "category": "cookies", 
            "base_price": 200.0,
            "image_url": "https://images.pexels.com/photos/6996299/pexels-photo-6996299.jpeg",
            "subscription_eligible": True,
            "ingredients": ["Premium butter", "Pastry flour", "Powdered sugar", "Sea salt", "Vanilla beans"],
            "bakers_notes": "Made with French technique using cultured butter for that distinctive tangy flavor."
        },
        # Cakes
        {
            "name": "Premium Chocolate Layer Cake",
            "description": "Rich, moist chocolate cake with layers of premium cocoa and silky ganache",
            "category": "cakes",
            "base_price": 800.0,
            "image_url": "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg",
            "subscription_eligible": True,
            "ingredients": ["Dark chocolate 70%", "Farm eggs", "Organic flour", "Fresh cream", "Dutch cocoa"],
            "bakers_notes": "Our signature cake takes 6 hours to prepare, with each layer baked separately for perfect texture."
        },
        {
            "name": "Elegant Pink Drip Cake",
            "description": "Sophisticated pink-themed cake with artistic drip design, perfect for celebrations",
            "category": "cakes",
            "base_price": 1200.0,
            "image_url": "https://images.unsplash.com/photo-1621303837174-89787a7d4729",
            "subscription_eligible": False,
            "ingredients": ["Vanilla sponge", "Swiss meringue", "Natural pink coloring", "White chocolate", "Raspberry coulis"],
            "bakers_notes": "Each drip is carefully crafted by hand. Available in custom colors for special occasions."
        },
        {
            "name": "Classic Wedding Cake",
            "description": "Beautiful multi-tier white cake with elegant design, customizable for special occasions",
            "category": "cakes",
            "base_price": 1500.0,
            "image_url": "https://images.pexels.com/photos/265801/pexels-photo-265801.jpeg",
            "subscription_eligible": False,
            "ingredients": ["Almond flour", "Fresh cream", "Royal icing", "Vanilla pods", "Edible flowers"],
            "bakers_notes": "Each tier can be customized with different flavors. Please order 48 hours in advance."
        },
        # Breads
        {
            "name": "Rustic Artisan Sourdough",
            "description": "Traditional sourdough bread with crispy crust and soft, airy interior",
            "category": "breads",
            "base_price": 150.0,
            "image_url": "https://images.pexels.com/photos/745988/pexels-photo-745988.jpeg",
            "subscription_eligible": True,
            "ingredients": ["Sourdough starter", "Stone-ground flour", "Sea salt", "Filtered water"],
            "bakers_notes": "Our starter is over 50 years old, inherited from a French baker. Fermented for 18 hours for complex flavors."
        },
        {
            "name": "Fresh Bakery Assortment",
            "description": "Daily selection of fresh artisan breads including whole wheat, multigrain, and rye",
            "category": "breads",
            "base_price": 300.0,
            "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
            "subscription_eligible": True
        },
        {
            "name": "Homestyle Artisan Loaves",
            "description": "Handcrafted bread loaves made with traditional methods and finest ingredients",
            "category": "breads",
            "base_price": 180.0,
            "image_url": "https://images.pexels.com/photos/263168/pexels-photo-263168.jpeg",
            "subscription_eligible": True
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
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
