from pydantic import BaseModel, Field
from typing import Optional


class ZeroTierStatus(BaseModel):
    installed: bool
    running: bool
    node_id: Optional[str] = None
    online: bool = False
    networks: list[dict] = []


class JoinNetworkRequest(BaseModel):
    network_id: str = Field(..., pattern="^[a-f0-9]{16}$")


class ZeroTierNetwork(BaseModel):
    network_id: str
    name: str = ""
    status: str = ""
    assigned_ips: list[str] = []
    member_count: int = 0
