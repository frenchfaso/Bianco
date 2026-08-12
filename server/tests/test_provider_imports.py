import subprocess
import sys
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]


def test_openai_codex_service_imports_in_fresh_interpreter() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from app.services.openai_codex import get_openai_codex_service; "
                "assert callable(get_openai_codex_service)"
            ),
        ],
        cwd=SERVER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr


def test_provider_package_keeps_public_exports() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from app.providers import ("
                "AIProvider, DisabledProvider, OllamaProvider, "
                "OpenAICompatibleProvider, OpenAISubscriptionProvider"
                "); assert all((AIProvider, DisabledProvider, OllamaProvider, "
                "OpenAICompatibleProvider, OpenAISubscriptionProvider))"
            ),
        ],
        cwd=SERVER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
