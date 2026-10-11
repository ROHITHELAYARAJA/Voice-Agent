import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import run
from buddy.sheets import IntegrationError


async def test_initial_call_rejection_keeps_server_and_console_alive(settings, monkeypatch, caplog):
    runtime = SimpleNamespace(
        start_call=AsyncMock(side_effect=IntegrationError("Trial restriction"))
    )

    class Server:
        def __init__(self, config):
            self.started = False
            self.should_exit = False

        async def serve(self):
            self.started = True
            while not self.should_exit:
                await asyncio.sleep(0.01)

    async def console(active_runtime, server):
        assert active_runtime is runtime
        assert runtime.start_call.await_count == 1
        assert server.started and not server.should_exit
        server.should_exit = True

    monkeypatch.setattr(run, "BuddyRuntime", lambda settings: runtime)
    monkeypatch.setattr(run, "create_app", lambda settings, runtime: None)
    monkeypatch.setattr(run.uvicorn, "Server", Server)
    monkeypatch.setattr(run, "console", console)
    args = SimpleNamespace(no_tunnel=True, call=True, resume=None, non_interactive=False)
    assert await run.serve(settings, args) == 0
    assert "Buddy and ngrok remain online" in caplog.text
