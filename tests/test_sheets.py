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
                    json={
                        "values": [
                            [self.rows.get(n, [""])[0]] for n in range(1, max(self.rows) + 1)
                        ]
                    },
                )
            return httpx.Response(200, json={})
        row_number = int(cells.split(":")[0][1:])
        self.rows[row_number] = json.loads(request.content)["values"][0]
        self.writes.append((row_number, request.url.params["valueInputOption"]))
        if self.fail_after_write:
            self.fail_after_write = False
            raise httpx.ReadTimeout("simulated lost response")
        return httpx.Response(200, json={"updatedRows": 1})


async def test_retry_after_google_write_reuses_row_and_raw_values(settings, monkeypatch):
    fake = FakeSheets()
    settings.google_sheet_id = "test-sheet"
    settings.google_credentials_file = str(settings.data_dir / "credentials.json")
    settings.data_dir.mkdir(parents=True)
    settings.credentials_path.write_text("{}")
    store = Store(settings.data_dir / "test.sqlite3")
    session = store.create("2026-10-11")
    store.update(
        session["id"],
        answers={"accomplishments": {"answer": "=IMPORTXML(attacker)", "skipped": False}},
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handle)) as http:
        client = SheetsClient(settings, http)
        monkeypatch.setattr(client, "refresh_credentials", lambda: "test-token")
        sync = SheetsSync(store, client)
        fake.fail_after_write = True
        assert (await sync.flush())["error"]
        assert store.get(session["id"])["synced_version"] == 0
        store.retry_sync()
        assert (await sync.flush())["synced"] == 1
        assert [row for row, _ in fake.writes] == [2, 2]
        assert all(mode == "RAW" for _, mode in fake.writes)
        assert fake.rows[2][3] == "=IMPORTXML(attacker)"
