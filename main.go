package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"image/color"
	"log"
	"os/exec"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	"github.com/hajimehoshi/ebiten/v2/text"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gomono"
	"golang.org/x/image/font/opentype"
)

//go:embed apps.json
var appsJSON []byte

type App struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Icon string `json:"icon"`
	Clr  string `json:"color"`
	Type string `json:"type"`
	URL  string `json:"url"`
	Desc string `json:"desc"`
}

var apps []App

var (
	clrBG     = rgb(0x0a, 0x0a, 0x0f)
	clrCard   = rgb(0x14, 0x14, 0x1f)
	clrText   = rgb(0xe8, 0xe8, 0xf0)
	clrDim    = rgb(0x6b, 0x6b, 0x8a)
	clrAccent = rgb(0x0f, 0x8a, 0x5f)
	clrBorder = rgb(0x2a, 0x2a, 0x3a)
)

func rgb(r, g, b uint8) color.RGBA { return color.RGBA{r, g, b, 255} }

type Game struct {
	focus      int
	titleFont  font.Face
	nameFont   font.Face
	descFont   font.Face
	hintFont   font.Face
	iconFont   font.Face
	screenW    int
	screenH    int
	tileW      int
	tileH      int
	cols       int
	startX     int
	startY     int
	exitConfirm bool
	toastMsg   string
	toastTimer int
	hasGamepad bool
}

func (g *Game) Layout(w, h int) (int, int) {
	g.screenW, g.screenH = w, h
	return w, h
}

func NewGame() *Game {
	g := &Game{}
	if err := json.Unmarshal(appsJSON, &apps); err != nil {
		log.Fatal("apps.json:", err)
	}

	tt, err := opentype.Parse(gomono.TTF)
	if err != nil {
		log.Fatal("font:", err)
	}
	g.iconFont = mustFont(tt, 46)
	g.titleFont = mustFont(tt, 14)
	g.descFont = mustFont(tt, 11)
	g.hintFont = mustFont(tt, 13)
	g.hasGamepad = ebiten.IsStandardGamepadLayoutAvailable(0)

	return g
}

func mustFont(tt *opentype.Font, size float64) font.Face {
	f, err := opentype.NewFace(tt, &opentype.FaceOptions{
		Size: size, DPI: 96, Hinting: font.HintingFull,
	})
	if err != nil {
		log.Fatal("font face:", err)
	}
	return f
}

func (g *Game) calcLayout() {
	pad := 60
	margin := 16
	g.cols = max(3, (g.screenW-pad*2)/(170+margin))
	if g.cols > len(apps) {
		g.cols = max(1, len(apps))
	}
	rows := (len(apps) + g.cols - 1) / g.cols
	g.tileW = min(170, (g.screenW-pad*2-margin*(g.cols-1))/g.cols)
	g.tileH = min(155, (g.screenH-130-margin*(rows-1))/rows)
	g.startX = pad
	g.startY = 90
}

func (g *Game) Update() error {
	// Keyboard
	if inpututil.IsKeyJustPressed(ebiten.KeyEscape) {
		if g.exitConfirm {
			return fmt.Errorf("quit")
		}
		g.exitConfirm = true
		g.showToast("Presiona ESC nuevamente para salir")
	}
	if inpututil.IsKeyJustPressed(ebiten.KeyEnter) || inpututil.IsKeyJustPressed(ebiten.KeySpace) {
		g.doLaunch()
	}
	if inpututil.IsKeyJustPressed(ebiten.KeyUp)    { g.move(0, -1) }
	if inpututil.IsKeyJustPressed(ebiten.KeyDown)  { g.move(0, 1) }
	if inpututil.IsKeyJustPressed(ebiten.KeyLeft)  { g.move(-1, 0) }
	if inpututil.IsKeyJustPressed(ebiten.KeyRight) { g.move(1, 0) }

	// Gamepad (poll all connected)
	for id := 0; id < 4; id++ {
		gid := ebiten.GamepadID(id)
		if !ebiten.IsStandardGamepadLayoutAvailable(gid) {
			continue
		}
		g.hasGamepad = true

		if inpututil.IsStandardGamepadButtonJustPressed(gid, ebiten.StandardGamepadButtonRightBottom) {
			g.doLaunch()
		}
		if inpututil.IsStandardGamepadButtonJustPressed(gid, ebiten.StandardGamepadButtonRightRight) {
			if g.exitConfirm {
				g.exitConfirm = false
			}
			g.showToast("Volviendo…", 40)
		}
		if inpututil.IsStandardGamepadButtonJustPressed(gid, ebiten.StandardGamepadButtonCenterLeft) {
			if g.exitConfirm {
				return fmt.Errorf("quit")
			}
			g.exitConfirm = true
			g.showToast("Presiona START nuevamente para salir")
		}

		// D-pad (standard gamepad uses LeftStick for D-pad in Ebitengine)
		lx := ebiten.StandardGamepadAxisValue(gid, ebiten.StandardGamepadAxisLeftStickHorizontal)
		ly := ebiten.StandardGamepadAxisValue(gid, ebiten.StandardGamepadAxisLeftStickVertical)

		if lx < -0.5 {
			g.move(-1, 0)
		} else if lx > 0.5 {
			g.move(1, 0)
		}
		if ly < -0.5 {
			g.move(0, -1)
		} else if ly > 0.5 {
			g.move(0, 1)
		}
	}

	if g.toastTimer > 0 {
		g.toastTimer--
		if g.toastTimer == 0 {
			g.exitConfirm = false
		}
	}

	g.calcLayout()
	return nil
}

func (g *Game) move(dx, dy int) {
	if g.cols == 0 { return }
	n := g.focus

	if dy != 0 {
		n = clamp(g.focus+dy*g.cols, 0, len(apps)-1)
	}
	if dx != 0 {
		n = g.focus + dx
		if n < 0 || n >= len(apps) || n/g.cols != g.focus/g.cols {
			return
		}
	}
	if n >= 0 && n < len(apps) {
		g.focus = n
	}
}

func (g *Game) doLaunch() {
	if g.focus < 0 || g.focus >= len(apps) { return }
	app := apps[g.focus]
	g.showToast("▶️ Abriendo " + app.Name + "…")
	go func() {
		if app.Type == "app" {
			exec.Command("cmd", "/c", "start", "", app.URL).Run()
		} else {
			exec.Command("cmd", "/c", "start", app.URL).Run()
		}
	}()
}

func (g *Game) showToast(msg string, frames ...int) {
	g.toastMsg = msg
	f := 90
	if len(frames) > 0 {
		f = frames[0]
	}
	g.toastTimer = f
}

func (g *Game) Draw(screen *ebiten.Image) {
	screen.Fill(clrBG)

	// Header
	text.Draw(screen, "🎮 TV Launcher", g.hintFont, 24, 30, clrText)

	// Hints
	var hints []string
	if g.hasGamepad {
		hints = []string{"🎮 Mando", "DPAD Navegar", "A Abrir", "B Volver", "START Salir"}
	} else {
		hints = []string{"⌨️ Teclado", "Flechas", "Enter Abrir", "ESC Salir"}
	}
	x := g.screenW - 20
	for i := len(hints) - 1; i >= 0; i-- {
		b := text.BoundString(g.descFont, hints[i])
		x -= b.Dx() + 12
		text.Draw(screen, hints[i], g.descFont, x, 28, clrDim)
	}

	ebitenutil.DrawLine(screen, 20, 55, float64(g.screenW)-20, 55, clrBorder)

	// Tiles
	g.calcLayout()
	for i := range apps {
		g.drawTile(screen, i)
	}

	// Toast / exit confirm
	if g.toastTimer > 0 {
		var msg string
		if g.exitConfirm {
			msg = "¿Salir? Presiona START/ESC nuevamente"
		} else {
			msg = g.toastMsg
		}
		b := text.BoundString(g.titleFont, msg)
		tx := (g.screenW - b.Dx()) / 2
		ty := g.screenH / 2 - 10
		ebitenutil.DrawRect(screen, float64(tx-20), float64(ty-15), float64(b.Dx()+40), 40,
			color.RGBA{10, 10, 15, 230})
		text.Draw(screen, msg, g.titleFont, tx, ty+6, clrText)
	}
}

func (g *Game) drawTile(screen *ebiten.Image, idx int) {
	app := apps[idx]
	c := idx % g.cols
	r := idx / g.cols
	x := g.startX + c*(g.tileW+16)
	y := g.startY + r*(g.tileH+16)
	focused := idx == g.focus

	// Glow ring for focused
	if focused {
		for i := 0; i < 6; i++ {
			sz := float64(i * 3)
			alpha := uint8(60 - i*8)
			ebitenutil.DrawRect(screen,
				float64(x)-sz, float64(y)-sz,
				float64(g.tileW)+sz*2, float64(g.tileH)+sz*2,
				color.RGBA{15, 138, 95, alpha})
		}
	}

	// Card background
	if focused {
		ebitenutil.DrawRect(screen, float64(x), float64(y), float64(g.tileW), float64(g.tileH),
			color.RGBA{30, 32, 45, 255})
	} else {
		ebitenutil.DrawRect(screen, float64(x), float64(y), float64(g.tileW), float64(g.tileH), clrCard)
	}

	// Border
	bClr := clrBorder
	if focused { bClr = clrAccent }
	th := 2
	if focused { th = 3 }
	ebitenutil.DrawRect(screen, float64(x), float64(y), float64(g.tileW), float64(th), bClr)
	ebitenutil.DrawRect(screen, float64(x), float64(y+g.tileH-th), float64(g.tileW), float64(th), bClr)

	// Icon
	ix := x + g.tileW/2 - 10
	text.Draw(screen, app.Icon, g.iconFont, ix, y+55, clrText)

	// Name
	nameText := app.Name
	if len(nameText) > 12 { nameText = nameText[:11] + "…" }
	text.Draw(screen, nameText, g.titleFont, x+10, y+g.tileH-32, clrText)

	// Description
	text.Draw(screen, app.Desc, g.descFont, x+10, y+g.tileH-14, clrDim)
}

func main() {
	ebiten.SetWindowTitle("TV Launcher")
	ebiten.SetFullscreen(true)
	ebiten.SetCursorMode(ebiten.CursorModeHidden)
	ebiten.SetWindowDecorated(false)

	game := NewGame()
	if err := ebiten.RunGameWithOptions(game, nil); err != nil && err.Error() != "quit" {
		log.Fatal(err)
	}
}

func clamp(v, lo, hi int) int {
	if v < lo { return lo }
	if v > hi { return hi }
	return v
}
func min(a, b int) int { if a < b { return a }; return b }
func max(a, b int) int { if a > b { return a }; return b }
