from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QFormLayout, QGroupBox,
    QPushButton, QLabel, QLineEdit, QSpinBox, QCheckBox,
    QComboBox, QPlainTextEdit, QSplitter, QFrame, QProgressBar,
)
from PySide6.QtGui import QFont, QTextCursor

from app.services.server_manager import server_manager


class ServerTab(QWidget):
    def __init__(self):
        super().__init__()
        self.server_manager = server_manager
        self._setup_ui()
        self._status_timer = QTimer()
        self._status_timer.timeout.connect(self._update_status)
        self._status_timer.start(3000)
        self._log_timer = QTimer()
        self._log_timer.timeout.connect(self._update_logs)
        self._log_timer.start(1000)
        self._log_cursor = 0

    def _setup_ui(self):
        layout = QHBoxLayout()

        # Left: control panel
        left = QWidget()
        left_layout = QVBoxLayout()

        # Profile selector
        profile_bar = QHBoxLayout()
        from PySide6.QtWidgets import QComboBox
        self.profile_combo = QComboBox()
        self.profile_combo.addItem("Manual")
        self.profile_combo.currentIndexChanged.connect(self._load_profile)
        self.load_profiles_btn = QPushButton("Load Profiles")
        self.load_profiles_btn.clicked.connect(self._fetch_profiles)
        profile_bar.addWidget(QLabel("Profile:"))
        profile_bar.addWidget(self.profile_combo)
        profile_bar.addWidget(self.load_profiles_btn)
        left_layout.addLayout(profile_bar)

        # Model config group
        model_group = QGroupBox("Model Configuration")
        model_form = QFormLayout()

        self.model_path = QLineEdit()
        self.model_path.setPlaceholderText("e.g., meta-llama/Llama-3.1-8B-Instruct")
        model_form.addRow("Model Path:", self.model_path)

        self.host = QLineEdit("127.0.0.1")
        model_form.addRow("Host:", self.host)

        self.port = QSpinBox()
        self.port.setRange(1024, 65535)
        self.port.setValue(30000)
        model_form.addRow("Port:", self.port)

        self.tp = QSpinBox()
        self.tp.setRange(1, 8)
        self.tp.setValue(1)
        model_form.addRow("Tensor Parallel:", self.tp)

        self.quant = QComboBox()
        self.quant.addItems(["None", "awq", "fp8", "gptq", "marlin", "bitsandbytes", "gguf"])
        model_form.addRow("Quantization:", self.quant)

        self.dtype = QComboBox()
        self.dtype.addItems(["auto", "half", "bfloat16", "float32"])
        model_form.addRow("Dtype:", self.dtype)

        self.context_length = QSpinBox()
        self.context_length.setRange(1024, 524288)
        self.context_length.setValue(0)
        self.context_length.setSuffix(" (0 = auto)")
        model_form.addRow("Context Length:", self.context_length)

        self.enable_mm = QCheckBox("Enable Multimodal (vision/audio)")
        model_form.addRow(self.enable_mm)

        self.trust_code = QCheckBox("Trust Remote Code")
        model_form.addRow(self.trust_code)

        model_group.setLayout(model_form)
        left_layout.addWidget(model_group)

        # Presets
        preset_group = QGroupBox("Presets")
        preset_layout = QHBoxLayout()
        self.preset_combo = QComboBox()
        self.preset_combo.addItems(["None", "Low Latency", "High Throughput", "Multimodal", "GGUF", "FP8 Quantization"])
        self.apply_preset_btn = QPushButton("Apply")
        self.apply_preset_btn.clicked.connect(self._apply_preset)
        preset_layout.addWidget(self.preset_combo)
        preset_layout.addWidget(self.apply_preset_btn)
        preset_group.setLayout(preset_layout)
        left_layout.addWidget(preset_group)

        # Control buttons
        btn_group = QGroupBox("Controls")
        btn_layout = QHBoxLayout()

        self.start_btn = QPushButton("\u25b6 Start")
        self.start_btn.setStyleSheet("background-color: #22c55e; color: white; padding: 8px 16px;")
        self.start_btn.clicked.connect(self._start_server)

        self.stop_btn = QPushButton("\u25a0 Stop")
        self.stop_btn.setStyleSheet("background-color: #ef4444; color: white; padding: 8px 16px;")
        self.stop_btn.clicked.connect(self._stop_server)
        self.stop_btn.setEnabled(False)

        self.restart_btn = QPushButton("\U0001f504 Restart")
        self.restart_btn.clicked.connect(self._restart_server)
        self.restart_btn.setEnabled(False)

        btn_layout.addWidget(self.start_btn)
        btn_layout.addWidget(self.stop_btn)
        btn_layout.addWidget(self.restart_btn)
        btn_group.setLayout(btn_layout)
        left_layout.addWidget(btn_group)

        # Status
        self.status_label = QLabel("Status: Stopped")
        self.status_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #ef4444;")
        left_layout.addWidget(self.status_label)

        left_layout.addStretch()
        left.setLayout(left_layout)

        # Right: command preview + log
        right = QWidget()
        right_layout = QVBoxLayout()

        # Command preview
        cmd_group = QGroupBox("Command Preview")
        cmd_layout = QVBoxLayout()
        self.cmd_preview = QPlainTextEdit()
        self.cmd_preview.setReadOnly(True)
        self.cmd_preview.setMaximumHeight(80)
        self.cmd_preview.setFont(QFont("Consolas", 9))
        cmd_layout.addWidget(self.cmd_preview)
        cmd_group.setLayout(cmd_layout)
        right_layout.addWidget(cmd_group)

        # Server log
        log_group = QGroupBox("Server Output")
        log_layout = QVBoxLayout()
        self.log_output = QPlainTextEdit()
        self.log_output.setReadOnly(True)
        self.log_output.setFont(QFont("Consolas", 9))
        log_layout.addWidget(self.log_output)

        log_btn_layout = QHBoxLayout()
        self.clear_log_btn = QPushButton("Clear Log")
        self.clear_log_btn.clicked.connect(self.log_output.clear)
        log_btn_layout.addWidget(self.clear_log_btn)
        log_btn_layout.addStretch()
        log_layout.addLayout(log_btn_layout)

        log_group.setLayout(log_layout)
        right_layout.addWidget(log_group)

        right.setLayout(right_layout)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setSizes([400, 600])

        main_layout = QVBoxLayout()
        main_layout.addWidget(splitter)
        self.setLayout(main_layout)

    def _build_command(self) -> str:
        parts = ["python3", "-m", "sglang.launch_server"]
        parts.extend(["--model-path", self.model_path.text()])
        parts.extend(["--host", self.host.text()])
        parts.extend(["--port", str(self.port.value())])

        tp = self.tp.value()
        if tp > 1:
            parts.extend(["--tensor-parallel-size", str(tp)])

        if self.quant.currentText() != "None":
            parts.extend(["--quantization", self.quant.currentText()])
        if self.dtype.currentText() != "auto":
            parts.extend(["--dtype", self.dtype.currentText()])
        if self.context_length.value() > 0:
            parts.extend(["--context-length", str(self.context_length.value())])
        if self.enable_mm.isChecked():
            parts.append("--enable-multimodal")
        if self.trust_code.isChecked():
            parts.append("--trust-remote-code")

        return " ".join(parts)

    def get_config(self) -> dict:
        return {
            "model_path": self.model_path.text(),
            "host": self.host.text(),
            "port": self.port.value(),
            "tensor_parallel_size": self.tp.value(),
            "quantization": self.quant.currentText() if self.quant.currentText() != "None" else None,
            "dtype": self.dtype.currentText() if self.dtype.currentText() != "auto" else None,
            "context_length": self.context_length.value() if self.context_length.value() > 0 else None,
            "enable_multimodal": self.enable_mm.isChecked(),
            "trust_remote_code": self.trust_code.isChecked(),
        }

    async def _start_server(self):
        config = self.get_config()
        self.cmd_preview.setPlainText(self._build_command())
        result = await self.server_manager.start(config)
        if result.get("status") == "started":
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self.restart_btn.setEnabled(True)
            self.status_label.setText(f"Status: Starting... (PID: {result.get('pid', '?')})")
            self.status_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #eab308;")

    async def _stop_server(self):
        await self.server_manager.stop()
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.restart_btn.setEnabled(False)
        self.status_label.setText("Status: Stopped")
        self.status_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #ef4444;")

    async def _restart_server(self):
        config = self.get_config()
        self.cmd_preview.setPlainText(self._build_command())
        result = await self.server_manager.restart(config)
        if result.get("status") == "started":
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self.restart_btn.setEnabled(True)

    async def _update_status(self):
        status = await self.server_manager.get_status()
        if status.get("running"):
            health = status.get("health", "unknown")
            color = {"healthy": "#22c55e", "starting": "#eab308", "stopped": "#ef4444"}.get(health, "#eab308")
            self.status_label.setText(f"Running - PID: {status.get('pid', '?')} - Health: {health}")
            self.status_label.setStyleSheet(f"font-size: 14px; font-weight: bold; color: {color};")
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self.restart_btn.setEnabled(True)
        else:
            self.status_label.setText("Status: Stopped")
            self.status_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #ef4444;")
            self.start_btn.setEnabled(True)
            self.stop_btn.setEnabled(False)
            self.restart_btn.setEnabled(False)

    async def _update_logs(self):
        result = await self.server_manager.get_logs(self._log_cursor)
        lines = result.get("lines", [])
        if lines:
            for line in lines:
                self.log_output.appendPlainText(line)
            self._log_cursor = result.get("cursor", self._log_cursor)
            cursor = self.log_output.textCursor()
            cursor.movePosition(QTextCursor.End)
            self.log_output.setTextCursor(cursor)

    def _apply_preset(self):
        preset = self.preset_combo.currentText()
        presets_map = {
            "Low Latency": {"chunked_prefill_size": 4096, "max_running_requests": 32},
            "High Throughput": {"max_running_requests": 128},
            "Multimodal": {"enable_multimodal": True},
            "GGUF": {"load_format": "gguf"},
            "FP8 Quantization": {"quantization": "fp8"},
        }
        if preset in presets_map:
            import json
            data = presets_map[preset]
            if "enable_multimodal" in data:
                self.enable_mm.setChecked(True)
            if "quantization" in data:
                idx = self.quant.findText(data["quantization"])
                if idx >= 0:
                    self.quant.setCurrentIndex(idx)

    def _fetch_profiles(self):
        import asyncio
        async def fetch():
            from app.services.server_profile_service import server_profile_service
            from app.core.database import get_db
            async for db in get_db():
                profiles = await server_profile_service.list_profiles(db)
                break
            self.profile_combo.clear()
            self.profile_combo.addItem("Manual")
            for p in profiles:
                label = p["name"]
                if p.get("is_remote"):
                    label += " (remote)"
                self.profile_combo.addItem(label, p)
        asyncio.ensure_future(fetch())

    def _load_profile(self, idx):
        if idx <= 0:
            return
        p = self.profile_combo.itemData(idx)
        if not p:
            return
        self.model_path.setText(p.get("model_path", ""))
        self.host.setText(p.get("host", "127.0.0.1"))
        self.port.setValue(p.get("port", 30000))
        try:
            import json
            args = json.loads(p.get("args_json", "{}"))
            if "tensor_parallel_size" in args:
                self.tp.setValue(args["tensor_parallel_size"])
            if "quantization" in args:
                idx2 = self.quant.findText(args["quantization"])
                if idx2 >= 0:
                    self.quant.setCurrentIndex(idx2)
            if args.get("enable_multimodal"):
                self.enable_mm.setChecked(True)
            if args.get("trust_remote_code"):
                self.trust_code.setChecked(True)
            if args.get("context_length"):
                self.context_length.setValue(args["context_length"])
        except json.JSONDecodeError:
            pass
