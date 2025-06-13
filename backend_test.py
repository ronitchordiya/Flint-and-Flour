import requests
import json
import time
import uuid
import os
from datetime import datetime

# Read the backend URL from the frontend .env file
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.strip().split('=')[1]
            break

API_URL = f"{BACKEND_URL}/api"

# Test data
test_email = f"test.user.{uuid.uuid4()}@example.com"
test_password = "SecurePassword123"
test_region_india = "India"
test_region_canada = "Canada"

# Store tokens and user data
access_token = None
refresh_token = None
user_id = None
verification_token = None
reset_token = None

def print_test_header(test_name):
    print(f"\n{'=' * 80}")
    print(f"TEST: {test_name}")
    print(f"{'=' * 80}")

def print_response(response):
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_health_check():
    print_test_header("Health Check")
    
    response = requests.get(f"{API_URL}/health")
    print_response(response)
    
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    print("✅ Health check passed")

def test_register_user_india():
    global user_id, verification_token
    print_test_header("User Registration - India Region")
    
    payload = {
        "email": test_email,
        "password": test_password,
        "region": test_region_india
    }
    
    response = requests.post(f"{API_URL}/auth/register", json=payload)
    print_response(response)
    
    assert response.status_code == 200
    assert response.json()["email"] == test_email
    assert response.json()["region"] == test_region_india
    assert response.json()["is_email_verified"] == False
    
    user_id = response.json()["id"]
    print(f"✅ User registration passed - User ID: {user_id}")
    
    # Extract verification token from logs (in a real scenario, this would be from an email)
    # For testing purposes, we'll need to handle this differently

def test_register_duplicate_email():
    print_test_header("Register with Duplicate Email")
    
    payload = {
        "email": test_email,
        "password": test_password,
        "region": test_region_india
    }
    
    response = requests.post(f"{API_URL}/auth/register", json=payload)
    print_response(response)
    
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()
    print("✅ Duplicate email check passed")

def test_register_invalid_region():
    print_test_header("Register with Invalid Region")
    
    payload = {
        "email": f"invalid.region.{uuid.uuid4()}@example.com",
        "password": test_password,
        "region": "InvalidRegion"
    }
    
    response = requests.post(f"{API_URL}/auth/register", json=payload)
    print_response(response)
    
    assert response.status_code == 400
    assert "region must be" in response.json()["detail"].lower()
    print("✅ Invalid region check passed")

def test_login_user():
    global access_token, refresh_token
    print_test_header("User Login")
    
    payload = {
        "email": test_email,
        "password": test_password
    }
    
    response = requests.post(f"{API_URL}/auth/login", json=payload)
    print_response(response)
    
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert "refresh_token" in response.json()
    
    access_token = response.json()["access_token"]
    refresh_token = response.json()["refresh_token"]
    print("✅ User login passed")

def test_login_invalid_credentials():
    print_test_header("Login with Invalid Credentials")
    
    payload = {
        "email": test_email,
        "password": "WrongPassword123"
    }
    
    response = requests.post(f"{API_URL}/auth/login", json=payload)
    print_response(response)
    
    assert response.status_code == 401
    assert "invalid email or password" in response.json()["detail"].lower()
    print("✅ Invalid credentials check passed")

def test_get_profile():
    print_test_header("Get User Profile")
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    response = requests.get(f"{API_URL}/user/profile", headers=headers)
    print_response(response)
    
    assert response.status_code == 200
    assert response.json()["id"] == user_id
    assert response.json()["email"] == test_email
    assert response.json()["region"] == test_region_india
    print("✅ Get profile passed")

def test_get_profile_no_token():
    print_test_header("Get Profile without Token")
    
    response = requests.get(f"{API_URL}/user/profile")
    print_response(response)
    
    assert response.status_code == 403
    print("✅ No token check passed")

def test_update_profile():
    print_test_header("Update User Profile")
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    payload = {
        "region": test_region_canada
    }
    
    response = requests.put(f"{API_URL}/user/profile", headers=headers, json=payload)
    print_response(response)
    
    assert response.status_code == 200
    assert response.json()["region"] == test_region_canada
    print("✅ Update profile passed")

def test_update_profile_invalid_region():
    print_test_header("Update Profile with Invalid Region")
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    payload = {
        "region": "InvalidRegion"
    }
    
    response = requests.put(f"{API_URL}/user/profile", headers=headers, json=payload)
    print_response(response)
    
    assert response.status_code == 400
    assert "region must be" in response.json()["detail"].lower()
    print("✅ Invalid region update check passed")

def test_refresh_token():
    global access_token, refresh_token
    print_test_header("Refresh Token")
    
    payload = {
        "refresh_token": refresh_token
    }
    
    response = requests.post(f"{API_URL}/auth/refresh", json=payload)
    print_response(response)
    
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert "refresh_token" in response.json()
    
    # Update tokens
    old_access_token = access_token
    old_refresh_token = refresh_token
    access_token = response.json()["access_token"]
    refresh_token = response.json()["refresh_token"]
    
    assert access_token != old_access_token
    assert refresh_token != old_refresh_token
    print("✅ Token refresh passed")

def test_refresh_invalid_token():
    print_test_header("Refresh with Invalid Token")
    
    payload = {
        "refresh_token": "invalid_token"
    }
    
    response = requests.post(f"{API_URL}/auth/refresh", json=payload)
    print_response(response)
    
    assert response.status_code == 401
    print("✅ Invalid refresh token check passed")

def test_password_reset_request():
    print_test_header("Password Reset Request")
    
    payload = {
        "email": test_email
    }
    
    response = requests.post(f"{API_URL}/auth/reset-password", json=payload)
    print_response(response)
    
    assert response.status_code == 200
    assert "message" in response.json()
    print("✅ Password reset request passed")
    
    # In a real test, we would extract the reset token from the email
    # For this test, we'll need to handle it differently

def test_verify_email_invalid_token():
    print_test_header("Email Verification with Invalid Token")
    
    payload = {
        "token": "invalid_token"
    }
    
    response = requests.post(f"{API_URL}/auth/verify-email", json=payload)
    print_response(response)
    
    assert response.status_code == 400
    assert "invalid verification token" in response.json()["detail"].lower()
    print("✅ Invalid verification token check passed")

def test_reset_password_invalid_token():
    print_test_header("Reset Password with Invalid Token")
    
    payload = {
        "token": "invalid_token",
        "new_password": "NewPassword123"
    }
    
    response = requests.post(f"{API_URL}/auth/reset-password-confirm", json=payload)
    print_response(response)
    
    assert response.status_code == 400
    assert "invalid or expired reset token" in response.json()["detail"].lower()
    print("✅ Invalid reset token check passed")

def test_get_products():
    print_test_header("Get Products")
    
    response = requests.get(f"{API_URL}/products")
    print_response(response)
    
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    
    if len(response.json()) > 0:
        product = response.json()[0]
        assert "id" in product
        assert "name" in product
        assert "description" in product
        assert "base_price" in product
        assert "regional_price" in product
        assert "currency" in product
        assert product["currency"] == "INR"  # Default region is India
    
    print("✅ Get products passed")

def test_get_products_by_region():
    print_test_header("Get Products by Region")
    
    # Test India region
    response_india = requests.get(f"{API_URL}/products?region=India")
    print("India Region Response:")
    print_response(response_india)
    
    assert response_india.status_code == 200
    assert isinstance(response_india.json(), list)
    
    if len(response_india.json()) > 0:
        product_india = response_india.json()[0]
        assert product_india["currency"] == "INR"
        india_price = product_india["regional_price"]
    
    # Test Canada region
    response_canada = requests.get(f"{API_URL}/products?region=Canada")
    print("Canada Region Response:")
    print_response(response_canada)
    
    assert response_canada.status_code == 200
    assert isinstance(response_canada.json(), list)
    
    if len(response_canada.json()) > 0 and len(response_india.json()) > 0:
        product_canada = response_canada.json()[0]
        assert product_canada["currency"] == "CAD"
        canada_price = product_canada["regional_price"]
        
        # Verify price conversion (India to Canada)
        # The exchange rate in the code is 0.06 (1 INR = 0.06 CAD)
        # Allow for small rounding differences
        expected_canada_price = round(india_price * 0.06, 2)
        assert abs(canada_price - expected_canada_price) < 0.01, f"Expected {expected_canada_price}, got {canada_price}"
    
    print("✅ Get products by region passed")

def test_cart_calculation():
    print_test_header("Cart Calculation")
    
    # First, get a product ID to use in the cart
    response = requests.get(f"{API_URL}/products")
    assert response.status_code == 200
    assert len(response.json()) > 0
    
    product_id = response.json()[0]["id"]
    product_price = response.json()[0]["regional_price"]
    
    # Test cart calculation for India
    cart_payload_india = {
        "items": [
            {
                "product_id": product_id,
                "quantity": 2,
                "subscription_type": "one-time"
            }
        ]
    }
    
    response_india = requests.post(f"{API_URL}/cart?region=India", json=cart_payload_india)
    print("India Cart Response:")
    print_response(response_india)
    
    assert response_india.status_code == 200
    assert "items" in response_india.json()
    assert "subtotal" in response_india.json()
    assert "tax" in response_india.json()
    assert "total" in response_india.json()
    assert "currency" in response_india.json()
    assert response_india.json()["currency"] == "INR"
    
    # Verify tax calculation for India (18% GST)
    subtotal_india = response_india.json()["subtotal"]
    tax_india = response_india.json()["tax"]
    total_india = response_india.json()["total"]
    
    expected_tax_india = round(subtotal_india * 0.18, 2)
    assert abs(tax_india - expected_tax_india) < 0.01, f"Expected tax {expected_tax_india}, got {tax_india}"
    assert abs(total_india - (subtotal_india + tax_india)) < 0.01, f"Expected total {subtotal_india + tax_india}, got {total_india}"
    
    # Test cart calculation for Canada
    cart_payload_canada = {
        "items": [
            {
                "product_id": product_id,
                "quantity": 2,
                "subscription_type": "one-time"
            }
        ]
    }
    
    response_canada = requests.post(f"{API_URL}/cart?region=Canada", json=cart_payload_canada)
    print("Canada Cart Response:")
    print_response(response_canada)
    
    assert response_canada.status_code == 200
    assert "items" in response_canada.json()
    assert "subtotal" in response_canada.json()
    assert "tax" in response_canada.json()
    assert "total" in response_canada.json()
    assert "currency" in response_canada.json()
    assert response_canada.json()["currency"] == "CAD"
    
    # Verify tax calculation for Canada (13% HST)
    subtotal_canada = response_canada.json()["subtotal"]
    tax_canada = response_canada.json()["tax"]
    total_canada = response_canada.json()["total"]
    
    expected_tax_canada = round(subtotal_canada * 0.13, 2)
    assert abs(tax_canada - expected_tax_canada) < 0.01, f"Expected tax {expected_tax_canada}, got {tax_canada}"
    assert abs(total_canada - (subtotal_canada + tax_canada)) < 0.01, f"Expected total {subtotal_canada + tax_canada}, got {total_canada}"
    
    print("✅ Cart calculation passed")

def test_delivery_info():
    print_test_header("Delivery Info")
    
    # Test delivery info for India
    response_india = requests.get(f"{API_URL}/delivery?region=India")
    print("India Delivery Response:")
    print_response(response_india)
    
    assert response_india.status_code == 200
    assert "region" in response_india.json()
    assert "available_today" in response_india.json()
    assert "message" in response_india.json()
    assert "cutoff_time" in response_india.json()
    assert response_india.json()["region"] == "India"
    
    # Test delivery info for Canada
    response_canada = requests.get(f"{API_URL}/delivery?region=Canada")
    print("Canada Delivery Response:")
    print_response(response_canada)
    
    assert response_canada.status_code == 200
    assert "region" in response_canada.json()
    assert "available_today" in response_canada.json()
    assert "message" in response_canada.json()
    assert "cutoff_time" in response_canada.json()
    assert response_canada.json()["region"] == "Canada"
    
    # Test invalid region
    response_invalid = requests.get(f"{API_URL}/delivery?region=InvalidRegion")
    print("Invalid Region Delivery Response:")
    print_response(response_invalid)
    
    assert response_invalid.status_code == 200  # The API returns 200 even for invalid regions
    assert response_invalid.json()["region"] == "InvalidRegion"
    assert response_invalid.json()["available_today"] == False
    assert "not available" in response_invalid.json()["message"].lower()
    
    print("✅ Delivery info passed")

def run_all_tests():
    print(f"\n{'=' * 80}")
    print(f"STARTING FLINT & FLOURS E-COMMERCE PLATFORM TESTS")
    print(f"Backend URL: {API_URL}")
    print(f"Test Email: {test_email}")
    print(f"{'=' * 80}\n")
    
    try:
        # Basic health check
        test_health_check()
        
        # Products tests
        test_get_products()
        test_get_products_by_region()
        
        # Cart tests
        test_cart_calculation()
        
        # Delivery tests
        test_delivery_info()
        
        # Authentication tests
        test_register_user_india()
        test_register_duplicate_email()
        test_register_invalid_region()
        
        # Login tests
        test_login_user()
        test_login_invalid_credentials()
        
        # Profile tests
        test_get_profile()
        test_get_profile_no_token()
        test_update_profile()
        test_update_profile_invalid_region()
        
        # Token refresh tests
        test_refresh_token()
        test_refresh_invalid_token()
        
        # Password reset and email verification tests
        test_password_reset_request()
        test_verify_email_invalid_token()
        test_reset_password_invalid_token()
        
        print(f"\n{'=' * 80}")
        print(f"ALL TESTS COMPLETED SUCCESSFULLY")
        print(f"{'=' * 80}\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

if __name__ == "__main__":
    run_all_tests()
