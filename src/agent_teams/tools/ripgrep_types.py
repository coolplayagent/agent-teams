from __future__ import annotations

from dataclasses import dataclass


@dataclass
class GrepMatch:
    """单条 grep 匹配"""

    path: str
    line_num: int
    line_text: str

    def format(self, show_filename: bool = True) -> str:
        prefix = f"{self.path}:" if show_filename else ""
        return f"{prefix}Line {self.line_num}: {self.line_text}"


@dataclass
class GrepResult:
    """grep 搜索结果"""

    matches: list[GrepMatch]
    truncated: bool
    total: int

    def format(self) -> str:
        if not self.matches:
            return "No matches found"

        lines = [f"Found {self.total} matches"]
        if self.truncated:
            lines.append(f"(Results truncated: showing first {len(self.matches)})")

        current_file = ""
        for m in self.matches:
            if m.path != current_file:
                current_file = m.path
                lines.append(f"\n{m.path}:")
            lines.append(f"  {m.format(show_filename=False)}")

        return "\n".join(lines)
