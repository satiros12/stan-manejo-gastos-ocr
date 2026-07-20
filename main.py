#!/usr/bin/env python3
"""
TV Launcher — App nativa para controlar tu TV con mando
Python + Pygame | Instalable con PyInstaller
"""
import pygame
import json
import os
import sys
import subprocess
import webbrowser
import math
from pathlib import Path

# ─── Constants ────────────────────────────────────────────────────
APP_NAME = "TV Launcher"
VERSION = "1.0.0"
FPS = 30
BG_COLOR = (10, 10, 15)
CARD_BG = (20, 20, 31)
TEXT_COLOR = (232, 232, 240)
TEXT_DIM = (107, 107, 138)
ACCENT = (15, 138, 95)
ACCENT_GLOW = (15, 138, 95, 100)
BORDER_COLOR = (42, 42, 58)
FOCUS_GLOW = (15, 138, 95, 60)

# Exit button positions
BTN_A = 0
BTN_B = 1
BTN_X = 2
BTN_Y = 3
BTN_LB = 4
BTN_RB = 5
BTN_BACK = 6
BTN_START = 7
BTN_L3 = 9
BTN_R3 = 10
DPAD_UP = 11
DPAD_DOWN = 12
DPAD_LEFT = 13
DPAD_RIGHT = 14
BTN_GUIDE = 15

# ─── Load apps config ─────────────────────────────────────────────
def load_apps():
    base = Path(getattr(sys, '_MEIPASS', Path.cwd()))
    path = base / "apps.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def parse_hex(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

# ─── Launch functions (Windows) ───────────────────────────────────
def launch_app(app):
    if sys.platform == "win32":
        os.startfile(app["url"])
    else:
        import webbrowser
        if app.get("type") == "app":
            subprocess.Popen([app["url"]], shell=True)
        else:
            webbrowser.open(app["url"])

# ─── Application ──────────────────────────────────────────────────
class TVLauncher:
    def __init__(self):
        pygame.init()
        pygame.mixer.quit()  # No audio needed
        self.apps = load_apps()
        self.info = pygame.display.Info()
        self.W, self.H = self.info.current_w, self.info.current_h

        # Fullscreen
        self.screen = pygame.display.set_mode(
            (self.W, self.H), pygame.FULLSCREEN | pygame.NOFRAME
        )
        pygame.display.set_caption(APP_NAME)
        self.clock = pygame.time.Clock()
        self.running = True

        # Layout calculations
        self.cols = max(3, self.W // 180)
        self.rows = max(2, self.H // 200)
        self.tile_w = min(170, (self.W - 80) // self.cols)
        self.tile_h = min(160, (self.H - 160) // self.rows)
        self.grid_start_x = (self.W - (self.tile_w + 16) * self.cols + 16) // 2
        self.grid_start_y = 100  # below header

        # Focus
        self.focus = 0
        self.focus_anim = 0.0
        self.available_fonts = pygame.font.get_fonts()
        self.font_large = pygame.font.Font(None, int(self.tile_h * 0.35))
        self.font_title = pygame.font.Font(None, int(self.tile_h * 0.16))
        self.font_desc = pygame.font.Font(None, int(self.tile_h * 0.12))
        self.font_hint = pygame.font.Font(None, 18)

        # Controller
        self.joystick = None
        self.last_hat = (0, 0)
        self.last_axis_l = (0, 0)
        self.button_cooldown = 0

        # State
        self.toast_msg = ""
        self.toast_timer = 0
        self.exit_confirm = False
        self.launch_anim = 0.0
        self.launching = False

        # Load controller on start
        pygame.joystick.init()
        self.init_joystick()

    def init_joystick(self):
        if pygame.joystick.get_count() > 0:
            try:
                self.joystick = pygame.joystick.Joystick(0)
                self.joystick.init()
            except:
                self.joystick = None

    def get_layout(self):
        return min(self.cols, len(self.apps))

    def draw_tile(self, idx, focused=False):
        app = self.apps[idx]
        col = idx % self.cols
        row = idx // self.cols
        x = self.grid_start_x + col * (self.tile_w + 16)
        y = self.grid_start_y + row * (self.tile_h + 16)

        # Glow for focused
        if focused:
            glow_radius = 15
            for g in range(glow_radius, 0, -2):
                alpha = max(0, 60 - g * 4)
                glow = pygame.Surface((self.tile_w + g*2, self.tile_h + g*2), pygame.SRCALPHA)
                pygame.draw.rect(glow, (*ACCENT, alpha),
                                 (0, 0, self.tile_w + g*2, self.tile_h + g*2),
                                 border_radius=18)
                self.screen.blit(glow, (x - g, y - g))

        # Card
        pygame.draw.rect(self.screen, CARD_BG, (x, y, self.tile_w, self.tile_h),
                         border_radius=14)

        if focused:
            pygame.draw.rect(self.screen, ACCENT, (x, y, self.tile_w, self.tile_h),
                             width=3, border_radius=14)
        else:
            pygame.draw.rect(self.screen, BORDER_COLOR, (x, y, self.tile_w, self.tile_h),
                             width=2, border_radius=14)

        # Icon (emoji as text)
        icon_surf = self.font_large.render(app["icon"], True, TEXT_COLOR)
        icon_rect = icon_surf.get_rect(center=(x + self.tile_w//2, y + self.tile_h//2 - 12))
        self.screen.blit(icon_surf, icon_rect)

        # Name
        name_surf = self.font_title.render(app["name"], True, TEXT_COLOR)
        name_rect = name_surf.get_rect(center=(x + self.tile_w//2, y + self.tile_h - 38))
        self.screen.blit(name_surf, name_rect)

        # Description
        desc_surf = self.font_desc.render(app.get("desc", ""), True, TEXT_DIM)
        desc_rect = desc_surf.get_rect(center=(x + self.tile_w//2, y + self.tile_h - 18))
        self.screen.blit(desc_surf, desc_rect)

    def draw_header(self):
        # Title
        title_font = pygame.font.Font(None, 32)
        title = title_font.render(f"🎮 {APP_NAME}", True, TEXT_COLOR)
        self.screen.blit(title, (30, 25))

        # Controller status
        status_font = pygame.font.Font(None, 16)
        if self.joystick and self.joystick.get_init():
            status = f"🎮 Conectado |   Navega |   A Abrir |   B Atrás"
        else:
            status = "⌨️ Teclado |  ← → ↑ ↓ Navega | Enter Abre | Esc Salir"

        # Controls hints
        hints_parts = []
        if self.joystick and self.joystick.get_init():
            hints_parts = ["🎮 Mando conectado", "DPAD Navegar", "A Abrir", "B Volver", "START Cerrar"]
        else:
            hints_parts = ["⌨️ Teclado", "Flechas Navegar", "Enter Abrir", "ESC Cerrar"]

        hint_font = pygame.font.Font(None, 16)
        x_pos = self.W - 30
        for part in reversed(hints_parts):
            surf = hint_font.render(part, True, TEXT_DIM)
            rect = surf.get_rect(right=x_pos, centery=30)
            self.screen.blit(surf, rect)
            x_pos = rect.left - 16

        # Separator line
        pygame.draw.line(self.screen, BORDER_COLOR, (20, 65), (self.W - 20, 65), 1)

    def draw_toast(self):
        if self.toast_timer > 0:
            alpha = min(255, int(255 * self.toast_timer / 0.5)) if self.toast_timer < 0.5 else 255
            surf = pygame.Surface((self.W, 60), pygame.SRCALPHA)
            surf.fill((*BG_COLOR, alpha))
            font = pygame.font.Font(None, 28)
            text = font.render(self.toast_msg, True, TEXT_COLOR)
            text_rect = text.get_rect(center=(self.W//2, 30))
            self.screen.blit(text, text_rect)

    def show_toast(self, msg, duration=2.0):
        self.toast_msg = msg
        self.toast_timer = duration

    # ─── Navigation ────────────────────────────────────────────
    def move_focus(self, dx, dy):
        cols = self.get_layout()
        row = self.focus // cols
        col = self.focus % cols
        total = len(self.apps)

        if dy != 0:
            ni = self.focus + dy * cols
            if 0 <= ni < total:
                self.focus = ni
        if dx != 0:
            ni = self.focus + dx
            if 0 <= ni < total and ni // cols == self.focus // cols:
                self.focus = ni

    def do_launch(self):
        if 0 <= self.focus < len(self.apps):
            app = self.apps[self.focus]
            self.show_toast(f"▶️ Abriendo {app['name']}…", 1.5)
            try:
                launch_app(app)
            except Exception as e:
                self.show_toast(f"Error: {e}", 2.0)

    # ─── Event handling ────────────────────────────────────────
    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False

            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if self.exit_confirm:
                        self.running = False
                    else:
                        self.exit_confirm = True
                        self.show_toast("Presiona ESC nuevamente para salir", 3.0)
                elif event.key == pygame.K_UP:
                    self.move_focus(0, -1)
                elif event.key == pygame.K_DOWN:
                    self.move_focus(0, 1)
                elif event.key == pygame.K_LEFT:
                    self.move_focus(-1, 0)
                elif event.key == pygame.K_RIGHT:
                    self.move_focus(1, 0)
                elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                    self.do_launch()
                elif event.key == pygame.K_BACKSPACE or event.key == pygame.K_DELETE:
                    if self.exit_confirm:
                        self.exit_confirm = False
                        self.show_toast("Cancelado", 1.0)

            if event.type == pygame.JOYDEVICEADDED:
                self.init_joystick()

            if event.type == pygame.JOYDEVICEREMOVED:
                self.joystick = None

        # Gamepad polling
        if self.joystick and self.joystick.get_init():
            self.poll_joystick()

        # Cooldown for button repeat
        if self.button_cooldown > 0:
            self.button_cooldown -= 1

        # Toast timer
        if self.toast_timer > 0:
            self.toast_timer -= 1.0 / FPS
            if self.toast_timer <= 0:
                self.toast_timer = 0
                self.exit_confirm = False

    def poll_joystick(self):
        if self.button_cooldown > 0:
            return

        # D-pad hat
        hat = self.joystick.get_hat(0) if self.joystick.get_numhats() > 0 else (0, 0)
        if hat != self.last_hat:
            self.last_hat = hat
            if hat[1] == 1:
                self.move_focus(0, -1); self.button_cooldown = 8
            elif hat[1] == -1:
                self.move_focus(0, 1); self.button_cooldown = 8
            if hat[0] == -1:
                self.move_focus(-1, 0); self.button_cooldown = 8
            elif hat[0] == 1:
                self.move_focus(1, 0); self.button_cooldown = 8

        # Analog sticks
        axis_dead = 0.5
        if self.joystick.get_numaxes() >= 2:
            lx = self.joystick.get_axis(0)
            ly = self.joystick.get_axis(1)

            # Only on first crossing of deadzone
            new_lx = lx if abs(lx) > axis_dead else 0
            new_ly = ly if abs(ly) > axis_dead else 0

            if (new_lx, new_ly) != self.last_axis_l:
                self.last_axis_l = (new_lx, new_ly)
                if new_ly == -1:
                    self.move_focus(0, -1); self.button_cooldown = 12
                elif new_ly == 1:
                    self.move_focus(0, 1); self.button_cooldown = 12
                if new_lx == -1:
                    self.move_focus(-1, 0); self.button_cooldown = 12
                elif new_lx == 1:
                    self.move_focus(1, 0); self.button_cooldown = 12

        # Buttons
        try:
            if self.joystick.get_button(BTN_A):
                self.do_launch()
                self.button_cooldown = 15

            if self.joystick.get_button(BTN_B):
                if self.exit_confirm:
                    self.exit_confirm = False
                self.show_toast("Volviendo…", 1.0)
                self.button_cooldown = 15

            if self.joystick.get_button(BTN_START):
                if self.exit_confirm:
                    self.running = False
                else:
                    self.exit_confirm = True
                    self.show_toast("Presiona START nuevamente para salir", 3.0)
                self.button_cooldown = 20

        except pygame.error:
            pass

    # ─── No controller overlay ─────────────────────────────────
    def draw_no_controller(self):
        if self.joystick and self.joystick.get_init():
            return

        overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
        overlay.fill((*BG_COLOR, 200))
        self.screen.blit(overlay, (0, 0))

        font_big = pygame.font.Font(None, 60)
        font_mid = pygame.font.Font(None, 28)
        font_small = pygame.font.Font(None, 18)

        # Icon
        icon = font_big.render("🎮", True, TEXT_COLOR)
        icon_rect = icon.get_rect(center=(self.W//2, self.H//2 - 60))
        self.screen.blit(icon, icon_rect)

        # Text
        title = font_mid.render("Conecta un mando", True, TEXT_COLOR)
        title_rect = title.get_rect(center=(self.W//2, self.H//2 + 10))
        self.screen.blit(title, title_rect)

        subtitle = font_small.render("Xbox / PlayStation / mando compatible", True, TEXT_DIM)
        sub_rect = subtitle.get_rect(center=(self.W//2, self.H//2 + 40))
        self.screen.blit(subtitle, sub_rect)

        # Animated dots
        t = pygame.time.get_ticks() / 1000
        for i in range(3):
            y_offset = math.sin(t * 3 + i * 2) * 8
            dot = pygame.draw.circle(self.screen, ACCENT,
                                     (self.W//2 - 15 + i * 15, self.H//2 + 80 + y_offset), 4)

    # ─── Exit confirm ──────────────────────────────────────────
    def draw_exit_confirm(self):
        if not self.exit_confirm:
            return
        overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 180))
        self.screen.blit(overlay, (0, 0))

        font = pygame.font.Font(None, 32)
        msg = font.render("¿Salir? Presiona START/ESC nuevamente", True, TEXT_COLOR)
        msg_rect = msg.get_rect(center=(self.W//2, self.H//2))
        self.screen.blit(msg, msg_rect)

        font_s = pygame.font.Font(None, 20)
        hint = font_s.render("START/ESC = Salir  |  B/BACK = Cancelar", True, TEXT_DIM)
        hint_rect = hint.get_rect(center=(self.W//2, self.H//2 + 35))
        self.screen.blit(hint, hint_rect)

    # ─── Main loop ─────────────────────────────────────────────
    def run(self):
        while self.running:
            self.handle_events()

            # Draw
            self.screen.fill(BG_COLOR)
            self.draw_header()

            # Draw tiles
            cols = self.get_layout()
            for i, app in enumerate(self.apps):
                self.draw_tile(i, focused=(i == self.focus))

            self.draw_no_controller()
            self.draw_exit_confirm()
            self.draw_toast()

            pygame.display.flip()
            self.clock.tick(FPS)

        pygame.quit()
        sys.exit(0)

# ─── Main ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    launcher = TVLauncher()
    launcher.run()
