/**
 * Copy the freshly compiled BSP from tmp/ to Quake's "maps" directory so
 * ironwail can load it.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_DESTINATION = 'D:\\quake\\uplifter\\maps';

async function deployBsp(sourcePath, destDir = DEFAULT_DESTINATION) {
  const stat = await fs.stat(sourcePath);
  if (!stat.isFile()) {
    throw new Error(`Source BSP is not a regular file: ${sourcePath}`);
  }
  await fs.mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, path.basename(sourcePath));
  await fs.copyFile(sourcePath, destPath);
  return { path: destPath, bytes: stat.size };
}

module.exports = { deployBsp, DEFAULT_DESTINATION };
