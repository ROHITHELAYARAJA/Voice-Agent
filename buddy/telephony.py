import logging

import httpx

from buddy.sheets import IntegrationError
from config import Settings

logger = logging.getLogger("TWILIO")


class TwilioClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http
        self.account_type = None

    async def request(self, path: str, data: dict | None = None, method: str = "POST") -> dict:
        account = f"https://api.twilio.com/2010-04-01/Accounts/{self.settings.twilio_account_sid}"
        try:
            response = await self.http.request(
                method,
                f"{account}/{path}" if path else f"{account}.json",
                auth=(self.settings.twilio_account_sid, self.settings.twilio_auth_token),
                data=data,
            )
        except httpx.HTTPError:
            raise IntegrationError(
                "Twilio could not be reached. Check the call status in Twilio before trying again."
            ) from None
        if response.status_code >= 400:
            try:
                details = response.json()
            except ValueError:
                details = {}
            if not isinstance(details, dict):
                details = {}
            code = details.get("code", response.status_code)
            message = str(details.get("message") or response.reason_phrase)
            for secret in (
                self.settings.twilio_auth_token,
                self.settings.deepgram_api_key,
                self.settings.elevenlabs_api_key,
            ):
                if secret:
                    message = message.replace(secret, "[hidden]")
            raise IntegrationError(
                f"Twilio rejected the request (HTTP {response.status_code}, code {code}): {message[:500]}"
            )
        try:
            result = response.json()
        except ValueError:
            raise IntegrationError(
                "Twilio returned an unreadable response. Check the call status before retrying."
            ) from None
        if not isinstance(result, dict):
            raise IntegrationError(
                "Twilio returned an unexpected response. Check the call status before retrying."
            )
        return result

    async def check_account(self) -> str:
        result = await self.request("", method="GET")
        account_type = result.get("type")
        if account_type not in {"Trial", "Full"}:
            raise IntegrationError(
                "Twilio did not return a supported account type. Check your account in Twilio Console."
            )
        self.account_type = account_type
        return account_type

    async def call_owner(self, session_id: str, webhook_token: str | None = None) -> dict:
        if self.account_type is None:
            await self.check_account()
        if self.account_type == "Trial" and self.settings.call_mode == "stream":
            raise IntegrationError("Twilio trial blocks Media Streams. Use CALL_MODE=gather with Deepgram and Jessica; no call was placed.")
        base = self.settings.public_url
        data = {
            "To": self.settings.owner_phone_number,
            "From": self.settings.twilio_phone_number,
            "Url": f"{base}/twiml?session_id={session_id}",
        }
        if webhook_token and self.account_type == "Trial" and self.settings.call_mode == "gather":
            data["Url"] += f"&webhook_token={webhook_token}"
        if self.account_type == "Trial":
            if self.settings.call_mode == "gather":
                logger.info(
                    "Trial account | speech questions enabled | maximum %s answers per call",
                    self.settings.gather_max_turns,
                )
        else:
            data.update(
                {
                    "Method": "POST",
                    "StatusCallback": f"{base}/call-status?session_id={session_id}",
                    "StatusCallbackMethod": "POST",
                    "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
                    "Timeout": "30",
                    "TimeLimit": str(self.settings.max_call_seconds),
                }
            )
        result = await self.request("Calls.json", data)
        if not isinstance(result.get("sid"), str) or not result["sid"]:
            raise IntegrationError(
                "Twilio did not return a call ID. Check the call status before retrying."
            )
        return result

    async def get_call(self, call_sid: str) -> dict:
        return await self.request(f"Calls/{call_sid}.json", method="GET")

    async def hangup(self, call_sid: str) -> None:
        await self.request(f"Calls/{call_sid}.json", {"Status": "completed"})
