# Talon: Birds of Prey

A browser-based 3D bird-of-prey RPG set in a British valley. Play as a peregrine falcon, golden eagle, barn owl, osprey, red kite or sparrowhawk, each with its own flying style, special skill, home nest, favourite prey and quests.

## Files

- `src/head.html`: page styles and HUD markup
- `src/game.js`: all game code (Three.js)
- `index.html`: the two above joined together, published as the Claude artifact.
- `docs/index.html`: the same game as a complete web page, served by GitHub Pages.

To rebuild both after editing `src/`:

```sh
./build.sh
```

## Play it

- GitHub Pages: https://dwillmot86.github.io/talon_BOP/ (once Pages is switched on for this repository)
- Locally: open `docs/index.html` in a browser. It needs an internet connection to load Three.js and the fonts.

## Controls

- **Keyboard:** Q for your bird's special skill, A/D to turn, W/S to climb/dive, Space to flap or take off, Shift to stoop, E to eat, drink or sleep, Z to sleep, V to change camera, Esc to pause and save.
- **Touch:** a joystick to steer or walk, plus FLAP, DIVE, SKILL, ACT and VIEW buttons.
- **Gamepad:** supported.
