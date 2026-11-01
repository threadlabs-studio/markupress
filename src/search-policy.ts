import type { ContentSecurityPolicyOptions } from '@threadlabs/markupkit';

/** Preserve explicit policies; a new connect directive also needs self for native page fetches. */
export function hostedPolicy(policy: ContentSecurityPolicyOptions | false | undefined, origin: string): ContentSecurityPolicyOptions | false {
  if (policy === false) return false;
  if (policy !== undefined && (policy === null || typeof policy !== 'object' || Array.isArray(policy))) throw new Error('csp must be false or an object of sources per directive.');
  const sources = policy?.['connect-src'] ?? policy?.['default-src'] ?? ["'self'"];
  if (!Array.isArray(sources) || !sources.every(source => typeof source === 'string')) throw new Error('csp connection sources must be a list of CSP source expressions.');
  return { ...policy, 'connect-src': [...new Set([...sources, origin])] };
}
