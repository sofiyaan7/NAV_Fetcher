"""app.py must own st.set_page_config, and own it alone.

The bug this guards against: nav_fetcher.py called st.set_page_config at module
level, and app.py imports nav_fetcher before making its own call. On a cold
process the app's own call was therefore the second one, and Streamlit returned
StreamlitSetPageConfigMustBeFirstCommandError instead of the page. A refresh hid
it -- by then the module is in sys.modules and its top level does not run again
-- so only the first visitor after a restart or a redeploy hit it.
"""

import ast
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

IMPORTED_MODULES = [
    "nav_fetcher.py", "mis_generator.py", "ui_theme.py",
    "benchmark_proxy.py", "amfi_nav.py", "mis_history.py", "model_portfolio.py",
]

# Statements whose bodies run only when called, or only as the main script.
_DEFERRED = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def _is_main_guard(node) -> bool:
    if not isinstance(node, ast.If):
        return False
    return "__name__" in ast.dump(node.test) and "__main__" in ast.dump(node.test)


def _import_time_st_calls(path: Path):
    """Every st.<name>() that actually runs when the module is imported."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = []
    for node in tree.body:
        if isinstance(node, _DEFERRED) or _is_main_guard(node):
            continue
        for sub in ast.walk(node):
            if isinstance(sub, _DEFERRED):
                continue
            if not isinstance(sub, ast.Call):
                continue
            fn = sub.func
            if (isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name)
                    and fn.value.id == "st"):
                found.append((fn.attr, sub.lineno))
    return found


@pytest.mark.parametrize("name", IMPORTED_MODULES)
def test_imported_modules_emit_nothing_at_import_time(name):
    path = ROOT / name
    if not path.exists():
        pytest.skip(f"{name} not present")
    calls = _import_time_st_calls(path)
    assert calls == [], (
        f"{name} runs Streamlit commands when imported: {calls}. "
        f"app.py's set_page_config must be the first command in the script."
    )


def _calls_set_page_config(path: Path) -> bool:
    """A real call, not the word appearing in a comment or a docstring."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for sub in ast.walk(tree):
        if (isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute)
                and sub.func.attr == "set_page_config"):
            return True
    return False


def test_only_app_sets_page_config():
    owners = sorted(p.name for p in ROOT.glob("*.py") if _calls_set_page_config(p))
    assert owners == ["app.py"], f"set_page_config should live only in app.py, found in {owners}"


def test_app_still_sets_page_config():
    assert _calls_set_page_config(ROOT / "app.py"), "app.py must set the page config"
