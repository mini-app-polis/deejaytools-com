## [1.19.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.2...v1.19.3) (2026-04-26)


### Bug Fixes

* cast createServer to satisfy TypeScript overloaded signature ([0a4e8da](https://github.com/mini-app-polis/deejaytools-com/commit/0a4e8dac6d1f692493ea574968d8704eaa71cd26))
* pre-drain request body via createAdaptorServer hook to avoid Railway Fastly timeout ([20b4ebc](https://github.com/mini-app-polis/deejaytools-com/commit/20b4ebc6e5718951cc4841be17f27dfbf5fcba26))

## [1.19.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.1...v1.19.2) (2026-04-26)


### Bug Fixes

* eagerly drain request body to avoid Railway Fastly write timeout ([226f952](https://github.com/mini-app-polis/deejaytools-com/commit/226f9523238c8f040bb20931133b83af1af2acae))

## [1.19.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.0...v1.19.1) (2026-04-26)


### Bug Fixes

* drain request body at TCP level to avoid Railway Fastly write timeout ([fe1adea](https://github.com/mini-app-polis/deejaytools-com/commit/fe1adea8d2b6950b83bc309e35ceb17b6d35a9e4))

# [1.19.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.18.2...v1.19.0) (2026-04-26)


### Features

* restoring song upload ([bd0e56b](https://github.com/mini-app-polis/deejaytools-com/commit/bd0e56b080a82f7c9ffefefae120a765ccc1a5e8))

## [1.18.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.18.1...v1.18.2) (2026-04-25)


### Bug Fixes

* fix ([8ddc39b](https://github.com/mini-app-polis/deejaytools-com/commit/8ddc39b8ee384150e3e82593768210509f055f29))

## [1.18.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.18.0...v1.18.1) (2026-04-25)


### Bug Fixes

* **api:** bypass @hono/node-server to drain request body at TCP level ([a517d35](https://github.com/mini-app-polis/deejaytools-com/commit/a517d35998e83f32469e7cd03e68a2cf355cb155))
* **api:** bypass @hono/node-server to drain request body at TCP level ([1dbf940](https://github.com/mini-app-polis/deejaytools-com/commit/1dbf940be73fb08a78f55fea0ea253e3cd3db3fc))
* **api:** bypass @hono/node-server to drain request body at TCP level ([5821ac9](https://github.com/mini-app-polis/deejaytools-com/commit/5821ac9f5792233a1f550aa715d2b9a8cfd9e8b0))
* **api:** bypass @hono/node-server to drain request body at TCP level ([a6d86af](https://github.com/mini-app-polis/deejaytools-com/commit/a6d86af7b809f02017238bde2dd88ca6ea0476c6))
* **api:** drain upload body before requireAuth to fix Railway proxy timeout ([7881259](https://github.com/mini-app-polis/deejaytools-com/commit/7881259ffbc971cf5ed3b23d138f4a6ae54fb6b1))

# [1.18.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.17.5...v1.18.0) (2026-04-25)


### Bug Fixes

* **api:** drain upload body before requireAuth to fix Railway proxy timeout ([075491a](https://github.com/mini-app-polis/deejaytools-com/commit/075491a05fe03a757cc06e249171825f91144d96))


### Features

* restore upload ([856250a](https://github.com/mini-app-polis/deejaytools-com/commit/856250a037fb7532f9e979fbea5b171960f09bf0))

## [1.17.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.17.4...v1.17.5) (2026-04-25)


### Bug Fixes

* **api:** drain upload body before db queries to fix Railway proxy timeout ([52c2dd1](https://github.com/mini-app-polis/deejaytools-com/commit/52c2dd129efb8443b6561ff8292671af397ac313))

## [1.17.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.17.3...v1.17.4) (2026-04-25)


### Bug Fixes

* **api:** pin hono + node-server to last-known-working versions ([9d6f76d](https://github.com/mini-app-polis/deejaytools-com/commit/9d6f76d47a9eeff63e8395c857e8bf128ac0b111))

## [1.17.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.17.2...v1.17.3) (2026-04-25)


### Bug Fixes

* **api:** drain upload body before db queries to avoid proxy timeout ([ff968f6](https://github.com/mini-app-polis/deejaytools-com/commit/ff968f6d5397f2c801f14ccb2e939a199981b318))

## [1.17.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.17.1...v1.17.2) (2026-04-25)


### Bug Fixes

* **api:** bind server to 0.0.0.0 so Railway can route multipart uploads ([c2488e1](https://github.com/mini-app-polis/deejaytools-com/commit/c2488e1f123f4c4877c90e0da3eebc5d0a62e2e4))

## [1.17.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.17.0...v1.17.1) (2026-04-25)


### Bug Fixes

* updating UI to match the mpdel requirements change ([0507497](https://github.com/mini-app-polis/deejaytools-com/commit/0507497777b1c215d57a9695d9f170d34b474975))

# [1.17.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.16.0...v1.17.0) (2026-04-25)


### Features

* full form with working pattern ([09f7331](https://github.com/mini-app-polis/deejaytools-com/commit/09f733105dbd14f917df3b9a054652c2a628e21d))

# [1.16.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.8...v1.16.0) (2026-04-25)


### Features

* full form with working pattern ([a35234e](https://github.com/mini-app-polis/deejaytools-com/commit/a35234e0191f19d59cf83eedccb266a8cb3c3ca1))
* full form with working pattern ([0ff6bde](https://github.com/mini-app-polis/deejaytools-com/commit/0ff6bdec6782762e998074e9d5cb16f4db56d881))

## [1.15.8](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.7...v1.15.8) (2026-04-25)


### Bug Fixes

* bandaid pattern ([b731835](https://github.com/mini-app-polis/deejaytools-com/commit/b7318358f9970e5ddb01382b2eb2e85d368473f4))

## [1.15.7](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.6...v1.15.7) (2026-04-25)


### Bug Fixes

* bandaid pattern ([7b7cd94](https://github.com/mini-app-polis/deejaytools-com/commit/7b7cd9421769d8f3f599ee0f38e449f2e883d88a))

## [1.15.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.5...v1.15.6) (2026-04-25)


### Bug Fixes

* **app:** replace Radix Dialog with plain-div modal for session form ([ac17803](https://github.com/mini-app-polis/deejaytools-com/commit/ac1780369df63ef43f18417491bc0577bb7475ab))

## [1.15.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.4...v1.15.5) (2026-04-25)


### Bug Fixes

* **app:** remove non-applying animation classes from shadcn Dialog (overlay+content) ([9643d8a](https://github.com/mini-app-polis/deejaytools-com/commit/9643d8ae4f6fe031324655abcb1fca2d932b83ba))

## [1.15.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.3...v1.15.4) (2026-04-25)


### Bug Fixes

* **app:** simplify session-dialog open handler — drop pre-fill from latest ([8d67f31](https://github.com/mini-app-polis/deejaytools-com/commit/8d67f319e205579f79ba9b670f9f5c8947985621))

## [1.15.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.2...v1.15.3) (2026-04-25)


### Bug Fixes

* **app:** remove _redirects, rely on Cloudflare Pages native SPA fallback ([269e4aa](https://github.com/mini-app-polis/deejaytools-com/commit/269e4aa3a3c6b689fb60dac2200998a117e8f2d9))

## [1.15.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.1...v1.15.2) (2026-04-25)


### Bug Fixes

* **app:** _redirects use force-rewrite flag for Cloudflare Pages SPA fallback ([32a181f](https://github.com/mini-app-polis/deejaytools-com/commit/32a181f6cab83f8e38bb1690dbe45a519f5390eb))

## [1.15.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.15.0...v1.15.1) (2026-04-25)


### Bug Fixes

* **app:** _redirects fallback for SPA routes on Cloudflare Pages ([158d401](https://github.com/mini-app-polis/deejaytools-com/commit/158d40125bd45fbc4b88796e43fb70225cda816c))

# [1.15.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.14.0...v1.15.0) (2026-04-25)


### Bug Fixes

* tests ([b4a9271](https://github.com/mini-app-polis/deejaytools-com/commit/b4a9271316beb4cf4adf8cb76014ceb5eed8b648))


### Features

* **app:** floor-trial queue UI on new model ([234edbf](https://github.com/mini-app-polis/deejaytools-com/commit/234edbf42fabb9796c3d26cadc3067a154912069))

# [1.14.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.13.4...v1.14.0) (2026-04-25)


### Bug Fixes

* **api:** canonical envelope for validation 400s via zValidator wrapper ([432fd49](https://github.com/mini-app-polis/deejaytools-com/commit/432fd493178dafa0861d4670bea4628068e04770))


### Features

* **app:** wire @sentry/react for browser error tracking ([7a95c01](https://github.com/mini-app-polis/deejaytools-com/commit/7a95c01efc911c88f8df643086bde6b5a58cae53))

## [1.13.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.13.3...v1.13.4) (2026-04-23)


### Bug Fixes

* **schemas:** build and ship compiled JS so runtime can import it ([1f254fc](https://github.com/mini-app-polis/deejaytools-com/commit/1f254fcf6e4489e3fb6936646d1667f263cdf99a))
* **typecheck:** build @deejaytools/schemas before consumers typecheck ([088f8c7](https://github.com/mini-app-polis/deejaytools-com/commit/088f8c75b01dd64bcc3cc9980f9914e4abc9cf24))

## [1.13.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.13.2...v1.13.3) (2026-04-23)


### Bug Fixes

* **api:** move @types/node to dependencies for Railway build ([78cada8](https://github.com/mini-app-polis/deejaytools-com/commit/78cada8029e357311da52cd5f4a1803177923610))

## [1.13.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.13.1...v1.13.2) (2026-04-23)


### Bug Fixes

* **api:** move build tooling to dependencies to unblock Railway deploy ([a11a410](https://github.com/mini-app-polis/deejaytools-com/commit/a11a410d53849920aed7719f13b5215452be2cb7))

## [1.13.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.13.0...v1.13.1) (2026-04-23)


### Bug Fixes

* **railway:** install devDependencies for build and db:migrate (closes tsc not found) ([23f98af](https://github.com/mini-app-polis/deejaytools-com/commit/23f98af45d8a6d47b1db6869e63b125f8a222846))

# [1.13.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.12.2...v1.13.0) (2026-04-05)


### Features

* migrate from @deejaytools/ts-utils to common-typescript-utils and @deejaytools/schemas ([f615ba5](https://github.com/mini-app-polis/deejaytools-com/commit/f615ba5ba83626825dc7d985daca4a074141f09d))

## [1.12.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.12.1...v1.12.2) (2026-04-03)


### Bug Fixes

* UI ([5ab9703](https://github.com/mini-app-polis/deejaytools-com/commit/5ab9703abe8b90c5000d2abde4a1167e8faa58db))

## [1.12.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.12.0...v1.12.1) (2026-04-03)


### Bug Fixes

* UI updates ([cf3c7c6](https://github.com/mini-app-polis/deejaytools-com/commit/cf3c7c6666f632d7f2560295a68ae7215aa726ef))

# [1.12.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.11.0...v1.12.0) (2026-04-03)


### Features

* style overhall ([3e3173f](https://github.com/mini-app-polis/deejaytools-com/commit/3e3173ff893b30966990810816e13f6ff137e3cb))

# [1.11.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.10.0...v1.11.0) (2026-04-03)


### Bug Fixes

* legacy songs endpoint ([b32c773](https://github.com/mini-app-polis/deejaytools-com/commit/b32c77374f4427fd96d34b404342c37f1ffe07c2))


### Features

* supporting legacy songs pre platform, and adding landing page ([becf14e](https://github.com/mini-app-polis/deejaytools-com/commit/becf14e4cb480a97ef03ed5066d2288d7a42de98))

# [1.10.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.9.0...v1.10.0) (2026-03-31)


### Features

* testing milestone — 103 tests, multi-format audio tagging ([55db116](https://github.com/mini-app-polis/deejaytools-com/commit/55db11637d7bd40a0f0907a03421883c5213c604))

# [1.9.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.8.0...v1.9.0) (2026-03-31)


### Bug Fixes

* skip ID3 tagging for non-MP3 audio formats ([b7e366e](https://github.com/mini-app-polis/deejaytools-com/commit/b7e366e033e279ed33dff5d149f1b58ac5d1f61f))


### Features

* multi-format audio tagging — MP3, WAV, m4a, FLAC ([b8d81d3](https://github.com/mini-app-polis/deejaytools-com/commit/b8d81d3dcab44e540e5c90a600991983c6e4a200))

# [1.8.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.7.0...v1.8.0) (2026-03-31)


### Bug Fixes

* handle FK constraints on partner delete and add loading state ([b2c833c](https://github.com/mini-app-polis/deejaytools-com/commit/b2c833c1529918784ab5f927c55f6f7b7ef633bf))


### Features

* show association warnings before partner delete ([25eefb7](https://github.com/mini-app-polis/deejaytools-com/commit/25eefb7b9a9b056504304cd8f6f8cb4468976aff))

# [1.7.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.6.0...v1.7.0) (2026-03-30)


### Features

* partner dance role — leader/follower ordering in song filenames ([63a5bb6](https://github.com/mini-app-polis/deejaytools-com/commit/63a5bb65578ae47d01b4910355c3fa4aaa966ee7))

# [1.6.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.5.0...v1.6.0) (2026-03-30)


### Bug Fixes

* restore 404.html copy for Cloudflare Pages SPA routing ([f69307a](https://github.com/mini-app-polis/deejaytools-com/commit/f69307a68dd3aeed161ee7b92e0a9929bf9b8440))


### Features

* loading states on all mutation buttons ([047b5a4](https://github.com/mini-app-polis/deejaytools-com/commit/047b5a49f5605e185a1139755f55338803297214))

# [1.5.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.4.0...v1.5.0) (2026-03-30)


### Features

* full-process progress bar for song upload ([5f74897](https://github.com/mini-app-polis/deejaytools-com/commit/5f748974e982a2a7c707a3cf97aca72fc08818e2))

# [1.4.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.3.5...v1.4.0) (2026-03-30)


### Features

* partner validation, form reset, and upload progress bar ([c81babf](https://github.com/mini-app-polis/deejaytools-com/commit/c81babf53cfa94bec523999eea5797354bcc42d6))

## [1.3.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.3.4...v1.3.5) (2026-03-30)


### Bug Fixes

* song create schema accepts null, fix filename format and ID3 tags to match old platform ([51dcb87](https://github.com/mini-app-polis/deejaytools-com/commit/51dcb8719a976514b7daac18cbeacabd388f0b6c))

## [1.3.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.3.3...v1.3.4) (2026-03-30)


### Bug Fixes

* accept null values in song create body schema ([8c6cb80](https://github.com/mini-app-polis/deejaytools-com/commit/8c6cb80e5cddaa3c5d2d6c988b303841c47250b0))

## [1.3.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.3.2...v1.3.3) (2026-03-30)


### Bug Fixes

* move build tools to dependencies in apps/app for Cloudflare Pages production build ([46f1355](https://github.com/mini-app-polis/deejaytools-com/commit/46f13558e8492513ef85f70dc25ae75e623457ad))

## [1.3.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.3.1...v1.3.2) (2026-03-30)


### Bug Fixes

* move @types/node to dependencies in ts-utils for Cloudflare Pages build ([1004f50](https://github.com/mini-app-polis/deejaytools-com/commit/1004f50fcfbbc3b3960a258fc3d0d5506b2e2af2))

## [1.3.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.3.0...v1.3.1) (2026-03-30)


### Bug Fixes

* move typescript to dependencies in ts-utils for Cloudflare Pages build ([93f3802](https://github.com/mini-app-polis/deejaytools-com/commit/93f3802db6a84be513c3c5333050ac3d09553534))

# [1.3.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.2.5...v1.3.0) (2026-03-30)


### Features

* song upload UI — atomic two-step create+upload flow ([755d9dc](https://github.com/mini-app-polis/deejaytools-com/commit/755d9dc1b4e3c248b674340ebaae8456ccfd5d73))

## [1.2.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.2.4...v1.2.5) (2026-03-30)


### Bug Fixes

* uprev ([43563d9](https://github.com/mini-app-polis/deejaytools-com/commit/43563d905fff99fe0315ffb45192963695a988bd))

## [1.2.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.2.3...v1.2.4) (2026-03-30)


### Bug Fixes

* read version from root package.json — will update after next semantic-release ([ccebb5e](https://github.com/mini-app-polis/deejaytools-com/commit/ccebb5e9ef8c54a7f4d32cd0c6b5ce3f7623ed58))

## [1.2.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.2.2...v1.2.3) (2026-03-30)


### Bug Fixes

* use env var for app version display ([daa1e64](https://github.com/mini-app-polis/deejaytools-com/commit/daa1e64fb85b16ef20777586f2019c940b857fc1))

## [1.2.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.2.1...v1.2.2) (2026-03-30)


### Bug Fixes

* import version directly from root package.json ([a81ee36](https://github.com/mini-app-polis/deejaytools-com/commit/a81ee3609e4a9e8ba4d27423d8bd924d70832222))

## [1.2.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.2.0...v1.2.1) (2026-03-30)


### Bug Fixes

* read version from root package.json for nav display ([eeb20db](https://github.com/mini-app-polis/deejaytools-com/commit/eeb20dbb26d5b69f581ff93d140cd67a653038cd))

# [1.2.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.1.0...v1.2.0) (2026-03-30)


### Features

* update site title and show version in nav ([e95df3d](https://github.com/mini-app-polis/deejaytools-com/commit/e95df3d4c787c08a980e1115fba2641c14d18a0d))

# [1.1.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.0.5...v1.1.0) (2026-03-30)


### Features

* port Drive upload and ID3 tagging from routine-management-platform. ([4aed284](https://github.com/mini-app-polis/deejaytools-com/commit/4aed284bc376cef7aae77a2dc4ecf46920687d3c))

## [1.0.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.0.4...v1.0.5) (2026-03-30)


### Bug Fixes

* uprev post ci fix ([cfec285](https://github.com/mini-app-polis/deejaytools-com/commit/cfec285d7856f2dc0682bb0aa2daa8498b554f43))

## [1.0.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.0.3...v1.0.4) (2026-03-30)


### Bug Fixes

* copy index.html to 404.html for Cloudflare Pages SPA routing ([b56cf35](https://github.com/mini-app-polis/deejaytools-com/commit/b56cf35dc1cceb06f82c83b804c349b133618c1a))

## [1.0.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.0.2...v1.0.3) (2026-03-30)


### Bug Fixes

* use _routes.json and _headers for Cloudflare Pages SPA ([4b0bcf3](https://github.com/mini-app-polis/deejaytools-com/commit/4b0bcf3aa001a7dfa53fdf967cb3eb2eda427f98))

## [1.0.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.0.1...v1.0.2) (2026-03-30)


### Bug Fixes

* force SPA redirect rule for Cloudflare Pages v3 ([115f25a](https://github.com/mini-app-polis/deejaytools-com/commit/115f25a0de30eb6db72deedc932569161f11d915))

## [1.0.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.0.0...v1.0.1) (2026-03-30)


### Bug Fixes

* add Cloudflare Pages redirects for SPA routing ([1d00cca](https://github.com/mini-app-polis/deejaytools-com/commit/1d00cca1a59180cae836341f2af37660b1b8671a))

# 1.0.0 (2026-03-29)


### Features

* add Sentry error tracking to api ([7afc6fc](https://github.com/mini-app-polis/deejaytools-com/commit/7afc6fc6c34b974b80d69fff8cba14b86e52d095))
* structured logger shape — CD-003 CD-009 ([48afd5b](https://github.com/mini-app-polis/deejaytools-com/commit/48afd5b49df2c0faf44ed93035578ed1345cafee))

# 1.0.0 (2026-03-24)


### Bug Fixes

* build ([aad5b39](https://github.com/kaianolevine/deejaytools-com/commit/aad5b39c16c610435c55722adc759a46cc9882dc))
* build ([af19881](https://github.com/kaianolevine/deejaytools-com/commit/af19881c138f38134ec4c9f90ab86974a1f8dc46))
* build ([47aeb6b](https://github.com/kaianolevine/deejaytools-com/commit/47aeb6b6e594038d239e05061d690bdcf8b9de85))
* build ([47e3d2a](https://github.com/kaianolevine/deejaytools-com/commit/47e3d2a2fed7468f5d1db0ce6042d19ad058d7d3))


### Features

* follow up to parity completion ([1f177df](https://github.com/kaianolevine/deejaytools-com/commit/1f177df6a8296561745b107397c090f37b7d0f22))
* full feature parity migration ([1dba7e4](https://github.com/kaianolevine/deejaytools-com/commit/1dba7e4f9339c251b62e891934ae03bb2c2a8321))
