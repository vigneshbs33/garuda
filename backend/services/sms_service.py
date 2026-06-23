import time
import logging
from datetime import datetime
from ..core.alert_service import get_alert_service

logger = logging.getLogger(__name__)

# Global rate limit tracker in memory: stores the timestamp when the last SMS was sent to the dual recipients
LAST_AUTO_SMS_TIME = 0.0

SMS_DESCRIPTIONS = {
    "No Helmet": "No Helmet",
    "Seatbelt": "No Seatbelt",
    "Triple Riding": "Triple Riding",
    "Wrong Way": "Wrong Way",
    "Stop Line": "Stop Line",
    "Red Light": "Red Light",
    "Illegal Parking": "No Parking",
    "Phone Use": "Phone Use",
    "Drowsy": "Drowsy Driving",
}

async def send_challan_sms(violation, force: bool = False) -> bool:
    """Send SMS challan to the target dual recipients +919670333459 and +919263225604.
    
    If force=False (automatic pipeline), rate limits to at most one message every 10 minutes.
    If force=True (manually triggered from frontend), rate limit is bypassed.
    """
    global LAST_AUTO_SMS_TIME
    
    # 1. Rate limiting check (10 min = 600s) for automatic messages
    if not force:
        now = time.time()
        if now - LAST_AUTO_SMS_TIME < 600:
            logger.info("SMS rate-limited: last auto SMS was sent less than 10 minutes ago. Skipping.")
            return False
            
    # 2. Build the SMS body matching the data.md template (customized for Karnataka Police / Garuda)
    desc = SMS_DESCRIPTIONS.get(violation.violation_type, violation.violation_type)
    
    body = (
        f"Garuda Alert: {violation.id[-13:]} on {violation.plate_text}: {desc}. "
        f"Rs{violation.fine_amount}. Pay: parivahan.gov.in"
    )
    
    # 3. Send SMS via Twilio AlertService
    alert_svc = get_alert_service()
    recipients = ["+919670333459", "+919263225604"]
    
    logger.info("Sending SMS Challan to %s (force=%s)... Message:\n%s", recipients, force, body)
    
    # Trigger dispatch to both recipients
    results = await alert_svc.send_violation_alert(body, recipient_phones=recipients, via_whatsapp=False)
    logger.info("Twilio SMS send results: %s", results)
    
    # 4. Check for errors
    failed = [r for r in results if r.get("status") == "error"]
    if failed:
        err_msg = ", ".join([f"{f['phone']}: {f.get('error')}" for f in failed])
        raise RuntimeError(f"Twilio Dispatch Failed — {err_msg}")
    
    if not force:
        LAST_AUTO_SMS_TIME = time.time()
        
    return True

