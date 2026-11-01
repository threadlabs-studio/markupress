import { expect, it } from 'vitest';
import { hostedPolicy } from '../src/search-policy.js';

it('adds only the configured connection origin while preserving native fetches and explicit policy choices', () => {
  const origin = 'https://app-dsn.algolia.net';
  expect(hostedPolicy(undefined, origin)).toEqual({ 'connect-src': ["'self'", origin] });
  expect(hostedPolicy(false, origin)).toBe(false);
  const explicit = { reportOnly: true, 'default-src': ["'self'"], 'connect-src': ['https://api.example'], 'img-src': ['data:'] };
  expect(hostedPolicy(explicit, origin)).toEqual({ ...explicit, 'connect-src': ['https://api.example', origin] });
  expect(hostedPolicy({ 'default-src': ['https://api.example'] }, origin)).toEqual({ 'default-src': ['https://api.example'], 'connect-src': ['https://api.example', origin] });
  expect(() => hostedPolicy({ 'connect-src': true }, origin)).toThrow(/csp/);
});
