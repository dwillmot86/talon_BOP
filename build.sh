#!/bin/sh
# Builds the two published copies of the game from src/:
#   index.html       page fragment published as the Claude artifact (it adds its own page wrapper)
#   docs/index.html  complete web page served by GitHub Pages
set -e
cd "$(dirname "$0")"
{ cat src/head.html; echo '<script type="module">'; cat src/game.js; echo '</script>'; } > index.html
{
  echo '<!doctype html>'
  echo '<html lang="en">'
  echo '<head>'
  echo '<meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  sed -n '1,/<\/style>/p' index.html
  echo '</head>'
  echo '<body>'
  sed '1,/<\/style>/d' index.html
  echo '</body>'
  echo '</html>'
} > docs/index.html
touch docs/.nojekyll
