from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class Checkpoint(ApiModel):
    sequence: int = Field(ge=0)


class PullRequest(ApiModel):
    checkpoint: Checkpoint | None = None
    batch_size: int = Field(100, alias="batchSize", ge=1, le=500)


class PullResponse(ApiModel):
    documents: list[dict[str, Any]]
    checkpoint: Checkpoint


class PushRow(ApiModel):
    assumed_master_state: dict[str, Any] | None = Field(
        None, alias="assumedMasterState"
    )
    new_document_state: dict[str, Any] = Field(alias="newDocumentState")


class PushRequest(ApiModel):
    rows: list[PushRow] = Field(max_length=500)


class PushResponse(ApiModel):
    conflicts: list[dict[str, Any]]
