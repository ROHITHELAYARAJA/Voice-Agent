import json

import httpx
import pytest

from buddy.sheets import HEADERS, IntegrationError, SheetsClient, SheetsSync
from buddy.storage import Store


class FakeSheets:
    def __init__(self):
        self.rows = {1: HEADERS}
        self.writes = []
        self.fail_after_write = False

    def handle(self, request):
        if request.url.path.endswith(":batchUpdate"):
            return httpx.Response(200, json={})
        if "/values/" not in request.url.path:
            return httpx.Response(
                200,
                json={
                    "sheets": [
                        {
                            "properties": {
                                "title": "Buddy Checkins",
                                "sheetId": 42,
                                "gridProperties": {"rowCount": 1000},
                            }
                        }
                    ]
                },
            )
        cells = request.url.path.split("!", 1)[1]
        if request.method == "GET":
            if cells == "A1:R1":
                return httpx.Response(200, json={"values": [self.rows[1]]})
            if cells == "A:A":
                return httpx.Response(
                    200,
