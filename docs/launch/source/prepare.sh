#!/usr/bin/env sh
# Pulls the three demo segments the recorder scene plays out of the real walkthrough.
set -e
cd "$(dirname "$0")"
D=../../../apps/web/public/assets/demo.mp4
for seg in "a 10.5" "b 21.3" "c 33.0"; do
  set -- $seg; mkdir -p "frames/$1"
  ffmpeg -v error -y -ss "$2" -t 4.2 -i "$D" -vf fps=30 -q:v 3 "frames/$1/%03d.jpg"
done
