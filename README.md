# Journaline Reader UI

React + TypeScript + Vite demo that reads Journaline XML and renders it with a fixed UI theme.

## Features
- Loads `root.xml`, `FullJournaline_Example.xml`, and `SimpleJournaline_Example.xml`
- Parses Journaline menus, messages, lists, references, links, images, geo metadata
- Keeps the UI layout fixed while XML content changes
- Adds per-page audio playback with Play/Pause, Mute, seek, and volume controls
- Matches audio files by `idString`, `objectID`, or page title slug

## Run
```bash
npm install
npm run dev
```

## Audio mapping
Audio files are configured in `public/audio/audio-map.json`.

Example keys:
- `root.xml::hot_news`
- `weather_today`
- `title:unicode-example`

The app looks for matches in this order:
1. `<source-file>::<idString>`
2. `<source-file>::objectID:<value>`
3. `<source-file>::title:<slug>`
4. `<idString>`
5. `objectID:<value>`
6. `title:<slug>`
7. `<source-file>`

## Included demo assets
- `public/data/root.xml`
- `public/data/FullJournaline_Example.xml`
- `public/data/SimpleJournaline_Example.xml`
- `public/data/Journaline.xsd`
- `public/audio/*.wav`
- `public/audio/audio-map.json`
