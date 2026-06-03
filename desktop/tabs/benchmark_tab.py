import asyncio

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QPushButton,
    QLabel, QLineEdit, QSpinBox, QDoubleSpinBox, QPlainTextEdit,
    QFormLayout, QProgressBar, QTableWidget, QTableWidgetItem,
    QHeaderView,
)

from app.services.benchmark_service import benchmark_service


class BenchmarkTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout()

        # Config
        cfg_group = QGroupBox("Configuration")
        cfg_form = QFormLayout()

        self.host = QLineEdit("127.0.0.1")
        cfg_form.addRow("Host:", self.host)

        self.port = QSpinBox()
        self.port.setRange(1024, 65535)
        self.port.setValue(30000)
        cfg_form.addRow("Port:", self.port)

        self.prompt = QPlainTextEdit()
        self.prompt.setPlaceholderText("What is the capital of France?")
        self.prompt.setMaximumHeight(60)
        cfg_form.addRow("Prompt:", self.prompt)

        self.num_runs = QSpinBox()
        self.num_runs.setRange(1, 100)
        self.num_runs.setValue(10)
        cfg_form.addRow("Number of Runs:", self.num_runs)

        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 4096)
        self.max_tokens.setValue(100)
        cfg_form.addRow("Max Tokens:", self.max_tokens)

        cfg_group.setLayout(cfg_form)
        layout.addWidget(cfg_group)

        # Controls
        btn_layout = QHBoxLayout()
        self.run_btn = QPushButton("▶ Run Benchmark")
        self.run_btn.clicked.connect(self._run)
        self.cancel_btn = QPushButton("✕ Cancel")
        self.cancel_btn.clicked.connect(self._cancel)
        self.cancel_btn.setEnabled(False)
        btn_layout.addWidget(self.run_btn)
        btn_layout.addWidget(self.cancel_btn)
        layout.addLayout(btn_layout)

        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)

        # Results summary
        self.summary_label = QLabel("")
        self.summary_label.setWordWrap(True)
        layout.addWidget(self.summary_label)

        # Results table
        self.table = QTableWidget()
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["Run", "Latency (ms)", "Tokens"])
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setVisible(False)
        layout.addWidget(self.table)

        self._poll_timer = QTimer()
        self._poll_timer.timeout.connect(self._poll_status)

        layout.addStretch()
        self.setLayout(layout)

    def _run(self):
        self.run_btn.setEnabled(False)
        self.cancel_btn.setEnabled(True)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        self.summary_label.setText("Running...")
        self.table.setVisible(False)
        self._poll_timer.start(500)

        asyncio.ensure_future(benchmark_service.run_benchmark(
            host=self.host.text(),
            port=self.port.value(),
            prompt=self.prompt.toPlainText() or "What is the capital of France?",
            max_tokens=self.max_tokens.value(),
            num_runs=self.num_runs.value(),
        ))

    def _poll_status(self):
        status = benchmark_service._progress
        self.progress_bar.setValue(int(status))
        if not benchmark_service._running and self.progress_bar.value() >= 100:
            self._poll_timer.stop()
            self._display_results()
            self.run_btn.setEnabled(True)
            self.cancel_btn.setEnabled(False)

    def _display_results(self):
        results = benchmark_service._results
        if not results:
            self.summary_label.setText("No results available.")
            return

        # Calculate stats
        latencies = [r["latency_ms"] for r in results if r["latency_ms"] > 0]
        if latencies:
            avg = sum(latencies) / len(latencies)
            sorted_l = sorted(latencies)
            n = len(sorted_l)
            p50 = sorted_l[n * 50 // 100] if n > 0 else 0

            self.summary_label.setText(
                f"Results: {len(results)} runs\n"
                f"Average Latency: {avg:.1f} ms\n"
                f"P50 Latency: {p50:.1f} ms"
            )

        self.table.setRowCount(len(results))
        for i, r in enumerate(results):
            self.table.setItem(i, 0, QTableWidgetItem(str(r["run"])))
            self.table.setItem(i, 1, QTableWidgetItem(f'{r["latency_ms"]:.1f}'))
            self.table.setItem(i, 2, QTableWidgetItem(str(r["tokens_generated"])))
        self.table.setVisible(True)

    def _cancel(self):
        asyncio.ensure_future(self._cancel_async())

    async def _cancel_async(self):
        benchmark_service.cancel()
        self._poll_timer.stop()
        self.progress_bar.setVisible(False)
        self.run_btn.setEnabled(True)
        self.cancel_btn.setEnabled(False)
        self.summary_label.setText("Benchmark cancelled.")
