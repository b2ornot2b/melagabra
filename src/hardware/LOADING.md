# Loading `melagabra.littlefoot` onto a ROLI Lightpad Block

The Block runs a Littlefoot interpreter in firmware. Programs are loaded over USB using ROLI's proprietary BLOCKS protocol. **The Melagabra web app cannot do this** — Web MIDI does not expose the loader. You need a desktop tool. Three paths:

## 1. ROLI Dashboard (recommended, macOS / Windows)

Dashboard is the original ROLI tool and the simplest path. It is no longer maintained (ROLI entered administration in 2021), but the last released build still works on current macOS and Windows.

1. Install Dashboard. The most reliable source is the legacy installer bundled inside Equator 2 from Roli's archive.
2. Connect the Lightpad Block via USB-C. Wait for Dashboard to enumerate it (left rail).
3. Open the **Apps** tab. Click the `+` to load a custom app, or open the built-in editor.
4. Paste the contents of `melagabra.littlefoot`, or use *File → Open* to point at it directly.
5. Click **Load onto Block**. Dashboard compiles the script and pushes it over USB. The Block reboots into the new program in a few seconds.
6. The program stays in the Block's flash and survives unplug/reboot until you load a different app.

The `<metadata>` header at the top of `melagabra.littlefoot` is what Dashboard reads to display the program name and target. Without that header it will not be enumerated.

## 2. JUCE BlocksMonitor (cross-platform, including Linux)

ROLI open-sourced the BLOCKS host code inside the JUCE framework. The `BlocksMonitor` example is a small C++ app that uses `juce_blocks_basics` to enumerate connected Blocks and load programs.

1. Clone JUCE from `https://github.com/juce-framework/JUCE`.
2. Open `JUCE/examples/BLOCKS/BlocksMonitor/BlocksMonitor.jucer` in Projucer, generate the project for your toolchain, build.
3. Run the binary. With the Block plugged in, click **Load Program**, point at `melagabra.littlefoot`. Or, in code, call:

   ```cpp
   auto script = juce::String::fromUTF8 (..., size);
   block->setProgram (std::make_unique<juce::LittleFootProgram> (script));
   ```

4. This is the path to use from Linux (Dashboard never had a Linux build) or for any custom CLI workflow.

## 3. Roli Studio / Roli Connect (not recommended)

The current Roli software (Studio Player, Connect, Equator 2) generally targets the Seaboard and doesn't expose custom Littlefoot loading reliably. Some versions can; the surface keeps moving. Use Dashboard or the JUCE path for predictability.

## What gets transferred

The `.littlefoot` script is **plain text**. The loader compiles it to Littlefoot bytecode on the host (in Dashboard or JUCE), then sends bytecode + the metadata block to the Block. The Block's runtime executes the bytecode and persists the program in its flash. There is no separate firmware step; you are not flashing firmware, just installing a userspace program inside the firmware's interpreter.

## Verifying the load

After loading, the Block will:

- Render the active raga vector immediately (defaulting to mela 15 / Mayamalavagowla on first install — `0xCB9`).
- Send a `0xF0 7D 4D 12 01 00 0xF7` HELLO SysEx the moment the Web app's `RoliBlock.connect()` opens its input port.

Open the Melagabra web app, enter Perform mode (`~`), pick **ROLI Lightpad (hardware)** in the instrument dropdown, click **Connect**, and the on-screen 15×15 preview will mirror the Block's actual LED state in real time.

## Troubleshooting

- **Dashboard says "Block not found"**: Try a different USB cable (the C-to-C cable shipped with some Blocks is power-only). On macOS, Big Sur and later may require granting Dashboard MIDI access in *Settings → Privacy & Security*.
- **Program loads but LEDs stay dark**: The Block lost its local config. The script will repopulate from defaults on first boot — pull power and reconnect.
- **Web app says "Lightpad Block not found among MIDI ports"**: Browser hasn't been granted SysEx permission. Reload the page, click the audio gate, and re-grant when the prompt appears. Chrome/Edge have the most reliable Web MIDI; Firefox needs `dom.webmidi.enabled` plus an extension.
