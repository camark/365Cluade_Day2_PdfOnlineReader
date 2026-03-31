# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a client-side PDF reader application that reads PDF files aloud using text-to-speech (TTS). It's a pure frontend application with no backend dependencies.

## Development

### Running the Application

```bash
# Start a local HTTP server (any of these)
python -m http.server 8000
# Then open http://localhost:8000 in a browser

# Or directly open index.html in a browser (some features may be limited)
```

## Architecture

### Core Components

**index.html** - Main HTML structure with:
- File upload/drop zone for PDF selection
- Controls section (voice selection, rate, pitch)
- Playback buttons (play/pause/stop)
- Progress bar and text preview area

**app.js** - Single-file JavaScript application using a class-based architecture:

`PDFReader` class handles:
- PDF processing via PDF.js library
- Text extraction and sentence segmentation
- Web Speech API for TTS playback
- Playback state management (playing, paused, stopped)

Key methods:
- `processPDF()` - Loads PDF and extracts all text pages
- `splitIntoSentences()` - Segments text into readable sentences (handles Chinese/English punctuation)
- `speakNextSentence()` - Recursive TTS playback with progress tracking
- `play()/pause()/stop()` - Playback control

**style.css** - Gradient purple theme with responsive design

### External Dependencies

- **PDF.js** (CDN) - Mozilla's library for PDF parsing and text extraction
- **Web Speech API** - Browser native API for text-to-speech

### Data Flow

1. User uploads PDF → `processPDF()` reads file
2. PDF.js extracts text page by page → `splitIntoSentences()` segments text
3. Sentences stored in array → `speakNextSentence()` plays one at a time
4. Each sentence's `onend` triggers the next sentence automatically

### Browser Compatibility

Requires browser support for:
- Web Speech API (`window.speechSynthesis`)
- ES6+ (class syntax, async/await)
- File API
