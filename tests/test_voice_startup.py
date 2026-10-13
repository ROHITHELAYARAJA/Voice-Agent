import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


def test_container_console_launcher_starts_voice_service(tmp_path):
    root = Path(__file__).resolve().parents[1]
    dockerfile = (root / "services/voice-python/Dockerfile").read_text()
    assert "PYTHONPATH=/app" in dockerfile
    launcher = Path(sys.executable).parent / ("uvicorn.exe" if os.name == "nt" else "uvicorn")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    environment = {
        **os.environ,
        "PYTHONPATH": str(root),
        "API_INTERNAL_URL": "https://api.example.com",
        "VOICE_PUBLIC_URL": "https://voice.example.com",
        "INTERNAL_SERVICE_SECRET": "test-internal-secret-" + "x" * 32,
        "VOICE_SESSION_SECRET": "test-session-secret-" + "y" * 32,
    }
    process = subprocess.Popen(
        [
            str(launcher),
            "calmloop_voice.app:app",
            "--app-dir",
            str(root / "services/voice-python"),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--no-access-log",
        ],
        cwd=tmp_path,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise AssertionError(process.communicate()[0])
            try:
                with urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                    assert response.status == 200
                    assert b'"status":"ready"' in response.read()
                    return
            except (URLError, TimeoutError):
                time.sleep(0.1)
        raise AssertionError("Voice service did not become ready")
    finally:
        process.terminate()
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
