import fs from 'node:fs';
import path from 'node:path';

const localesDir = new URL('../src/i18n/locales/', import.meta.url);
const baseline = 'en';

/**
 * Namespaces whose per-locale coverage is intentionally partial. Translations
 * come from the upstream Stardroid bundles, which ship different subsets of
 * celestial-object names per language. Our locale loader deep-merges each
 * locale over the English baseline, so we only validate that non-`en` locales
 * never add *extra* keys that English doesn't know about.
 */
const SPARSE_NAMESPACES = new Set(['celestial.json']);

function listJsonFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));
}

function flattenJson(value, prefix = '', out = new Map()) {
  if (Array.isArray(value)) {
    out.set(prefix || '(root)', 'array');
    value.forEach((item, index) => {
      const next = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenJson(item, next, out);
    });
    return out;
  }

  if (value && typeof value === 'object') {
    if (prefix) out.set(prefix, 'object');
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenJson(child, next, out);
    }
    return out;
  }

  out.set(prefix || '(root)', value === null ? 'null' : typeof value);
  return out;
}

function compareNamespace(refJson, targetJson, fileName) {
  const issues = [];
  const refMap = flattenJson(refJson);
  const targetMap = flattenJson(targetJson);
  const sparse = SPARSE_NAMESPACES.has(fileName);

  for (const [key, type] of refMap) {
    if (!targetMap.has(key)) {
      if (sparse) continue;
      issues.push(`${fileName}: missing ${key}`);
      continue;
    }
    const targetType = targetMap.get(key);
    if (targetType !== type) {
      issues.push(`${fileName}: type mismatch ${key} (${targetType} != ${type})`);
    }
  }

  for (const key of targetMap.keys()) {
    if (!refMap.has(key)) issues.push(`${fileName}: extra ${key}`);
  }

  return issues;
}

const localeDirs = fs
  .readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const baselineDir = path.join(localesDir.pathname, baseline);
const baselineFiles = listJsonFiles(baselineDir);
const baselineJson = new Map(
  baselineFiles.map((fileName) => [
    fileName,
    JSON.parse(fs.readFileSync(path.join(baselineDir, fileName), 'utf8')),
  ]),
);

const allIssues = [];

for (const locale of localeDirs) {
  const localeDir = path.join(localesDir.pathname, locale);
  const localeFiles = new Set(listJsonFiles(localeDir));

  for (const fileName of baselineFiles) {
    if (!localeFiles.has(fileName)) {
      allIssues.push(`${locale}: missing file ${fileName}`);
      continue;
    }

    const localeJson = JSON.parse(fs.readFileSync(path.join(localeDir, fileName), 'utf8'));
    const issues = compareNamespace(baselineJson.get(fileName), localeJson, fileName);
    for (const issue of issues) allIssues.push(`${locale}: ${issue}`);
  }

  for (const fileName of localeFiles) {
    if (!baselineJson.has(fileName)) allIssues.push(`${locale}: extra file ${fileName}`);
  }
}

if (allIssues.length > 0) {
  console.error(`i18n validation failed with ${allIssues.length} issue(s):`);
  for (const issue of allIssues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `i18n validation passed for ${localeDirs.length} locale(s) across ${baselineFiles.length} namespace file(s).`,
);
