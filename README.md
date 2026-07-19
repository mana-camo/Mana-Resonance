# Mana Resonance

Mana Resonance is a high-performance desktop real-time music and multi-band audio analyzer built with Electron and Web Audio API. It features precise vocal pitch detection, beat-synchronized pulses, chord/key estimation, and automated silent updates.

---

## Key Features

- **High-Precision Vocal Pitch Tracker**: Detects and scrolls vocal pitch (F0) using autocorrelation and parabolic interpolation with sub-Hz accuracy. Includes a HIGH CONF mode to filter out background noise.
- **3-Band Synchronized Beat Pulse System**: Splits incoming audio into Low, Mid, and High bands to detect kick/snare transients via Adaptive Thresholding, generating beautiful synchronized pulse animations.
- **Heatmap-Style Log-Hz Spectrum**: Visualizes audio frequencies on a logarithmic scale with a dynamic thermal gradient color mapping based on energy levels.
- **Real-Time Key & Chord Estimation**: Automatically calculates chromagram vectors and matches them to 24 major/minor chord templates, displaying current chord and key in real-time.
- **Vibrato Radar Chart**: Plots the rate (Hz) and depth (cents) of detected vocal vibrato onto a 2D radar interface.
- **High-Quality Audio Recorder**: Record system audio on the fly and export it directly to your local drive as a high-quality WebM file.
- **Smart Mute Toggle**: Analyze drag-and-dropped audio files silently through speakers while visualizers continue computing at full volume.
- **Automatic Silent Updates (Windows)**: Background update checking downloads updates and applies them silently on application restart without asking for folders.

---

## Installation & Requirements

### Windows
- Run the compiled `ManaResonanceSetup.exe`.
- Standard installation will default to `C:\Program Files\Mana Resonance`.

### macOS
1. Install **Node.js** (LTS version recommended).
2. Clone the repository and navigate to the project folder:
   ```bash
   npm install
   npm run build-mac
   ```
3. Copy the compiled `Mana Resonance.app` from `dist/Mana Resonance-darwin-x64/` to your `/Applications` directory.
4. **First-time launch**: Right-click (or Control-click) `Mana Resonance.app` and choose **Open** to bypass the "Unidentified Developer" warning.
5. **System Audio Setup**: Install a virtual audio device such as **BlackHole 2ch**. Create a **Multi-Output Device** in macOS Audio MIDI Setup containing both your headphones and BlackHole, and set it as your system audio output.

---

## Development & Building

To run the application locally in development mode:
```bash
npm install
npm start
```

### Build Commands
- **Windows Portable**: `npm run build`
- **Windows Setup**: `npm run build-installer`
- **macOS Portable**: `npm run build-mac`

---

## License

This project is licensed under the ISC License.
