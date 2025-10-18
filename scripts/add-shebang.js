#!/usr/bin/env node
/**
 * Post-build script to add shebang to the CLI file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cliPath = path.join(__dirname, '../dist/cli.js');

// Check if file exists
if (!fs.existsSync(cliPath)) {
  console.error('Error: dist/cli.js not found. Please run build first.');
  process.exit(1);
}

// Read the file
let content = fs.readFileSync(cliPath, 'utf-8');

// Check if shebang already exists
if (!content.startsWith('#!/usr/bin/env node')) {
  // Add shebang at the beginning
  content = '#!/usr/bin/env node\n' + content;

  // Write back
  fs.writeFileSync(cliPath, content);

  // Make executable
  fs.chmodSync(cliPath, 0o755);

  console.log('✅ Shebang added to dist/cli.js');
} else {
  console.log('✅ Shebang already present in dist/cli.js');
}

// Ensure executable
fs.chmodSync(cliPath, 0o755);