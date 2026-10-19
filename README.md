# Talon: Birds of Prey

A browser-based 3D bird-of-prey RPG. Each bird has its own flying style, special skill, home nest, favourite prey and quests.

## Worlds

- **British Valley:** peregrine falcon, golden eagle, barn owl, osprey, red kite and sparrowhawk.
- **Rainforest** (unlocks at level 3): harpy eagle and bat falcon. Macaws, toucans, parakeets, monkeys, sloths, and bats at night. It also has a jungle temple, a tepui with a waterfall, and jaguars.
- **Arctic Tundra** (unlocks at level 4): snowy owl and gyrfalcon. Ptarmigan, lemmings, arctic hares, snow geese, caribou herds, arctic foxes and the northern lights.

Every world has landmarks to discover and challenges to complete (see the journal in the pause menu). Saves remember their world. To open a world directly, add `#world-rainforest` or `#world-arctic` to the address.

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

- GitHub Pages: https://turchillytundra.github.io/talon_BOP/
- Locally: open `docs/index.html` in a browser. It needs an internet connection to load Three.js and the fonts.

## Controls

- **Keyboard:** Q for your bird's special skill, A/D to turn, W/S to climb/dive, Space to flap or take off, Shift to stoop, B to brake, E to eat, drink or sleep, Z to sleep, V to change camera, Esc to pause and save. Drag with the mouse (or use the right stick or d-pad) to look around.
- **Touch:** a joystick to steer or walk, plus FLAP, DIVE, BRAKE, SKILL, ACT and VIEW buttons. Drag on the right of the screen to look around.
- **Gamepad:** supported.
