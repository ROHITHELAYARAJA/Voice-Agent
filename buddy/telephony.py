import httpx

from buddy.sheets import IntegrationError
from config import Settings


class TwilioClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def request(self, path: str, data: dict) -> dict:
        try:
            response = await self.http.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.settings.twilio_account_sid}/{path}",
                auth=(self.settings.twilio_account_sid, self.settings.twilio_auth_token),
                data=data,
            )
        except httpx.HTTPError:
            raise IntegrationError(
                "Twilio could not be reached. Check the call status in Twilio before trying again."
            ) from None
        if response.status_code >= 400:
            try:
                code = response.json().get("code", response.status_code)
            except ValueError:
                code = response.status_code
            raise IntegrationError(
                f"Twilio rejected the request (code {code}). Check credentials, the caller number, and destination permissions."
            )
        return response.json()

    async def call_owner(self, session_id: str) -> dict:
        base = self.settings.public_url
        return await self.request(
            "Calls.json",
            {
                "To": self.settings.owner_phone_number,
                "From": self.settings.twilio_phone_number,
                "Url": f"{base}/twiml?session_id={session_id}",
                "Method": "POST",
                "StatusCallback": f"{base}/call-status?session_id={session_id}",
                "StatusCallbackMethod": "POST",
                "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
                "Timeout": "30",
                "TimeLimit": str(self.settings.max_call_seconds),
            },
        )

    async def hangup(self, call_sid: str) -> None:
        await self.request(f"Calls/{call_sid}.json", {"Status": "completed"})
