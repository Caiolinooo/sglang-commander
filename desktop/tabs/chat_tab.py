import json

import io
import threading

from PySide6.QtCore import Qt, QThread, Signal, QByteArray
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QTextEdit,
    QLabel, QComboBox, QDoubleSpinBox, QSpinBox, QGroupBox,
    QFormLayout, QSplitter, QScrollArea, QFrame, QFileDialog,
)
from PySide6.QtGui import QFont, QTextCursor
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput

import httpx


class StreamReader(QThread):
    chunk_received = Signal(str)
    finished = Signal()
    error = Signal(str)

    def __init__(self, url, payload):
        super().__init__()
        self.url = url
        self.payload = payload

    def run(self):
        import asyncio
        asyncio.run(self._stream())

    async def _stream(self):
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream("POST", self.url, json=self.payload) as r:
                    async for line in r.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data.strip() == "[DONE]":
                                break
                            try:
                                parsed = json.loads(data)
                                delta = parsed.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    self.chunk_received.emit(content)
                            except json.JSONDecodeError:
                                pass
            self.finished.emit()
        except Exception as e:
            self.error.emit(str(e))


class ChatTab(QWidget):
    def __init__(self):
        super().__init__()
        self._setup_ui()
        self._messages = []

    def _setup_ui(self):
        layout = QVBoxLayout()

        # Top controls
        controls = QHBoxLayout()

        self.model_combo = QComboBox()
        self.model_combo.setEditable(True)
        self.model_combo.setMinimumWidth(200)
        self.model_combo.addItem("default")
        controls.addWidget(QLabel("Model:"))
        controls.addWidget(self.model_combo)

        self.temp_spin = QDoubleSpinBox()
        self.temp_spin.setRange(0.0, 2.0)
        self.temp_spin.setValue(0.7)
        self.temp_spin.setSingleStep(0.1)
        controls.addWidget(QLabel("Temp:"))
        controls.addWidget(self.temp_spin)

        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 131072)
        self.max_tokens.setValue(4096)
        controls.addWidget(QLabel("Max Tokens:"))
        controls.addWidget(self.max_tokens)

        self.clear_btn = QPushButton("Clear Chat")
        self.clear_btn.clicked.connect(self._clear_chat)
        controls.addWidget(self.clear_btn)

        controls.addStretch()
        layout.addLayout(controls)

        # Chat display
        self.chat_display = QTextEdit()
        self.chat_display.setReadOnly(True)
        self.chat_display.setFont(QFont("Segoe UI", 10))
        self.chat_display.setMinimumHeight(300)
        layout.addWidget(self.chat_display)

        # Input area
        input_layout = QHBoxLayout()

        self.message_input = QTextEdit()
        self.message_input.setPlaceholderText("Type your message here...")
        self.message_input.setMaximumHeight(100)
        self.message_input.setFont(QFont("Segoe UI", 10))

        self.send_btn = QPushButton("\u27a1 Send")
        self.send_btn.setStyleSheet("background-color: #3b82f6; color: white; padding: 8px 16px;")
        self.send_btn.clicked.connect(self._send_message)

        input_layout.addWidget(self.message_input)
        input_layout.addWidget(self.send_btn)
        layout.addLayout(input_layout)

        # Image upload + TTS/STT
        extra_layout = QHBoxLayout()
        self.image_btn = QPushButton("\U0001f5bc Upload Image")
        self.image_btn.clicked.connect(self._upload_image)
        self.image_label = QLabel("")

        self.tts_btn = QPushButton("\U0001f50a TTS")
        self.tts_btn.clicked.connect(self._read_aloud)
        self.tts_btn.setToolTip("Read last assistant response aloud")

        self.stt_btn = QPushButton("\U0001f3a4 STT")
        self.stt_btn.setCheckable(True)
        self.stt_btn.clicked.connect(self._toggle_stt)

        extra_layout.addWidget(self.image_btn)
        extra_layout.addWidget(self.image_label)
        extra_layout.addWidget(self.tts_btn)
        extra_layout.addWidget(self.stt_btn)
        extra_layout.addStretch()
        layout.addLayout(extra_layout)

        self.setLayout(layout)
        self._current_image = None
        self._player = QMediaPlayer()
        self._audio_output = QAudioOutput()
        self._player.setAudioOutput(self._audio_output)

    def _send_message(self):
        text = self.message_input.toPlainText().strip()
        if not text:
            return

        self._add_message("user", text)
        if self._current_image:
            self._add_message("system", f"[Image attached: {self._current_image}]")
        self.message_input.clear()

        self._add_message("assistant", "_thinking...")
        self.send_btn.setEnabled(False)

        self._stream_response(text)

    def _stream_response(self, text):
        import asyncio

        messages = [{"role": "user", "content": text}]
        if self._current_image:
            messages[0]["content"] = [
                {"type": "text", "text": text},
                {"type": "image_url", "image_url": {"url": f"file://{self._current_image}"}},
            ]

        payload = {
            "model": self.model_combo.currentText(),
            "messages": messages,
            "temperature": self.temp_spin.value(),
            "max_tokens": self.max_tokens.value(),
            "stream": True,
        }

        from app.services.server_manager import server_manager
        status = asyncio.run(server_manager.get_status())
        if not status.get("running"):
            self._append_text("\n[Error: Server is not running]")
            self.send_btn.setEnabled(True)
            return

        host = status.get("host", "127.0.0.1")
        port = status.get("port", 30000)
        url = f"http://{host}:{port}/v1/chat/completions"

        async def stream():
            nonlocal url, payload
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    async with client.stream("POST", url, json=payload) as r:
                        full_response = ""
                        async for line in r.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:]
                                if data.strip() == "[DONE]":
                                    break
                                try:
                                    parsed = json.loads(data)
                                    delta = parsed.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        full_response += content
                                        self._update_last_message(full_response)
                                except json.JSONDecodeError:
                                    pass
            except Exception as e:
                self._append_text(f"\n[Error: {e}]")

        import threading
        threading.Thread(target=lambda: asyncio.run(stream()), daemon=True).start()

    def _add_message(self, role: str, content: str):
        prefix = {"user": "You", "assistant": "Assistant", "system": "System"}.get(role, role)
        self._messages.append({"role": role, "content": content})

        color = {"user": "#3b82f6", "assistant": "#22c55e", "system": "#eab308"}.get(role, "#ffffff")
        html = f'<div style="margin: 8px 0;"><b style="color: {color};">{prefix}:</b><br>{content}</div>'
        self.chat_display.append(html)
        self.send_btn.setEnabled(True)

        cursor = self.chat_display.textCursor()
        cursor.movePosition(QTextCursor.End)
        self.chat_display.setTextCursor(cursor)

    def _update_last_message(self, content: str):
        if self._messages:
            self._messages[-1]["content"] = content

        cursor = self.chat_display.textCursor()
        cursor.movePosition(QTextCursor.End)
        cursor.movePosition(QTextCursor.StartOfBlock, QTextCursor.KeepAnchor)
        cursor.removeSelectedText()

        role = self._messages[-1]["role"] if self._messages else "assistant"
        color = {"assistant": "#22c55e"}.get(role, "#ffffff")
        prefix = "Assistant"
        html = f'<div style="margin: 8px 0;"><b style="color: {color};">{prefix}:</b><br>{content}</div>'
        cursor.insertHtml(html)

    def _append_text(self, text: str):
        self.chat_display.append(text)
        cursor = self.chat_display.textCursor()
        cursor.movePosition(QTextCursor.End)
        self.chat_display.setTextCursor(cursor)
        self.send_btn.setEnabled(True)

    def _clear_chat(self):
        self._messages = []
        self.chat_display.clear()
        self._current_image = None
        self.image_label.setText("")

    def _upload_image(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Select Image", "",
            "Images (*.png *.jpg *.jpeg *.gif *.webp)"
        )
        if path:
            self._current_image = path
            self.image_label.setText(f"Image: {path.split('/')[-1].split('\\\\')[-1]}")

    def _read_aloud(self):
        import asyncio
        last_assistant = ""
        for m in reversed(self._messages):
            if m["role"] == "assistant":
                last_assistant = m["content"]
                break
        if not last_assistant:
            return

        async def tts():
            from app.services.tts_stt_service import tts_service
            from app.services.server_manager import server_manager
            status = await server_manager.get_status()
            host = status.get("host", "127.0.0.1")
            port = status.get("port", 30000)
            try:
                audio = await tts_service.synthesize(last_assistant, endpoint_url=f"http://{host}:{port}")
                from PySide6.QtCore import QBuffer
                buf = QBuffer()
                buf.setData(QByteArray(audio))
                self._player.setSourceDevice(buf)
                self._player.play()
            except Exception as e:
                self._append_text(f"\n[TTS Error: {e}]")

        threading.Thread(target=lambda: asyncio.run(tts()), daemon=True).start()

    def _toggle_stt(self):
        import asyncio
        if self.stt_btn.isChecked():
            self.stt_btn.setText("\U0001f3a4 Recording...")
            threading.Thread(target=self._record_audio, daemon=True).start()
        else:
            self.stt_btn.setText("\U0001f3a4 STT")

    def _record_audio(self):
        import asyncio
        import tempfile
        import sounddevice as sd
        import soundfile as sf

        try:
            fs = 16000
            duration = 5
            recording = sd.rec(int(fs * duration), samplerate=fs, channels=1)
            sd.wait()
            audio_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
            sf.write(audio_path, recording, fs)

            async def transcribe():
                from app.services.tts_stt_service import stt_service
                from app.services.server_manager import server_manager
                status = await server_manager.get_status()
                host = status.get("host", "127.0.0.1")
                port = status.get("port", 30000)
                try:
                    with open(audio_path, "rb") as f:
                        audio_data = f.read()
                    text = await stt_service.transcribe(audio_data, endpoint_url=f"http://{host}:{port}")
                    if text.strip():
                        self.message_input.append(text)
                except Exception as e:
                    self._append_text(f"\n[STT Error: {e}]")
                finally:
                    import os
                    os.unlink(audio_path)

            asyncio.run(transcribe())
        except ImportError:
            self._append_text("\n[STT requires sounddevice and soundfile: pip install sounddevice soundfile]")
        except Exception as e:
            self._append_text(f"\n[STT Error: {e}]")
        finally:
            self.stt_btn.setChecked(False)
            self.stt_btn.setText("\U0001f3a4 STT")
