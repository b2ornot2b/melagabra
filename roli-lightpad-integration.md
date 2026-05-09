Context

You are a Principal Software Engineer and Embedded Systems Architect. We are building a sophisticated interactive React/TypeScript Progressive Web App (PWA) that visualizes the 72 Melakarta ragas of Carnatic music on a guitar fretboard.

The application includes an "Algebra Engine" that performs bitwise transformations on $F_{2}^{12}$ vectors (representing the 12 semitones) and a "Modulator" using Hamming distance to find neighboring ragas.

Objective

We need to deeply integrate a ROLI Lightpad Block into this application using WebMIDI. The Block will serve as a tactile, bidirectional hardware interface:

It will visually display the current 12-bit raga vector on its 15x15 LED grid.

It will act as an MPE (Multidimensional Polyphonic Expression) controller, where 5D touch (Press, Glide, Slide) triggers algebraic transformations (e.g., Klein-four group shifts) and authentic pitch-bends (gamakas).

Task Breakdown

Please generate the required code for both the Web (TypeScript) and Hardware (Littlefoot) layers.

1. Hardware Layer (Littlefoot Script)

Write a .littlefoot script for the ROLI Lightpad Block that does the following:

State Management: Maintains a 12-bit integer representing the active raga scale.

Incoming MIDI (handleSysEx or handleMessage): Listens for a specific custom MIDI message from the Web app containing the 12-bit vector (split across two 7-bit data bytes) and updates the internal state.

Rendering (repaint): Maps the 12-bit vector to the 15x15 LED grid. Create a layout (e.g., 12 vertical columns or a circular layout) where "active" bits are illuminated. Add a pulsing effect for specific bits if a "Vivadi" (dissonant) flag is sent.

Outgoing MIDI (handleTouch): Captures 5D touch data (X, Y, Z coordinates) and sends it out as MPE/Standard MIDI CCs so the web app can use it to trigger transformations.

2. Web Layer (React / TypeScript WebMIDI Service)

Write a WebMIDI service class or React Hook (useRoliBlock.ts) that handles the following:

Connection: Requests SysEx permissions (navigator.requestMIDIAccess({ sysex: true })) and connects to the ROLI Lightpad Block.

Data Transmission: Includes a function sendRagaState(vector12Bit: number, isVivadi: boolean) that bit-shifts the 12-bit integer into two 7-bit MIDI-safe bytes (MSB/LSB) and sends them to the Block via SysEx or CC.

Event Listening: Subscribes to incoming MIDI messages from the Block. Map incoming CCs (representing X/Y/Z touch) to a callback that the Algebra Engine can use to trigger bitwise inversions or Hamming distance modulations.

Constraints & Preferences

Ensure the TypeScript code uses strict typing for MIDI message arrays.

The Littlefoot C-code must be highly optimized in the repaint() loop, as it runs at roughly 25-30fps. Decouple the MIDI parsing from the rendering loop.

Use standard System Exclusive framing (0xF0 ... 0xF7) with a non-commercial manufacturer ID (e.g., 0x7D) for the custom protocol between the web app and the hardware.

Please output the TypeScript WebMIDI hook and the Littlefoot script in separate code blocks.
