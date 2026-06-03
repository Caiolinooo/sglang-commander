from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox,
    QGroupBox, QGridLayout, QFrame, QPushButton,
)
from PySide6.QtGui import QFont

from pyqtgraph import PlotWidget, mkPen
import numpy as np

from app.services.metrics_collector import metrics_collector


class GaugeWidget(QFrame):
    def __init__(self, title: str, unit: str = "", color: str = "#3b82f6"):
        super().__init__()
        self.setFrameStyle(QFrame.StyledPanel)
        self.setMinimumSize(150, 100)

        layout = QVBoxLayout()
        self.title_label = QLabel(title)
        self.title_label.setStyleSheet("font-size: 11px; color: #888;")
        layout.addWidget(self.title_label)

        self.value_label = QLabel("--")
        self.value_label.setStyleSheet(f"font-size: 24px; font-weight: bold; color: {color};")
        layout.addWidget(self.value_label)

        self.unit_label = QLabel(unit)
        self.unit_label.setStyleSheet("font-size: 10px; color: #666;")
        layout.addWidget(self.unit_label)

        self.setLayout(layout)

    def update_value(self, value, unit=""):
        if value is not None:
            self.value_label.setText(f"{value:.1f}" if isinstance(value, float) else str(value))
            if unit:
                self.unit_label.setText(unit)


class MetricsTab(QWidget):
    def __init__(self):
        super().__init__()
        self._history = {"time": [], "throughput": [], "ttft": [], "tpot": [], "cache_hit": [], "queue": []}
        self._setup_ui()
        self._timer = QTimer()
        self._timer.timeout.connect(self._update_charts)
        self._timer.start(3000)
        self._time_counter = 0

    def _setup_ui(self):
        layout = QVBoxLayout()

        # Top gauges row
        gauges_layout = QHBoxLayout()
        self.gpu_gauge = GaugeWidget("GPU Utilization", "%", "#22c55e")
        self.vram_gauge = GaugeWidget("VRAM", "GB", "#3b82f6")
        self.temp_gauge = GaugeWidget("GPU Temp", "\u00b0C", "#ef4444")
        self.tokens_gauge = GaugeWidget("Tokens/sec", "", "#a855f7")
        self.queue_gauge = GaugeWidget("Queue", "", "#eab308")
        self.cache_gauge = GaugeWidget("Cache Hit", "%", "#06b6d4")

        gauges_layout.addWidget(self.gpu_gauge)
        gauges_layout.addWidget(self.vram_gauge)
        gauges_layout.addWidget(self.temp_gauge)
        gauges_layout.addWidget(self.tokens_gauge)
        gauges_layout.addWidget(self.queue_gauge)
        gauges_layout.addWidget(self.cache_gauge)
        layout.addLayout(gauges_layout)

        # Time range selector
        time_layout = QHBoxLayout()
        time_layout.addWidget(QLabel("Time Range:"))
        self.time_range = QComboBox()
        self.time_range.addItems(["1 min", "5 min", "15 min", "30 min"])
        self.time_range.currentTextChanged.connect(self._on_time_range_change)
        time_layout.addWidget(self.time_range)
        time_layout.addStretch()

        self.export_btn = QPushButton("Export CSV")
        self.export_btn.clicked.connect(self._export_csv)
        time_layout.addWidget(self.export_btn)

        layout.addLayout(time_layout)

        # Charts grid
        charts = QGridLayout()

        self.throughput_chart = PlotWidget(title="Token Throughput")
        self.throughput_chart.setLabel("left", "Tokens/s")
        self.throughput_chart.setLabel("bottom", "Time")
        self.throughput_curve = self.throughput_chart.plot(pen=mkPen("#22c55e", width=2))
        charts.addWidget(self.throughput_chart, 0, 0)

        self.latency_chart = PlotWidget(title="Latency (TTFT / TPOT)")
        self.latency_chart.setLabel("left", "ms")
        self.latency_chart.setLabel("bottom", "Time")
        self.ttft_curve = self.latency_chart.plot(pen=mkPen("#3b82f6", width=2), name="TTFT")
        self.tpot_curve = self.latency_chart.plot(pen=mkPen("#a855f7", width=2), name="TPOT")
        charts.addWidget(self.latency_chart, 0, 1)

        self.cache_chart = PlotWidget(title="Cache Hit Rate")
        self.cache_chart.setLabel("left", "Rate")
        self.cache_chart.setLabel("bottom", "Time")
        self.cache_curve = self.cache_chart.plot(pen=mkPen("#06b6d4", width=2))
        charts.addWidget(self.cache_chart, 1, 0)

        self.queue_chart = PlotWidget(title="Queue Depth")
        self.queue_chart.setLabel("left", "Requests")
        self.queue_chart.setLabel("bottom", "Time")
        self.queue_curve = self.queue_chart.plot(pen=mkPen("#eab308", width=2))
        charts.addWidget(self.queue_chart, 1, 1)

        layout.addLayout(charts)
        self.setLayout(layout)

    def _update_charts(self):
        snapshot = metrics_collector.get_latest()
        if not snapshot:
            return

        self._time_counter += 1
        self._history["time"].append(self._time_counter)
        self._history["throughput"].append(snapshot.get("gen_throughput", 0))
        self._history["ttft"].append(snapshot.get("ttft_avg_ms", 0))
        self._history["tpot"].append(snapshot.get("tpot_avg_ms", 0))
        self._history["cache_hit"].append(snapshot.get("cache_hit_rate", 0) * 100)
        self._history["queue"].append(snapshot.get("num_queue_reqs", 0))

        max_points = self._get_max_points()
        if len(self._history["time"]) > max_points:
            for key in self._history:
                self._history[key] = self._history[key][-max_points:]

        self._update_curve(self.throughput_curve, self._history["throughput"])
        self._update_curve(self.ttft_curve, self._history["ttft"])
        self._update_curve(self.tpot_curve, self._history["tpot"])
        self._update_curve(self.cache_curve, self._history["cache_hit"])
        self._update_curve(self.queue_curve, self._history["queue"])

        self.gpu_gauge.update_value(snapshot.get("gpu_util", 0), "%")
        gpu_mem = snapshot.get("gpu_mem_used_mb", 0) / 1024
        self.vram_gauge.update_value(gpu_mem, "GB")
        self.temp_gauge.update_value(snapshot.get("gpu_temp_c", 0), "\u00b0C")
        self.tokens_gauge.update_value(snapshot.get("gen_throughput", 0), "")
        self.queue_gauge.update_value(snapshot.get("num_queue_reqs", 0), "")
        cache_rate = snapshot.get("cache_hit_rate", 0) * 100
        self.cache_gauge.update_value(cache_rate, "%")

    def _update_curve(self, curve, data):
        if data:
            x = list(range(len(data)))
            y = data
            valid = [(xi, yi) for xi, yi in zip(x, y) if yi is not None]
            if valid:
                curve.setData([v[0] for v in valid], [v[1] for v in valid])

    def _get_max_points(self) -> int:
        mapping = {"1 min": 20, "5 min": 100, "15 min": 300, "30 min": 600}
        return mapping.get(self.time_range.currentText(), 100)

    def _on_time_range_change(self):
        max_points = self._get_max_points()
        for key in self._history:
            if len(self._history[key]) > max_points:
                self._history[key] = self._history[key][-max_points:]

    def _export_csv(self):
        import csv
        from PySide6.QtWidgets import QFileDialog

        path, _ = QFileDialog.getSaveFileName(self, "Export Metrics", "metrics.csv", "CSV (*.csv)")
        if not path:
            return

        with open(path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["time", "throughput", "ttft_ms", "tpot_ms", "cache_hit_%", "queue"])
            for i in range(len(self._history["time"])):
                writer.writerow([
                    self._history["time"][i],
                    self._history["throughput"][i] if i < len(self._history["throughput"]) else "",
                    self._history["ttft"][i] if i < len(self._history["ttft"]) else "",
                    self._history["tpot"][i] if i < len(self._history["tpot"]) else "",
                    self._history["cache_hit"][i] if i < len(self._history["cache_hit"]) else "",
                    self._history["queue"][i] if i < len(self._history["queue"]) else "",
                ])
