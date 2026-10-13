# Third-party notices

The DOCX Export plugin's built bundle includes the `docx` and `jszip` libraries and their runtime dependencies, listed below (generated 2026-10-02 from the lock file and each package's licence file or `package.json`). The `@logseq/libs` package (the Logseq plugin SDK) and its dependencies are also bundled and are listed below (versions from `package-lock.json`, licences and copyright lines read from each package's `node_modules` folder on 2026-10-13). Development-only tools (TypeScript, esbuild, vitest and so on) are not shipped and are not listed.

DOCX Export itself is licensed under the GNU AGPL-3.0-or-later (see `LICENSE`). The full source of the plugin, including the Pro code, is in this repository. You may modify and redistribute it under that licence.

| Package | Version | Licence | Copyright |
|---|---|---|---|
| docx | 9.8.1 | MIT | Copyright (c) 2016 Dolan (as written in the package LICENSE file) |
| jszip | 3.10.2 | MIT (used under MIT; the package is dual-licensed MIT or GPL-3.0-or-later, and we choose MIT) | Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso |
| pako | 1.0.11 | MIT AND Zlib | Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn |
| xml | 1.0.1 | MIT | Copyright (c) 2011-2016 Dylan Greene |
| xml-js | 1.6.11 | MIT | Copyright (c) 2016-2017 Yousuf Almarzooqi |
| sax | 1.6.1 | BlueOak-1.0.0 (permissive) | Isaac Z. Schlueter (package author) |
| nanoid | 6.0.1 | MIT | Copyright 2017 Andrey Sitnik |
| hash.js | 1.1.7 | MIT | Copyright Fedor Indutny, 2014 |
| minimalistic-assert | 1.0.1 | ISC | Copyright 2015 Calvin Metcalf |
| inherits | 2.0.4 | ISC | Copyright (c) Isaac Z. Schlueter |
| immediate | 3.0.6 | MIT | Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, Domenic Denicola, Brian Cavalier |
| lie | 3.3.0 | MIT | Copyright (c) 2014-2018 Calvin Metcalf, Jordan Harband |
| setimmediate | 1.0.5 | MIT | Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, and Domenic Denicola |
| readable-stream | 2.3.8 | MIT | Copyright Node.js contributors |
| core-util-is | 1.0.3 | MIT | Copyright Node.js contributors |
| isarray | 1.0.0 | MIT | Julian Gruber (package author) |
| process-nextick-args | 2.0.1 | MIT | Copyright (c) 2015 Calvin Metcalf |
| safe-buffer | 5.1.2 | MIT | Copyright (c) Feross Aboukhadijeh |
| string_decoder | 1.1.1 | MIT | Copyright Node.js contributors |
| util-deprecate | 1.0.2 | MIT | Copyright (c) 2014 Nathan Rajlich |
| @logseq/libs | 0.2.12 | No licence declared in the package (no `license` field in its `package.json`, no LICENSE file in the package). Its source is in logseq/logseq, which is licensed AGPL-3.0: https://github.com/logseq/logseq/tree/master/libs. DOCX Export is therefore licensed AGPL-3.0-or-later. | None stated in the package |
| csstype | 3.1.0 | MIT | Copyright (c) 2017-2018 Fredrik Nicol |
| debug | 4.3.4 | MIT | Copyright (c) 2014-2017 TJ Holowaychuk; Copyright (c) 2018-2021 Josh Junon |
| ms | 2.1.2 | MIT | Copyright (c) 2016 Zeit, Inc. |
| deepmerge | 4.3.1 | MIT | Copyright (c) 2012 James Halliday, Josh Duff, and other contributors |
| dompurify | 3.3.1 | MPL-2.0 OR Apache-2.0 (used under Apache-2.0) | Copyright 2025 Dr.-Ing. Mario Heiderich, Cure53 |
| eventemitter3 | 4.0.7 | MIT | Copyright (c) 2014 Arnout Kazemier |
| fast-deep-equal | 3.1.3 | MIT | Copyright (c) 2017 Evgeny Poberezkin |
| lodash-es | 4.17.21 | MIT | Copyright OpenJS Foundation and other contributors |
| path | 0.12.7 | MIT | Copyright Joyent, Inc. and other Node contributors |
| process | 0.11.10 | MIT | Copyright (c) 2013 Roman Shtylman |
| util | 0.10.4 | MIT | Copyright Joyent, Inc. and other Node contributors |
| snake-case | 3.0.4 | MIT | Copyright (c) 2014 Blake Embrey |
| dot-case | 3.0.4 | MIT | Copyright (c) 2014 Blake Embrey |
| no-case | 3.0.4 | MIT | Copyright (c) 2014 Blake Embrey |
| lower-case | 2.0.2 | MIT | Copyright (c) 2014 Blake Embrey |
| tslib | 2.8.1 | 0BSD | Copyright (c) Microsoft Corporation |
| @types/node (nested under docx) | 26.6.4 | MIT | Copyright (c) Microsoft Corporation (type definitions only, not in the bundle) |
| undici-types (nested under docx) | 8.9.0 | MIT | Copyright (c) Matteo Collina and Undici contributors (type definitions only, not in the bundle) |

Licences other than MIT, ISC, BSD, Apache-2.0 or Zlib: `sax` is BlueOak-1.0.0, a permissive licence. `jszip` and `pako` offer or combine licences as stated in the table above. `dompurify` is dual-licensed and we use it under Apache-2.0. `@logseq/libs` is described in its row above. `inherits` (ISC) is listed above and is also used by `util`.

The full licence texts are in each package's folder inside `node_modules` (`npm ci` installs them). The bundle keeps the licence headers esbuild leaves in place.
