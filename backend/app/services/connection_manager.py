import asyncio
import os
from typing import Dict, Any, Optional
import asyncssh
from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.connection import ConnectionProfile


class ConnectionManagerService:
    def __init__(self):
        # Maps profile_id -> SSH connection object
        self._connections: Dict[int, asyncssh.SSHClientConnection] = {}
        # Maps profile_id -> SSH local port forward listener object
        self._listeners: Dict[int, asyncssh.SSHListener] = {}

    async def test_connection(
        self,
        host: str,
        port: int,
        username: str,
        auth_method: str,
        password: Optional[str] = None,
        key_path: Optional[str] = None,
    ) -> tuple[bool, str]:
        """Test an SSH connection without opening any tunnels."""
        try:
            connect_kwargs: dict[str, Any] = {
                "host": host,
                "port": port,
                "username": username,
                "known_hosts": None,  # Ignore known hosts checks for user convenience
            }

            if auth_method == "password" and password:
                connect_kwargs["password"] = password
            elif auth_method == "key" and key_path:
                resolved_key_path = os.path.expanduser(key_path)
                if not os.path.exists(resolved_key_path):
                    return False, f"Key path does not exist: {key_path}"
                connect_kwargs["client_keys"] = [resolved_key_path]
            else:
                return False, "Missing password or key_path for selected auth method"

            async with asyncssh.connect(**connect_kwargs) as conn:
                # Connected successfully!
                return True, "Connection successful"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    async def connect_tunnel(self, profile_id: int) -> dict:
        """Open the SSH tunnel and local port forwarding for the connection profile."""
        async with async_session_factory() as db:
            result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.id == profile_id))
            profile = result.scalar_one_or_none()
            if not profile:
                return {"status": "error", "message": "Connection profile not found"}

            if profile_id in self._connections:
                return {"status": "error", "message": "Tunnel already connected"}

            try:
                connect_kwargs: dict[str, Any] = {
                    "host": profile.host,
                    "port": profile.port,
                    "username": profile.username,
                    "known_hosts": None,
                    "keepalive_interval": 30,  # Send keepalive packets to keep tunnel open
                }

                if profile.auth_method == "password" and profile.password:
                    connect_kwargs["password"] = profile.password
                elif profile.auth_method == "key" and profile.key_path:
                    resolved_key_path = os.path.expanduser(profile.key_path)
                    if not os.path.exists(resolved_key_path):
                        return {"status": "error", "message": f"Key path does not exist: {profile.key_path}"}
                    connect_kwargs["client_keys"] = [resolved_key_path]
                else:
                    return {"status": "error", "message": "Invalid authentication credentials"}

                conn = await asyncssh.connect(**connect_kwargs)
                self._connections[profile_id] = conn

                # Setup local port forwarding
                # Forward local:local_bind_port -> remote 127.0.0.1:remote_forward_port
                listener = await conn.forward_local_port(
                    "127.0.0.1",
                    profile.local_bind_port,
                    "127.0.0.1",
                    profile.remote_forward_port
                )
                self._listeners[profile_id] = listener

                profile.is_active = True
                await db.commit()

                return {
                    "status": "connected",
                    "local_port": profile.local_bind_port,
                    "remote_port": profile.remote_forward_port,
                }

            except Exception as e:
                # Cleanup if failed partway
                await self.disconnect_tunnel(profile_id)
                return {"status": "error", "message": f"Failed to establish tunnel: {str(e)}"}

    async def disconnect_tunnel(self, profile_id: int) -> bool:
        """Close the local listener and SSH connection for the connection profile."""
        listener = self._listeners.pop(profile_id, None)
        if listener:
            listener.close()
            await listener.wait_closed()

        conn = self._connections.pop(profile_id, None)
        if conn:
            conn.close()
            await conn.wait_closed()

        async with async_session_factory() as db:
            result = await db.execute(select(ConnectionProfile).where(ConnectionProfile.id == profile_id))
            profile = result.scalar_one_or_none()
            if profile:
                profile.is_active = False
                await db.commit()
                return True
        return False

    def is_tunnel_active(self, profile_id: int) -> bool:
        return profile_id in self._connections

    async def shutdown_all(self):
        """Close all tunnels on app shutdown."""
        profile_ids = list(self._connections.keys())
        for pid in profile_ids:
            try:
                await self.disconnect_tunnel(pid)
            except Exception:
                pass


connection_manager = ConnectionManagerService()
