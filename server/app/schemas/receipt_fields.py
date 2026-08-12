from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, StringConstraints


CategoryId = Literal[
    "food_grocery",
    "restaurant",
    "transport",
    "home",
    "health",
    "personal",
    "entertainment",
    "other",
]

CurrencyCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]


def _real_iso_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("must be a real ISO 8601 calendar date") from error
    return value


ReceiptDate = Annotated[
    str,
    StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    AfterValidator(_real_iso_date),
]
