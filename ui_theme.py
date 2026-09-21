"""Shared Streamlit UI theme — sleek finance / market terminal aesthetic."""

from __future__ import annotations

from contextlib import contextmanager

import streamlit as st


def inject_custom_css() -> None:
    st.markdown(
        """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
    /* Color Palette - Bloomberg/TradingView dark theme inspired */
    --bg-void: #040711;
    --bg-base: #0a0e19;
    --bg-surface: rgba(16, 23, 41, 0.72);
    --bg-elevated: rgba(22, 33, 59, 0.8);
    --bg-panel: linear-gradient(160deg, rgba(20, 31, 54, 0.9) 0%, rgba(10, 16, 28, 0.96) 100%);
    --bg-glass: rgba(11, 17, 32, 0.65);
    
    /* Neon Borders & Accents */
    --border-faint: rgba(148, 163, 184, 0.06);
    --border-subtle: rgba(148, 163, 184, 0.12);
    --border-accent: rgba(0, 242, 254, 0.28);
    --border-glow: rgba(0, 242, 254, 0.08);
    
    /* Brand Colors */
    --gold: #f59e0b;
    --gold-glow: rgba(245, 158, 11, 0.35);
    --gold-soft: rgba(245, 158, 11, 0.12);
    --cyan: #00f2fe;
    --cyan-glow: rgba(0, 242, 254, 0.35);
    --cyan-soft: rgba(0, 242, 254, 0.08);
    
    /* Trading Signals */
    --gain: #00e676;
    --gain-glow: rgba(0, 230, 118, 0.35);
    --gain-soft: rgba(0, 230, 118, 0.08);
    --loss: #ff3366;
    --loss-glow: rgba(255, 51, 102, 0.35);
    --loss-soft: rgba(255, 51, 102, 0.08);
    
    /* Typography */
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #5e6f85;
    
    /* Corner Radius */
    --radius-xl: 16px;
    --radius-lg: 12px;
    --radius-md: 8px;
    --radius-sm: 6px;
    
    /* Shadows & Effects */
    --shadow-neon-cyan: 0 0 25px rgba(0, 242, 254, 0.15);
    --shadow-neon-gold: 0 0 25px rgba(245, 158, 11, 0.15);
    --shadow-panel: 0 12px 40px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

/* ── Base Styling & Fonts ── */
html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
}

#MainMenu, footer, header { visibility: hidden; }
.block-container {
    padding-top: 1.5rem;
    padding-bottom: 4rem;
    max-width: 1400px;
}

/* ── Scrollbar Customization ── */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: var(--bg-void);
}
::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
    background: var(--cyan);
    box-shadow: 0 0 8px var(--cyan);
}

/* ── Live Market Grid Background ── */
.stApp {
    background-color: var(--bg-void);
    background-image:
        linear-gradient(rgba(0, 242, 254, 0.015) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 242, 254, 0.015) 1px, transparent 1px),
        radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 60%),
        radial-gradient(circle at 100% 25%, rgba(0, 230, 118, 0.03) 0%, transparent 35%),
        radial-gradient(circle at 0% 75%, rgba(255, 51, 102, 0.03) 0%, transparent 35%);
    background-size: 32px 32px, 32px 32px, 100% 100%, 100% 100%, 100% 100%;
}

/* ── Top Navigation Bar ── */
.top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 1.4rem;
    margin-bottom: 1.25rem;
    background: var(--bg-glass);
    backdrop-filter: blur(24px);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.02);
    position: relative;
    overflow: hidden;
}
.top-bar::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-accent), transparent);
}
.top-bar-brand {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}
.brand-mark {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-sm);
    background: linear-gradient(135deg, #16213e, #0f172a);
    border: 1px solid var(--cyan);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    box-shadow: 0 0 15px rgba(0, 242, 254, 0.25);
    transition: transform 0.3s ease;
}
.top-bar:hover .brand-mark {
    transform: rotate(5deg) scale(1.05);
}
.brand-name {
    font-size: 0.98rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text-primary);
}
.brand-tag {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.market-status {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gain);
    background: var(--gain-soft);
    padding: 0.3rem 0.75rem;
    border: 1px solid rgba(0, 230, 118, 0.2);
    border-radius: 100px;
    box-shadow: 0 0 15px rgba(0, 230, 118, 0.1);
}
.pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gain);
    box-shadow: 0 0 8px var(--gain);
    animation: pulse-ring-glow 2s infinite;
}
@keyframes pulse-ring-glow {
    0% { box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.6); }
    70% { box-shadow: 0 0 0 8px rgba(0, 230, 118, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 230, 118, 0); }
}

/* ── Workstation Hero Card ── */
.hero-card {
    background: var(--bg-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    padding: 2.25rem 2.5rem;
    margin-bottom: 1.5rem;
    box-shadow: var(--shadow-panel);
    position: relative;
    overflow: hidden;
}
.hero-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 50%, rgba(0, 242, 254, 0.03) 100%),
                radial-gradient(circle at 100% 0%, rgba(245, 158, 11, 0.05), transparent 45%);
    pointer-events: none;
}
.hero-card::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--gold) 0%, var(--cyan) 50%, var(--gold) 100%);
    background-size: 200% 100%;
    animation: flow-accent 10s linear infinite;
}
@keyframes flow-accent {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
.hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--cyan-soft);
    border: 1px solid rgba(0, 242, 254, 0.25);
    color: var(--cyan);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.35rem 0.85rem;
    border-radius: 100px;
    margin-bottom: 1rem;
    box-shadow: 0 0 15px rgba(0, 242, 254, 0.1);
}
.hero-title {
    font-size: clamp(1.85rem, 3.5vw, 2.45rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin: 0 0 0.65rem 0;
    line-height: 1.15;
}
.hero-title span {
    background: linear-gradient(135deg, var(--cyan) 0%, #3b82f6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 0 30px rgba(0, 242, 254, 0.1);
}
.hero-sub {
    color: var(--text-secondary);
    font-size: 1.02rem;
    margin: 0 0 1.65rem 0;
    line-height: 1.6;
    max-width: 800px;
}
.stat-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 12px;
}
.stat-chip {
    background: rgba(4, 7, 17, 0.65);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.85rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    position: relative;
    overflow: hidden;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.stat-chip:hover {
    border-color: var(--border-accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 15px rgba(0, 242, 254, 0.06);
}
.stat-chip::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 2px;
    background: var(--cyan);
    transform: scaleX(0);
    transition: transform 0.25s ease;
}
.stat-chip:hover::after {
    transform: scaleX(1);
}
.stat-chip-label {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
}
.stat-chip-value {
    font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
}
.stat-chip-value.positive {
    color: var(--gain);
    text-shadow: 0 0 8px rgba(0, 230, 118, 0.2);
}
.stat-chip-value.gold {
    color: var(--gold);
    text-shadow: 0 0 8px rgba(245, 158, 11, 0.2);
}

/* ── Content Grid Panels ── */
.content-panel {
    background: var(--bg-panel);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: var(--shadow-panel);
    transition: border-color 0.3s, box-shadow 0.3s;
}
.content-panel:hover {
    border-color: rgba(0, 242, 254, 0.18);
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 242, 254, 0.02);
}
.panel-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.65rem;
    text-shadow: 0 0 10px rgba(245, 158, 11, 0.15);
}

/* ── Section Headers ── */
.section-header {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    margin: 0.25rem 0 1.25rem 0;
}
.section-icon {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    background: linear-gradient(135deg, rgba(0, 242, 254, 0.08), rgba(245, 158, 11, 0.05));
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}
.section-title {
    color: var(--text-primary);
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
}
.section-desc {
    color: var(--text-secondary);
    font-size: 0.85rem;
    margin: 0.2rem 0 0 0;
    line-height: 1.45;
}

/* ── Info & Notification Cards ── */
.info-card {
    background: var(--cyan-soft);
    border: 1px solid rgba(0, 242, 254, 0.15);
    border-left: 4px solid var(--cyan);
    border-radius: var(--radius-md);
    padding: 1.05rem 1.35rem;
    margin-bottom: 1.25rem;
    color: var(--text-secondary);
    font-size: 0.88rem;
    line-height: 1.65;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}
.info-card strong { color: var(--text-primary); }

/* ── Metrics Overrides ── */
.metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 1.5rem;
}
@media (max-width: 960px) { .metrics-grid { grid-template-columns: repeat(2, 1fr); } }
.metric-card {
    background: rgba(4, 7, 17, 0.55);
    border: 1px solid var(--border-faint);
    border-radius: var(--radius-md);
    padding: 1.1rem 1.25rem;
    position: relative;
    overflow: hidden;
    transition: all 0.25s ease;
}
.metric-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    opacity: 0;
    transition: opacity 0.25s;
}
.metric-card:hover {
    border-color: var(--border-accent);
    background: rgba(4, 7, 17, 0.8);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35), 0 0 15px rgba(0, 242, 254, 0.05);
    transform: translateY(-1px);
}
.metric-card:hover::before { opacity: 0.8; }
.metric-label {
    display: block;
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.45rem;
}
.metric-value {
    display: block;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.35;
    word-break: break-word;
}
.metric-value.accent {
    color: var(--gain);
    font-size: 1.25rem;
    text-shadow: 0 0 10px rgba(0, 230, 118, 0.25);
}

.panel-divider {
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 1.75rem 0;
}

/* ── Streamlit Element Overrides ── */

/* Buttons */
.stButton > button[kind="primary"],
.stButton > button[data-testid="stBaseButton-primary"] {
    background: linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #facc15 100%) !important;
    background-size: 200% auto !important;
    color: #040711 !important;
    border: none !important;
    border-radius: var(--radius-sm) !important;
    font-weight: 700 !important;
    letter-spacing: 0.03em !important;
    padding: 0.6rem 1.5rem !important;
    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3) !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    text-transform: uppercase;
}
.stButton > button[kind="primary"]:hover,
.stButton > button[data-testid="stBaseButton-primary"]:hover {
    background-position: right center !important;
    transform: translateY(-1.5px) !important;
    box-shadow: 0 6px 25px rgba(245, 158, 11, 0.45) !important;
}
.stButton > button[kind="secondary"],
.stButton > button:not([kind="primary"]):not([data-testid="stBaseButton-primary"]) {
    background: rgba(22, 33, 59, 0.5) !important;
    border: 1px solid var(--border-subtle) !important;
    color: var(--text-secondary) !important;
    border-radius: var(--radius-sm) !important;
    font-weight: 600 !important;
    padding: 0.55rem 1.35rem !important;
    transition: all 0.25s ease !important;
}
.stButton > button:not([kind="primary"]):not([data-testid="stBaseButton-primary"]):hover {
    background: rgba(22, 33, 59, 0.8) !important;
    border-color: var(--cyan) !important;
    color: var(--text-primary) !important;
    box-shadow: 0 0 12px rgba(0, 242, 254, 0.15) !important;
    transform: translateY(-1px) !important;
}
.stDownloadButton > button {
    background: linear-gradient(135deg, #059669 0%, #10b981 100%) !important;
    color: #040711 !important;
    border: none !important;
    border-radius: var(--radius-sm) !important;
    font-weight: 700 !important;
    letter-spacing: 0.02em !important;
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.28) !important;
    transition: all 0.25s ease !important;
    text-transform: uppercase;
}
.stDownloadButton > button:hover {
    transform: translateY(-1.5px) !important;
    box-shadow: 0 6px 22px rgba(16, 185, 129, 0.45) !important;
}

/* Form inputs & boxes */
.stTextInput input,
.stTextArea textarea,
.stDateInput input,
.stNumberInput input,
.stSelectbox [data-baseweb="select"] > div {
    background: rgba(4, 7, 17, 0.8) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-sm) !important;
    color: var(--text-primary) !important;
    font-family: 'Inter', sans-serif !important;
    padding: 0.45rem 0.75rem !important;
    transition: border-color 0.2s, box-shadow 0.2s !important;
}
.stTextInput input:focus,
.stTextArea textarea:focus,
.stDateInput input:focus,
.stNumberInput input:focus {
    border-color: var(--cyan) !important;
    box-shadow: 0 0 0 3px rgba(0, 242, 254, 0.15) !important;
}

/* Date picker calendar.
   The calendar renders in a BaseWeb popover attached to the body, outside
   every container styled above, so it kept its default light-on-light
   palette and was unreadable against this theme. Style it explicitly. */
div[data-baseweb="popover"],
div[data-baseweb="calendar"] {
    z-index: 9999 !important;
}
div[data-baseweb="calendar"],
div[data-baseweb="calendar"] > div {
    background: #0b1220 !important;
    color: var(--text-primary) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-sm) !important;
}
/* Month/year header and the weekday initials */
div[data-baseweb="calendar"] [role="presentation"],
div[data-baseweb="calendar"] [data-baseweb="calendar-header"],
div[data-baseweb="calendar"] [data-baseweb="calendar-header"] * {
    background: transparent !important;
    color: var(--text-primary) !important;
}
/* Individual days */
div[data-baseweb="calendar"] [role="gridcell"] div {
    color: var(--text-primary) !important;
    background: transparent !important;
}
div[data-baseweb="calendar"] [role="gridcell"] div:hover {
    background: rgba(0, 242, 254, 0.18) !important;
    color: #ffffff !important;
}
/* Selected day and the range between two selected dates */
div[data-baseweb="calendar"] [aria-selected="true"] div,
div[data-baseweb="calendar"] [aria-selected="true"] {
    background: var(--cyan) !important;
    color: #04121a !important;
    font-weight: 600 !important;
}
/* Days outside the current month, and disabled days */
div[data-baseweb="calendar"] [aria-disabled="true"] div {
    color: rgba(248, 250, 252, 0.35) !important;
}
/* Month / year dropdowns inside the calendar header */
div[data-baseweb="calendar"] [data-baseweb="select"] > div {
    background: rgba(4, 7, 17, 0.9) !important;
    color: var(--text-primary) !important;
}
.stTextInput input::placeholder,
.stTextArea textarea::placeholder {
    color: var(--text-muted) !important;
    opacity: 0.6 !important;
}

/* Select dropdown lists */
ul[role="listbox"] {
    background-color: #0a0e19 !important;
    border: 1px solid var(--border-subtle) !important;
}
li[role="option"] {
    background-color: transparent !important;
    color: var(--text-secondary) !important;
}
li[role="option"]:hover, li[role="option"][aria-selected="true"] {
    background-color: var(--cyan-soft) !important;
    color: var(--cyan) !important;
}

/* Radio selectors redesigned as Sleek Market Toggles */
.stRadio > div { gap: 8px; flex-wrap: wrap; }
.stRadio label {
    background: rgba(4, 7, 17, 0.5) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-sm) !important;
    padding: 0.5rem 1.25rem !important;
    color: var(--text-secondary) !important;
    font-weight: 600 !important;
    font-size: 0.82rem !important;
    letter-spacing: 0.03em !important;
    transition: all 0.2s ease !important;
}
.stRadio label:hover {
    border-color: rgba(245, 158, 11, 0.3) !important;
    color: var(--text-primary) !important;
}
.stRadio label:has(input:checked) {
    background: var(--gold-soft) !important;
    border-color: var(--gold) !important;
    color: var(--gold) !important;
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.12) !important;
}

.stCheckbox label { color: var(--text-secondary) !important; font-size: 0.85rem !important; }

/* Multi-select styling */
.stMultiSelect [data-baseweb="tag"] {
    background: var(--cyan-soft) !important;
    border: 1px solid rgba(0, 242, 254, 0.25) !important;
    color: var(--cyan) !important;
    font-weight: 500;
}

/* Sidebar Custom Styling */
section[data-testid="stSidebar"] {
    background-color: #060913 !important;
    border-right: 1px solid var(--border-subtle) !important;
}

/* Standard Streamlit Metrics */
div[data-testid="stMetric"] {
    background: rgba(4, 7, 17, 0.55);
    border: 1px solid var(--border-faint);
    border-radius: var(--radius-md);
    padding: 0.9rem 1.15rem;
    transition: border-color 0.25s, box-shadow 0.25s;
}
div[data-testid="stMetric"]:hover {
    border-color: var(--border-subtle);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
div[data-testid="stMetric"] label {
    color: var(--text-muted) !important;
    font-size: 0.72rem !important;
    font-weight: 600 !important;
    letter-spacing: 0.06em !important;
    text-transform: uppercase !important;
}
div[data-testid="stMetric"] [data-testid="stMetricValue"] {
    color: var(--text-primary) !important;
    font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace !important;
    font-size: 1.15rem !important;
    font-weight: 700 !important;
}
div[data-testid="stMetric"] [data-testid="stMetricDelta"] {
    font-family: 'JetBrains Mono', monospace !important;
    font-weight: 600 !important;
    font-size: 0.8rem !important;
}
div[data-testid="stMetric"] [data-testid="stMetricDelta"] svg { display: none; }

/* Streamlit Tabs - Bloomberg style horizontal indicators */
button[data-baseweb="tab"] {
    color: var(--text-secondary) !important;
    background: transparent !important;
    border: none !important;
    border-bottom: 2px solid transparent !important;
    padding: 0.5rem 1.25rem !important;
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 0.85rem !important;
    letter-spacing: 0.05em !important;
    transition: all 0.25s !important;
}
button[data-baseweb="tab"]:hover {
    color: var(--cyan) !important;
}
button[data-baseweb="tab"][aria-selected="true"] {
    color: var(--cyan) !important;
    border-bottom-color: var(--cyan) !important;
    text-shadow: 0 0 8px rgba(0, 242, 254, 0.5) !important;
}
div[data-testid="stTabBar"] {
    border-bottom: 1px solid var(--border-subtle) !important;
    gap: 8px !important;
}

/* DataFrame styling override */
.stDataFrame, [data-testid="stDataFrame"] {
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-md) !important;
    overflow: hidden;
    background: rgba(4, 7, 17, 0.5) !important;
}

/* Toast / Status Cards */
.stSuccess, .stWarning, .stError, .stInfo {
    border-radius: var(--radius-sm) !important;
    border-width: 1px !important;
    font-size: 0.875rem !important;
    backdrop-filter: blur(8px);
}
.stSuccess { background: var(--gain-soft) !important; border-color: rgba(0, 230, 118, 0.25) !important; color: #a3f7bf !important; }
.stWarning { background: rgba(245, 158, 11, 0.06) !important; border-color: rgba(245, 158, 11, 0.25) !important; color: #ffdf9e !important; }
.stError { background: var(--loss-soft) !important; border-color: rgba(255, 51, 102, 0.25) !important; color: #ffb3c6 !important; }
.stInfo { background: var(--cyan-soft) !important; border-color: rgba(0, 242, 254, 0.2) !important; color: #a5f3fc !important; }

/* Markdown typography rules */
label, .stMarkdown p { color: var(--text-secondary) !important; }
h1, h2, h3, h4, [data-testid="stMarkdownContainer"] h3 {
    color: var(--text-primary) !important;
    font-weight: 700 !important;
    letter-spacing: -0.015em !important;
}

/* Expander custom styling */
details[data-testid="stExpander"] {
    background: var(--bg-panel) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-md) !important;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important;
}
details[data-testid="stExpander"] summary {
    color: var(--text-primary) !important;
    font-weight: 600 !important;
    font-size: 0.9rem !important;
    transition: color 0.2s;
}
details[data-testid="stExpander"] summary:hover {
    color: var(--cyan) !important;
}

/* Vertical Block Wrapper Override */
div[data-testid="stVerticalBlockBorderWrapper"] {
    background: var(--bg-panel) !important;
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-xl) !important;
    padding: 0.5rem 0.8rem 1rem !important;
    box-shadow: var(--shadow-panel) !important;
    margin-bottom: 1.5rem !important;
    transition: border-color 0.3s;
}
div[data-testid="stVerticalBlockBorderWrapper"]:hover {
    border-color: rgba(0, 242, 254, 0.15);
}
div[data-testid="stVerticalBlockBorderWrapper"] .panel-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    margin: 0.6rem 0.8rem 0.4rem;
}

.stSpinner > div { color: var(--cyan) !important; }

/* ── Footer ── */
.app-footer {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.78rem;
    margin-top: 3.5rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border-subtle);
    letter-spacing: 0.02em;
}
.app-footer strong { color: var(--text-secondary); font-weight: 600; }

/* Chart element container styling hint */
[data-testid="stLineChart"], [data-testid="stArrowVegaLiteChart"] {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.85rem;
    background: rgba(4, 7, 17, 0.45) !important;
    box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.2);
}
</style>
""",
        unsafe_allow_html=True,
    )


def render_top_bar() -> None:
    st.markdown(
        """
        <div class="top-bar">
            <div class="top-bar-brand">
                <div class="brand-mark">📈</div>
                <div>
                    <div class="brand-name">NAV Terminal</div>
                    <div class="brand-tag">AMFI India · Realtime Mutual Fund Ingestion</div>
                </div>
            </div>
            <div class="market-status">
                <span class="pulse-dot"></span>
                Terminal Active
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_hero(
    title: str,
    subtitle: str,
    badge: str = "AMFI Live Data",
    chips: list[dict[str, str]] | list[str] | None = None,
) -> None:
    chips_html = ""
    if chips:
        chip_items = []
        for chip in chips:
            if isinstance(chip, dict):
                label = chip.get("label", "")
                value = chip.get("value", "")
                tone = chip.get("tone", "")
                tone_class = f" {tone}" if tone else ""
                chip_items.append(
                    f'<div class="stat-chip">'
                    f'<span class="stat-chip-label">{label}</span>'
                    f'<span class="stat-chip-value{tone_class}">{value}</span>'
                    f'</div>'
                )
            else:
                chip_items.append(f'<div class="stat-chip"><span class="stat-chip-value">{chip}</span></div>')
        chips_html = f'<div class="stat-row">{"".join(chip_items)}</div>'

    title_html = title.replace("NAV", "<span>NAV</span>", 1) if "NAV" in title else title

    st.markdown(
        f"""
        <div class="hero-card">
            <span class="hero-badge">◆ {badge}</span>
            <h1 class="hero-title">{title_html}</h1>
            <p class="hero-sub">{subtitle}</p>
            {chips_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_panel_label(label: str) -> None:
    st.markdown(f'<div class="panel-label">{label}</div>', unsafe_allow_html=True)


@contextmanager
def finance_panel(label: str):
    with st.container(border=True):
        render_panel_label(label)
        yield


def render_section_header(icon: str, title: str, description: str = "") -> None:
    desc_html = f'<p class="section-desc">{description}</p>' if description else ""
    # Emitted as one unindented line. With no description the template used to
    # leave a blank line, and Markdown then read the indented closing tags that
    # followed as an indented code block -- printing a literal </div> on screen.
    st.markdown(
        f'<div class="section-header">'
        f'<div class="section-icon">{icon}</div>'
        f'<div><p class="section-title">{title}</p>{desc_html}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )


def render_info_card(content: str) -> None:
    st.markdown(f'<div class="info-card">{content}</div>', unsafe_allow_html=True)


def render_app_footer() -> None:
    st.markdown(
        """
        <div class="app-footer">
            <strong>Data sourced from AMFI India</strong> · Live intelligence console for mutual fund research, comparison &amp; reporting
        </div>
        """,
        unsafe_allow_html=True,
    )
