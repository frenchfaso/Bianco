import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

SYNC_RESYNC_EVENT = "RESYNC"
AI_CONFIGURATION_CHANGED_EVENT = "AI_CONFIGURATION_CHANGED"


@dataclass(eq=False)
class _Subscriber:
    event: asyncio.Event = field(default_factory=asyncio.Event)
    messages: set[str] = field(default_factory=set)


class ChangeBroadcaster:
    def __init__(self) -> None:
        self._subscribers: set[_Subscriber] = set()

    async def publish(self, message: str) -> None:
        for subscriber in tuple(self._subscribers):
            # There are only two semantic event kinds. Coalesce duplicates but
            # never let a RESYNC hide an AI configuration change (or vice versa).
            subscriber.messages.add(message)
            subscriber.event.set()

    async def publish_resync(self) -> None:
        await self.publish(SYNC_RESYNC_EVENT)

    async def publish_ai_configuration_changed(self) -> None:
        await self.publish(AI_CONFIGURATION_CHANGED_EVENT)

    async def subscribe(self) -> AsyncIterator[str]:
        subscriber = _Subscriber()
        self._subscribers.add(subscriber)
        try:
            while True:
                await subscriber.event.wait()
                messages = tuple(sorted(subscriber.messages))
                subscriber.messages.clear()
                subscriber.event.clear()
                for message in messages:
                    yield message
        finally:
            self._subscribers.discard(subscriber)


broadcaster = ChangeBroadcaster()
