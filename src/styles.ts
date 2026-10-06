import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

/** CSS syntax is parsed by PostCSS; HTMLKit/Vite still compile and deliver the styles. */
export function stylesheet(css: string, file: string, rewrite: boolean): { css: string; files: readonly string[] } {
  const root = postcss.parse(css, { from: file });
  const dependencies = new Set<string>();
  const local = (value: string, imported = false): string => {
    if (/^(?:[A-Za-z][A-Za-z\d+.-]*:|\/|#)/.test(value) && !value.startsWith('file:')) return value;
    const clean = value.split(/[?#]/)[0]!;
    let target: string;
    if (value.startsWith('file:')) target = fileURLToPath(value);
    else if (imported && !value.startsWith('.')) {
      try { target = createRequire(pathToFileURL(file)).resolve(clean); }
      catch { target = resolve(dirname(file), clean); }
    } else target = resolve(dirname(file), clean);
    dependencies.add(target);
    return rewrite ? pathToFileURL(target).href + value.slice(clean.length) : value;
  };
  const transform = (value: string, imported: boolean): string => {
    const parsed = valueParser(value);
    if (imported && parsed.nodes[0]?.type === 'string') parsed.nodes[0].value = local(parsed.nodes[0].value, true);
    parsed.walk(node => {
      if (node.type === 'function' && node.value.toLowerCase() === 'url') {
        const first = node.nodes[0];
        if (first && (first.type === 'string' || first.type === 'word')) first.value = local(first.value, imported);
        return false;
      }
      return undefined;
    });
    return parsed.toString();
  };
  root.walkAtRules('import', rule => { rule.params = transform(rule.params, true); });
  root.walkDecls(declaration => { declaration.value = transform(declaration.value, false); });
  return { css: root.toString(), files: [...dependencies] };
}
