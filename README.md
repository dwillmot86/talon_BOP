# Talon: Birds of Prey

A browser-based 3D bird-of-prey RPG. Play as a peregrine falcon in a British valley: ride thermals, stoop on wood pigeons and teal, feed your chicks, land, walk, drink and sleep, and survive golden eagles, mobbing crows and foxes.

## Files

- `src/head.html`: page styles and HUD markup
- `src/game.js`: all game code (Three.js)
- `index.html`: the two above joined together. This is the file that gets published.

To rebuild `index.html` after editing:

```sh
{ cat src/head.html; echo '<script type="module">'; cat src/game.js; echo '</script>'; } > index.html
```

`index.html` is a page fragment, without its own `<html>`, `<head>` or `<body>` tags. It's published as a Claude artifact, which wraps it in a full page. To play it locally, put it inside a minimal HTML page and serve that page over HTTP. Three.js loads from the jsDelivr CDN.

## Controls

- **Keyboard:** A/D to turn, W/S to climb/dive, Space to flap or take off, Shift to stoop, E to eat, drink or sleep, Z to sleep, V to change camera, Esc to pause and save.
- **Touch:** a joystick to steer or walk, plus FLAP, DIVE, ACT and VIEW buttons.
- **Gamepad:** supported.
