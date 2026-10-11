import asyncio
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from buddy.storage import Store
from config import Settings

LOG_HEADERS = ["Log ID", "Check-in ID", "Timestamp", "Speaker", "Message"]
CHECKINS_TAB = "Buddy Checkins"
LOG_TAB = "Conversation Log"

class ExcelClient:
    label = "Excel file"
    configured = True

    def __init__(self, settings: Settings):
        self.settings = settings
        self.path = settings.excel_path.resolve()

    @property
    def target(self) -> str:
        return f"excel:{self.path}"

    @staticmethod
    def make_sheet(workbook, title: str, headers: list, widths: list):
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter

        sheet = workbook.create_sheet(title)
        sheet.append(headers)
        sheet.freeze_panes = "C2"
        sheet.sheet_view.showGridLines = False
        sheet.row_dimensions[1].height = 32
        for col, width in enumerate(widths, 1):
            sheet.column_dimensions[get_column_letter(col)].width = width
        for cell in sheet[1]:
            cell.font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="244A40")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        return sheet

    def open(self):
        from openpyxl import Workbook, load_workbook
        from buddy.sheets import HEADERS, IntegrationError

        if self.path.exists():
            workbook = load_workbook(self.path)
            for title, headers in [(CHECKINS_TAB, HEADERS), (LOG_TAB, LOG_HEADERS)]:
                if (
                    title not in workbook.sheetnames
                    or [cell.value for cell in workbook[title][1]] != headers
                ):
                    workbook.close()
                    raise IntegrationError(
                        "Excel headers do not match Buddy. Choose another EXCEL_FILE to protect existing data."
                    )
            return workbook
        workbook = Workbook()
        workbook.remove(workbook.active)
        self.make_sheet(
            workbook,
            CHECKINS_TAB,
            HEADERS,
            [27, 14, 16, 40, 36, 36, 24, 40, 36, 24, 40, 32, 36, 36, 28, 22, 28, 18],
        )
        self.make_sheet(workbook, LOG_TAB, LOG_HEADERS, [14, 34, 30, 16, 100])
        return workbook

    @staticmethod
    def put_row(sheet, number: int, values: list):
        from openpyxl.styles import Alignment, Font

        for column, value in enumerate(values, 1):
            cell = sheet.cell(number, column, value)
            if isinstance(value, str):
                cell.data_type = "s"
            cell.font = Font(name="Arial", size=11, color="24332D")
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        sheet.row_dimensions[number].height = 45

    def save(self, workbook):
        from tempfile import NamedTemporaryFile

        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with NamedTemporaryFile(dir=self.path.parent, suffix=".xlsx", delete=False) as file:
                temporary = Path(file.name)
            workbook.save(temporary)
            os.replace(temporary, self.path)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
