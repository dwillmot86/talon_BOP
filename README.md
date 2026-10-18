# Talon: Birds of Prey

A browser-based 3D bird-of-prey RPG set in a British valley. Play as a peregrine falcon, golden eagle, barn owl, osprey, red kite or sparrowhawk, each with its own flying style, special skill, home nest, favourite prey and quests.

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

- **Keyboard:** Q for your bird's special skill, A/D to turn, W/S to climb/dive, Space to flap or take off, Shift to stoop, E to eat, drink or sleep, Z to sleep, V to change camera, Esc to pause and save.
- **Touch:** a joystick to steer or walk, plus FLAP, DIVE, SKILL, ACT and VIEW buttons.
- **Gamepad:** supported.
