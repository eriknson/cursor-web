#!/usr/bin/env node

if (process.platform !== 'darwin') {
  console.error('DMG packaging is only supported on macOS. Aborting.');
  process.exit(1);
}
