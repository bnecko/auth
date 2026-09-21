import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safeNext';

const ORIGIN = 'https://auth.example.com';
const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);

describe('safeNext', () => {
  it.each([
    ['/account', '/account'],
    ['/oauth/authorize?client_id=app&state=x#top', '/oauth/authorize?client_id=app&state=x#top'],
    ['/device?user_code=ABCD-EFGH', '/device?user_code=ABCD-EFGH'],
  ])('keeps a path on this site: %s', (value, expected) => {
    expect(safeNext(value, ORIGIN)).toBe(expected);
  });

  // Each of these starts with one slash, which is all the old check asked for,
  // and a browser takes every one of them to evil.example.
  it.each([
    ['a backslash read as a slash', '/\\evil.example'],
    ['a tab the parser drops', `/${TAB}/evil.example`],
    ['a newline the parser drops', `/${NEWLINE}/evil.example`],
    ['two slashes', '//evil.example'],
    ['two slashes and a path', '//evil.example/%2e%2e'],
  ])('sends %s home instead of to another site', (_name, value) => {
    expect(safeNext(value, ORIGIN)).toBe('/');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/'],
    ['a scheme without slashes', 'https:evil.example'],
    ['a script URL', 'javascript:alert(1)'],
    ['a leading backslash', '\\/evil.example'],
    ['a leading space', ' /account'],
    ['nothing', ''],
    ['null', null],
  ])('sends %s home', (_name, value) => {
    expect(safeNext(value, ORIGIN)).toBe('/');
  });

  // This one resolves to this origin, with the path "//evil.example". Handed
  // back to the browser as a relative reference, that path is another host.
  it('sends home a path that would be read as another host the second time', () => {
    expect(safeNext('/./\\evil.example', ORIGIN)).toBe('/');
    expect(safeNext('/.//evil.example', ORIGIN)).toBe('/');
  });

  // Whatever is returned, resolving it again must land on this origin.
  it.each(['/account', '/\\evil.example', '/./\\evil.example', '//evil.example', '/a/../..//evil.example'])(
    'never returns something that leaves this site when resolved again: %s',
    value => {
      expect(new URL(safeNext(value, ORIGIN), ORIGIN).origin).toBe(ORIGIN);
    },
  );
});
