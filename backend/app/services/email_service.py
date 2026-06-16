import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.utils.logger import logger


class EmailDeliveryError(RuntimeError):
    pass


def _build_smtp_client() -> smtplib.SMTP:
    timeout = 20
    if settings.smtp_use_ssl:
        return smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=timeout,
            context=ssl.create_default_context(),
        )

    return smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout)


def _send_email_sync(to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    with _build_smtp_client() as smtp:
        smtp.ehlo_or_helo_if_needed()
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    raise_on_error: bool = False,
) -> bool:
    """
    Best-effort email sender.
    Falls back to console logging in local development when SMTP is unset.
    """
    if not settings.smtp_host:
        logger.info("[EMAIL-DEV] to=%s subject=%s body=%s", to_email, subject, body)
        return False

    try:
        await asyncio.to_thread(_send_email_sync, to_email, subject, body)
        return True
    except Exception as exc:
        logger.exception("Email delivery failed for %s", to_email)
        if raise_on_error:
            raise EmailDeliveryError(f"Unable to send email to {to_email}") from exc
        return False
