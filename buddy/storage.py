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
                CREATE TABLE IF NOT EXISTS tool_results (
                    session_id TEXT NOT NULL, function_id TEXT NOT NULL, result TEXT NOT NULL,
                    PRIMARY KEY(session_id, function_id)
                );
                CREATE TABLE IF NOT EXISTS sheet_rows (
                    target TEXT NOT NULL, session_id TEXT NOT NULL, row_number INTEGER NOT NULL,
                    PRIMARY KEY(target, session_id), UNIQUE(target, row_number)
                );
                CREATE TABLE IF NOT EXISTS sheet_sync (
                    target TEXT NOT NULL, session_id TEXT NOT NULL, version INTEGER NOT NULL,
                    PRIMARY KEY(target, session_id)
                );
                CREATE TABLE IF NOT EXISTS transcripts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
                    role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
                );
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def decode(row) -> dict:
        value = dict(row)
        for field in ("answers", "expenses", "income"):
            value[field] = json.loads(value[field])
        return value

    def create(self, checkin_date: str) -> dict:
        session_id = uuid4().hex
        now = utc_now()
        with self.connection() as db:
            db.execute(
                "INSERT INTO sessions(id, checkin_date, created_at, updated_at, stream_token) VALUES (?, ?, ?, ?, ?)",
                (session_id, checkin_date, now, now, secrets.token_urlsafe(32)),
            )
        return self.get(session_id)

    def get(self, session_id: str) -> dict:
        with self.connection() as db:
            row = db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if row is None:
            raise KeyError("Check-in not found")
        return self.decode(row)

    def list_sessions(self, limit: int = 50) -> list[dict]:
        with self.connection() as db:
            rows = db.execute(
                "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self.decode(row) for row in rows]

    def update(self, session_id: str, **changes) -> dict:
        allowed = {
            "status",
            "call_status",
            "call_sid",
            "answers",
            "expenses",
            "income",
            "call_error",
            "stream_token",
        }
        if not changes or not changes.keys() <= allowed:
            raise ValueError("Invalid session update")
        values = [
            json.dumps(value, ensure_ascii=False)
            if key in {"answers", "expenses", "income"}
            else value
            for key, value in changes.items()
        ]
        assignments = ", ".join(f"{key} = ?" for key in changes)
        with self.connection() as db:
            db.execute(
                f"UPDATE sessions SET {assignments}, updated_at = ?, version = version + 1, next_sync_at = 0 WHERE id = ?",
                (*values, utc_now(), session_id),
            )
        return self.get(session_id)

    def tool_result(self, session_id: str, function_id: str) -> dict | None:
        with self.connection() as db:
            row = db.execute(
                "SELECT result FROM tool_results WHERE session_id = ? AND function_id = ?",
                (session_id, function_id),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def cache_tool(self, session_id: str, function_id: str, result: dict) -> None:
        with self.connection() as db:
            db.execute(
                "INSERT OR IGNORE INTO tool_results VALUES (?, ?, ?)",
                (session_id, function_id, json.dumps(result)),
            )

    def transcript(self, session_id: str, role: str, content: str) -> None:
        with self.connection() as db:
            db.execute(
                "INSERT INTO transcripts(session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (session_id, role, content[:10000], utc_now()),
            )
            db.execute(
                "UPDATE sessions SET version = version + 1, updated_at = ?, next_sync_at = 0 WHERE id = ?",
                (utc_now(), session_id),
            )

    def transcripts(self, session_id: str) -> list[dict]:
        with self.connection() as db:
            rows = db.execute(
                "SELECT id, role, content, created_at FROM transcripts WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def pending(self, target: str, now: float) -> list[dict]:
        with self.connection() as db:
            rows = db.execute(
                """
                SELECT s.* FROM sessions s LEFT JOIN sheet_sync x ON x.session_id = s.id AND x.target = ?
                WHERE s.version > COALESCE(x.version, 0) AND s.next_sync_at <= ?
                ORDER BY s.updated_at LIMIT 20
            """,
                (target, now),
            ).fetchall()
        return [self.decode(row) for row in rows]

    def reserve_row(self, target: str, session_id: str, minimum_row: int) -> int:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT row_number FROM sheet_rows WHERE target = ? AND session_id = ?",
                (target, session_id),
            ).fetchone()
            if existing:
                return existing[0]
            last = (
                db.execute(
                    "SELECT MAX(row_number) FROM sheet_rows WHERE target = ?", (target,)
                ).fetchone()[0]
                or 1
            )
            row_number = max(last + 1, minimum_row)
            db.execute("INSERT INTO sheet_rows VALUES (?, ?, ?)", (target, session_id, row_number))
        return row_number

    def mark_synced(self, target: str, session_id: str, version: int) -> None:
        with self.connection() as db:
            db.execute(
                "INSERT INTO sheet_sync VALUES (?, ?, ?) ON CONFLICT(target, session_id) DO UPDATE SET version = excluded.version",
                (target, session_id, version),
            )
            db.execute(
                "UPDATE sessions SET synced_version = ?, sync_error = NULL, sync_attempts = 0, next_sync_at = 0 WHERE id = ?",
                (version, session_id),
            )

    def mark_sync_error(self, session_id: str, message: str, now: float) -> None:
        with self.connection() as db:
            row = db.execute(
                "SELECT sync_attempts FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            attempts = row[0] + 1
            db.execute(
                "UPDATE sessions SET sync_error = ?, sync_attempts = ?, next_sync_at = ? WHERE id = ?",
                (message, attempts, now + min(300, 2 ** min(attempts, 8)), session_id),
            )

    def retry_sync(self) -> None:
        with self.connection() as db:
            db.execute("UPDATE sessions SET next_sync_at = 0")

    def synced_version(self, session_id: str, target: str) -> int:
        with self.connection() as db:
            row = db.execute(
                "SELECT version FROM sheet_sync WHERE session_id = ? AND target = ?",
                (session_id, target),
            ).fetchone()
        return row[0] if row else 0

    def recover_calls(self) -> None:
        with self.connection() as db:
            db.execute(
                """
                UPDATE sessions SET call_status = 'interrupted',
                status = CASE WHEN status IN ('completed', 'declined') THEN status ELSE 'interrupted' END,
                version = version + 1, updated_at = ?
                WHERE call_status IN ('starting', 'queued', 'initiated', 'ringing', 'in-progress')
            """,
                (utc_now(),),
            )
