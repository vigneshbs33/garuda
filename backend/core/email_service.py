"""
GARUDA Core — Email Dispatcher Service
========================================
Handles formatting and non-blocking sending of verification links using SMTP.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

logger = logging.getLogger(__name__)


def send_email_sync(to_email: str, subject: str, html_content: str, settings: Any) -> None:
    """Send SMTP email synchronously. Executed inside a thread pool."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to_email
    
    part = MIMEText(html_content, "html")
    msg.attach(part)
    
    if settings.SMTP_PORT == 465:
        # SSL Connection
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())
    else:
        # TLS Connection (port 587 or others)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10.0) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())


async def send_verification_email(to_email: str, name: str, token: str, settings: Any) -> None:
    """Prepare verification template and dispatch email in a thread executor."""
    verify_url = f"http://localhost:8000/api/v1/auth/verify?token={token}"
    subject = "Verify Your GARUDA Platform Account"
    
    html_content = f"""
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your GARUDA Account</title>
        <style>
          body {{ font-family: -apple-system, sans-serif; background-color: #F8FAFC; color: #0F172A; padding: 24px; margin: 0; }}
          .container {{ background-color: #FFFFFF; max-width: 500px; border-radius: 8px; border: 1px solid #E2E8F0; border-top: 4px solid #FEF08A; padding: 32px; margin: 20px auto; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
          .logo-badge {{ display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background-color: #EAB308; font-weight: bold; color: #854D0E; font-size: 14px; margin-bottom: 12px; }}
          h1 {{ font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 16px 0; letter-spacing: -0.5px; }}
          p {{ font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px 0; }}
          .btn-container {{ text-align: center; margin-bottom: 24px; }}
          .btn {{ background-color: #FEF08A; border: 1px solid #EAB308; color: #854D0E; font-size: 13px; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; transition: background 0.15s; }}
          .footer {{ border-top: 1px solid #E2E8F0; padding-top: 16px; font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo-badge">G</div>
          <h1>Account Verification</h1>
          <p>Hello <b>{name}</b>,</p>
          <p>Your enforcement user registry request has been received by the **GARUDA Traffic Violation Intelligence Platform**. To verify your email address and activate your officer credentials, please click the button below:</p>
          <div class="btn-container">
            <a href="{verify_url}" class="btn">ACTIVATE OFFICER ACCOUNT</a>
          </div>
          <p>If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="word-break: break-all; font-size: 11px; font-family: monospace; background-color: #F1F5F9; padding: 8px; border-radius: 4px;">{verify_url}</p>
          <div class="footer">
            GARUDA surveillance network • confidential system access logs
          </div>
        </div>
      </body>
    </html>
    """
    
    logger.info("Mailing verification request token to %s using SMTP server %s...", to_email, settings.SMTP_HOST)
    
    # Run synchronous SMTP sending in thread pool to prevent blocking FastAPI
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        send_email_sync,
        to_email,
        subject,
        html_content,
        settings
    )
    logger.info("Verification mail dispatched successfully to %s", to_email)
