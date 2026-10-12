FROM ghcr.io/astral-sh/uv:0.13.0-python3.12-trixie-slim@sha256:17af15d103f32869a63825517f9e8867ce98598937e3e5f5ce1e24313c552406
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY buddy ./buddy
COPY prompts ./prompts
COPY config.py ./config.py
COPY services/voice-python ./services/voice-python
RUN useradd --create-home calmloop && chown -R calmloop:calmloop /app
USER calmloop
CMD ["sh", "-c", "uv run --no-sync uvicorn calmloop_voice.app:app --app-dir services/voice-python --host 0.0.0.0 --port ${PORT:-8000} --no-access-log --workers 1"]
