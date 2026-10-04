import { cn } from '../../lib/utils';

// Inspect the effective base background only: hover classes and translucent
// tints must not turn a light/ghost action into a white-on-white action.
export function hasFilledButtonBackground(className: string | undefined, filledByDefault: boolean): boolean {
  const background = cn(className).split(/\s+/).filter(token => /^!?bg-/.test(token)).pop();
  if (!background) return filledByDefault;
  return /^!?bg-(primary(?:-hover|-active)?|success(?:-strong)?|error|text-primary|(?:blue|red|green|emerald|indigo|violet|purple|rose|slate|gray|zinc|neutral|stone|teal|cyan|sky|orange|amber)-(?:[6-9]00|950))$/.test(background);
}
