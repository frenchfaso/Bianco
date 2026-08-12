import asyncio

from app.services.events import (
    AI_CONFIGURATION_CHANGED_EVENT,
    SYNC_RESYNC_EVENT,
    ChangeBroadcaster,
)


def test_broadcaster_coalesces_duplicates_without_dropping_distinct_events():
    async def scenario() -> None:
        broadcaster = ChangeBroadcaster()
        stream = broadcaster.subscribe()
        first = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)

        await broadcaster.publish_resync()
        await broadcaster.publish_resync()
        await broadcaster.publish_ai_configuration_changed()

        messages = {await first, await anext(stream)}
        assert messages == {SYNC_RESYNC_EVENT, AI_CONFIGURATION_CHANGED_EVENT}
        await stream.aclose()

    asyncio.run(scenario())
