import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo


class TerminalFormatter(logging.Formatter):
    def __init__(self, timezone: str):
        super().__init__("%(asctime)s  %(levelname)-7s [%(name)s] %(message)s", datefmt="%H:%M:%S")
        self.timezone = ZoneInfo(timezone)

    def formatTime(self, record, datefmt=None):
        return datetime.fromtimestamp(record.created, self.timezone).strftime(datefmt or "%H:%M:%S")

    def format(self, record):
