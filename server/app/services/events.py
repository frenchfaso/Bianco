import asyncio
from collections.abc import AsyncIterator


class ChangeBroadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()

    async def publish_resync(self) -> None:
        for queue in tuple(self._subscribers):
            try:
                queue.put_nowait("RESYNC")
            except asyncio.QueueFull:
                pass

    async def subscribe(self) -> AsyncIterator[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers.discard(queue)


broadcaster = ChangeBroadcaster()
