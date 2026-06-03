from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QLineEdit, QTableWidget, QTableWidgetItem, QGroupBox,
    QHeaderView, QProgressBar, QSplitter, QTextEdit, QComboBox,
)
from PySide6.QtGui import QFont

from app.services.model_manager import model_manager


class ModelsTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()

    def _setup_ui(self):
        layout = QHBoxLayout()

        # Left: search + list
        left = QWidget()
        left_layout = QVBoxLayout()

        # Search
        search_group = QGroupBox("Search HuggingFace Hub")
        search_layout = QHBoxLayout()

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search models... (e.g., Gemma, Qwen, Llama)")
        self.search_btn = QPushButton("Search")
        self.search_btn.clicked.connect(self._search_models)

        search_layout.addWidget(self.search_input)
        search_layout.addWidget(self.search_btn)
        search_group.setLayout(search_layout)
        left_layout.addWidget(search_group)

        # Results table
        self.results_table = QTableWidget()
        self.results_table.setColumnCount(6)
        self.results_table.setHorizontalHeaderLabels(["Model ID", "Downloads", "Likes", "Task", "Library", ""])
        self.results_table.horizontalHeader().setStretchLastSection(True)
        self.results_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.results_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.results_table.setSelectionMode(QTableWidget.SingleSelection)
        self.results_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.results_table.cellDoubleClicked.connect(self._on_model_double_click)
        left_layout.addWidget(self.results_table)

        left.setLayout(left_layout)

        # Right: model details + download
        right = QWidget()
        right_layout = QVBoxLayout()

        details_group = QGroupBox("Model Details")
        details_layout = QVBoxLayout()
        self.model_details = QTextEdit()
        self.model_details.setReadOnly(True)
        self.model_details.setMaximumHeight(200)
        details_layout.addWidget(self.model_details)

        self.download_btn = QPushButton("\u2b07 Download Model")
        self.download_btn.setStyleSheet("background-color: #8b5cf6; color: white; padding: 8px 16px;")
        self.download_btn.clicked.connect(self._download_model)
        self.download_btn.setEnabled(False)
        details_layout.addWidget(self.download_btn)

        details_group.setLayout(details_layout)
        right_layout.addWidget(details_group)

        # Download progress
        progress_group = QGroupBox("Downloads")
        progress_layout = QVBoxLayout()
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        progress_layout.addWidget(self.progress_bar)
        self.progress_label = QLabel("")
        progress_layout.addWidget(self.progress_label)
        progress_group.setLayout(progress_layout)
        right_layout.addWidget(progress_group)

        # Local models
        local_group = QGroupBox("Local Models")
        local_layout = QVBoxLayout()
        self.local_table = QTableWidget()
        self.local_table.setColumnCount(3)
        self.local_table.setHorizontalHeaderLabels(["Model", "Size", ""])
        self.local_table.horizontalHeader().setStretchLastSection(True)
        self.refresh_local_btn = QPushButton("Refresh Local Models")
        self.refresh_local_btn.clicked.connect(self._refresh_local)
        local_layout.addWidget(self.local_table)
        local_layout.addWidget(self.refresh_local_btn)
        local_group.setLayout(local_layout)
        right_layout.addWidget(local_group)

        right.setLayout(right_layout)
        right.setMaximumWidth(400)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setSizes([600, 400])

        main_layout = QVBoxLayout()
        main_layout.addWidget(splitter)
        self.setLayout(main_layout)

        self._current_search_results = []
        self._selected_model = None

    async def _search_models(self):
        query = self.search_input.text().strip()
        if not query:
            return

        self.search_btn.setEnabled(False)
        self.search_btn.setText("Searching...")

        result = await model_manager.search_hf(query, limit=30)
        self._current_search_results = result.get("models", [])
        self.results_table.setRowCount(len(self._current_search_results))

        for i, model in enumerate(self._current_search_results):
            self.results_table.setItem(i, 0, QTableWidgetItem(model["repo_id"]))
            self.results_table.setItem(i, 1, QTableWidgetItem(self._format_number(model["downloads"])))
            self.results_table.setItem(i, 2, QTableWidgetItem(str(model["likes"])))
            self.results_table.setItem(i, 3, QTableWidgetItem(model.get("pipeline_tag", "") or ""))
            self.results_table.setItem(i, 4, QTableWidgetItem(model.get("library_name", "") or ""))
            deploy_btn = QPushButton("Deploy")
            deploy_btn.clicked.connect(lambda checked, m=model: self._quick_deploy(m))
            self.results_table.setCellWidget(i, 5, deploy_btn)

        self.search_btn.setEnabled(True)
        self.search_btn.setText("Search")

    async def _on_model_double_click(self, row, col):
        if 0 <= row < len(self._current_search_results):
            self._selected_model = self._current_search_results[row]
            repo_id = self._selected_model["repo_id"]
            self.model_details.setText(f"Loading details for {repo_id}...")
            card = await model_manager.get_model_card(repo_id)
            if "error" in card:
                self.model_details.setText(f"Error: {card['error']}")
            else:
                readme = card.get("readme", "")
                card_data = card.get("card_data", {})
                info = await model_manager.get_model_architecture(repo_id)
                arch_text = "\n".join([f"{k}: {v}" for k, v in info.items() if v])
                self.model_details.setText(
                    f"### {repo_id}\n\n"
                    f"**Task:** {card.get('pipeline_tag', 'N/A')}\n\n"
                    f"{arch_text}\n\n"
                    f"{readme[:2000]}" if readme else "No README"
                )
            self.download_btn.setEnabled(True)

    async def _download_model(self):
        if not self._selected_model:
            return

        repo_id = self._selected_model["repo_id"]
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)
        self.progress_label.setText(f"Downloading {repo_id}...")

        result = await model_manager.download_model(repo_id)
        self.progress_bar.setRange(0, 100)
        if result.get("status") == "completed":
            self.progress_bar.setValue(100)
            self.progress_label.setText(f"Downloaded: {result.get('path', repo_id)}")
        else:
            self.progress_label.setText(f"Error: {result.get('error', 'Unknown error')}")

    async def _refresh_local(self):
        local = await model_manager.list_local_models()
        self.local_table.setRowCount(len(local))
        for i, model in enumerate(local):
            self.local_table.setItem(i, 0, QTableWidgetItem(model["repo_id"]))
            size_gb = model.get("size_bytes", 0) / (1024**3)
            self.local_table.setItem(i, 1, QTableWidgetItem(f"{size_gb:.2f} GB"))

    def _quick_deploy(self, model):
        repo_id = model["repo_id"]
        from app.services.server_manager import server_manager
        import asyncio
        config = {
            "model_path": repo_id,
            "host": "127.0.0.1",
            "port": 30000,
            "tensor_parallel_size": 1,
            "trust_remote_code": True,
            "enable_multimodal": model.get("pipeline_tag") in ["image-text-to-text", "visual-question-answering"],
        }
        asyncio.create_task(server_manager.start(config))

    def _format_number(self, n):
        if n >= 1_000_000:
            return f"{n/1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n/1_000:.1f}K"
        return str(n)
