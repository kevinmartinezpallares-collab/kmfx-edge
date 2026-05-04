from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass(slots=True)
class Account:
    account_id: str
    user_id: str
    alias: str
    broker: str
    platform: str
    login: str
    server: str
    connection_mode: str
    status: str
    api_key: str
    connection_key_hash: str = ""
    connection_key_preview: str = ""
    last_sync_at: Optional[datetime] = None
    mt5_login: str = ""
    is_primary: bool = False
    linked_at: Optional[datetime] = None
    first_sync_at: Optional[datetime] = None
    last_policy_at: Optional[datetime] = None
    last_error_code: str = ""
    last_error_message: str = ""
    latest_report_metrics: dict[str, Any] = field(default_factory=dict)
    connector_version: str = ""
    connection_key_revoked_at: Optional[datetime] = None
    connection_key_revocation_reason: str = ""
    revoked_connection_keys: list[str] = field(default_factory=list)
    revoked_connection_key_hashes: list[str] = field(default_factory=list)
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    is_default: bool = False
    nickname: Optional[str] = None
    latest_payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
