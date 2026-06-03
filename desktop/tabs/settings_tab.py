import asyncio

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QPushButton,
    QLabel, QLineEdit, QFormLayout, QCheckBox, QMessageBox,
)

from app import __version__
from app.config import settings
from app.services.auth_service import auth_service


class SettingsTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout()

        info_group = QGroupBox("System Info")
        info_form = QFormLayout()
        info_form.addRow("Version:", QLabel(f"sglang-commander v{__version__}"))
        info_form.addRow("Database:", QLabel(settings.database_url.replace("+aiosqlite", "")))
        info_group.setLayout(info_form)
        layout.addWidget(info_group)

        server_group = QGroupBox("SGLang Defaults")
        svr_form = QFormLayout()
        svr_form.addRow("Default Host:", QLabel(settings.sglang_default_host))
        svr_form.addRow("Default Port:", QLabel(str(settings.sglang_default_port)))
        server_group.setLayout(svr_form)
        layout.addWidget(server_group)

        layout.addStretch()
        self.setLayout(layout)
