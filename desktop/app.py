import sys
import os
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QIcon, QAction
from PySide6.QtWidgets import QApplication, QMainWindow, QTabWidget, QMessageBox, QSystemTrayIcon, QMenu

from app import __version__
from desktop.tabs.server_tab import ServerTab
from desktop.tabs.chat_tab import ChatTab
from desktop.tabs.metrics_tab import MetricsTab
from desktop.tabs.models_tab import ModelsTab
from desktop.tabs.deploy_tab import DeployTab
from desktop.tabs.args_builder import ArgsBuilderTab
from desktop.tabs.settings_tab import SettingsTab
from desktop.tabs.updates_tab import UpdatesTab
from desktop.tabs.benchmark_tab import BenchmarkTab


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"SGLang Commander v{__version__}")
        self.setMinimumSize(1200, 800)
        self.setWindowIcon(QIcon(str(Path(__file__).parent / "resources" / "icons" / "app.png")))

        self._setup_ui()
        self._setup_tray()
        self._setup_theme()

    def _setup_ui(self):
        self.tabs = QTabWidget()
        self.tabs.setTabPosition(QTabWidget.North)
        self.tabs.setDocumentMode(True)

        self.server_tab = ServerTab()
        self.chat_tab = ChatTab()
        self.metrics_tab = MetricsTab()
        self.models_tab = ModelsTab()
        self.deploy_tab = DeployTab()
        self.args_builder = ArgsBuilderTab()
        self.benchmark_tab = BenchmarkTab()
        self.settings_tab = SettingsTab()
        self.updates_tab = UpdatesTab()

        self.tabs.addTab(self.server_tab, "\U0001f5a5\ufe0f  Server")
        self.tabs.addTab(self.chat_tab, "\U0001f4ac  Chat")
        self.tabs.addTab(self.metrics_tab, "\U0001f4ca  Metrics")
        self.tabs.addTab(self.models_tab, "\U0001f917  Models")
        self.tabs.addTab(self.args_builder, "\u2699\ufe0f  Args Builder")
        self.tabs.addTab(self.benchmark_tab, "\u23f1\ufe0f  Benchmark")
        self.tabs.addTab(self.deploy_tab, "\U0001f310  Deploy")
        self.tabs.addTab(self.updates_tab, "\U0001f504  Updates")
        self.tabs.addTab(self.settings_tab, "\u2699\ufe0f  Settings")

        self.setCentralWidget(self.tabs)

    def _setup_tray(self):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray = QSystemTrayIcon(self)
            self.tray.setIcon(QIcon(str(Path(__file__).parent / "resources" / "icons" / "app.png")))
            self.tray.setToolTip("SGLang Commander")

            menu = QMenu()
            show_action = QAction("Show Window", self)
            show_action.triggered.connect(self.show)
            menu.addAction(show_action)

            quit_action = QAction("Quit", self)
            quit_action.triggered.connect(self.quit_app)
            menu.addAction(quit_action)

            self.tray.setContextMenu(menu)
            self.tray.activated.connect(self._tray_activated)
            self.tray.show()

    def _tray_activated(self, reason):
        if reason == QSystemTrayIcon.DoubleClick:
            self.show()
            self.raise_()

    def _setup_theme(self):
        theme_path = Path(__file__).parent / "resources" / "styles" / "dark.qss"
        if theme_path.exists():
            with open(theme_path) as f:
                self.setStyleSheet(f.read())

    def quit_app(self):
        self.server_tab.server_manager.stop()
        QApplication.quit()

    def closeEvent(self, event):
        if self.tray and self.tray.isVisible():
            self.hide()
            event.ignore()
        else:
            self.server_tab.server_manager.stop()
            event.accept()


def run_desktop():
    app = QApplication(sys.argv)
    app.setApplicationName("SGLang Commander")
    app.setOrganizationName("SGLang")

    window = MainWindow()
    window.show()

    sys.exit(app.exec())
