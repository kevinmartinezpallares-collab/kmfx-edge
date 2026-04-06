from __future__ import annotations

import json
import platform
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from urllib.error import URLError
from urllib.request import urlopen

from .backend_client import BackendClient
from .config import LauncherConfig, load_config, save_config
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
        self.root.geometry("920x640")
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
        self._build_ui()
        self.refresh_installations()
        self.refresh_pending_accounts()
        self.root.after(1000, self.refresh_status)

    def _build_ui(self) -> None:
        header = ttk.Frame(self.root, padding=16)
        header.pack(fill="x")
        ttk.Label(header, text="KMFX Launcher", font=("Helvetica", 20, "bold")).pack(anchor="w")
        ttk.Label(header, text="Instalación local de connector + servicio robusto + conexión al backend KMFX").pack(anchor="w")

        config_frame = ttk.LabelFrame(self.root, text="Configuración", padding=12)
        config_frame.pack(fill="x", padx=16, pady=(0, 12))
        ttk.Label(config_frame, text="Connection Key").grid(row=0, column=0, sticky="w")
        ttk.Entry(config_frame, textvariable=self.connection_key, width=40).grid(row=0, column=1, sticky="ew", padx=(8, 8))
        ttk.Button(config_frame, text="Vincular cuenta", command=self.save_launcher_config).grid(row=0, column=2, sticky="e")
        ttk.Label(config_frame, text="Pega aquí el connection_key generado desde el dashboard y luego reinstala o repara el connector si hace falta.").grid(row=1, column=0, columnspan=3, sticky="w", pady=(8, 0))
        ttk.Label(config_frame, text=f"Servicio local: http://{self.config.local_host}:{self.config.local_port}").grid(row=2, column=0, columnspan=3, sticky="w", pady=(6, 0))
        config_frame.columnconfigure(1, weight=1)

        status_frame = ttk.LabelFrame(self.root, text="Estado", padding=12)
        status_frame.pack(fill="x", padx=16, pady=(0, 12))
        self._status_row(status_frame, 0, "Servicio local", self.service_status)
        self._status_row(status_frame, 1, "Backend KMFX", self.backend_status)
        self._status_row(status_frame, 2, "MT5", self.mt5_status)
        self._status_row(status_frame, 3, "Connector", self.connector_status)
        self._status_row(status_frame, 4, "Última cuenta/sync", self.account_status)

        install_frame = ttk.LabelFrame(self.root, text="Instalación MT5", padding=12)
        install_frame.pack(fill="x", padx=16, pady=(0, 12))
        ttk.Label(install_frame, text="Instalación detectada").grid(row=0, column=0, sticky="w")
        self.install_selector = ttk.Combobox(install_frame, textvariable=self.selected_installation_label, state="readonly")
        self.install_selector.grid(row=0, column=1, sticky="ew", padx=(8, 8))
        ttk.Button(install_frame, text="Redetectar MT5", command=self.refresh_installations).grid(row=0, column=2, padx=(0, 8))
        ttk.Button(install_frame, text="Instalar/Reparar connector", command=self.install_connector).grid(row=0, column=3)
        ttk.Button(install_frame, text="Abrir MT5", command=self.open_mt5).grid(row=1, column=1, sticky="w", pady=(8, 0))
        ttk.Button(install_frame, text="Instalar MT5", command=self.guided_mt5_install).grid(row=1, column=2, sticky="w", pady=(8, 0))
        install_frame.columnconfigure(1, weight=1)

        pending_frame = ttk.LabelFrame(self.root, text="Cuentas pendientes de vincular", padding=12)
        pending_frame.pack(fill="x", padx=16, pady=(0, 12))
        self.pending_tree = ttk.Treeview(pending_frame, columns=("alias", "created_at"), show="headings", height=5)
        self.pending_tree.heading("alias", text="Alias")
        self.pending_tree.heading("created_at", text="Creada")
        self.pending_tree.column("alias", width=280, anchor="w")
        self.pending_tree.column("created_at", width=180, anchor="w")
        self.pending_tree.grid(row=0, column=0, columnspan=3, sticky="nsew")
        ttk.Button(pending_frame, text="Actualizar pendientes", command=self.refresh_pending_accounts).grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Button(pending_frame, text="Vincular", command=self.bind_selected_pending_account).grid(row=1, column=1, sticky="w", pady=(8, 0), padx=(8, 0))
        ttk.Label(pending_frame, text="El campo manual de connection_key sigue disponible como fallback.").grid(row=1, column=2, sticky="e", pady=(8, 0))
        pending_frame.columnconfigure(0, weight=1)

        actions = ttk.Frame(self.root, padding=(16, 0))
        actions.pack(fill="x")
        ttk.Button(actions, text="Arrancar servicio local", command=self.start_service).pack(side="left")
        ttk.Button(actions, text="Detener servicio local", command=self.stop_service).pack(side="left", padx=(8, 0))
        ttk.Button(actions, text="Probar conexión", command=self.test_connection).pack(side="left", padx=(8, 0))
        ttk.Button(actions, text="Ver logs", command=self.show_logs).pack(side="left", padx=(8, 0))

        self.log_box = tk.Text(self.root, height=16, wrap="word")
        self.log_box.pack(fill="both", expand=True, padx=16, pady=16)
        self.log_box.insert("1.0", read_recent_logs())
        self.log_box.configure(state="disabled")

    def _status_row(self, parent: ttk.Widget, row: int, label: str, value_var: tk.StringVar) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", pady=2)
        ttk.Label(parent, textvariable=value_var).grid(row=row, column=1, sticky="w", pady=2, padx=(12, 0))

    def save_launcher_config(self) -> None:
        self.config.connection_key = self.connection_key.get().strip()
        save_config(self.config.ensure_runtime_values())
        messagebox.showinfo("KMFX Launcher", "Cuenta vinculada. El preset y los requests usarán este connection_key.")

    def refresh_pending_accounts(self) -> None:
        response = self.backend.get_pending_accounts()
        self.pending_tree.delete(*self.pending_tree.get_children())
        self.pending_accounts = response.body.get("accounts", []) if response.ok else []
        for account in self.pending_accounts:
            self.pending_tree.insert("", "end", iid=account.get("account_id", ""), values=(account.get("alias", "—"), account.get("created_at", "")))

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
        else:
            self.selected_installation_label.set("")
            self.mt5_status.set("No detectado")
            self.connector_status.set("No instalado")

    def selected_installation(self) -> MT5Installation | None:
        label = self.selected_installation_label.get().strip()
        return next((installation for installation in self.installations if installation.label == label), None)

    def start_service(self) -> None:
        if self.service_process and self.service_process.poll() is None:
            return
        self.save_launcher_config()
        self.service_process = subprocess.Popen([sys.executable, "-m", "launcher.service"], cwd=str(Path(__file__).resolve().parent.parent))
        self.logger.info("[KMFX][LAUNCHER] service process started pid=%s", self.service_process.pid if self.service_process else "")
        self.service_status.set("STARTING")

    def stop_service(self) -> None:
        if self.service_process and self.service_process.poll() is None:
            self.service_process.terminate()
            self.logger.info("[KMFX][LAUNCHER] service process terminated")
        self.service_status.set("OFF")

    def service_url(self, path: str) -> str:
        return f"http://{self.config.local_host}:{self.config.local_port}{path}"

    def fetch_json(self, path: str) -> dict[str, object] | None:
        try:
            with urlopen(self.service_url(path), timeout=2) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            return None

    def refresh_status(self) -> None:
        status = self.fetch_json("/status")
        if status:
            self.service_status.set("ON")
            self.backend_status.set("Reachable" if status.get("backend_reachable") else "Unreachable")
            last_sync = status.get("last_sync") or {}
            if isinstance(last_sync, dict) and last_sync:
                self.account_status.set(f"{last_sync.get('identity_key','')} · {last_sync.get('status','')}")
            else:
                self.account_status.set("Sin sincronización")
        else:
            self.service_status.set("OFF")
            self.backend_status.set("Unknown")
        self.refresh_pending_accounts()
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
        result = install_connector(installation, self.config)
        self.connector_status.set("Instalado")
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


def main() -> None:
    LauncherApp().run()


if __name__ == "__main__":
    main()
