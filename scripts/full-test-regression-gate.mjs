export function assessFullTestRun(output, exitCode, knownFailures) {
  const actualFailures = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\(fail\) (.*?)(?: \[\d+(?:\.\d+)?ms\])?$/);
    if (match) actualFailures.add(match[1]);
  }

  const summary = output.match(/(?:^|\n)\s*(\d+) pass\r?\n\s*(\d+) skip\r?\n\s*(\d+) fail\r?\n[\s\S]*?Ran (\d+) tests across (\d+) files\./);
  const unexpected = [...actualFailures].filter(name => !knownFailures.has(name));
  const resolved = [...knownFailures].filter(name => !actualFailures.has(name));
  const errors = [];

  if (!summary) {
    errors.push('O executor não produziu um resumo completo da suite.');
  } else {
    const [, passed, skipped, failed, total, files] = summary.map(Number);
    if (files < 1 || passed + skipped + failed !== total || failed !== actualFailures.size) {
      errors.push('O resumo do executor não corresponde aos testes e falhas observados.');
    }
  }
  if (exitCode !== (actualFailures.size ? 1 : 0)) {
    errors.push(`O executor terminou com código ${exitCode}; era esperado ${actualFailures.size ? 1 : 0}.`);
  }
  if (unexpected.length) errors.push(`${unexpected.length} falhas fora da baseline.`);
  if (resolved.length) errors.push(`${resolved.length} entradas da baseline já não falham e devem ser removidas.`);

  return { actualFailures, unexpected, resolved, errors };
}
