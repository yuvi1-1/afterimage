#!/bin/bash
# Run once after unzipping: clears the download quarantine and ad-hoc signs the unsigned build.
cd "$(dirname "$0")"
APP="Afterimage.app"
[ -d "$APP" ] || APP="$HOME/Downloads/Afterimage.app"
xattr -cr "$APP" && codesign --force --deep -s - "$APP" 2>/dev/null
open "$APP"
