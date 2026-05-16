"""Analytics V2 sub-routers, mounted into the main analytics_v2 router."""

from .networth_misc import router as networth_misc_router
from .recurring import router as recurring_router
from .summaries import router as summaries_router

__all__ = ["networth_misc_router", "recurring_router", "summaries_router"]
