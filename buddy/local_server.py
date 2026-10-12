import asyncio
import logging
import os
import subprocess
from urllib.parse import urlsplit

import httpx

from buddy.sheets import IntegrationError
from config import ROOT


async def ensure_local_server(http: httpx.AsyncClient, url: str) -> None:
    try:
        response = await http.get(url + "/api/version", timeout=2)
        response.raise_for_status()
        return
    except httpx.HTTPError:
        pass
    executable = ROOT / ".local" / "ollama" / "ollama.exe"
    if not executable.is_file():
        raise IntegrationError("Local Ollama is not installed. Run uv run python setup_local.py.")
    env = {
        **os.environ,
        "OLLAMA_HOST": urlsplit(url).netloc,
        "OLLAMA_NO_CLOUD": "1",
        "OLLAMA_MODELS": str(ROOT / ".local" / "models"),
    }
    with (executable.parent / "server.log").open("ab") as log:
        subprocess.Popen(
            [str(executable), "serve"],
            env=env,
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    logging.getLogger("LOCAL AI").info("Starting local Ollama server")
    for _ in range(20):
        await asyncio.sleep(0.25)
        try:
            response = await http.get(url + "/api/version", timeout=1)
            response.raise_for_status()
            return
        except httpx.HTTPError:
            pass
    raise IntegrationError("Local Ollama could not start. Check .local/ollama/server.log.")
