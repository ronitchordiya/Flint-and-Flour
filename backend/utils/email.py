"""
SendGrid Email Utility for Flint & Flours
Handles all transactional emails with proper error handling and logging
"""

import os
import logging
from typing import Optional, Dict, Any
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, From, To, Subject, HtmlContent, Content
from python_http_client.exceptions import HTTPError

# Setup logging
logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.api_key = os.getenv('SENDGRID_API_KEY')
        self.from_email = os.getenv('SENDGRID_FROM_EMAIL')
        
        if not self.api_key:
            logger.error("SENDGRID_API_KEY environment variable not set")
            raise ValueError("SendGrid API key is required")
            
        if not self.from_email:
            logger.error("SENDGRID_FROM_EMAIL environment variable not set")
            raise ValueError("SendGrid from email is required")
            
        self.sg = SendGridAPIClient(api_key=self.api_key)
        logger.info(f"EmailService initialized with from_email: {self.from_email}")

    async def send_email(
        self,
        recipient_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send an email using SendGrid
        
        Args:
            recipient_email: Recipient's email address
            subject: Email subject line
            html_content: HTML content of the email
            text_content: Plain text content (optional, falls back to HTML)
            **kwargs: Additional parameters for future extensibility
            
        Returns:
            Dict with success status and response details
        """
        try:
            # Create the email message
            message = Mail(
                from_email=From(self.from_email, "Flint & Flours"),
                to_emails=To(recipient_email),
                subject=Subject(subject),
                html_content=HtmlContent(html_content)
            )
            
            # Add plain text content if provided
            if text_content:
                message.content = [
                    Content("text/plain", text_content),
                    Content("text/html", html_content)
                ]
            
            # Send the email
            response = self.sg.send(message)
            
            logger.info(
                f"Email sent successfully to {recipient_email} | "
                f"Subject: {subject} | "
                f"Status: {response.status_code}"
            )
            
            return {
                "success": True,
                "status_code": response.status_code,
                "message": "Email sent successfully",
                "recipient": recipient_email,
                "subject": subject
            }
            
        except HTTPError as e:
            error_msg = f"SendGrid HTTP Error: {e.status_code} - {e.body}"
            logger.error(f"Failed to send email to {recipient_email}: {error_msg}")
            
            return {
                "success": False,
                "error": error_msg,
                "status_code": getattr(e, 'status_code', None),
                "recipient": recipient_email,
                "subject": subject
            }
            
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f"Failed to send email to {recipient_email}: {error_msg}")
            
            return {
                "success": False,
                "error": error_msg,
                "recipient": recipient_email,
                "subject": subject
            }

    async def send_verification_email(self, recipient_email: str, verification_token: str, base_url: str) -> Dict[str, Any]:
        """Send email verification link"""
        verification_link = f"{base_url}/verify-email?token={verification_token}"
        
        subject = "Welcome to Flint & Flours - Verify Your Email"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verification - Flint & Flours</title>
            <style>
                body {{ font-family: 'Georgia', serif; color: #3a3a3a; line-height: 1.6; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #8b5a3c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; }}
                .content {{ background: #fffef9; padding: 40px; border-radius: 0 0 10px 10px; }}
                .button {{ display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #7a7a7a; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🥖 Flint & Flours</h1>
                </div>
                <div class="content">
                    <h2>Welcome to our artisan bakery family!</h2>
                    <p>Thank you for joining Flint & Flours. To complete your registration and start exploring our handcrafted breads, pastries, and treats, please verify your email address.</p>
                    
                    <p style="text-align: center;">
                        <a href="{verification_link}" class="button">Verify My Email</a>
                    </p>
                    
                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #8b5a3c;">{verification_link}</p>
                    
                    <p>This verification link will expire in 24 hours for security purposes.</p>
                    
                    <p>If you didn't create an account with us, please ignore this email.</p>
                    
                    <p>Happy baking!<br>The Flint & Flours Team</p>
                </div>
                <div class="footer">
                    <p>© 2024 Flint & Flours - Where tradition meets artistry</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return await self.send_email(recipient_email, subject, html_content)

    async def send_password_reset_email(self, recipient_email: str, reset_token: str, base_url: str) -> Dict[str, Any]:
        """Send password reset link"""
        reset_link = f"{base_url}/reset-password?token={reset_token}"
        
        subject = "Reset Your Flint & Flours Password"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset - Flint & Flours</title>
            <style>
                body {{ font-family: 'Georgia', serif; color: #3a3a3a; line-height: 1.6; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #8b5a3c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; }}
                .content {{ background: #fffef9; padding: 40px; border-radius: 0 0 10px 10px; }}
                .button {{ display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #7a7a7a; font-size: 14px; }}
                .warning {{ background: #fef3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🥖 Flint & Flours</h1>
                </div>
                <div class="content">
                    <h2>Reset Your Password</h2>
                    <p>We received a request to reset the password for your Flint & Flours account.</p>
                    
                    <p style="text-align: center;">
                        <a href="{reset_link}" class="button">Reset My Password</a>
                    </p>
                    
                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #8b5a3c;">{reset_link}</p>
                    
                    <div class="warning">
                        <strong>⏰ Important:</strong> This password reset link will expire in 1 hour for security purposes.
                    </div>
                    
                    <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                    
                    <p>Stay secure!<br>The Flint & Flours Team</p>
                </div>
                <div class="footer">
                    <p>© 2024 Flint & Flours - Where tradition meets artistry</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return await self.send_email(recipient_email, subject, html_content)

    async def send_order_confirmation_email(self, recipient_email: str, order_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send order confirmation email"""
        subject = f"Order Confirmation #{order_data.get('order_id', 'N/A')} - Flint & Flours"
        
        # Build items list
        items_html = ""
        for item in order_data.get('items', []):
            items_html += f"""
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f5f1eb;">{item.get('name', 'Unknown Item')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f5f1eb; text-align: center;">{item.get('quantity', 1)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f5f1eb; text-align: right;">{order_data.get('currency', '₹')}{item.get('price', 0)}</td>
            </tr>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Confirmation - Flint & Flours</title>
            <style>
                body {{ font-family: 'Georgia', serif; color: #3a3a3a; line-height: 1.6; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #8b5a3c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; }}
                .content {{ background: #fffef9; padding: 40px; border-radius: 0 0 10px 10px; }}
                .order-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                .order-table th {{ background: #f5f1eb; padding: 15px; text-align: left; }}
                .order-table td {{ padding: 10px; border-bottom: 1px solid #f5f1eb; }}
                .total {{ background: #8b5a3c; color: white; font-weight: bold; }}
                .footer {{ text-align: center; margin-top: 30px; color: #7a7a7a; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🥖 Flint & Flours</h1>
                </div>
                <div class="content">
                    <h2>Thank you for your order!</h2>
                    <p>We're delighted to confirm your order and will begin preparing your artisan baked goods with care.</p>
                    
                    <h3>Order Details</h3>
                    <p><strong>Order ID:</strong> #{order_data.get('order_id', 'N/A')}</p>
                    <p><strong>Order Date:</strong> {order_data.get('order_date', 'N/A')}</p>
                    <p><strong>Region:</strong> {order_data.get('region', 'N/A')}</p>
                    
                    <table class="order-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style="text-align: center;">Quantity</th>
                                <th style="text-align: right;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_html}
                            <tr class="total">
                                <td colspan="2"><strong>Total</strong></td>
                                <td style="text-align: right;"><strong>{order_data.get('currency', '₹')}{order_data.get('total', 0)}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <h3>Delivery Information</h3>
                    <p>We'll send you tracking information once your order ships.</p>
                    <p>Expected delivery: {order_data.get('expected_delivery', '2-3 business days')}</p>
                    
                    <p>Thank you for choosing Flint & Flours. We can't wait for you to enjoy our handcrafted creations!</p>
                    
                    <p>Freshly yours,<br>The Flint & Flours Team</p>
                </div>
                <div class="footer">
                    <p>© 2024 Flint & Flours - Where tradition meets artistry</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return await self.send_email(recipient_email, subject, html_content)

    async def send_shipping_update_email(self, recipient_email: str, tracking_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send shipping tracking update"""
        subject = f"Your Order is On Its Way! - Flint & Flours"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Shipping Update - Flint & Flours</title>
            <style>
                body {{ font-family: 'Georgia', serif; color: #3a3a3a; line-height: 1.6; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #8b5a3c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; }}
                .content {{ background: #fffef9; padding: 40px; border-radius: 0 0 10px 10px; }}
                .tracking-box {{ background: #f5f1eb; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }}
                .tracking-number {{ font-size: 18px; font-weight: bold; color: #8b5a3c; }}
                .button {{ display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #7a7a7a; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚚 Your Order is Shipped!</h1>
                </div>
                <div class="content">
                    <h2>Great news! Your order is on its way</h2>
                    <p>Your Flint & Flours order #{tracking_data.get('order_id', 'N/A')} has been shipped and is heading to your doorstep.</p>
                    
                    <div class="tracking-box">
                        <p><strong>Tracking Number:</strong></p>
                        <div class="tracking-number">{tracking_data.get('tracking_number', 'N/A')}</div>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="{tracking_data.get('tracking_link', '#')}" class="button">Track Your Order</a>
                    </p>
                    
                    <p><strong>Expected Delivery:</strong> {tracking_data.get('expected_delivery', '2-3 business days')}</p>
                    
                    <p>We've carefully packaged your artisan baked goods to ensure they arrive fresh and delicious.</p>
                    
                    <p>Thank you for your order!<br>The Flint & Flours Team</p>
                </div>
                <div class="footer">
                    <p>© 2024 Flint & Flours - Where tradition meets artistry</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return await self.send_email(recipient_email, subject, html_content)

# Global email service instance
email_service = None

def get_email_service() -> EmailService:
    """Get or create the email service instance"""
    global email_service
    if email_service is None:
        email_service = EmailService()
    return email_service

# Convenience functions for common email types
async def send_verification_email(recipient_email: str, verification_token: str, base_url: str = "https://flintandflours.com") -> Dict[str, Any]:
    """Send verification email"""
    service = get_email_service()
    return await service.send_verification_email(recipient_email, verification_token, base_url)

async def send_password_reset_email(recipient_email: str, reset_token: str, base_url: str = "https://flintandflours.com") -> Dict[str, Any]:
    """Send password reset email"""
    service = get_email_service()
    return await service.send_password_reset_email(recipient_email, reset_token, base_url)

async def send_order_confirmation_email(recipient_email: str, order_data: Dict[str, Any]) -> Dict[str, Any]:
    """Send order confirmation email"""
    service = get_email_service()
    return await service.send_order_confirmation_email(recipient_email, order_data)

async def send_shipping_update_email(recipient_email: str, tracking_data: Dict[str, Any]) -> Dict[str, Any]:
    """Send shipping update email"""
    service = get_email_service()
    return await service.send_shipping_update_email(recipient_email, tracking_data)