import asyncio
import hashlib
import os
import subprocess
import zipfile

import httpx

from config import ROOT


async def main():
    target = ROOT / ".local" / "ollama"
    executable = target / "ollama.exe"
    target.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
        if not executable.exists():
            release = await http.get("https://api.github.com/repos/ollama/ollama/releases/latest")
            release.raise_for_status()
            asset = next(
                a for a in release.json()["assets"] if a["name"] == "ollama-windows-amd64.zip"
            )
            archive = target / "download.zip"
            print(f"Downloading official Ollama {release.json()['tag_name']} locally", flush=True)
            digest = hashlib.sha256()
            downloaded = 0
            progress = 0
            async with http.stream("GET", asset["browser_download_url"]) as response:
                response.raise_for_status()
                with archive.open("wb") as file:
                    async for chunk in response.aiter_bytes(1024 * 1024):
                        file.write(chunk)
                        digest.update(chunk)
                        downloaded += len(chunk)
                        percentage = int(downloaded * 100 / asset["size"])
                        if percentage >= progress + 10:
                            progress = percentage
                            print(f"Ollama download: {percentage}%", flush=True)
            expected = asset.get("digest", "")
            if expected and expected != "sha256:" + digest.hexdigest():
                raise RuntimeError("Ollama download checksum did not match")
            with zipfile.ZipFile(archive) as bundle:
                for member in bundle.infolist():
                    destination = (target / member.filename).resolve()
                    if not destination.is_relative_to(target.resolve()):
                        raise RuntimeError("Unexpected archive path")
                bundle.extractall(target)
            archive.unlink()
            print("Ollama extracted into the project", flush=True)
        try:
            response = await http.get("http://127.0.0.1:11434/api/version", timeout=2)
            response.raise_for_status()
        except httpx.HTTPError:
            env = {
                **os.environ,
                "OLLAMA_HOST": "127.0.0.1:11434",
                "OLLAMA_NO_CLOUD": "1",
                "OLLAMA_MODELS": str(ROOT / ".local" / "models"),
            }
            log = (target / "server.log").open("ab")
            subprocess.Popen(
                [str(executable), "serve"],
                env=env,
                stdout=log,
                stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            log.close()
            for _ in range(30):
                await asyncio.sleep(1)
                try:
                    response = await http.get("http://127.0.0.1:11434/api/version", timeout=2)
                    response.raise_for_status()
                    break
                except httpx.HTTPError:
                    pass
            else:
                raise RuntimeError("Local Ollama server did not start")
        model = os.getenv("LOCAL_MODEL", "qwen3:1.7b")
        if ":cloud" in model:
            raise RuntimeError("Use a local model, not a cloud model")
        print(f"Downloading local model {model}", flush=True)
        async with http.stream(
            "POST", "http://127.0.0.1:11434/api/pull", json={"model": model}, timeout=600
        ) as response:
            response.raise_for_status()
            import json

            previous = ""
            async for line in response.aiter_lines():
                if not line:
                    continue
                event = json.loads(line)
                if event.get("error"):
                    raise RuntimeError(event["error"])
                status = event.get("status", "")
                if event.get("total"):
                    status += (
                        f": {int(event.get('completed', 0) * 100 / event['total']) // 10 * 10}%"
                    )
                if status != previous:
                    print(status, flush=True)
                    previous = status
        print("Local AI installed. Run uv run python run.py --doctor --live-check", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
