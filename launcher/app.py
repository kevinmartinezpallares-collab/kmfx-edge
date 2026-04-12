from __future__ import annotations

import json
import platform
import subprocess
import sys
import tkinter as tk
from datetime import datetime, timezone
from pathlib import Path
from tkinter import messagebox, ttk
from urllib.error import URLError
from urllib.request import Request, urlopen

from .backend_client import BackendClient
from .config import LauncherConfig, load_config, mask_connection_key, save_bridge_config, save_config
from .connector_installer import connector_installed, install_connector
from .log_utils import configure_logging, read_recent_logs
from .mt5_detector import MT5Installation, detect_mt5_installations
from .platform_mac import guided_mt5_install as guided_mt5_install_mac, open_mt5 as open_mt5_mac
from .platform_windows import guided_mt5_install as guided_mt5_install_windows, open_mt5 as open_mt5_windows
from .state_store import LauncherStateStore


class LauncherApp:
    def __init__(self) -> None:
        self.config: LauncherConfig = load_config().ensure_runtime_values()
        self.logger = configure_logging(self.config.debug)
        self.logger.info("[KMFX][LAUNCHER] backend target resolved url=%s", self.config.backend_base_url)
        self.root = tk.Tk()
        self.root.title("KMFX Launcher")
        self.root.geometry("880x760")
        self.root.minsize(760, 620)
        self.service_process: subprocess.Popen[str] | None = None
        self.backend = BackendClient(self.config)
        self.store = LauncherStateStore()
        self.installations: list[MT5Installation] = []
        self.pending_accounts: list[dict[str, str]] = []
        self.selected_installation_label = tk.StringVar()
        self.service_status = tk.StringVar(value="OFF")
        self.backend_status = tk.StringVar(value="Unknown")
        self.mt5_status = tk.StringVar(value="Detectando...")
        self.connector_status = tk.StringVar(value="No instalado")
        self.account_status = tk.StringVar(value="Sin sincronización")
        self.connection_key = tk.StringVar(value=self.config.connection_key)
        self.overall_status = tk.StringVar(value="Iniciando")
        self.service_display = tk.StringVar(value="Inactivo")
        self.backend_display = tk.StringVar(value="Validando")
        self.mt5_display = tk.StringVar(value="Detectando")
        self.connector_display = tk.StringVar(value="No instalado")
        self.account_display = tk.StringVar(value="No vinculada")
        self.sync_display = tk.StringVar(value="Sin sync")
        self.account_summary = tk.StringVar(value="Sin cuenta detectada")
        self.account_login = tk.StringVar(value="—")
        self.account_broker = tk.StringVar(value="—")
        self.advanced_toggle_text = tk.StringVar(value="Diagnóstico avanzado ▸")
        self.key_propagation_status = tk.StringVar(value="Esperando vinculación")
        self.pending_status = tk.StringVar(value="Sin pendientes")
        self.mt5_path_value = tk.StringVar(value="No detectado")
        self.preset_path_value = tk.StringVar(value="—")
        self.runtime_file_value = tk.StringVar(value="—")
        self.bridge_url_value = tk.StringVar(value=f"Servicio local · http://{self.config.local_host}:{self.config.local_port}")
        self.last_sync_detail = tk.StringVar(value="Sin actividad reciente")
        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.refresh_installations()
        self.refresh_pending_accounts()
        self.root.after(150, self.ensure_service_started)
        self.root.after(1000, self.refresh_status)

    def _build_ui(self) -> None:
        self._configure_styles()
        self.root.configure(bg=self.colors["bg"])
        self.root.option_add("*Font", ("SF Pro Display", 12))

        shell = ttk.Frame(self.root, style="Shell.TFrame", padding=24)
        shell.pack(fill="both", expand=True)
        shell.columnconfigure(0, weight=1)
        shell.rowconfigure(1, weight=1)

        self._build_header(shell)

        content = self._build_scroll_content(shell)
        self._build_main_connector_card(content)
        self._build_advanced_diagnostics(content)
        self._refresh_status_badges()

    def _build_scroll_content(self, parent: ttk.Frame) -> ttk.Frame:
        container = ttk.Frame(parent, style="Shell.TFrame")
        container.grid(row=1, column=0, sticky="nsew", pady=(22, 0))
        container.columnconfigure(0, weight=1)
        container.rowconfigure(0, weight=1)

        canvas = tk.Canvas(container, bg=self.colors["bg"], highlightthickness=0, bd=0)
        scrollbar = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
        content = ttk.Frame(canvas, style="Shell.TFrame")

        window_id = canvas.create_window((0, 0), window=content, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns", padx=(12, 0))

        content.columnconfigure(0, weight=1)

        def sync_scroll_region(_event: tk.Event) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))

        def sync_content_width(event: tk.Event) -> None:
            canvas.itemconfigure(window_id, width=event.width)

        content.bind("<Configure>", sync_scroll_region)
        canvas.bind("<Configure>", sync_content_width)
        canvas.bind("<MouseWheel>", lambda event: canvas.yview_scroll(int(-1 * (event.delta / 120)), "units"))
        return content

    def _status_row(self, parent: ttk.Widget, row: int, label: str, value_var: tk.StringVar) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", pady=2)
        ttk.Label(parent, textvariable=value_var).grid(row=row, column=1, sticky="w", pady=2, padx=(12, 0))

    def _configure_styles(self) -> None:
        self.colors = {
            "bg": "#050607",
            "shell": "#090A0C",
            "card": "#131517",
            "card_alt": "#171A1D",
            "card_deep": "#0E1012",
            "border": "#282C31",
            "border_soft": "#202327",
            "text": "#F5F5F2",
            "muted": "#8B8F96",
            "subtle": "#60656D",
            "blue": "#5E97FF",
            "blue_dim": "#17223A",
            "green": "#21A66B",
            "green_dim": "#0D3023",
            "amber": "#E2A327",
            "amber_dim": "#35280E",
            "red": "#E26175",
            "red_dim": "#351419",
        }
        self.style = ttk.Style(self.root)
        try:
            self.style.theme_use("clam")
        except tk.TclError:
            pass
        self.style.configure("Shell.TFrame", background=self.colors["bg"])
        self.style.configure("Card.TFrame", background=self.colors["card"], borderwidth=1, relief="solid")
        self.style.configure("DeepCard.TFrame", background=self.colors["card_deep"], borderwidth=1, relief="solid")
        self.style.configure("Tile.TFrame", background=self.colors["card_alt"], borderwidth=1, relief="solid")
        self.style.configure("Kmfx.TLabel", background=self.colors["card"], foreground=self.colors["text"])
        self.style.configure("Shell.TLabel", background=self.colors["bg"], foreground=self.colors["text"])
        self.style.configure("Title.TLabel", background=self.colors["bg"], foreground=self.colors["text"], font=("SF Pro Display", 24, "bold"))
        self.style.configure("Subtitle.TLabel", background=self.colors["bg"], foreground=self.colors["muted"], font=("SF Pro Text", 12))
        self.style.configure("CardTitle.TLabel", background=self.colors["card"], foreground=self.colors["text"], font=("SF Pro Display", 15, "bold"))
        self.style.configure("CardSubtitle.TLabel", background=self.colors["card"], foreground=self.colors["muted"], font=("SF Pro Text", 11))
        self.style.configure("Eyebrow.TLabel", background=self.colors["card"], foreground=self.colors["subtle"], font=("SF Pro Text", 10, "bold"))
        self.style.configure("Muted.TLabel", background=self.colors["card"], foreground=self.colors["muted"], font=("SF Pro Text", 11))
        self.style.configure("Value.TLabel", background=self.colors["card"], foreground=self.colors["text"], font=("SF Pro Display", 18, "bold"))
        self.style.configure("TileTitle.TLabel", background=self.colors["card_alt"], foreground=self.colors["muted"], font=("SF Pro Text", 10, "bold"))
        self.style.configure("TileValue.TLabel", background=self.colors["card_alt"], foreground=self.colors["text"], font=("SF Pro Display", 14, "bold"))
        self.style.configure("DeepTitle.TLabel", background=self.colors["card_deep"], foreground=self.colors["text"], font=("SF Pro Display", 13, "bold"))
        self.style.configure("DeepMuted.TLabel", background=self.colors["card_deep"], foreground=self.colors["muted"], font=("SF Pro Text", 11))
        self.style.configure(
            "Kmfx.TEntry",
            fieldbackground="#1D2025",
            background="#1D2025",
            foreground=self.colors["text"],
            insertcolor=self.colors["text"],
            bordercolor=self.colors["border"],
            lightcolor=self.colors["border"],
            darkcolor=self.colors["border"],
            padding=10,
        )
        self.style.configure(
            "Kmfx.TCombobox",
            fieldbackground="#1D2025",
            background="#1D2025",
            foreground=self.colors["text"],
            arrowcolor=self.colors["muted"],
            bordercolor=self.colors["border"],
            lightcolor=self.colors["border"],
            darkcolor=self.colors["border"],
            padding=8,
        )
        self.style.map("Kmfx.TCombobox", fieldbackground=[("readonly", "#1D2025")], foreground=[("readonly", self.colors["text"])])
        self.style.configure("Primary.TButton", background=self.colors["blue"], foreground="#F7FAFF", borderwidth=0, focusthickness=0, padding=(16, 10), font=("SF Pro Text", 11, "bold"))
        self.style.map("Primary.TButton", background=[("active", "#77A8FF"), ("pressed", "#467DDF")])
        self.style.configure("Hero.TButton", background=self.colors["blue"], foreground="#F7FAFF", borderwidth=0, focusthickness=0, padding=(24, 16), font=("SF Pro Display", 14, "bold"))
        self.style.map("Hero.TButton", background=[("active", "#77A8FF"), ("pressed", "#467DDF")])
        self.style.configure("Secondary.TButton", background="#22262D", foreground=self.colors["text"], borderwidth=0, focusthickness=0, padding=(14, 10), font=("SF Pro Text", 11, "bold"))
        self.style.map("Secondary.TButton", background=[("active", "#2C313A"), ("pressed", "#1D2128")])
        self.style.configure("Ghost.TButton", background=self.colors["card"], foreground=self.colors["muted"], borderwidth=0, focusthickness=0, padding=(12, 9), font=("SF Pro Text", 10, "bold"))
        self.style.map("Ghost.TButton", background=[("active", "#1B1E22")], foreground=[("active", self.colors["text"])])
        self.style.configure(
            "Kmfx.Treeview",
            background="#111316",
            fieldbackground="#111316",
            foreground=self.colors["text"],
            bordercolor=self.colors["border_soft"],
            rowheight=30,
            font=("SF Pro Text", 11),
        )
        self.style.configure(
            "Kmfx.Treeview.Heading",
            background="#171A1D",
            foreground=self.colors["muted"],
            bordercolor=self.colors["border_soft"],
            font=("SF Pro Text", 10, "bold"),
        )
        self.style.map("Kmfx.Treeview", background=[("selected", self.colors["blue_dim"])], foreground=[("selected", self.colors["text"])])

    def _build_header(self, parent: ttk.Frame) -> None:
        header = ttk.Frame(parent, style="Shell.TFrame")
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(1, weight=1)

        logo = tk.Canvas(header, width=48, height=48, bg=self.colors["bg"], highlightthickness=0)
        logo.grid(row=0, column=0, rowspan=2, sticky="w", padx=(0, 16))
        logo.create_rectangle(3, 3, 45, 45, fill="#172033", outline="#25344C", width=1)
        logo.create_line(15, 34, 34, 15, fill="#D9E7FF", width=2)

        ttk.Label(header, text="KMFX Launcher", style="Title.TLabel").grid(row=0, column=1, sticky="sw")
        ttk.Label(header, text="Conecta MetaTrader con KMFX Edge", style="Subtitle.TLabel").grid(row=1, column=1, sticky="nw", pady=(3, 0))

        right = ttk.Frame(header, style="Shell.TFrame")
        right.grid(row=0, column=2, rowspan=2, sticky="e")
        self.overall_pill = self._make_pill(right, self.overall_status)
        self.overall_pill.pack(anchor="e", pady=(8, 0))

    def _build_main_connector_card(self, parent: ttk.Frame) -> None:
        card = ttk.Frame(parent, style="Card.TFrame", padding=28)
        card.grid(row=0, column=0, sticky="ew", pady=(0, 18))
        card.columnconfigure(0, weight=1)

        ttk.Label(card, text="Estado de conexión", style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            card,
            text="Todo lo necesario para dejar MetaTrader conectado y sincronizando con KMFX Edge.",
            style="CardSubtitle.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(5, 20))

        status = ttk.Frame(card, style="Card.TFrame")
        status.grid(row=2, column=0, sticky="ew")
        status.columnconfigure(0, weight=1)
        status.columnconfigure(1, weight=1)
        self.service_line_pill = self._connector_status_line(status, 0, "Servicio local", self.service_display)
        self.mt5_line_pill = self._connector_status_line(status, 1, "MetaTrader", self.mt5_display)
        self.connector_line_pill = self._connector_status_line(status, 2, "Connector", self.connector_display)
        self.account_line_pill = self._connector_status_line(status, 3, "Cuenta", self.account_display)
        self.sync_line_pill = self._connector_status_line(status, 4, "Último sync", self.sync_display)

        ttk.Separator(card).grid(row=3, column=0, sticky="ew", pady=24)

        cta_row = ttk.Frame(card, style="Card.TFrame")
        cta_row.grid(row=4, column=0, sticky="ew")
        cta_row.columnconfigure(0, weight=1)
        ttk.Button(cta_row, text="Conectar MetaTrader", command=self.connect_metatrader, style="Hero.TButton").grid(row=0, column=0, sticky="ew")

        secondary = ttk.Frame(card, style="Card.TFrame")
        secondary.grid(row=5, column=0, sticky="ew", pady=(14, 0))
        secondary.columnconfigure((0, 1, 2), weight=1)
        ttk.Button(secondary, text="Instalar / Reparar connector", command=self.install_connector, style="Secondary.TButton").grid(row=0, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(secondary, text="Abrir MetaTrader", command=self.open_mt5, style="Secondary.TButton").grid(row=0, column=1, sticky="ew", padx=8)
        ttk.Button(secondary, text="Reintentar conexión", command=self.retry_connection, style="Secondary.TButton").grid(row=0, column=2, sticky="ew", padx=(8, 0))

        mt5_picker = ttk.Frame(card, style="DeepCard.TFrame", padding=18)
        mt5_picker.grid(row=6, column=0, sticky="ew", pady=(22, 0))
        mt5_picker.columnconfigure(0, weight=1)
        ttk.Label(mt5_picker, text="MetaTrader detectado", style="DeepTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(mt5_picker, text="Selecciona la instalación sobre la que instalar o reparar el connector.", style="DeepMuted.TLabel").grid(row=1, column=0, sticky="w", pady=(4, 12))
        self.install_selector = ttk.Combobox(mt5_picker, textvariable=self.selected_installation_label, state="readonly", style="Kmfx.TCombobox")
        self.install_selector.grid(row=2, column=0, sticky="ew")
        ttk.Button(mt5_picker, text="Redetectar", command=self.refresh_installations, style="Ghost.TButton").grid(row=2, column=1, sticky="e", padx=(12, 0))

        key_box = ttk.Frame(card, style="DeepCard.TFrame", padding=18)
        key_box.grid(row=7, column=0, sticky="ew", pady=(14, 0))
        key_box.columnconfigure(0, weight=1)
        ttk.Label(key_box, text="Connection Key", style="DeepTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(key_box, textvariable=self.key_propagation_status, style="DeepMuted.TLabel").grid(row=1, column=0, sticky="w", pady=(4, 12))
        ttk.Entry(key_box, textvariable=self.connection_key, show="•", style="Kmfx.TEntry").grid(row=2, column=0, sticky="ew")
        ttk.Button(key_box, text="Aplicar key", command=self.apply_connection_key, style="Primary.TButton").grid(row=2, column=1, sticky="e", padx=(12, 0))

        context = ttk.Frame(card, style="DeepCard.TFrame", padding=18)
        context.grid(row=8, column=0, sticky="ew", pady=(14, 0))
        context.columnconfigure((0, 1, 2), weight=1)
        self._context_metric(context, 0, "Cuenta detectada", self.account_summary)
        self._context_metric(context, 1, "Login", self.account_login)
        self._context_metric(context, 2, "Broker", self.account_broker)

    def _connector_status_line(self, parent: ttk.Frame, row: int, label: str, value_var: tk.StringVar) -> tk.Label:
        parent.rowconfigure(row, weight=1)
        ttk.Label(parent, text=label, style="Muted.TLabel").grid(row=row, column=0, sticky="w", pady=7)
        pill = self._make_pill(parent, value_var)
        pill.grid(row=row, column=1, sticky="e", pady=7)
        return pill

    def _context_metric(self, parent: ttk.Frame, column: int, label: str, value_var: tk.StringVar) -> None:
        block = ttk.Frame(parent, style="DeepCard.TFrame")
        block.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 14, 0))
        ttk.Label(block, text=label.upper(), style="DeepMuted.TLabel").pack(anchor="w")
        ttk.Label(block, textvariable=value_var, style="DeepTitle.TLabel", wraplength=220).pack(anchor="w", pady=(8, 0))

    def _build_advanced_diagnostics(self, parent: ttk.Frame) -> None:
        wrapper = ttk.Frame(parent, style="Card.TFrame", padding=22)
        wrapper.grid(row=1, column=0, sticky="ew", pady=(0, 18))
        wrapper.columnconfigure(0, weight=1)

        ttk.Button(wrapper, textvariable=self.advanced_toggle_text, command=self.toggle_advanced_diagnostics, style="Ghost.TButton").grid(row=0, column=0, sticky="w")
        self.advanced_body = ttk.Frame(wrapper, style="Card.TFrame")
        self.advanced_body.grid(row=1, column=0, sticky="ew", pady=(18, 0))
        self.advanced_body.columnconfigure(0, weight=1)

        self._info_line(self.advanced_body, 0, "Ruta MT5", self.mt5_path_value)
        self._info_line(self.advanced_body, 1, "Preset", self.preset_path_value)
        self._info_line(self.advanced_body, 2, "Runtime file", self.runtime_file_value)
        self._info_line(self.advanced_body, 3, "Bridge", self.bridge_url_value)
        self._info_line(self.advanced_body, 4, "Connection key", self.connection_key)

        actions = ttk.Frame(self.advanced_body, style="Card.TFrame")
        actions.grid(row=5, column=0, columnspan=3, sticky="ew", pady=(18, 10))
        actions.columnconfigure((0, 1, 2, 3), weight=1)
        ttk.Button(actions, text="Probar conexión", command=self.test_connection, style="Secondary.TButton").grid(row=0, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(actions, text="Arrancar servicio", command=self.start_service, style="Secondary.TButton").grid(row=0, column=1, sticky="ew", padx=8)
        ttk.Button(actions, text="Detener servicio", command=self.stop_service, style="Secondary.TButton").grid(row=0, column=2, sticky="ew", padx=8)
        ttk.Button(actions, text="Instalar MT5", command=self.guided_mt5_install, style="Secondary.TButton").grid(row=0, column=3, sticky="ew", padx=(8, 0))

        self.log_box = tk.Text(
            self.advanced_body,
            height=9,
            wrap="word",
            bg="#0D0F12",
            fg=self.colors["muted"],
            insertbackground=self.colors["text"],
            relief="flat",
            borderwidth=0,
            padx=14,
            pady=12,
            font=("SF Mono", 10),
        )
        self.log_box.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        self.log_box.insert("1.0", read_recent_logs())
        self.log_box.configure(state="disabled")

        log_actions = ttk.Frame(self.advanced_body, style="Card.TFrame")
        log_actions.grid(row=7, column=0, sticky="w", pady=(12, 0))
        ttk.Button(log_actions, text="Refrescar logs", command=self.show_logs, style="Secondary.TButton").grid(row=0, column=0, sticky="w")
        ttk.Button(log_actions, text="Copiar logs", command=self.copy_logs, style="Ghost.TButton").grid(row=0, column=1, sticky="w", padx=(10, 0))

        self.advanced_body.grid_remove()

    def toggle_advanced_diagnostics(self) -> None:
        if self.advanced_body.winfo_ismapped():
            self.advanced_body.grid_remove()
            self.advanced_toggle_text.set("Diagnóstico avanzado ▸")
        else:
            self.advanced_body.grid()
            self.advanced_toggle_text.set("Diagnóstico avanzado ▾")

    def _build_hero_status(self, parent: ttk.Frame) -> None:
        card = self._make_card(parent, "Estado general", "Resumen operativo del bridge, MT5 y backend.", row=0, column=0, columnspan=2)
        card.columnconfigure((0, 1, 2, 3, 4), weight=1)

        self.service_pill = self._status_tile(card, 0, "Servicio local", self.service_status)
        self.backend_pill = self._status_tile(card, 1, "Backend", self.backend_status)
        self.mt5_pill = self._status_tile(card, 2, "MetaTrader 5", self.mt5_status)
        self.connector_pill = self._status_tile(card, 3, "Connector", self.connector_status)
        self.sync_pill = self._status_tile(card, 4, "Último sync", self.account_status)

    def _build_connection_card(self, parent: ttk.Frame) -> None:
        card = self._make_card(parent, "Connection Key", "Identidad segura que vincula MT5 con tu cuenta KMFX.", row=1, column=0)
        card.columnconfigure(0, weight=1)

        ttk.Entry(card, textvariable=self.connection_key, style="Kmfx.TEntry").grid(row=2, column=0, columnspan=4, sticky="ew", pady=(16, 10))
        ttk.Button(card, text="Vincular cuenta", command=self.save_launcher_config, style="Primary.TButton").grid(row=3, column=0, sticky="w", pady=(0, 8))
        ttk.Button(card, text="Aplicar key", command=self.apply_connection_key, style="Secondary.TButton").grid(row=3, column=1, sticky="w", padx=(10, 0), pady=(0, 8))
        ttk.Button(card, text="Copiar", command=self.copy_connection_key, style="Ghost.TButton").grid(row=3, column=2, sticky="w", padx=(10, 0), pady=(0, 8))

        ttk.Label(card, textvariable=self.key_propagation_status, style="Muted.TLabel").grid(row=4, column=0, columnspan=4, sticky="w", pady=(4, 0))
        ttk.Label(card, textvariable=self.bridge_url_value, style="Eyebrow.TLabel").grid(row=5, column=0, columnspan=4, sticky="w", pady=(14, 0))

    def _build_mt5_card(self, parent: ttk.Frame) -> None:
        card = self._make_card(parent, "MetaTrader 5", "Instalación, preset fallback y runtime file del connector.", row=1, column=1)
        card.columnconfigure(0, weight=1)

        self.install_selector = ttk.Combobox(card, textvariable=self.selected_installation_label, state="readonly", style="Kmfx.TCombobox")
        self.install_selector.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(16, 10))
        ttk.Button(card, text="Instalar / Reparar", command=self.install_connector, style="Primary.TButton").grid(row=3, column=0, sticky="w")
        ttk.Button(card, text="Redetectar", command=self.refresh_installations, style="Secondary.TButton").grid(row=3, column=1, sticky="w", padx=(10, 0))
        ttk.Button(card, text="Abrir MT5", command=self.open_mt5, style="Ghost.TButton").grid(row=3, column=2, sticky="w", padx=(10, 0))

        self._info_line(card, 4, "Ruta MT5", self.mt5_path_value)
        self._info_line(card, 5, "Preset", self.preset_path_value)
        self._info_line(card, 6, "Runtime file", self.runtime_file_value)

    def _build_pending_card(self, parent: ttk.Frame) -> None:
        card = self._make_card(parent, "Cuentas pendientes", "Vinculaciones creadas en backend antes del primer sync.", row=2, column=0)
        card.columnconfigure(0, weight=1)
        card.rowconfigure(3, weight=1)

        ttk.Label(card, textvariable=self.pending_status, style="Muted.TLabel").grid(row=2, column=0, sticky="w", pady=(14, 8))
        self.pending_tree = ttk.Treeview(card, columns=("alias", "created_at"), show="headings", height=5, style="Kmfx.Treeview")
        self.pending_tree.heading("alias", text="Alias")
        self.pending_tree.heading("created_at", text="Creada")
        self.pending_tree.column("alias", width=280, anchor="w")
        self.pending_tree.column("created_at", width=180, anchor="w")
        self.pending_tree.grid(row=3, column=0, columnspan=3, sticky="nsew")
        ttk.Button(card, text="Actualizar", command=self.refresh_pending_accounts, style="Secondary.TButton").grid(row=4, column=0, sticky="w", pady=(12, 0))
        ttk.Button(card, text="Vincular seleccionada", command=self.bind_selected_pending_account, style="Primary.TButton").grid(row=4, column=1, sticky="w", pady=(12, 0), padx=(10, 0))

    def _build_activity_card(self, parent: ttk.Frame) -> None:
        card = self._make_card(parent, "Actividad reciente", "Eventos operativos, errores y syncs recientes.", row=2, column=1)
        card.columnconfigure(0, weight=1)
        card.rowconfigure(3, weight=1)

        ttk.Label(card, textvariable=self.last_sync_detail, style="Muted.TLabel").grid(row=2, column=0, columnspan=3, sticky="w", pady=(14, 8))
        self.log_box = tk.Text(
            card,
            height=8,
            wrap="word",
            bg="#0D0F12",
            fg=self.colors["muted"],
            insertbackground=self.colors["text"],
            relief="flat",
            borderwidth=0,
            padx=14,
            pady=12,
            font=("SF Mono", 10),
        )
        self.log_box.grid(row=3, column=0, columnspan=3, sticky="nsew")
        self.log_box.insert("1.0", read_recent_logs())
        self.log_box.configure(state="disabled")
        ttk.Button(card, text="Refrescar logs", command=self.show_logs, style="Secondary.TButton").grid(row=4, column=0, sticky="w", pady=(12, 0))
        ttk.Button(card, text="Copiar logs", command=self.copy_logs, style="Ghost.TButton").grid(row=4, column=1, sticky="w", padx=(10, 0), pady=(12, 0))

    def _build_advanced_card(self, parent: ttk.Frame) -> None:
        card = self._make_card(parent, "Advanced", "Herramientas internas preparadas para soporte y diagnóstico.", row=3, column=0, columnspan=2)
        card.columnconfigure((0, 1, 2, 3), weight=1)

        ttk.Button(card, text="Arrancar servicio", command=self.start_service, style="Secondary.TButton").grid(row=2, column=0, sticky="ew", pady=(14, 0), padx=(0, 8))
        ttk.Button(card, text="Detener servicio", command=self.stop_service, style="Secondary.TButton").grid(row=2, column=1, sticky="ew", pady=(14, 0), padx=8)
        ttk.Button(card, text="Probar conexión", command=self.test_connection, style="Primary.TButton").grid(row=2, column=2, sticky="ew", pady=(14, 0), padx=8)
        ttk.Button(card, text="Instalar MT5", command=self.guided_mt5_install, style="Ghost.TButton").grid(row=2, column=3, sticky="ew", pady=(14, 0), padx=(8, 0))

    def _make_card(self, parent: ttk.Frame, title: str, subtitle: str, row: int, column: int, columnspan: int = 1) -> ttk.Frame:
        card = ttk.Frame(parent, style="Card.TFrame", padding=24)
        card.grid(row=row, column=column, columnspan=columnspan, sticky="nsew", padx=(0 if column == 0 else 14, 0), pady=(0, 14))
        ttk.Label(card, text=title, style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(card, text=subtitle, style="CardSubtitle.TLabel").grid(row=1, column=0, columnspan=5, sticky="w", pady=(5, 0))
        return card

    def _status_tile(self, parent: ttk.Frame, column: int, label: str, value_var: tk.StringVar) -> tk.Label:
        tile = ttk.Frame(parent, style="Tile.TFrame", padding=16)
        tile.grid(row=2, column=column, sticky="nsew", padx=(0 if column == 0 else 10, 0), pady=(18, 0))
        ttk.Label(tile, text=label.upper(), style="TileTitle.TLabel").pack(anchor="w")
        ttk.Label(tile, textvariable=value_var, style="TileValue.TLabel").pack(anchor="w", pady=(8, 0))
        pill = self._make_pill(tile, value_var)
        pill.pack(anchor="w", pady=(12, 0))
        return pill

    def _make_pill(self, parent: tk.Misc, value_var: tk.StringVar) -> tk.Label:
        return tk.Label(
            parent,
            textvariable=value_var,
            bg=self.colors["amber_dim"],
            fg=self.colors["amber"],
            padx=12,
            pady=5,
            font=("SF Pro Text", 10, "bold"),
            bd=0,
        )

    def _info_line(self, parent: ttk.Frame, row: int, label: str, value_var: tk.StringVar) -> None:
        ttk.Label(parent, text=label.upper(), style="Eyebrow.TLabel").grid(row=row, column=0, sticky="w", pady=(14, 0))
        ttk.Label(parent, textvariable=value_var, style="Muted.TLabel", wraplength=420).grid(row=row, column=1, columnspan=2, sticky="e", pady=(14, 0), padx=(18, 0))

    def _status_colors(self, value: str) -> tuple[str, str]:
        normalized = value.lower()
        if any(token in normalized for token in ("off", "inactivo", "unreachable", "no detectado", "no instalado", "no vinculada", "error", "rejected", "unknown")):
            return self.colors["red_dim"], self.colors["red"]
        if any(token in normalized for token in ("on", "activo", "listo", "reachable", "detectado", "instalado", "vinculada", "ok", "accepted", "conect", "ready")):
            return self.colors["green_dim"], self.colors["green"]
        if any(token in normalized for token in ("starting", "pendiente", "sync", "iniciando", "esperando", "sin sync")):
            return self.colors["amber_dim"], self.colors["amber"]
        return self.colors["blue_dim"], self.colors["blue"]

    def _refresh_status_badges(self) -> None:
        if not hasattr(self, "overall_pill"):
            return
        service_ok = self.service_status.get().upper() == "ON"
        backend_ok = self.backend_status.get().lower() == "reachable"
        mt5_status = self.mt5_status.get().lower()
        connector_status = self.connector_status.get().lower()
        mt5_ok = "detectado" in mt5_status and "no detectado" not in mt5_status
        connector_ok = "instalado" in connector_status and "no instalado" not in connector_status
        account_ok = bool(self.config.connection_key or self.connection_key.get().strip())
        self.service_display.set("Activo" if service_ok else ("Iniciando" if self.service_status.get().upper() == "STARTING" else "Inactivo"))
        self.backend_display.set("Reachable" if backend_ok else self.backend_status.get())
        self.mt5_display.set("Detectado" if mt5_ok else "No detectado")
        self.connector_display.set("Instalado" if connector_ok else "No instalado")
        self.account_display.set("Vinculada" if account_ok else "No vinculada")
        if service_ok and backend_ok and mt5_ok and connector_ok and account_ok:
            self.overall_status.set("Listo")
        elif self.backend_status.get().lower() == "unreachable":
            self.overall_status.set("Error")
        else:
            self.overall_status.set("Pendiente")
        for label, value in (
            (self.overall_pill, self.overall_status),
            (getattr(self, "service_pill", None), self.service_status),
            (getattr(self, "backend_pill", None), self.backend_status),
            (getattr(self, "mt5_pill", None), self.mt5_status),
            (getattr(self, "connector_pill", None), self.connector_status),
            (getattr(self, "sync_pill", None), self.account_status),
            (getattr(self, "service_line_pill", None), self.service_display),
            (getattr(self, "mt5_line_pill", None), self.mt5_display),
            (getattr(self, "connector_line_pill", None), self.connector_display),
            (getattr(self, "account_line_pill", None), self.account_display),
            (getattr(self, "sync_line_pill", None), self.sync_display),
        ):
            if label is None:
                continue
            bg, fg = self._status_colors(value.get())
            label.configure(bg=bg, fg=fg)

    def _humanize_last_sync(self, last_sync: dict[str, object]) -> str:
        raw = str(last_sync.get("updated_at") or last_sync.get("time") or last_sync.get("timestamp") or "").strip()
        if not raw:
            return "Recibido"
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            seconds = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds()))
            if seconds < 60:
                return f"hace {seconds}s"
            minutes = seconds // 60
            if minutes < 60:
                return f"hace {minutes}m"
            return f"hace {minutes // 60}h"
        except ValueError:
            return raw

    def connect_metatrader(self) -> None:
        if not self.connection_key.get().strip():
            self.save_launcher_config()
        else:
            self.apply_connection_key()
        if self.selected_installation() is None:
            self.refresh_installations()
        if self.selected_installation() is not None:
            self.install_connector()
        self.ensure_service_started()
        self.refresh_status(schedule=False)

    def retry_connection(self) -> None:
        self.refresh_installations()
        self.ensure_service_started()
        self.refresh_status(schedule=False)

    def apply_connection_key(self) -> None:
        self.persist_launcher_config()
        self.reload_bridge_runtime()
        self.key_propagation_status.set(f"Connection Key aplicada: {mask_connection_key(self.config.connection_key)}")
        self._refresh_status_badges()

    def copy_connection_key(self) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(self.connection_key.get().strip())
        self.key_propagation_status.set("Connection Key copiada al portapapeles")

    def copy_logs(self) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(read_recent_logs())
        self.last_sync_detail.set("Logs copiados al portapapeles")

    def persist_launcher_config(self) -> None:
        self.config.connection_key = self.connection_key.get().strip()
        save_config(self.config.ensure_runtime_values())
        if self.config.connection_key:
            save_bridge_config(self.config, user_id="local")

    def reload_bridge_runtime(self) -> None:
        if not self.fetch_json("/health"):
            self.start_service()
            return
        try:
            request = Request(self.service_url("/bridge/reload-config"), method="POST")
            with urlopen(request, timeout=2) as response:
                body = json.loads(response.read().decode("utf-8"))
            self.logger.info(
                "[KMFX][LAUNCHER] bridge runtime reloaded key=%s",
                body.get("connection_key") or mask_connection_key(self.config.connection_key),
            )
        except Exception as exc:
            self.logger.warning("[KMFX][LAUNCHER] bridge reload failed; attempting safe restart error=%s", exc)
            if self.service_process and self.service_process.poll() is None:
                self.stop_service()
                self.start_service()
            else:
                self.logger.warning(
                    "[KMFX][LAUNCHER] bridge reload needs manual restart because the running service was not started by this launcher key=%s",
                    mask_connection_key(self.config.connection_key),
                )

    def ensure_remote_account_link(self) -> bool:
        response = self.backend.link_account(user_id="local", label="KMFX Launcher")
        if not response.ok:
            self.logger.error(
                "[KMFX][LAUNCHER] backend account link failed status=%s body=%s",
                response.status_code,
                response.body,
            )
            return False

        connection_key = str(
            response.body.get("connection_key")
            or (response.body.get("launcher_config") or {}).get("connection_key")
            or ""
        ).strip()
        if not connection_key:
            self.logger.error("[KMFX][LAUNCHER] backend account link missing connection_key body=%s", response.body)
            return False

        self.config.connection_key = connection_key
        self.connection_key.set(connection_key)
        self.key_propagation_status.set(f"Backend link listo: {mask_connection_key(connection_key)}")
        self.logger.info(
            "[KMFX][LAUNCHER] backend account link ready account_id=%s key=%s",
            response.body.get("account_id", ""),
            mask_connection_key(connection_key),
        )
        return True

    def save_launcher_config(self) -> None:
        if not self.ensure_remote_account_link():
            if self.connection_key.get().strip():
                self.persist_launcher_config()
                messagebox.showwarning(
                    "KMFX Launcher",
                    "No pude registrar la cuenta en el backend remoto. Mantengo el connection_key manual como fallback.",
                )
            else:
                messagebox.showerror(
                    "KMFX Launcher",
                    "No pude registrar la cuenta en el backend remoto. Revisa conexión y vuelve a intentar.",
                )
            return
        self.persist_launcher_config()
        self.reload_bridge_runtime()
        self.refresh_pending_accounts()
        self.key_propagation_status.set("Connection Key guardada y bridge recargado")
        messagebox.showinfo("KMFX Launcher", "Cuenta vinculada. El preset y los requests usarán el connection_key registrado en backend.")

    def refresh_pending_accounts(self) -> None:
        response = self.backend.get_pending_accounts()
        self.pending_accounts = response.body.get("accounts", []) if response.ok else []
        if hasattr(self, "pending_tree"):
            self.pending_tree.delete(*self.pending_tree.get_children())
            for account in self.pending_accounts:
                self.pending_tree.insert("", "end", iid=account.get("account_id", ""), values=(account.get("alias", "—"), account.get("created_at", "")))
        count = len(self.pending_accounts)
        self.pending_status.set(f"{count} cuenta{'s' if count != 1 else ''} pendiente{'s' if count != 1 else ''}" if count else "Sin cuentas pendientes")

    def bind_selected_pending_account(self) -> None:
        selection = self.pending_tree.selection()
        if not selection:
            messagebox.showwarning("KMFX Launcher", "Selecciona una cuenta pendiente para vincular.")
            return
        installation = self.selected_installation()
        if installation is None:
            messagebox.showwarning("KMFX Launcher", "Selecciona primero una instalación MT5.")
            return
        account_id = selection[0]
        account = next((item for item in self.pending_accounts if item.get("account_id") == account_id), None)
        if not account:
            messagebox.showerror("KMFX Launcher", "No pude resolver la cuenta pendiente seleccionada.")
            return
        self.config.connection_key = str(account.get("connection_key") or "").strip()
        self.connection_key.set(self.config.connection_key)
        self.config.selected_mt5_terminal_path = installation.terminal_path
        self.config.selected_mt5_data_path = installation.data_path
        self.config.selected_mt5_experts_path = installation.experts_path
        save_config(self.config.ensure_runtime_values())
        save_bridge_config(self.config, user_id=str(account.get("user_id") or "local"))
        self.reload_bridge_runtime()
        result = install_connector(installation, self.config)
        self.store.save_binding(
            {
                "account_id": account.get("account_id", ""),
                "alias": account.get("alias", ""),
                "connection_key": self.config.connection_key,
                "mt5_terminal_path": installation.terminal_path,
                "mt5_data_path": installation.data_path,
                "mt5_experts_path": installation.experts_path,
                "status": "waiting_first_sync",
            }
        )
        messagebox.showinfo(
            "KMFX Launcher",
            "Cuenta vinculada.\n\n"
            f"Alias: {account.get('alias','')}\n"
            f"Experts: {result['experts_path']}\n"
            f"Preset: {result['preset_path']}\n\n"
            "Ahora abre MT5, adjunta el EA y ejecuta el primer sync.",
        )
        self.key_propagation_status.set(f"Key vinculada e instalada: {mask_connection_key(self.config.connection_key)}")
        self.refresh_pending_accounts()

    def refresh_installations(self) -> None:
        self.installations = detect_mt5_installations()
        labels = [installation.label for installation in self.installations]
        self.install_selector["values"] = labels
        if labels:
            preferred = next((item for item in self.installations if item.experts_path == self.config.selected_mt5_experts_path), self.installations[0])
            self.selected_installation_label.set(preferred.label)
            self.mt5_status.set(f"Detectado ({len(labels)})")
            self.connector_status.set("Instalado" if connector_installed(preferred) else "No instalado")
            self.mt5_path_value.set(preferred.data_path)
            self.preset_path_value.set(str(Path(preferred.data_path) / "MQL5" / "Profiles" / "Presets" / "KMFXConnector_Launcher.set"))
            self.runtime_file_value.set(str(Path(preferred.data_path) / "MQL5" / "Files" / "kmfx_connection.conf"))
        else:
            self.selected_installation_label.set("")
            self.mt5_status.set("No detectado")
            self.connector_status.set("No instalado")
            self.mt5_path_value.set("No detectado")
            self.preset_path_value.set("—")
            self.runtime_file_value.set("—")
        self._refresh_status_badges()

    def selected_installation(self) -> MT5Installation | None:
        label = self.selected_installation_label.get().strip()
        return next((installation for installation in self.installations if installation.label == label), None)

    def start_service(self) -> None:
        if self.service_process and self.service_process.poll() is None:
            return
        self.persist_launcher_config()
        self.service_process = subprocess.Popen([sys.executable, "-m", "launcher.service"], cwd=str(Path(__file__).resolve().parent.parent))
        self.logger.info("[KMFX][LAUNCHER] service process started pid=%s", self.service_process.pid if self.service_process else "")
        self.service_status.set("STARTING")
        self._refresh_status_badges()

    def ensure_service_started(self) -> None:
        if self.fetch_json("/health"):
            self.logger.info("[KMFX][LAUNCHER] local bridge already running on %s", self.service_url(""))
            self.service_status.set("ON")
            self._refresh_status_badges()
            return
        self.start_service()

    def stop_service(self) -> None:
        if self.service_process and self.service_process.poll() is None:
            self.service_process.terminate()
            self.logger.info("[KMFX][LAUNCHER] service process terminated")
        self.service_status.set("OFF")
        self._refresh_status_badges()

    def service_url(self, path: str) -> str:
        return f"http://{self.config.local_host}:{self.config.local_port}{path}"

    def fetch_json(self, path: str) -> dict[str, object] | None:
        try:
            with urlopen(self.service_url(path), timeout=2) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            return None

    def refresh_status(self, schedule: bool = True) -> None:
        status = self.fetch_json("/status")
        if status:
            self.service_status.set("ON")
            self.backend_status.set("Reachable" if status.get("backend_reachable") else "Unreachable")
            self.bridge_url_value.set(f"Backend target · {status.get('backend_base_url') or self.config.backend_base_url}")
            last_sync = status.get("last_sync") or {}
            if isinstance(last_sync, dict) and last_sync:
                login = str(last_sync.get("login") or last_sync.get("account_login") or last_sync.get("identity_key") or "—")
                broker = str(last_sync.get("broker") or last_sync.get("server") or "—")
                self.account_summary.set("Cuenta MT5 detectada")
                self.account_login.set(login)
                self.account_broker.set(broker)
                self.sync_display.set(self._humanize_last_sync(last_sync))
                self.account_status.set(f"{login} · {last_sync.get('status','')}")
                self.last_sync_detail.set(
                    f"Último sync: {last_sync.get('status','')} · {last_sync.get('identity_key','')} · {last_sync.get('updated_at', last_sync.get('time', ''))}"
                )
            else:
                self.account_status.set("Sin sincronización")
                self.sync_display.set("Sin sync")
                self.account_summary.set("Esperando snapshot" if self.connection_key.get().strip() else "Sin cuenta detectada")
                self.account_login.set("—")
                self.account_broker.set("—")
                self.last_sync_detail.set("Servicio activo. Esperando primer snapshot de MT5.")
        else:
            self.service_status.set("OFF")
            self.backend_status.set("Unknown")
            self.sync_display.set("Sin sync")
            self.last_sync_detail.set("Servicio local no disponible todavía.")
        self.refresh_pending_accounts()
        self._refresh_status_badges()
        if schedule:
            self.root.after(2000, self.refresh_status)

    def install_connector(self) -> None:
        installation = self.selected_installation()
        if installation is None:
            messagebox.showwarning("KMFX Launcher", "No hay instalación de MT5 seleccionada.")
            return
        self.config.selected_mt5_terminal_path = installation.terminal_path
        self.config.selected_mt5_data_path = installation.data_path
        self.config.selected_mt5_experts_path = installation.experts_path
        save_config(self.config)
        if self.config.connection_key:
            save_bridge_config(self.config, user_id="local")
        result = install_connector(installation, self.config)
        self.connector_status.set("Instalado")
        self.key_propagation_status.set("Connector instalado. Preset y runtime file actualizados.")
        self.refresh_installations()
        messagebox.showinfo(
            "KMFX Launcher",
            "Connector instalado.\n\n"
            f"Experts: {result['experts_path']}\n"
            f"Preset: {result['preset_path']}\n\n"
            "Adjunta el EA al gráfico y carga el preset KMFXConnector_Launcher.set si MetaTrader no rellena inputs automáticamente.",
        )

    def open_mt5(self) -> None:
        installation = self.selected_installation()
        terminal_path = installation.terminal_path if installation else self.config.selected_mt5_terminal_path
        if not terminal_path:
            messagebox.showwarning("KMFX Launcher", "No hay terminal MT5 detectada para abrir.")
            return
        opener = open_mt5_mac if platform.system().lower() == "darwin" else open_mt5_windows
        if not opener(terminal_path):
            messagebox.showerror("KMFX Launcher", "No pude abrir MT5 automáticamente.")

    def guided_mt5_install(self) -> None:
        opener = guided_mt5_install_mac if platform.system().lower() == "darwin" else guided_mt5_install_windows
        if not opener():
            messagebox.showerror("KMFX Launcher", "No pude abrir la descarga guiada de MT5.")

    def test_connection(self) -> None:
        health = self.fetch_json("/health")
        if not health:
            messagebox.showwarning("KMFX Launcher", "El servicio local no está respondiendo todavía.")
            return
        messagebox.showinfo(
            "KMFX Launcher",
            "Servicio local operativo.\n\n"
            f"Backend target: {health.get('backend_base_url', self.config.backend_base_url)}\n"
            f"Backend reachable: {health.get('backend_reachable')}\n"
            f"Queue snapshot: {health.get('queue_depth',{}).get('snapshot',0)}\n"
            f"Queue journal: {health.get('queue_depth',{}).get('journal',0)}",
        )

    def show_logs(self) -> None:
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.insert("1.0", read_recent_logs())
        self.log_box.configure(state="disabled")

    def run(self) -> None:
        self.root.mainloop()

    def on_close(self) -> None:
        self.stop_service()
        self.root.destroy()


def main() -> None:
    LauncherApp().run()


if __name__ == "__main__":
    main()
