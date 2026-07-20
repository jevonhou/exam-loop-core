# Compatibility

## Runtime targets

| Environment         | Status                     | Requirements                                                                          |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Node.js 22 LTS      | supported CI target        | ESM and Web Crypto enabled                                                            |
| Node.js 24 LTS      | primary development target | npm 10 or newer                                                                       |
| Modern browsers     | supported API target       | ESM, `crypto.subtle`, `TextEncoder`, and `structuredClone` when using memory adapters |
| Deno, Bun, CommonJS | not currently tested       | community reports welcome; no compatibility promise yet                               |

The published package is ESM-only and includes TypeScript declarations, declaration maps, and source maps. It has no runtime dependencies.

## Platform-neutral modules

Learning and content modules do not read the clock, browser DOM, filesystem, environment variables, or network. Callers inject timestamps, random sources, adapters, configuration, and persistence.

Archive checksum operations require standards-based Web Crypto. `MemoryRepository` and `MemorySnapshotStore` use `structuredClone`; production applications can implement the small repository interfaces with their preferred storage platform.

## Version support

The latest `0.1.x` version is the only maintained line before `1.0.0`. Node support changes are documented in `CHANGELOG.md` and treated as a minor change during `0.x`.
