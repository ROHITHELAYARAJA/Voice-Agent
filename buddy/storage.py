import json
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, checkin_date TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft', call_status TEXT NOT NULL DEFAULT 'not_started',
                    call_sid TEXT, stream_token TEXT NOT NULL,
                    answers TEXT NOT NULL DEFAULT '{}', expenses TEXT NOT NULL DEFAULT '[]', income TEXT NOT NULL DEFAULT '[]',
                    version INTEGER NOT NULL DEFAULT 1, synced_version INTEGER NOT NULL DEFAULT 0,
                    sync_error TEXT, sync_attempts INTEGER NOT NULL DEFAULT 0,
                    next_sync_at REAL NOT NULL DEFAULT 0, call_error TEXT
                );
