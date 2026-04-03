from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass(slots=True)
class Account:
    account_id: str
    user_id: str
    broker: str
    platform: str
    login: str
    server: str
    connection_mode: str
    status: str
    api_key: str
    last_sync_at: Optional[datetime] = None
    is_default: bool = False
    nickname: Optional[str] = None
    latest_payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

