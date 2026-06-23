"""
GARUDA Backend — Alert Service
================================
Sends WhatsApp / SMS notifications to patrol officers for Tier 2 violations.

Default mode: MOCK (prints to log — no Twilio credentials needed for dev).
Production mode: Set TWILIO_* env vars and ALERTS_ENABLED=true in .env.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AlertService:
    """
    Multi-channel alert dispatcher.
    Automatically selects mock vs Twilio based on configuration.
    """

    def __init__(self) -> None:
        self._twilio_client = None
        if settings.ALERTS_ENABLED and settings.TWILIO_ACCOUNT_SID:
            self._init_twilio()

    def _init_twilio(self) -> None:
        try:
            from twilio.rest import Client  # type: ignore
            if settings.TWILIO_API_KEY and settings.TWILIO_API_SECRET:
                self._twilio_client = Client(
                    settings.TWILIO_API_KEY,
                    settings.TWILIO_API_SECRET,
                    settings.TWILIO_ACCOUNT_SID,
                )
            else:
                self._twilio_client = Client(
                    settings.TWILIO_ACCOUNT_SID,
                    settings.TWILIO_AUTH_TOKEN,
                )
            logger.info("Twilio alert service initialised")
        except ImportError:
            logger.warning("Twilio package not installed. Run: pip install twilio")
        except Exception as e:
            logger.error("Twilio init failed: %s", e)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def send_violation_alert(
        self,
        message: str,
        recipient_phones: Optional[List[str]] = None,
        via_whatsapp: bool = True,
    ) -> List[dict]:
        """
        Send violation alert to all officer phones concurrently.

        Returns list of {phone, status, sid_or_error} per recipient.
        """
        phones = recipient_phones or settings.officer_phone_list

        if not settings.ALERTS_ENABLED:
            return [self._send_mock(message, phone, via_whatsapp) for phone in phones]

        if not self._twilio_client:
            return [{"phone": phone, "status": "error", "error": "Twilio Client not initialized. Check your credentials."} for phone in phones]

        import asyncio
        tasks = [self._send_twilio(message, phone, via_whatsapp) for phone in phones]
        results = await asyncio.gather(*tasks)
        return list(results)

    async def send_tier2_review(
        self,
        violation_id: str,
        violation_type: str,
        confidence: float,
        plate: str,
        location: str,
        image_url: str,
        recipient_phones: Optional[List[str]] = None,
    ) -> List[dict]:
        """Convenience method for Tier 2 human-review alerts"""
        conf_pct = int(confidence * 100)
        message = (
            f"🚦 GARUDA ALERT\n"
            f"📍 {location}\n\n"
            f"⚠️ REVIEW NEEDED\n"
            f"Violation : {violation_type.replace('_', ' ').title()}\n"
            f"Confidence: {conf_pct}%\n"
            f"Plate     : {plate or 'UNCLEAR'}\n\n"
            f"ID: {violation_id}\n\n"
            f"Reply CONFIRM or FP within 10 min"
        )
        return await self.send_violation_alert(message, recipient_phones)

    async def send_repeat_offender_alert(
        self,
        plate: str,
        prior_count: int,
        location: str,
        recipient_phones: Optional[List[str]] = None,
    ) -> List[dict]:
        """High-priority alert for known repeat offenders"""
        message = (
            f"🚨 GARUDA — REPEAT OFFENDER\n"
            f"📍 {location}\n\n"
            f"Vehicle : {plate}\n"
            f"History : {prior_count} prior violations\n\n"
            f"⚠️ PHYSICAL INTERCEPTION RECOMMENDED\n"
            f"Reply ACK to confirm awareness"
        )
        return await self.send_violation_alert(message, recipient_phones)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _send_twilio(
        self, message: str, phone: str, via_whatsapp: bool
    ) -> dict:
        try:
            if via_whatsapp and settings.TWILIO_WHATSAPP_FROM:
                msg = self._twilio_client.messages.create(
                    body=message,
                    from_=settings.TWILIO_WHATSAPP_FROM,
                    to=f"whatsapp:{phone}",
                )
            else:
                from_num = settings.TWILIO_FROM_NUMBER
                if from_num.startswith("MG"):
                    msg = self._twilio_client.messages.create(
                        body=message,
                        messaging_service_sid=from_num,
                        to=phone,
                    )
                else:
                    msg = self._twilio_client.messages.create(
                        body=message,
                        from_=from_num,
                        to=phone,
                    )
            logger.info("Alert dispatched via Twilio to %s | SID: %s. Polling status...", phone, msg.sid)
            
            # Poll status briefly to catch immediate carrier/sandbox failures (e.g. Error 21608 unverified caller ID)
            import asyncio
            status = msg.status
            error_code = getattr(msg, "error_code", None)
            error_message = getattr(msg, "error_message", None)
            
            for _ in range(3):
                if status in ("sent", "delivered", "failed", "undelivered"):
                    break
                await asyncio.sleep(0.5)
                try:
                    fetched = self._twilio_client.messages(msg.sid).fetch()
                    status = fetched.status
                    error_code = fetched.error_code
                    error_message = fetched.error_message
                except Exception as fetch_err:
                    logger.debug("Failed to fetch message status: %s", fetch_err)
                    break
            
            if status in ("failed", "undelivered") or error_code:
                err_desc = error_message or f"Twilio Error {error_code or 'Unknown'}"
                if error_code == 21608 or "21608" in str(error_code):
                    err_desc = "Twilio Trial Limit: Recipient number is not verified in Twilio Console (Error 21608)"
                logger.error("Twilio message delivery failed to %s: %s", phone, err_desc)
                return {"phone": phone, "status": "error", "error": err_desc}
                
            logger.info("Alert delivered via Twilio to %s | SID: %s | Status: %s", phone, msg.sid, status)
            return {"phone": phone, "status": "sent", "sid": msg.sid}
        except Exception as e:
            logger.error("Twilio send failed to %s: %s", phone, e)
            return {"phone": phone, "status": "error", "error": str(e)}

    def _send_mock(self, message: str, phone: str, via_whatsapp: bool) -> dict:
        channel = "WhatsApp" if via_whatsapp else "SMS"
        logger.info(
            "MOCK ALERT [%s → %s]:\n%s\n%s",
            channel, phone, "─" * 50, message,
        )
        return {"phone": phone, "status": "mock_sent", "channel": channel}


# Module-level singleton
_alert_service: Optional[AlertService] = None


def get_alert_service() -> AlertService:
    global _alert_service
    if _alert_service is None:
        _alert_service = AlertService()
    return _alert_service
