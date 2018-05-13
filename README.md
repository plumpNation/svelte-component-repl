Svelte Component REPL
=====================

REPL to play with your Svelte components, inspired by svelte.technology/repl, although that was
a little beyond me so I decided to "sort of" reverse engineer it to learn how it worked.

The idea is that you can configure this client side app to load your raw svelte components
into the browser, and compile them into your 'App' there. The 'App' in this case would be the
output from the editor, wrapped in svelte syntax, compiled and bundled.

## Order of events

- Get the raw component contents
- Create a raw App component that will load the components
- Use the svelte compiler to compile all raw components
- Use rollup to create a bundle for the REPL to run

## Information

The compiler is loaded from a CDN in the index.html. This is a completely
static REPL, I am trying to avoid the need to have a server for any compilation.

## Todo

These are just possibilities, but placed in order or priority.

- Add styles in the preview iframe.
- Attribute hints.
- Cache fetched raw component contents.
- Modularise and add a build.
- support script tags
