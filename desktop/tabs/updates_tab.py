import asyncio

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QPushButton,
    QLabel, QProgressBar, QPlainTextEdit,
)

from app.services.updater import updater


class UpdatesTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()
        self._poll_timer = QTimer()
        self._poll_timer.timeout.connect(self._poll_status)

    def _setup_ui(self):
        layout = QVBoxLayout()

        self.check_btn = QPushButton("Check for Updates")
        self.check_btn.clicked.connect(self._check_updates)
        layout.addWidget(self.check_btn)

        self.info_label = QLabel("")
        self.info_label.setWordWrap(True)
        layout.addWidget(self.info_label)

        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)

        btn_layout = QHBoxLayout()
        self.download_btn = QPushButton("Download")
        self.download_btn.clicked.connect(self._download)
        self.download_btn.setVisible(False)
        self.download_btn.setEnabled(False)

        self.apply_btn = QPushButton("Apply Update")
        self.apply_btn.clicked.connect(self._apply)
        self.apply_btn.setVisible(False)
        self.apply_btn.setEnabled(False)

        self.cancel_btn = QPushButton("Cancel")
        self.cancel_btn.clicked.connect(self._cancel)
        self.cancel_btn.setVisible(False)
        self.cancel_btn.setEnabled(False)

        btn_layout.addWidget(self.download_btn)
        btn_layout.addWidget(self.apply_btn)
        btn_layout.addWidget(self.cancel_btn)
        layout.addLayout(btn_layout)

        layout.addStretch()
        self.setLayout(layout)

        self._update_info = None

    def _check_updates(self):
        async def check():
            result = await updater.check_all()
            if result.get("update_available"):
                self._update_info = result
                self.info_label.setText(
                    f"Update available: {result.get('latest_version', '')}\n\n"
                    f"{result.get('changelog', '')[:500]}"
                )
                self.download_btn.setVisible(True)
                self.download_btn.setEnabled(True)
            else:
                self.info_label.setText("You're running the latest version.")
                self.download_btn.setVisible(False)
                self.apply_btn.setVisible(False)
        asyncio.ensure_future(check())

    def _download(self):
        url = self._update_info.get("download_url", "")
        if not url:
            return
        self.download_btn.setEnabled(False)
        self.cancel_btn.setVisible(True)
        self.cancel_btn.setEnabled(True)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        self._poll_timer.start(1000)

        async def dl():
            result = await updater.download_update(url)
            if result.get("status") == "downloaded":
                self.apply_btn.setVisible(True)
                self.apply_btn.setEnabled(True)
                self.cancel_btn.setEnabled(False)

        asyncio.ensure_future(dl())

    def _poll_status(self):
        status = updater._download_progress
        if status.get("status") == "downloading":
            self.progress_bar.setValue(int(status.get("progress", 0)))
        elif status.get("status") == "done":
            self.progress_bar.setValue(100)
            self._poll_timer.stop()
            self.apply_btn.setVisible(True)
            self.apply_btn.setEnabled(True)
            self.cancel_btn.setEnabled(False)

    def _apply(self):
        async def apply():
            result = await updater.apply_update()
            if result.get("status") == "applied":
                self.info_label.setText("Update will be applied on next restart.")
                self.apply_btn.setEnabled(False)
        asyncio.ensure_future(apply())

    def _cancel(self):
        async def cancel():
            await updater.cancel_download()
            self._poll_timer.stop()
            self.progress_bar.setVisible(False)
            self.cancel_btn.setVisible(False)
            self.download_btn.setEnabled(True)
        asyncio.ensure_future(cancel())
