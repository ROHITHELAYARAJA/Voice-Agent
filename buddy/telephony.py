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
