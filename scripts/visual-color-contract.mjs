import postcss from 'postcss';

/** Only @theme declarations register Tailwind colour utilities; root variables do not. */
export function collectColorRoles(sources) {
  const roles = new Set();
  for (const source of sources) {
    postcss.parse(source).walkAtRules('theme', rule => {
      rule.walkDecls(declaration => {
        if (declaration.prop.startsWith('--color-')) roles.add(declaration.prop.slice(8));
      });
    });
  }
  return roles;
}

const colorUtility = /(?<![\w-])(?:bg|text|border(?:-[trblsexy])?|divide(?:-[xy])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|accent|caret|decoration|placeholder|shadow)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/[\d.]+)?(?![\w-])/g;

/** Check registered semantic namespaces without mistaking typography/geometry for colours. */
export function findUnresolvedColorClasses(value, roles) {
  const namespaces = new Set([...roles].map(role => role.split('-')[0]));
  return [...value.matchAll(colorUtility)]
    .filter(match => namespaces.has(match[1].split('-')[0]) && !roles.has(match[1]))
    .map(match => ({ value: match[0], index: match.index }));
}
