import string
from typing import List, Dict, Any
from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.core.database import Base


class SafeFormatter(string.Formatter):
    def get_value(self, key, args, kwargs):
        if isinstance(key, str):
            return kwargs.get(key, f"{{{key}}}")
        return super().get_value(key, args, kwargs)


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), unique=True, nullable=False)
    description = Column(String(256), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def get_placeholders(self) -> List[str]:
        """Extract placeholder variable names from the template content."""
        if not self.content:
            return []
        try:
            # string.Formatter().parse(content) returns tuples of (literal_text, field_name, format_spec, conversion)
            placeholders = []
            for _, field_name, _, _ in string.Formatter().parse(self.content):
                if field_name is not None and field_name not in placeholders:
                    placeholders.append(field_name)
            return placeholders
        except Exception:
            return []

    def render(self, inputs: Dict[str, Any]) -> str:
        """Render the template using the provided dictionary of inputs."""
        if not self.content:
            return ""
        try:
            return SafeFormatter().format(self.content, **inputs)
        except Exception:
            # Fallback in case of syntax error in template format
            rendered = self.content
            for k, v in inputs.items():
                rendered = rendered.replace(f"{{{k}}}", str(v))
            return rendered
