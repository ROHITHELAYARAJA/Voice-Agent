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
