import requests
import json
import time
import uuid
from datetime import datetime

# Get the backend URL from the frontend .env file
BACKEND_URL = "https://4d1b1b2a-ddb8-41cf-a00b-d281702989f0.preview.emergentagent.com"
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

def run_all_tests():
    print(f"\n{'=' * 80}")
    print(f"STARTING JWT AUTHENTICATION SYSTEM TESTS")
    print(f"Backend URL: {API_URL}")
    print(f"Test Email: {test_email}")
    print(f"{'=' * 80}\n")
    
    try:
        # Basic health check
        test_health_check()
        
        # Registration tests
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
