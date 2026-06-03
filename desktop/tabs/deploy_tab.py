from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QLineEdit, QGroupBox, QTextEdit, QFormLayout, QMessageBox,
)
from PySide6.QtGui import QFont

from app.services.zerotier_manager import zerotier_manager
from app.services.auth_service import auth_service
from app.services.server_manager import server_manager


class DeployTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()
        self._timer = QTimer()
        self._timer.timeout.connect(self._update_status)
        self._timer.start(5000)

    def _setup_ui(self):
        layout = QVBoxLayout()

        # ZeroTier Status
        zt_group = QGroupBox("ZeroTier Network")
        zt_layout = QVBoxLayout()

        status_layout = QHBoxLayout()
        self.zt_status = QLabel("Checking...")
        self.zt_status.setStyleSheet("font-size: 14px;")
        self.zt_node_id = QLabel("")
        status_layout.addWidget(self.zt_status)
        status_layout.addStretch()
        zt_layout.addLayout(status_layout)

        self.zt_networks = QLabel("")
        zt_layout.addWidget(self.zt_networks)

        join_layout = QHBoxLayout()
        self.zt_network_input = QLineEdit()
        self.zt_network_input.setPlaceholderText("Enter 16-digit Network ID")
        self.zt_join_btn = QPushButton("Join")
        self.zt_join_btn.clicked.connect(self._join_network)
        self.zt_leave_btn = QPushButton("Leave")
        self.zt_leave_btn.clicked.connect(self._leave_network)
        join_layout.addWidget(self.zt_network_input)
        join_layout.addWidget(self.zt_join_btn)
        join_layout.addWidget(self.zt_leave_btn)
        zt_layout.addLayout(join_layout)

        zt_group.setLayout(zt_layout)
        layout.addWidget(zt_group)

        # Remote Access
        remote_group = QGroupBox("Remote Access")
        remote_layout = QVBoxLayout()

        self.connection_string = QTextEdit()
        self.connection_string.setReadOnly(True)
        self.connection_string.setMaximumHeight(150)
        self.connection_string.setFont(QFont("Consolas", 9))
        remote_layout.addWidget(self.connection_string)

        refresh_conn_btn = QPushButton("Refresh Connection Info")
        refresh_conn_btn.clicked.connect(self._refresh_connection)
        remote_layout.addWidget(refresh_conn_btn)

        remote_group.setLayout(remote_layout)
        layout.addWidget(remote_group)

        # API Keys
        api_group = QGroupBox("API Keys")
        api_layout = QVBoxLayout()

        api_key_layout = QHBoxLayout()
        self.api_key_name = QLineEdit()
        self.api_key_name.setPlaceholderText("Key name (e.g., remote-device)")
        self.api_key_scope = QLineEdit()
        self.api_key_scope.setPlaceholderText("Scope (read/write/admin)")
        self.api_key_scope.setText("read")
        self.create_key_btn = QPushButton("Create API Key")
        self.create_key_btn.clicked.connect(self._create_api_key)
        api_key_layout.addWidget(self.api_key_name)
        api_key_layout.addWidget(self.api_key_scope)
        api_key_layout.addWidget(self.create_key_btn)
        api_layout.addLayout(api_key_layout)

        self.api_keys_list = QLabel("No API keys created yet")
        api_layout.addWidget(self.api_keys_list)

        api_group.setLayout(api_layout)
        layout.addWidget(api_group)

        layout.addStretch()
        self.setLayout(layout)

    async def _update_status(self):
        status = await zerotier_manager.get_status()
        if status.get("installed") and status.get("running"):
            self.zt_status.setText(f"\u2705 Connected (Node: {status.get('node_id', '?')})")
            self.zt_status.setStyleSheet("font-size: 14px; color: #22c55e;")
            nets = status.get("networks", [])
            if nets:
                net_info = "\n".join([
                    f"  \ud83c\udf10 {n['network_id']} - {n.get('name', '')} - {n.get('status', '')}"
                    f" - IPs: {', '.join(n.get('assigned_ips', []))}"
                    for n in nets
                ])
                self.zt_networks.setText(f"Networks:\n{net_info}")
            else:
                self.zt_networks.setText("No networks joined")
        elif status.get("installed"):
            self.zt_status.setText("\u26a0\ufe0f ZeroTier installed but not running")
            self.zt_status.setStyleSheet("font-size: 14px; color: #eab308;")
        else:
            self.zt_status.setText("\u274c ZeroTier not installed")
            self.zt_status.setStyleSheet("font-size: 14px; color: #ef4444;")

    async def _join_network(self):
        net_id = self.zt_network_input.text().strip()
        if not net_id:
            return
        result = await zerotier_manager.join_network(net_id)
        if result.get("status") == "joined":
            QMessageBox.information(self, "Success", f"Joined network {net_id}")

    async def _leave_network(self):
        net_id = self.zt_network_input.text().strip()
        if not net_id:
            return
        result = await zerotier_manager.leave_network(net_id)
        if result.get("status") == "left":
            QMessageBox.information(self, "Success", f"Left network {net_id}")

    async def _refresh_connection(self):
        zt_status = await zerotier_manager.get_status()
        server_status = await server_manager.get_status()

        zt_ip = ""
        networks = zt_status.get("networks", [])
        if networks:
            zt_ip = ", ".join(networks[0].get("assigned_ips", []))

        host = zt_ip or server_status.get("host", "127.0.0.1")
        port = server_status.get("port", 30000)

        conn_str = (
            f"# SGLang Commander - Connection Info\n"
            f"Server: {host}:{port}\n"
            f"Status: {'Running' if server_status.get('running') else 'Stopped'}\n"
            f"Model: {server_status.get('model_path', 'N/A')}\n"
            f"\n# Connection command:\n"
            f"curl http://{host}:{port}/v1/models\n"
            f"\n# Python example:\n"
            f"from openai import OpenAI\n"
            f'client = OpenAI(base_url="http://{host}:{port}/v1", api_key="not-needed")\n'
        )
        self.connection_string.setPlainText(conn_str)

    async def _create_api_key(self):
        name = self.api_key_name.text().strip()
        scopes = self.api_key_scope.text().strip() or "read"
        if not name:
            return

        result = await auth_service.create_api_key(1, name, scopes)
        key = result.get("key", "")
        QMessageBox.information(
            self, "API Key Created",
            f"Key: {key}\n\nSave this key - it won't be shown again!"
        )
        self.api_key_name.clear()
        await self._refresh_api_keys()

    async def _refresh_api_keys(self):
        keys = await auth_service.list_api_keys(1)
        if keys:
            text = "\n".join([f"  \ud83d\udd11 {k['name']} ({k['scopes']}) - {k['key'][:12]}..." for k in keys])
            self.api_keys_list.setText(f"Active Keys:\n{text}")
        else:
            self.api_keys_list.setText("No API keys created yet")
