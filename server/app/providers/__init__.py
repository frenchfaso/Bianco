"""AI provider exports.

Provider implementations are loaded on first access.  Keeping this package
initializer free of eager imports is important because the OpenAI transport
uses helpers from ``app.providers.common`` while the subscription provider in
turn depends on that transport.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.providers.base import AIProvider
    from app.providers.disabled import DisabledProvider
    from app.providers.ollama import OllamaProvider
    from app.providers.openai_compatible import OpenAICompatibleProvider
    from app.providers.openai_subscription import OpenAISubscriptionProvider

__all__ = [
    "AIProvider",
    "DisabledProvider",
    "OllamaProvider",
    "OpenAICompatibleProvider",
    "OpenAISubscriptionProvider",
]


def __getattr__(name: str) -> Any:
    if name == "AIProvider":
        from app.providers.base import AIProvider

        value = AIProvider
    elif name == "DisabledProvider":
        from app.providers.disabled import DisabledProvider

        value = DisabledProvider
    elif name == "OllamaProvider":
        from app.providers.ollama import OllamaProvider

        value = OllamaProvider
    elif name == "OpenAICompatibleProvider":
        from app.providers.openai_compatible import OpenAICompatibleProvider

        value = OpenAICompatibleProvider
    elif name == "OpenAISubscriptionProvider":
        from app.providers.openai_subscription import OpenAISubscriptionProvider

        value = OpenAISubscriptionProvider
    else:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    globals()[name] = value
    return value
