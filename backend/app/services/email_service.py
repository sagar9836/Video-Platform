import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import settings


def _send_email_sync(to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls:
            smtp.starttls()
            smtp.ehlo()
        smtp.login(settings.smtp_username, settings.smtp_password.replace(" ", ""))
        smtp.send_message(message)


async def send_email(to_email: str, subject: str, body: str) -> None:
    """
    Best-effort email sender.
    Falls back to console logging in local development when SMTP is unset.
    """
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        print(f"[EMAIL-DEV] to={to_email} subject={subject} body={body}")
        return

    try:
        await asyncio.to_thread(_send_email_sync, to_email, subject, body)
    except Exception as exc:
        print(f"[EMAIL-ERROR] to={to_email} error={exc}")
