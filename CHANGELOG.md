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
