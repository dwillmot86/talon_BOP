# Talon: Birds of Prey

A browser-based 3D bird-of-prey RPG. Each bird has its own flying style, special skill, home nest, favourite prey and quests.

## Worlds

- **British Valley:** peregrine falcon, golden eagle, barn owl, osprey, red kite and sparrowhawk.
- **Rainforest** (unlocks at level 3): harpy eagle, bat falcon, spectacled owl and king vulture. Macaws, toucans, parakeets, monkeys, sloths, and bats at night. It also has a jungle temple, a tepui with a waterfall, and jaguars.
- **Arctic Tundra** (unlocks at level 4): snowy owl, gyrfalcon, rough-legged buzzard and white-tailed eagle. Ptarmigan, lemmings, arctic hares, snow geese, caribou herds, arctic foxes and the northern lights.

- **Fruit eaters:** not every bird is a bird of prey. The jay and waxwing (valley), toucan and scarlet macaw (rainforest) and raven and rock ptarmigan (Arctic) live on rowan berries, wild figs and crowberries. Fly slowly into a fruiting tree, or land next to the berries, to pick them. Watch out for the eagles and foxes!
- **Open world** (level 10): play any bird in any world, and fly off the north or south edge of the map to migrate. The Arctic is north of the valley, the Rainforest south.

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

- **Keyboard:** Q for your bird's special skill, A/D to turn, W/S to climb/dive, Space to flap or take off, Shift to stoop, B to brake, X to drop what you're carrying, E to eat, drink or sleep, Z to sleep, V to change camera, Esc to pause and save. Drag with the mouse (or use the right stick or d-pad) to look around.
- **Touch:** a joystick to steer or walk, plus FLAP, DIVE, BRAKE, SKILL, ACT, DROP and VIEW buttons. Drag on the right of the screen to look around.
- **Gamepad:** supported.
- **Aim assist** can be switched off in the pause menu.
