from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QLineEdit, QTreeWidget, QTreeWidgetItem, QTextEdit,
    QGroupBox, QSplitter, QComboBox,
)
from PySide6.QtGui import QFont

from shared.args_registry import ARGS_REGISTRY, ARG_CATEGORIES, PRESETS


class ArgsBuilderTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()

    def _setup_ui(self):
        layout = QHBoxLayout()

        # Left: categorized tree
        left = QWidget()
        left_layout = QVBoxLayout()

        # Search
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search arguments...")
        self.search_input.textChanged.connect(self._filter_args)
        left_layout.addWidget(self.search_input)

        # Tree
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["Argument", "Default"])
        self.tree.setColumnWidth(0, 280)
        self.tree.itemClicked.connect(self._show_arg_detail)
        left_layout.addWidget(self.tree)

        left.setLayout(left_layout)

        # Right: detail + presets
        right = QWidget()
        right_layout = QVBoxLayout()

        # Detail
        detail_group = QGroupBox("Argument Details")
        detail_layout = QVBoxLayout()
        self.arg_detail = QTextEdit()
        self.arg_detail.setReadOnly(True)
        self.arg_detail.setFont(QFont("Consolas", 9))
        detail_layout.addWidget(self.arg_detail)
        detail_group.setLayout(detail_layout)
        right_layout.addWidget(detail_group)

        # Presets
        preset_group = QGroupBox("Presets")
        preset_layout = QHBoxLayout()

        self.preset_combo = QComboBox()
        self.preset_combo.addItems(["Select a preset..."] + list(PRESETS.keys()))
        self.preset_combo.currentTextChanged.connect(self._show_preset)
        preset_layout.addWidget(self.preset_combo)

        preset_group.setLayout(preset_layout)
        right_layout.addWidget(preset_group)

        # Preset detail
        self.preset_detail = QTextEdit()
        self.preset_detail.setReadOnly(True)
        self.preset_detail.setMaximumHeight(200)
        right_layout.addWidget(self.preset_detail)

        right.setLayout(right_layout)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setSizes([500, 400])

        main_layout = QVBoxLayout()
        main_layout.addWidget(splitter)
        self.setLayout(main_layout)

        self._populate_tree()

    def _populate_tree(self, filter_text: str = ""):
        self.tree.clear()

        for category in ARG_CATEGORIES:
            cat_args = [
                a for a in ARGS_REGISTRY
                if a["category"] == category
            ]

            if filter_text:
                cat_args = [
                    a for a in cat_args
                    if filter_text.lower() in a["name"].lower()
                    or (a.get("short") and filter_text.lower() in a["short"].lower())
                    or filter_text.lower() in a["description"].lower()
                ]

            if not cat_args:
                continue

            cat_item = QTreeWidgetItem([category])
            cat_item.setExpanded(True)
            font = cat_item.font(0)
            font.setBold(True)
            cat_item.setFont(0, font)

            for arg in cat_args:
                required = " (required)" if arg.get("required") else ""
                name = f"{arg['name']}{required}"
                default = arg.get("default", "")
                item = QTreeWidgetItem([name, str(default)])
                item.setData(0, Qt.UserRole, arg)
                cat_item.addChild(item)

            self.tree.addTopLevelItem(cat_item)

    def _filter_args(self, text: str):
        self._populate_tree(text)

    def _show_arg_detail(self, item, col):
        arg = item.data(0, Qt.UserRole)
        if not arg:
            return

        detail = (
            f"<h2>{arg['name']}</h2>"
            f"<p><b>Short form:</b> {arg.get('short', 'N/A')}</p>"
            f"<p><b>Category:</b> {arg['category']}</p>"
            f"<p><b>Type:</b> {arg['type']}</p>"
            f"<p><b>Default:</b> {arg.get('default', 'N/A')}</p>"
            f"<p><b>Required:</b> {'Yes' if arg.get('required') else 'No'}</p>"
            f"<hr>"
            f"<p><b>Description:</b><br>{arg.get('description', 'No description')}</p>"
        )

        if arg.get("choices"):
            choices = ", ".join(arg["choices"])
            detail += f"<p><b>Choices:</b> {choices}</p>"

        if arg.get("example"):
            detail += f'<p><b>Example:</b><br><code>{arg["example"]}</code></p>'

        self.arg_detail.setHtml(detail)

    def _show_preset(self, preset_name: str):
        if preset_name == "Select a preset...":
            self.preset_detail.clear()
            return

        preset = PRESETS.get(preset_name)
        if not preset:
            return

        detail = (
            f"<h2>{preset_name}</h2>"
            f"<p><b>Description:</b> {preset['description']}</p>"
            f"<hr>"
            f"<p><b>Configuration:</b></p>"
            f"<pre>"
        )

        for k, v in preset["args"].items():
            flag = f"--{k.replace('_', '-')}"
            if isinstance(v, bool) and v:
                detail += f"  {flag}\n"
            elif isinstance(v, bool):
                pass
            else:
                detail += f"  {flag} {v}\n"

        detail += "</pre>"
        self.preset_detail.setHtml(detail)
