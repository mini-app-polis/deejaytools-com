## [2.0.3](https://github.com/mini-app-polis/deejaytools-com/compare/v2.0.2...v2.0.3) (2026-08-26)


### Bug Fixes

* **api:** count managed partnerships in has_active_checkin ([d417a38](https://github.com/mini-app-polis/deejaytools-com/commit/d417a3833197ecf6e82bf982f071b0fce5cedb16))
* **api:** record an audit event when a queue entry is moved ([705d3a4](https://github.com/mini-app-polis/deejaytools-com/commit/705d3a4fc65ca12473749bbdef925a762b9dee0c))
* **api:** stop creating solo queue entities ([6367e37](https://github.com/mini-app-polis/deejaytools-com/commit/6367e37d2a0133464467c9ffdead7ec7588a17aa))

## [2.0.2](https://github.com/mini-app-polis/deejaytools-com/compare/v2.0.1...v2.0.2) (2026-08-26)


### Bug Fixes

* **app:** correct inaccurate help claims and managed-partnership check-in ([e8b9526](https://github.com/mini-app-polis/deejaytools-com/commit/e8b9526d4d1069a860c1eab0323204a8c0cfc484))
* **app:** distinguish an unreadable upload file from a network failure ([2fd415f](https://github.com/mini-app-polis/deejaytools-com/commit/2fd415f29b7c78cab6c51045f29c2c94f9a04028))
* **app:** polyfill Blob.arrayBuffer in jsdom test setup ([7427fb8](https://github.com/mini-app-polis/deejaytools-com/commit/7427fb81cb52b872a22341b565c4913f143f7eb9))
* **app:** recognise team and exhibition entries as the user's own in the queue ([f580c92](https://github.com/mini-app-polis/deejaytools-com/commit/f580c9295fc183c7eb90e8a19d012fe3f7a7c037))
* **app:** send the managed partnership entity when checking in ([b165b83](https://github.com/mini-app-polis/deejaytools-com/commit/b165b8336d995f1f01fd329b306e2fe0ef71b281))

## [2.0.1](https://github.com/mini-app-polis/deejaytools-com/compare/v2.0.0...v2.0.1) (2026-08-26)


### Bug Fixes

* **app:** correct session start time conversion across calendar days ([081d706](https://github.com/mini-app-polis/deejaytools-com/commit/081d706f0eac7a48db0326804aedd701df964877))

# [2.0.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.58.0...v2.0.0) (2026-08-25)


### Features

* public events section ([f25b04b](https://github.com/mini-app-polis/deejaytools-com/commit/f25b04b55b3798c547af1ea2343a35c791e3204a))


### BREAKING CHANGES

* the events listing no longer shows completed or cancelled
events, and an event page no longer lists completed floor trials. Both stay
reachable by direct URL, but anything relying on these pages to render an
event's full history must read the event and session endpoints directly.

# [1.58.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.57.0...v1.58.0) (2026-08-25)


### Bug Fixes

* adding floor trial status ([740c14e](https://github.com/mini-app-polis/deejaytools-com/commit/740c14ef2b1033b2e441731688533ee733d76c12))
* adding floor trial status ([fea7cd3](https://github.com/mini-app-polis/deejaytools-com/commit/fea7cd3362e077d4945e1dc99d3dfaeeff3875a8))
* **api:** cascade song submissions when an event is deleted ([9685da0](https://github.com/mini-app-polis/deejaytools-com/commit/9685da0f9f850bd7bcb94a65b0bb9f3367b06b4e))
* **api:** clear the source comment on mp3 and m4a when provenance is empty ([b4e8f4e](https://github.com/mini-app-polis/deejaytools-com/commit/b4e8f4e40f8cbb557922c350db920e52d39e0f0c))
* **api:** compute event status in the event timezone ([3729090](https://github.com/mini-app-polis/deejaytools-com/commit/3729090460fca3457fc0db709e52f4780222d1e0))
* **api:** enqueue the trash job after the submission delete commits ([b0c800a](https://github.com/mini-app-polis/deejaytools-com/commit/b0c800ace46e72f33ea1d02a41c1d0a924f4f6e7))
* **api:** guard the drive job success update against a reclaimed rerun ([fff36d7](https://github.com/mini-app-polis/deejaytools-com/commit/fff36d7a2008d9b52742ee49363bc76ec4c50c4c))
* **api:** isolate drive job draining from the rest of the tick ([6f9e9ed](https://github.com/mini-app-polis/deejaytools-com/commit/6f9e9ed27c4fc8448ce4f5aee639eccfa83883da))
* **api:** log the cause of Drive job failures and expose queue state to admins ([2d6df5b](https://github.com/mini-app-polis/deejaytools-com/commit/2d6df5be4629b537735805181fb6b5ce48b81fb5))
* **api:** map snake_case columns from raw drive job claims ([dce6479](https://github.com/mini-app-polis/deejaytools-com/commit/dce64792d4c59a1a3238313433030bb6e3d3921d))
* **api:** name event Drive copies with the processed filename ([570e678](https://github.com/mini-app-polis/deejaytools-com/commit/570e678b1fccca6d8347abc0314796504da7076b))
* **api:** nest prelims-only submissions under a Prelims subfolder ([3f12509](https://github.com/mini-app-polis/deejaytools-com/commit/3f1250922ad552336032681a7c7bc3edb7832299))
* **api:** order ProAm FollowerAm entities amateur-first ([d7d309c](https://github.com/mini-app-polis/deejaytools-com/commit/d7d309c08270c53e5bb19dad98b42dff718c98f4))
* **api:** recover the folder cache when folder resolution fails ([1b959fe](https://github.com/mini-app-polis/deejaytools-com/commit/1b959fe1b5e1e87e3939bd8d6d8d17e0b2f1150b))
* **api:** return 409 when a drive job is not retryable ([46e11ea](https://github.com/mini-app-polis/deejaytools-com/commit/46e11ea21e10de7a828c59060f307f0ffe99514a))
* **api:** sanitize folder names on the song upload path ([ca97109](https://github.com/mini-app-polis/deejaytools-com/commit/ca97109a473b0d7c1bb6bf06c62ae0356b5c9609))
* **api:** trash per-event Drive copies when a partnership is deleted ([8d0cca0](https://github.com/mini-app-polis/deejaytools-com/commit/8d0cca05011b59ad1ab81a7b8e8086a5852cd35c))
* **api:** trash per-event Drive copies when a song is deleted ([4cfeea9](https://github.com/mini-app-polis/deejaytools-com/commit/4cfeea923861cff4ab31021c77a260c8c717ff37))
* **api:** validate and normalize the submission division override ([a542671](https://github.com/mini-app-polis/deejaytools-com/commit/a542671ddf55f59102fb83bb4292880f4f3de645))
* **app:** keep radio ownership intact in grouped ChoiceGroup rows ([7e37e2a](https://github.com/mini-app-polis/deejaytools-com/commit/7e37e2ac948275b19ee954376df8baa18609e90b))
* **app:** render event submissions from submissions, not the song library ([0ee391c](https://github.com/mini-app-polis/deejaytools-com/commit/0ee391c96c9a45eb612663d7310021e5d49aca8f))
* **app:** reset round and division tracking when the song changes ([401aa3b](https://github.com/mini-app-polis/deejaytools-com/commit/401aa3b7aace829ac28aff62c192a51ef26e2bd4))
* display songs and entities separately ([e3ebb05](https://github.com/mini-app-polis/deejaytools-com/commit/e3ebb05844b08e07a3f37ade8aa6b00a71ef2d50))
* event page view ui ([138bdb0](https://github.com/mini-app-polis/deejaytools-com/commit/138bdb0aae9a1ae051e2c9eac528079cee647411))
* floor trials view ui ([ee15351](https://github.com/mini-app-polis/deejaytools-com/commit/ee15351579af7d0ef78ef5773405f447f1244669))
* formatting ([5cc4abd](https://github.com/mini-app-polis/deejaytools-com/commit/5cc4abdedee5c081869273b6e74b7c7ad0e98fbd))
* **schemas:** match only names beginning with "The Open" ([a24ab0e](https://github.com/mini-app-polis/deejaytools-com/commit/a24ab0ebd6bce279713f5ec53988e5815b7d6db8))
* showing floor trials instead of days of event ([10a59ad](https://github.com/mini-app-polis/deejaytools-com/commit/10a59ad2278023ac6566efc628d34b20f1b48e9d))
* updating event view ([0a444e9](https://github.com/mini-app-polis/deejaytools-com/commit/0a444e92f7cd582fcd9f564e734b4b588a9b64f7))
* updating formatting for events page ([92b1847](https://github.com/mini-app-polis/deejaytools-com/commit/92b18475efbd066fd1db83eb5378af7358b9aec7))


### Features

* add per-submission division and Classic prelims/finals rounds to The Open ([e30f225](https://github.com/mini-app-polis/deejaytools-com/commit/e30f22513dabfbc665e061077d56137211c1a865))
* adding back in event view ([ab718d2](https://github.com/mini-app-polis/deejaytools-com/commit/ab718d21d7836ea1b5ee2781b79ac7ce4ffeccde))
* adding specific open page for submission ([3c1903b](https://github.com/mini-app-polis/deejaytools-com/commit/3c1903b66555b19d03784b6d0dd5343a1a279aa0))
* **api:** add overridable season year to events and roll seasons over October 1 ([ae4c161](https://github.com/mini-app-polis/deejaytools-com/commit/ae4c161980c374df99c424fe6ca1dfb5a04dd510))
* **api:** add rename drive job and backfill to re-apply naming rules ([d1d5f1a](https://github.com/mini-app-polis/deejaytools-com/commit/d1d5f1a3999bbae54cb907524a5f98bdeb782290))
* **api:** copy submitted songs into per-event Drive folders ([d8acc4b](https://github.com/mini-app-polis/deejaytools-com/commit/d8acc4baa59f1dfc141a3147862ca434021e5235))
* **api:** retry Drive jobs longer and report exhausted jobs to Sentry ([0ee3015](https://github.com/mini-app-polis/deejaytools-com/commit/0ee301513951a07274a9432cb6116b3ab9656a7a))
* **api:** separate artist metadata fields with | instead of - ([0368c67](https://github.com/mini-app-polis/deejaytools-com/commit/0368c67c948f078022dc2c6059d016bc8e8b5fa7))
* **api:** tag every song with genre "Routine" ([16e38d6](https://github.com/mini-app-polis/deejaytools-com/commit/16e38d66e4b07e6b3e2627e99d2abfdefbf411d2))
* **api:** write season year to the year tag and trim tag metadata ([6a52dec](https://github.com/mini-app-polis/deejaytools-com/commit/6a52dece7d8fb9cca76eb5125a9422270a8cfd1f))
* group divisions and apply a consistent display order ([90f442f](https://github.com/mini-app-polis/deejaytools-com/commit/90f442f88caf7ec28406b9f283e410c3826cc212))
* limit submissions to one song per entity per division ([98c0e9f](https://github.com/mini-app-polis/deejaytools-com/commit/98c0e9fda9c619eae5e381f276be5d8094666f5a))
* **open:** exclude legacy songs from The Open submission list ([8d008c5](https://github.com/mini-app-polis/deejaytools-com/commit/8d008c5b7323cbe786d746235dcc28290f85b692))


### Performance Improvements

* **api:** cache Drive folder ids across job batches ([be72f60](https://github.com/mini-app-polis/deejaytools-com/commit/be72f60e7deafc36232cad3d2ca4f6fd81098c9e))

# [1.57.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.56.0...v1.57.0) (2026-08-23)


### Bug Fixes

* admin song view ([c1f7ed7](https://github.com/mini-app-polis/deejaytools-com/commit/c1f7ed71a9cf232cb2842ee55dac71fbe1dc314e))
* admin song view ([f08ef00](https://github.com/mini-app-polis/deejaytools-com/commit/f08ef00d58e4f1b644faedac092417669ff6e647))
* aligning ui ([34f1a6a](https://github.com/mini-app-polis/deejaytools-com/commit/34f1a6add415417a0b9fa0df3793d405651467f3))
* aligning ui ([486bd1d](https://github.com/mini-app-polis/deejaytools-com/commit/486bd1d75b9ecb22bf4b8399d9aaa9fe62521df0))
* aligning ui ([dd8db30](https://github.com/mini-app-polis/deejaytools-com/commit/dd8db309aef275f6e7c18ab4176beab066bf1b70))
* aligning ui ([3fccace](https://github.com/mini-app-polis/deejaytools-com/commit/3fccace027da91d952effc83975f915002052b8b))
* aligning ui ([775a6b2](https://github.com/mini-app-polis/deejaytools-com/commit/775a6b2829c69da6ce3229999549a538940c9bdd))
* aligning ui ([22e5c94](https://github.com/mini-app-polis/deejaytools-com/commit/22e5c94f654e789d9587137021f0d9ebea4a3354))
* aligning ui ([3940018](https://github.com/mini-app-polis/deejaytools-com/commit/39400186d78cc609bbbbe929c8499041c07d2671))
* allowing managed partner deletion ([fb99b87](https://github.com/mini-app-polis/deejaytools-com/commit/fb99b878ff7f8ff338ae26a1aa97ace2301b7135))
* cancelled session shows proper badge ([ca721c4](https://github.com/mini-app-polis/deejaytools-com/commit/ca721c4194891801be0d5fab4157eb98d16c98d7))
* cleanup and organization ([90e6f51](https://github.com/mini-app-polis/deejaytools-com/commit/90e6f51c8792d00705b78188d02d98f5aaf6e290))
* collapsable divisions for event song submissions ([da748e7](https://github.com/mini-app-polis/deejaytools-com/commit/da748e7d082f54f0845bbaf767ee944d99c2257f))
* correct two misleading source comments ([c9321f3](https://github.com/mini-app-polis/deejaytools-com/commit/c9321f3dd5ee496a6bac333bebd08c2f938cc840))
* dev version exception ([75369e2](https://github.com/mini-app-polis/deejaytools-com/commit/75369e24704946ca3b5b7aeefeb30905b040adfa))
* handle song deletion for managed partnerships ([ea73a8a](https://github.com/mini-app-polis/deejaytools-com/commit/ea73a8ae251d4154e8ef2303e7621912b57ef35e))
* lint errors ([43b43b5](https://github.com/mini-app-polis/deejaytools-com/commit/43b43b5b2ab248eb02d8aef41bf0f2e1464b6cd7))
* manage and upload music for other partnerships ([8997310](https://github.com/mini-app-polis/deejaytools-com/commit/89973109cfef0773d6be2784867e26cc8cac2b02))
* manage and upload music for other partnerships ([77102b1](https://github.com/mini-app-polis/deejaytools-com/commit/77102b1ff5b0a5badaba59b4a6b48137c479b3fc))
* manage and upload music for other partnerships ([34542a2](https://github.com/mini-app-polis/deejaytools-com/commit/34542a2bdb824bbb23269993788488c029636956))
* mostly ui updates ([c9695a3](https://github.com/mini-app-polis/deejaytools-com/commit/c9695a3fc1c806b8c23a82708530b57f47d614bb))
* moving nav bar items ([f647d49](https://github.com/mini-app-polis/deejaytools-com/commit/f647d49b7c11642776d1dd2fdabc7e9a467776b2))
* partner calculation on the user admin page ([9183e6a](https://github.com/mini-app-polis/deejaytools-com/commit/9183e6a6af988f8535da37a2d01f05a54a788f05))
* restore help hub and legacy anchor redirects ([f013a3c](https://github.com/mini-app-polis/deejaytools-com/commit/f013a3cc8ad2e7e030102713613aa7737c318d80))
* run history ui ([68e5313](https://github.com/mini-app-polis/deejaytools-com/commit/68e5313862680ddd6a3183b1e5f899ec82757ca7))
* run history ui ([8043f70](https://github.com/mini-app-polis/deejaytools-com/commit/8043f70705a7ee542798d5d02a24f3dd63f07b64))
* runs report with managed pairs ([f9d81c8](https://github.com/mini-app-polis/deejaytools-com/commit/f9d81c85e9c4934ce142393ba170a6ca6101c84b))
* show partnership label instead of Solo for managed songs ([9480e02](https://github.com/mini-app-polis/deejaytools-com/commit/9480e02103602bc5ef26dd97cb9dabb4db0e882b))
* song versioning ([23ec287](https://github.com/mini-app-polis/deejaytools-com/commit/23ec287339ed26f64ba484130d62b201131ce67e))
* ui fix ([3964469](https://github.com/mini-app-polis/deejaytools-com/commit/3964469be3b4a86402979ff99de1e29122823523))
* ui fix ([3722766](https://github.com/mini-app-polis/deejaytools-com/commit/3722766bb52dca8a958996a070510eadd5cf6f2b))
* ui fix ([90d757a](https://github.com/mini-app-polis/deejaytools-com/commit/90d757a4395d18f16ae7f06a1e039ec8475d9b46))
* ui fix ([75a9513](https://github.com/mini-app-polis/deejaytools-com/commit/75a9513ab8ab3bdfe21377fd607c34ca52e7e39f))
* ui improvements ([3471bd3](https://github.com/mini-app-polis/deejaytools-com/commit/3471bd3426978826b324732e26b7dda8f3838720))
* ui update ([8351c4d](https://github.com/mini-app-polis/deejaytools-com/commit/8351c4d00841f878453c67fae136b286c5c007f3))
* ui update ([a11f95c](https://github.com/mini-app-polis/deejaytools-com/commit/a11f95ca976a27e1989bd3e7af5a62a8d754b534))
* ui update ([73a829a](https://github.com/mini-app-polis/deejaytools-com/commit/73a829acd9d091eba1dc949ea2997c62b8849b90))
* ui update ([65343c0](https://github.com/mini-app-polis/deejaytools-com/commit/65343c03d0d849895cc0e12904cb244a77ae00c6))
* ui update ([ce77526](https://github.com/mini-app-polis/deejaytools-com/commit/ce77526abedb5fa8db99d2cf63dccc3f48efa392))
* ui updates ([fef9008](https://github.com/mini-app-polis/deejaytools-com/commit/fef900822705bd236f411b03e1f2867aa70f19b3))
* ui updates ([fba7551](https://github.com/mini-app-polis/deejaytools-com/commit/fba7551625d5be40174a8cc8501bf58f7fcee35e))
* ui updates ([438b2a3](https://github.com/mini-app-polis/deejaytools-com/commit/438b2a3c59d4a1af3d83e95aecc8cdbf32f24ca0))
* updating managed partnership handling so owners do not get credit in floor trials ([a2c232a](https://github.com/mini-app-polis/deejaytools-com/commit/a2c232a747611b8a8354282d6415f86681eff870))


### Features

* add in-app help section and deejay guide ([295bae2](https://github.com/mini-app-polis/deejaytools-com/commit/295bae214450d2c2ed37cb88e1ae23fa389a9a45))
* adding a manager access row and moving test inject to checkin for ([2ea7dd6](https://github.com/mini-app-polis/deejaytools-com/commit/2ea7dd647952f7c031ae49a283bb517b6e5ab4bc))
* adding button to my content page to bring users to checkin when trial is active ([36f7777](https://github.com/mini-app-polis/deejaytools-com/commit/36f7777afa99f76c31aea0bde59511c5195abf84))
* adding go to event button on active events with songs submitted ([b18aa86](https://github.com/mini-app-polis/deejaytools-com/commit/b18aa860d425a80417e3daeb40046efaf6402a6f))
* adding summary to run history ([db48a8d](https://github.com/mini-app-polis/deejaytools-com/commit/db48a8d7248b3934e725921c5b37d74607b5852e))
* adding teams list to profile - per user only ([a257e31](https://github.com/mini-app-polis/deejaytools-com/commit/a257e312167bae8b198f5af4ab990fd809d3710f))
* adding upload for functionality ([a057492](https://github.com/mini-app-polis/deejaytools-com/commit/a057492a3577fefcd47edc44a02cd24c38d0aed6))
* aligning ui for user sessions and manager sessions ([53c8de0](https://github.com/mini-app-polis/deejaytools-com/commit/53c8de00786b8c128c3c0238e6499ef92fd594d1))
* auto promotion and required updates related ([22ad394](https://github.com/mini-app-polis/deejaytools-com/commit/22ad3944fd34efbd854828445958461cb4308ee9))
* auto promotion and required updates related ([4e09603](https://github.com/mini-app-polis/deejaytools-com/commit/4e096038ac8750ee75b2d966c5d53aae47139dea))
* auto promotion and required updates related ([342c3f3](https://github.com/mini-app-polis/deejaytools-com/commit/342c3f3ede913b40a5491b8bbf0005d831cc6a4a))
* auto promotion and required updates related ([4216513](https://github.com/mini-app-polis/deejaytools-com/commit/4216513895af9db9cd4091dba92b97264ce16357))
* building out event check in for collecting per event music in one place ([8396ad2](https://github.com/mini-app-polis/deejaytools-com/commit/8396ad219bfa4d0968a56386d1bcbbd23c6cb19c))
* building out event check in view admin portal ([30fa870](https://github.com/mini-app-polis/deejaytools-com/commit/30fa8701ed44a5da4c781aa1972dac84b6b71b08))
* changing active sessions refresh to a staleness counter ([71389e8](https://github.com/mini-app-polis/deejaytools-com/commit/71389e89d1d4a0c91d954e6b24a54d0454085de5))
* checkin for user ([611e414](https://github.com/mini-app-polis/deejaytools-com/commit/611e414ff6c86c78a8df35d1a40c428219486840))
* checkin gate for event songs added ([af25992](https://github.com/mini-app-polis/deejaytools-com/commit/af259927247a0bc5b7816326dc650453f84e54fd))
* current api no migration yet ([b3b9a06](https://github.com/mini-app-polis/deejaytools-com/commit/b3b9a0653a7daa2822a86b66e44431bb15bf84ad))
* database migration ([cacdf76](https://github.com/mini-app-polis/deejaytools-com/commit/cacdf764ee681e800e28ceb622e79e8bb16dd357))
* deprecating claim from history ([b69b63e](https://github.com/mini-app-polis/deejaytools-com/commit/b69b63ea6d82a65a7d35419ff6e791089da13f5a))
* dev marker ([e12990a](https://github.com/mini-app-polis/deejaytools-com/commit/e12990a0bc3bbb36f34d067eb74a8c3649f02f34))
* filters for songs ([429cd03](https://github.com/mini-app-polis/deejaytools-com/commit/429cd038ffb936cb60319c90b54b192bc522bf05))
* handling special uploads in new portal ([e7285ad](https://github.com/mini-app-polis/deejaytools-com/commit/e7285adfe78c096aab4af76f5406e15188539efc))
* manage and upload music for other partnerships ([cb50b58](https://github.com/mini-app-polis/deejaytools-com/commit/cb50b58418833d87cf407b1292622096dc9ede55))
* migration to support managed partnerships for floor trial running ([4017efe](https://github.com/mini-app-polis/deejaytools-com/commit/4017efe86f5a92b94537465f00e183b2bf2d5854))
* moving admin items ([92c67fb](https://github.com/mini-app-polis/deejaytools-com/commit/92c67fb4ae853a6ea78d988201c336a0d68e0743))
* moving managering sessions to manager access ([59685d5](https://github.com/mini-app-polis/deejaytools-com/commit/59685d598fcb55ff64d0cf469d5dae254fcf7c40))
* moving upload to normal case only ([3802248](https://github.com/mini-app-polis/deejaytools-com/commit/3802248c0f728aa8dc79856cfb959bfd179bac34))
* swapping out drop downs for pill lists ([90e3ee5](https://github.com/mini-app-polis/deejaytools-com/commit/90e3ee54283efbea9a9a0c1aa139249fdbf91184))
* swapping out drop downs for pill lists ([8ca0e40](https://github.com/mini-app-polis/deejaytools-com/commit/8ca0e40c5f0c7196143220319b5ec40e0308474c))

# [1.56.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.55.1...v1.56.0) (2026-08-11)


### Features

* allowing users to update their display names ([7533f22](https://github.com/mini-app-polis/deejaytools-com/commit/7533f22a75e8898941d61ce2059464aadd21a282))
* moving partner management to my profile page ([9c83d99](https://github.com/mini-app-polis/deejaytools-com/commit/9c83d99fc17194ff6a362bac89aafe73e1bfdaef))

## [1.55.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.55.0...v1.55.1) (2026-05-27)


### Bug Fixes

* **tagger:** support 64-bit atom sizes in m4a parser/serializer ([d43ea4b](https://github.com/mini-app-polis/deejaytools-com/commit/d43ea4b15bcc7e2e688a0021c77f01d85c054f26))

# [1.55.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.54.4...v1.55.0) (2026-05-27)


### Features

* **tagger:** m4a tagger that preserves existing ilst entries and updates stco/co64 offsets ([6e44a23](https://github.com/mini-app-polis/deejaytools-com/commit/6e44a233ef3f9017864d12d66e8806b77ef458c7))
* **tagger:** route by byte signature instead of client-supplied MIME type ([a443937](https://github.com/mini-app-polis/deejaytools-com/commit/a44393781bee6ca3f9d98ae6b509f8286821e354))

## [1.54.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.54.3...v1.54.4) (2026-05-27)


### Bug Fixes

* **tagger:** make m4a tagging a no-op until stco-aware rewrite ships ([f31b6a1](https://github.com/mini-app-polis/deejaytools-com/commit/f31b6a16cb81b10e1083e90cdaba12ab75ba8313))

## [1.54.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.54.2...v1.54.3) (2026-05-27)


### Bug Fixes

* **tagger:** write WAV metadata as id3 chunk inside RIFF container instead of corrupting the header ([5e87b2c](https://github.com/mini-app-polis/deejaytools-com/commit/5e87b2c7160233a18d362e37619a842dcc38143f))

## [1.54.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.54.1...v1.54.2) (2026-05-24)


### Bug Fixes

* **add-song:** refresh Clerk token per chunk fetch to prevent auth expiry on slow uploads ([564fa2a](https://github.com/mini-app-polis/deejaytools-com/commit/564fa2ab803429b4a5f334bcc1d398fc59f5b589))

## [1.54.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.54.0...v1.54.1) (2026-05-23)


### Bug Fixes

* **add-song:** allow Cabaret division to upload without a partner ([986324c](https://github.com/mini-app-polis/deejaytools-com/commit/986324caca30635b9f4fcca5c2b5843c557f90f8))
* tests ([8e5d4f5](https://github.com/mini-app-polis/deejaytools-com/commit/8e5d4f5152a18f33e67ae60e6d38c9123bc4e20f))

# [1.54.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.53.1...v1.54.0) (2026-05-23)


### Features

* **queue:** split non_priority_cap into two distinct reasons with gate snapshot in promote response ([3fe9d5f](https://github.com/mini-app-polis/deejaytools-com/commit/3fe9d5fd80852c9d957862334447b5c65c850927))

## [1.53.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.53.0...v1.53.1) (2026-05-23)


### Bug Fixes

* **api,app:** reliable audio upload on iOS via magic-byte detection ([7c8d251](https://github.com/mini-app-polis/deejaytools-com/commit/7c8d251684aa05a928f793a2aa1b3b960ca8b6bc))
* tests ([816c54b](https://github.com/mini-app-polis/deejaytools-com/commit/816c54b68fecbc615b82aefa7914c5162c978f0a))
* tests ([2c92f16](https://github.com/mini-app-polis/deejaytools-com/commit/2c92f16b863066817c956150541cf7367c611228))

# [1.53.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.52.4...v1.53.0) (2026-05-15)


### Features

* admin menu restructure ([eee1c3b](https://github.com/mini-app-polis/deejaytools-com/commit/eee1c3be95c09bbab677b67613a0d32269568766))

## [1.52.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.52.3...v1.52.4) (2026-05-14)


### Bug Fixes

* adding description on admin song page ([36bbc0c](https://github.com/mini-app-polis/deejaytools-com/commit/36bbc0c0446c3ec546c54ca423d8fa668a571275))

## [1.52.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.52.2...v1.52.3) (2026-05-14)


### Bug Fixes

* updated ui on mobile ([f6afaed](https://github.com/mini-app-polis/deejaytools-com/commit/f6afaed2f74ff70025066f04b1ecfdc1484dfaee))

## [1.52.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.52.1...v1.52.2) (2026-05-13)


### Bug Fixes

* display partner first in upload song when present ([5d77a36](https://github.com/mini-app-polis/deejaytools-com/commit/5d77a36aaf7df181780ff60baa7820f69c6e8c09))

## [1.52.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.52.0...v1.52.1) (2026-05-13)


### Bug Fixes

* fix presentation of legacy songs ([6457e46](https://github.com/mini-app-polis/deejaytools-com/commit/6457e460d5989a4fe2704de57a4e2e188995a665))

# [1.52.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.51.1...v1.52.0) (2026-05-13)


### Features

* auto share file with users ([0be9b5d](https://github.com/mini-app-polis/deejaytools-com/commit/0be9b5da974cb735f1bd180eddc479e7b056b945))

## [1.51.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.51.0...v1.51.1) (2026-05-13)


### Bug Fixes

* adding original filename, buttons side by side ([68ccead](https://github.com/mini-app-polis/deejaytools-com/commit/68ccead131620fd5524c7f3ff4f919bc3e0084c7))

# [1.51.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.50.0...v1.51.0) (2026-05-13)


### Features

* adding link to song file in song portal ([4b16d5c](https://github.com/mini-app-polis/deejaytools-com/commit/4b16d5ce2dc1bf8ac8874def3fcf3374daa3f7f2))

# [1.50.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.9...v1.50.0) (2026-05-12)


### Features

* icons and images ([a29c7f3](https://github.com/mini-app-polis/deejaytools-com/commit/a29c7f3f6849d100f49d3141c94c57daf3c8b888))

## [1.49.9](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.8...v1.49.9) (2026-05-07)


### Bug Fixes

* partner delete path and sentry reporting fix ([836c721](https://github.com/mini-app-polis/deejaytools-com/commit/836c7218537e9527cd0cec09902a0dd0795a7e1b))

## [1.49.8](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.7...v1.49.8) (2026-05-07)


### Bug Fixes

* ui allow multiple check ins for users with multilpe partners ([c1b7620](https://github.com/mini-app-polis/deejaytools-com/commit/c1b762024df92859f8442e0b3dec9514da72ff1a))
* ui allow multiple check ins for users with multilpe partners ([8fed63d](https://github.com/mini-app-polis/deejaytools-com/commit/8fed63d70c8bce99548076cb8d5cc126aa8b9672))

## [1.49.7](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.6...v1.49.7) (2026-05-07)


### Bug Fixes

* ui elements ([563e60c](https://github.com/mini-app-polis/deejaytools-com/commit/563e60c145bb8d729c50ec32fdeda4e5a2ce2abc))

## [1.49.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.5...v1.49.6) (2026-05-07)


### Bug Fixes

* ui elements ([e21ac4c](https://github.com/mini-app-polis/deejaytools-com/commit/e21ac4c19178cb86f4c448ee18ef62f4c3c39d87))

## [1.49.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.4...v1.49.5) (2026-05-07)


### Bug Fixes

* unify platform experience ([fec5173](https://github.com/mini-app-polis/deejaytools-com/commit/fec517301cf607656ee2cdcd8dc1599d697f7930))

## [1.49.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.3...v1.49.4) (2026-05-07)


### Bug Fixes

* unify platform experience ([d08fedb](https://github.com/mini-app-polis/deejaytools-com/commit/d08fedbfdffb7e7ef19d135a47051c3874683888))

## [1.49.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.2...v1.49.3) (2026-05-07)


### Bug Fixes

* tests ([bc32f4a](https://github.com/mini-app-polis/deejaytools-com/commit/bc32f4a4304fa83fef9e21731f8f63a4807b60f8))

## [1.49.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.1...v1.49.2) (2026-05-07)


### Bug Fixes

* replace inline delete confirmation with dialog modal on songs page ([d01e4d3](https://github.com/mini-app-polis/deejaytools-com/commit/d01e4d3259b783377663bfe1bff300fb3e53dbdb))
* tests ([5c2f8f0](https://github.com/mini-app-polis/deejaytools-com/commit/5c2f8f0bc7774009fc292178c5893fa969d78d83))

## [1.49.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.49.0...v1.49.1) (2026-05-07)


### Bug Fixes

* allow processed filename to wrap in songs table ([7e06dea](https://github.com/mini-app-polis/deejaytools-com/commit/7e06deaf26729f49853fb765595702a2579698bb))
* allow processed filenames to wrap in admin queue cards ([c6113c7](https://github.com/mini-app-polis/deejaytools-com/commit/c6113c7da61d7c917539f10dd6c39874dd73adb0))

# [1.49.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.48.1...v1.49.0) (2026-05-07)


### Bug Fixes

* PascalCase processed filenames (KaianoLevine_LibbyWooton_MyDivisionIsNotListed) ([cc8ddb8](https://github.com/mini-app-polis/deejaytools-com/commit/cc8ddb807333cc4660582048515fa8d3866cd57a))
* wrap long song filenames in check-in confirmation card ([6bb6638](https://github.com/mini-app-polis/deejaytools-com/commit/6bb6638107b1290c73e99c5e8517a8293d0b5b18))


### Features

* camelCase processed filenames — names and divisions use camelCase segments ([4238d21](https://github.com/mini-app-polis/deejaytools-com/commit/4238d210bb3e31df7ab1cef6833389b3b22e39c6))

## [1.48.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.48.0...v1.48.1) (2026-05-07)


### Bug Fixes

* never show original filename in song labels — use processed_filename → routine_name → division fallback ([6651463](https://github.com/mini-app-polis/deejaytools-com/commit/6651463c18d3af9e5a2ca43893e0a8ab313e41b1))

# [1.48.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.5...v1.48.0) (2026-05-07)


### Features

* add Cabaret, Carolina Shag Divisions, and My Division Is Not Listed to DIVISIONS ([8b028bb](https://github.com/mini-app-polis/deejaytools-com/commit/8b028bbf84f246c1410b8a27db4c0be67c10797c))

## [1.47.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.4...v1.47.5) (2026-05-07)


### Bug Fixes

* build ([2f488be](https://github.com/mini-app-polis/deejaytools-com/commit/2f488be7048a6fe8a180ca470777fbc1e16d970b))

## [1.47.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.3...v1.47.4) (2026-05-07)


### Bug Fixes

* build ([53c3b44](https://github.com/mini-app-polis/deejaytools-com/commit/53c3b440a7cc8ad0a570c25d169fda4a6d41e25a))
* build ([9c914ea](https://github.com/mini-app-polis/deejaytools-com/commit/9c914ea707caa160a0000f6645cafddcec65259b))
* potential ([a1c6309](https://github.com/mini-app-polis/deejaytools-com/commit/a1c63094b168bb4548e55b953b5697bca2c48fe5))
* surface actual fetch error in upload toast for diagnostics ([80ed34b](https://github.com/mini-app-polis/deejaytools-com/commit/80ed34b30a68835ea8faee72c5c42a3e53c17459))

## [1.47.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.3...v1.47.4) (2026-05-07)


### Bug Fixes

* build ([9c914ea](https://github.com/mini-app-polis/deejaytools-com/commit/9c914ea707caa160a0000f6645cafddcec65259b))
* potential ([a1c6309](https://github.com/mini-app-polis/deejaytools-com/commit/a1c63094b168bb4548e55b953b5697bca2c48fe5))
* surface actual fetch error in upload toast for diagnostics ([80ed34b](https://github.com/mini-app-polis/deejaytools-com/commit/80ed34b30a68835ea8faee72c5c42a3e53c17459))

## [1.47.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.3...v1.47.4) (2026-05-07)


### Bug Fixes

* potential ([a1c6309](https://github.com/mini-app-polis/deejaytools-com/commit/a1c63094b168bb4548e55b953b5697bca2c48fe5))
* surface actual fetch error in upload toast for diagnostics ([80ed34b](https://github.com/mini-app-polis/deejaytools-com/commit/80ed34b30a68835ea8faee72c5c42a3e53c17459))

## [1.47.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.3...v1.47.4) (2026-05-03)


### Bug Fixes

* potential ([a1c6309](https://github.com/mini-app-polis/deejaytools-com/commit/a1c63094b168bb4548e55b953b5697bca2c48fe5))
* surface actual fetch error in upload toast for diagnostics ([80ed34b](https://github.com/mini-app-polis/deejaytools-com/commit/80ed34b30a68835ea8faee72c5c42a3e53c17459))

## [1.47.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.3...v1.47.4) (2026-05-03)


### Bug Fixes

* surface actual fetch error in upload toast for diagnostics ([80ed34b](https://github.com/mini-app-polis/deejaytools-com/commit/80ed34b30a68835ea8faee72c5c42a3e53c17459))

## [1.47.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.2...v1.47.3) (2026-05-03)


### Bug Fixes

* background Drive upload — return HTTP response before uploading to Drive ([84bc830](https://github.com/mini-app-polis/deejaytools-com/commit/84bc830ca19b53916e5cea2a096c699d54f81ef7))

## [1.47.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.1...v1.47.2) (2026-05-03)


### Bug Fixes

* single timeout middleware on /v1/* — upload routes get 5 min, others 30 s ([0ee029a](https://github.com/mini-app-polis/deejaytools-com/commit/0ee029ab0ffcb310bfa4fddbd162e39e5339717c))

## [1.47.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.47.0...v1.47.1) (2026-05-03)


### Bug Fixes

* DELETE /checkins/:id ownership check uses queueEntries entity IDs ([331ca3a](https://github.com/mini-app-polis/deejaytools-com/commit/331ca3a845752a3db3b3f96e900405d2a93350a9))
* extend timeout to 5 min for song upload route (Drive uploads) ([a7a5931](https://github.com/mini-app-polis/deejaytools-com/commit/a7a59314a5b79e1e02e38662304034110a26ed2e))

# [1.47.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.46.0...v1.47.0) (2026-05-03)


### Bug Fixes

* adjusting my content queue position ([f9ac93a](https://github.com/mini-app-polis/deejaytools-com/commit/f9ac93aa5ab85d2502e38ea8b98f42f4b94dfb67))
* adjusting my content queue position ([a9144d5](https://github.com/mini-app-polis/deejaytools-com/commit/a9144d5d095554ef7626468c335e74a1a7bc3fec))
* run count is per partnership not per user across all pairs ([c7f9eca](https://github.com/mini-app-polis/deejaytools-com/commit/c7f9ecab5bd919aa426d482e2caf898969f778c4))
* run count uses all user pair IDs to handle partner re-creation ([7587be5](https://github.com/mini-app-polis/deejaytools-com/commit/7587be523679a819999be3c4d7746bcd360b0b84))
* runCount undefined fallback and queue badge labels ([432fd26](https://github.com/mini-app-polis/deejaytools-com/commit/432fd2627fb56fc5b1cd00872a0fd6097cba2b04))
* use queueEntries entity IDs as authoritative source in GET /mine ([9b8828d](https://github.com/mini-app-polis/deejaytools-com/commit/9b8828d7edf4973ab780ccac5f3831722845aa7d))


### Features

* show run count and improve check-in card layout on My Content ([a664982](https://github.com/mini-app-polis/deejaytools-com/commit/a66498235c4b3195dff03a78a939fee97bc3c2d2))

# [1.46.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.45.0...v1.46.0) (2026-05-03)


### Bug Fixes

* adjusting my content queue position ([01a773c](https://github.com/mini-app-polis/deejaytools-com/commit/01a773c3ab372a63062651144db7eb85f2de543e))
* adjusting my content queue position ([be2b1f3](https://github.com/mini-app-polis/deejaytools-com/commit/be2b1f309a0caae020c31efb854d62ea59fbc6da))
* run count uses all user pair IDs to handle partner re-creation ([59c7a6f](https://github.com/mini-app-polis/deejaytools-com/commit/59c7a6faea75a248fffe6390d26e0375d6300685))
* runCount undefined fallback and queue badge labels ([acaa587](https://github.com/mini-app-polis/deejaytools-com/commit/acaa58732afdafda4b0e47b20a8bad2bdb5d3e47))


### Features

* show run count and improve check-in card layout on My Content ([567d9c3](https://github.com/mini-app-polis/deejaytools-com/commit/567d9c371179185f5bc2e10bfffa2542ef60a5bf))

# [1.45.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.7...v1.45.0) (2026-05-03)


### Bug Fixes

* allowing checking while test data exists ([b80ab40](https://github.com/mini-app-polis/deejaytools-com/commit/b80ab409b7d1089abd81302281044f71b46d419c))


### Features

* display more session information ([33f61d6](https://github.com/mini-app-polis/deejaytools-com/commit/33f61d6d91b7869a4f6ba7c32f9ec84501d0b50b))
* display more session information ([69a7b62](https://github.com/mini-app-polis/deejaytools-com/commit/69a7b6287b9dc95662d455ca84023effddec886a))
* display more session information ([b26d0e5](https://github.com/mini-app-polis/deejaytools-com/commit/b26d0e55bc22eaf606d149e99ba13ed46a17cf10))

## [1.44.7](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.6...v1.44.7) (2026-05-03)


### Bug Fixes

* text ([d61256e](https://github.com/mini-app-polis/deejaytools-com/commit/d61256e1743fb4857a8977724d49a1f2377dcd30))

## [1.44.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.5...v1.44.6) (2026-05-03)


### Bug Fixes

* landing page text ([ad90846](https://github.com/mini-app-polis/deejaytools-com/commit/ad9084657938646bcd77e0e0efa2903250351002))

## [1.44.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.4...v1.44.5) (2026-05-03)


### Bug Fixes

* bug fixes ([ff4db1f](https://github.com/mini-app-polis/deejaytools-com/commit/ff4db1f2ff55e029558c45e665f73cbb931185bc))

## [1.44.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.3...v1.44.4) (2026-05-03)


### Bug Fixes

* bug fixes ([7381e70](https://github.com/mini-app-polis/deejaytools-com/commit/7381e70c45c8d283ff4ff7c8b92f349b9d54aed1))

## [1.44.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.2...v1.44.3) (2026-05-03)


### Bug Fixes

* edit sessions ([8d02129](https://github.com/mini-app-polis/deejaytools-com/commit/8d02129c0f25121bba107d7fd1e1845ad4b36789))

## [1.44.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.1...v1.44.2) (2026-05-03)


### Bug Fixes

* added error messaging ([d4b2d95](https://github.com/mini-app-polis/deejaytools-com/commit/d4b2d9527f536452a8928b3c95c8bf3ac228aa22))

## [1.44.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.44.0...v1.44.1) (2026-05-03)


### Bug Fixes

* edit options on sessions and events ([630f89e](https://github.com/mini-app-polis/deejaytools-com/commit/630f89e093850dede9a9f1b0ea0d5f147854ec8c))

# [1.44.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.43.0...v1.44.0) (2026-05-03)


### Features

* adding edit for events and sessions ([9533e92](https://github.com/mini-app-polis/deejaytools-com/commit/9533e92c254c981a79d7cc36a4127c7a6c54538c))

# [1.43.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.42.1...v1.43.0) (2026-05-03)


### Features

* adding all songs view to admin ui ([d6ce4ad](https://github.com/mini-app-polis/deejaytools-com/commit/d6ce4adb24d5d8770401b57100e7d30daa239f61))

## [1.42.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.42.0...v1.42.1) (2026-05-03)


### Bug Fixes

* updating admin users page ([17fdd79](https://github.com/mini-app-polis/deejaytools-com/commit/17fdd79d443f75a4c006b0264b6626827698f227))

# [1.42.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.41.2...v1.42.0) (2026-05-01)


### Bug Fixes

* admin inject and my content display ([c2be1ad](https://github.com/mini-app-polis/deejaytools-com/commit/c2be1ad5a964a31577d9216c9187fb2a6795ebb4))
* admin inject and my content display ([954a245](https://github.com/mini-app-polis/deejaytools-com/commit/954a24570a0eba7cbfc7827f1fd3590b80c41390))
* admin inject and my content display ([f303331](https://github.com/mini-app-polis/deejaytools-com/commit/f30333190639ff369c3834c53baeb0e46f85de80))


### Features

* shifting to my content ([18c2fd2](https://github.com/mini-app-polis/deejaytools-com/commit/18c2fd2223b349a5d03561b24a488806aaae3118))
* shifting to my content ([c6e89ce](https://github.com/mini-app-polis/deejaytools-com/commit/c6e89ceb7987b7fe4f62984bddc399c0d1436a53))

## [1.41.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.41.1...v1.41.2) (2026-05-01)


### Bug Fixes

* remove notes ([3ca63f8](https://github.com/mini-app-polis/deejaytools-com/commit/3ca63f8c622694291744a7c9910c0a8cd3ea90e9))

## [1.41.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.41.0...v1.41.1) (2026-05-01)


### Bug Fixes

* remove song name from sessions ([cb01559](https://github.com/mini-app-polis/deejaytools-com/commit/cb01559868058c6d0665378b818e743a6ae9bec3))

# [1.41.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.40.2...v1.41.0) (2026-05-01)


### Features

* showing song on admin live queue ([f63f441](https://github.com/mini-app-polis/deejaytools-com/commit/f63f4411d37cbb12e482a11c184ee812c09ea263))

## [1.40.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.40.1...v1.40.2) (2026-05-01)


### Bug Fixes

* move down functionality ([c32dc24](https://github.com/mini-app-polis/deejaytools-com/commit/c32dc24fd2bc1ddd7487d86fd9aff68a9124957a))

## [1.40.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.40.0...v1.40.1) (2026-05-01)


### Bug Fixes

* move down functionality ([23da307](https://github.com/mini-app-polis/deejaytools-com/commit/23da30716aa3cbb3ef3dbbe4732b2b88d2fd7e77))

# [1.40.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.39.0...v1.40.0) (2026-05-01)


### Bug Fixes

* UI adjustment for admin ([346fe75](https://github.com/mini-app-polis/deejaytools-com/commit/346fe75228db1aad970bb20284cf4a59f0880049))
* UI adjustment for admin ([2555b49](https://github.com/mini-app-polis/deejaytools-com/commit/2555b4938170437533d4bbca7890460507000414))
* UI adjustment for sessions ([b415204](https://github.com/mini-app-polis/deejaytools-com/commit/b415204d2ca0f19f836bf86cfef4f8b9fd85f714))


### Features

* adding reorder functionality to api and app ([f3e2b43](https://github.com/mini-app-polis/deejaytools-com/commit/f3e2b43648de4cc8d901cac36d86cc3eaaf7a759))

# [1.39.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.38.1...v1.39.0) (2026-05-01)


### Features

* updating fetch logic and promote process UI ([39f79e8](https://github.com/mini-app-polis/deejaytools-com/commit/39f79e8baddf2612f0c376de95562117666638b6))

## [1.38.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.38.0...v1.38.1) (2026-05-01)


### Bug Fixes

* descriptions ([cc9b8af](https://github.com/mini-app-polis/deejaytools-com/commit/cc9b8afb65b0d716782cd4bce0725048b966d3f0))

# [1.38.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.37.2...v1.38.0) (2026-05-01)


### Features

* updating google drive song organization ([116cd59](https://github.com/mini-app-polis/deejaytools-com/commit/116cd5942e33d4a606d0d134b5220f9d15c21a87))

## [1.37.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.37.1...v1.37.2) (2026-04-30)


### Bug Fixes

* how it works ([434349b](https://github.com/mini-app-polis/deejaytools-com/commit/434349b772b6145f48b582868553d83505f98253))

## [1.37.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.37.0...v1.37.1) (2026-04-30)


### Bug Fixes

* menu item locations ([2eb5046](https://github.com/mini-app-polis/deejaytools-com/commit/2eb504653db85a9d7035a23345f2d64e722f2f19))

# [1.37.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.36.3...v1.37.0) (2026-04-30)


### Features

* feedback form through brevo email ([3be3303](https://github.com/mini-app-polis/deejaytools-com/commit/3be3303c9eec65c7e5187aed5b34fc925463c479))

## [1.36.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.36.2...v1.36.3) (2026-04-29)


### Bug Fixes

* check in stuck post session ([8fbafa0](https://github.com/mini-app-polis/deejaytools-com/commit/8fbafa0dc08c9f06bc7500412fec742f783319d5))

## [1.36.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.36.1...v1.36.2) (2026-04-29)


### Bug Fixes

* check in stuck post session ([ec4fe17](https://github.com/mini-app-polis/deejaytools-com/commit/ec4fe17303faa371c17cafc378f53bcf2b9f92e0))

## [1.36.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.36.0...v1.36.1) (2026-04-29)


### Bug Fixes

* allowing users to remove song stuck in past session ([fb35118](https://github.com/mini-app-polis/deejaytools-com/commit/fb35118f45940a31a972b91d38863916e624812c))

# [1.36.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.35.0...v1.36.0) (2026-04-29)


### Features

* adding contract tests ([0361bc2](https://github.com/mini-app-polis/deejaytools-com/commit/0361bc2974814068d79cb043a9dbfe7d6f6a870a))

# [1.35.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.34.0...v1.35.0) (2026-04-29)


### Features

* type sharing added across app and api ([41a4358](https://github.com/mini-app-polis/deejaytools-com/commit/41a4358cfd3f01c36d8fec69b9e3ee742a7bc74a))

# [1.34.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.33.2...v1.34.0) (2026-04-29)


### Features

* testing, error reporting, and documentation ([3a02d02](https://github.com/mini-app-polis/deejaytools-com/commit/3a02d023a271676eecab6b906376ad8d63da0ebd))

## [1.33.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.33.1...v1.33.2) (2026-04-29)


### Bug Fixes

* tests only ([66aaf55](https://github.com/mini-app-polis/deejaytools-com/commit/66aaf55ecfa145f0222f36ce57410363cce99075))

## [1.33.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.33.0...v1.33.1) (2026-04-29)


### Bug Fixes

* doc and reliability update ([926c8b7](https://github.com/mini-app-polis/deejaytools-com/commit/926c8b7e6932ccb39d564c267b6ec49855848495))
* typecheck and tests ([3d15559](https://github.com/mini-app-polis/deejaytools-com/commit/3d155597c9b5dcec325dbdccc37bf73c92f95537))

# [1.33.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.32.5...v1.33.0) (2026-04-29)


### Features

* adding caching and rate limiting with supporting tests ([c6d6781](https://github.com/mini-app-polis/deejaytools-com/commit/c6d6781c44c4b98043c3b5837078ac3fbb308965))
* reliability update and test coverage ([35a6946](https://github.com/mini-app-polis/deejaytools-com/commit/35a69461a86db28c62d8b0959b4020f1cd90fa13))

## [1.32.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.32.4...v1.32.5) (2026-04-29)


### Bug Fixes

* check in admin view ([ca3db1b](https://github.com/mini-app-polis/deejaytools-com/commit/ca3db1b641741ed534c6619a0173b372e9123215))

## [1.32.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.32.3...v1.32.4) (2026-04-29)


### Bug Fixes

* address doc requirements ([d61f1d7](https://github.com/mini-app-polis/deejaytools-com/commit/d61f1d75ae8c8ae333b3eec2ecb8356c2d7fd956))

## [1.32.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.32.2...v1.32.3) (2026-04-29)


### Bug Fixes

* updating add song process for UX ([e1af262](https://github.com/mini-app-polis/deejaytools-com/commit/e1af2624997578a726150a553f574fddd2232840))
* updating add song process for UX ([8c70048](https://github.com/mini-app-polis/deejaytools-com/commit/8c70048c11e46e9caad9c684c8b633e81f959d8e))
* updating add song process for UX ([a1a276f](https://github.com/mini-app-polis/deejaytools-com/commit/a1a276f31160d97d56298c2020f1f4aa6cedaba3))

## [1.32.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.32.1...v1.32.2) (2026-04-28)


### Bug Fixes

* removing legacy song from front page ([98d2aa3](https://github.com/mini-app-polis/deejaytools-com/commit/98d2aa3909beab85d69c881120bb72c83f1d6905))

## [1.32.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.32.0...v1.32.1) (2026-04-28)


### Bug Fixes

* how it works update ([f8ce650](https://github.com/mini-app-polis/deejaytools-com/commit/f8ce650d566b329db6bb21fa214fbf855760f1cd))

# [1.32.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.31.3...v1.32.0) (2026-04-28)


### Features

* adding instruction details ([ba15a38](https://github.com/mini-app-polis/deejaytools-com/commit/ba15a3899af5b660d55f6f4045e75d0ec33de81a))

## [1.31.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.31.2...v1.31.3) (2026-04-28)


### Bug Fixes

* hover functionality unified ([2764358](https://github.com/mini-app-polis/deejaytools-com/commit/276435885255f2fe11069726983fa24592cb2757))

## [1.31.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.31.1...v1.31.2) (2026-04-28)


### Bug Fixes

* hover functionality unified ([ea1db7e](https://github.com/mini-app-polis/deejaytools-com/commit/ea1db7e2f40a3a2e63bee7ebb4ea6d2ec1d0b66f))

## [1.31.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.31.0...v1.31.1) (2026-04-28)


### Bug Fixes

* clickable cleanup and admin user setting ([65d3e15](https://github.com/mini-app-polis/deejaytools-com/commit/65d3e1543ada907a7dd8454a4e081e3174777ee7))

# [1.31.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.8...v1.31.0) (2026-04-28)


### Features

* updated homepage ([f27812d](https://github.com/mini-app-polis/deejaytools-com/commit/f27812d17de6adecd7f0f5d4b044c15683290792))

## [1.30.8](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.7...v1.30.8) (2026-04-28)


### Bug Fixes

* UI ([94e4e5c](https://github.com/mini-app-polis/deejaytools-com/commit/94e4e5c38c4e998102e5441fd55247ca4d668e1d))

## [1.30.7](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.6...v1.30.7) (2026-04-28)


### Bug Fixes

* logo updates ([f47c524](https://github.com/mini-app-polis/deejaytools-com/commit/f47c524d9f20ad7cf867361a8f843ecf97afb359))

## [1.30.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.5...v1.30.6) (2026-04-28)


### Bug Fixes

* sentry release tagging and logo updates ([9422df3](https://github.com/mini-app-polis/deejaytools-com/commit/9422df304b997d897fc50bb938177ad7e2194bfc))

## [1.30.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.4...v1.30.5) (2026-04-28)


### Bug Fixes

* testing improvements ([36b92b4](https://github.com/mini-app-polis/deejaytools-com/commit/36b92b49dd20394c58f1c075602e8319d24da601))
* updated documentation and tests ([2f378d6](https://github.com/mini-app-polis/deejaytools-com/commit/2f378d645d9f617b74c108e3da57c92c1decac2c))

## [1.30.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.3...v1.30.4) (2026-04-28)


### Bug Fixes

* moving pages ([c05b67e](https://github.com/mini-app-polis/deejaytools-com/commit/c05b67e8143ceffc4403f583b4e67bb9c6b0170f))
* moving pages ([63ef8e8](https://github.com/mini-app-polis/deejaytools-com/commit/63ef8e88dea11561c6230ef3e824cffb231943c4))

## [1.30.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.2...v1.30.3) (2026-04-28)


### Bug Fixes

* build ([2878337](https://github.com/mini-app-polis/deejaytools-com/commit/2878337db44a565233a5f207e9320ccf9ad85dca))
* build and logo size ([a80cb8c](https://github.com/mini-app-polis/deejaytools-com/commit/a80cb8c9baf637e52d43a3389c189c036fe87958))
* style changes including icon assets ([92a963a](https://github.com/mini-app-polis/deejaytools-com/commit/92a963aa0aead69e269e21d1e3b5580fd3934bbd))
* visual convenience ([df089f8](https://github.com/mini-app-polis/deejaytools-com/commit/df089f84954caceef1c29965c7eb68145b6318a8))

## [1.30.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.1...v1.30.2) (2026-04-28)


### Bug Fixes

* visual convenience ([c284708](https://github.com/mini-app-polis/deejaytools-com/commit/c2847089490189d752b947c95b134a0ae6e1e2f0))

## [1.30.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.30.0...v1.30.1) (2026-04-28)


### Bug Fixes

* adding timezone details and updating session creation form ([018db92](https://github.com/mini-app-polis/deejaytools-com/commit/018db92248d59147cb65a46a5ba18dd759a803d2))

# [1.30.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.29.1...v1.30.0) (2026-04-28)


### Features

* making times universal and setting at event setup ([06d8a7b](https://github.com/mini-app-polis/deejaytools-com/commit/06d8a7b7312e5a5765a0ea1e01090dfd6bffd9aa))

## [1.29.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.29.0...v1.29.1) (2026-04-28)


### Bug Fixes

* to apply sql migration ([a8bf65c](https://github.com/mini-app-polis/deejaytools-com/commit/a8bf65c90429394266bf0fa1feb5d316953afe79))

# [1.29.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.28.3...v1.29.0) (2026-04-28)


### Features

* making times universal and setting at event setup ([e449a4f](https://github.com/mini-app-polis/deejaytools-com/commit/e449a4f6676829b66ac92fd6606dbf1b24628b4f))

## [1.28.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.28.2...v1.28.3) (2026-04-28)


### Bug Fixes

* final xleanup ([f917c2f](https://github.com/mini-app-polis/deejaytools-com/commit/f917c2fd18a73a8396a276756e23a8b4659e74eb))
* fix ([f1511f2](https://github.com/mini-app-polis/deejaytools-com/commit/f1511f2c623529a593c24f8f0174c82fba1ed804))

## [1.28.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.28.1...v1.28.2) (2026-04-28)


### Bug Fixes

* allow removal of song with history ([acd23f0](https://github.com/mini-app-polis/deejaytools-com/commit/acd23f0efe26b952a1b081a86735822e031e3518))

## [1.28.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.28.0...v1.28.1) (2026-04-28)


### Bug Fixes

* allow removal of song with history ([3034d12](https://github.com/mini-app-polis/deejaytools-com/commit/3034d12302041a496d65855b6fe7162330ba2e07))

# [1.28.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.9...v1.28.0) (2026-04-28)


### Bug Fixes

* typecheck ([0419f7e](https://github.com/mini-app-polis/deejaytools-com/commit/0419f7e5c02f432a442d347606afc6635eed0acf))


### Features

* test suite update ([e43fe8b](https://github.com/mini-app-polis/deejaytools-com/commit/e43fe8bde3956bb5c1d5114c9be713ba61742753))

## [1.27.9](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.8...v1.27.9) (2026-04-28)


### Bug Fixes

* added testing ([1d9c2c2](https://github.com/mini-app-polis/deejaytools-com/commit/1d9c2c2a8bbc852a0efa0575a6a9a9bec0daf9d2))

## [1.27.8](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.7...v1.27.8) (2026-04-28)


### Bug Fixes

* font changes ([591ad71](https://github.com/mini-app-polis/deejaytools-com/commit/591ad7163a0e183f9bbcbd2b351899501c1a7d48))

## [1.27.7](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.6...v1.27.7) (2026-04-28)


### Bug Fixes

* updating count/numbers and colors of times ([8b3c607](https://github.com/mini-app-polis/deejaytools-com/commit/8b3c607b305c34fe35d1e891a89663c0ce50aa12))

## [1.27.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.5...v1.27.6) (2026-04-28)


### Bug Fixes

* adding division list to header ([094087e](https://github.com/mini-app-polis/deejaytools-com/commit/094087ec9ed2e643fd762fe1159c551806d9446a))

## [1.27.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.4...v1.27.5) (2026-04-28)


### Bug Fixes

* updating floor trial visuals ([2bdf34f](https://github.com/mini-app-polis/deejaytools-com/commit/2bdf34f50798a6b60fb80b21f0f7c52c90069a7c))

## [1.27.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.3...v1.27.4) (2026-04-28)


### Bug Fixes

* partnership names and check in at the top ([0a49e23](https://github.com/mini-app-polis/deejaytools-com/commit/0a49e230e4fd35320900fdac8ea15b2dcad4973f))

## [1.27.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.2...v1.27.3) (2026-04-28)


### Bug Fixes

* making floor trial board more obvious visually ([fff1a01](https://github.com/mini-app-polis/deejaytools-com/commit/fff1a018b86999749a0c51568dd43313ce53c9a7))

## [1.27.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.1...v1.27.2) (2026-04-28)


### Bug Fixes

* updating song display name format ([f5b0d9f](https://github.com/mini-app-polis/deejaytools-com/commit/f5b0d9f559ddda809232cdf865d2a57814debdbf))

## [1.27.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.27.0...v1.27.1) (2026-04-27)


### Bug Fixes

* updating nav bar functioning ([23517ad](https://github.com/mini-app-polis/deejaytools-com/commit/23517adca1630e77bd7de7d7a0f6397e2d3495fd))

# [1.27.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.26.3...v1.27.0) (2026-04-27)


### Features

* changing page setup for more seemless transition ([b7073ff](https://github.com/mini-app-polis/deejaytools-com/commit/b7073ffd67d2b29d6004ba3b91fba943bab9f1a4))

## [1.26.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.26.2...v1.26.3) (2026-04-27)


### Bug Fixes

* sort order of event ([215d983](https://github.com/mini-app-polis/deejaytools-com/commit/215d983fb8c2398b7f70e738d28187e0b3384adb))

## [1.26.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.26.1...v1.26.2) (2026-04-27)


### Bug Fixes

* sort order ([2a3bff0](https://github.com/mini-app-polis/deejaytools-com/commit/2a3bff0c977f454031e0572f7d759f1bfb97267d))

## [1.26.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.26.0...v1.26.1) (2026-04-27)


### Bug Fixes

* nav bar order and redirect ([5f69bef](https://github.com/mini-app-polis/deejaytools-com/commit/5f69bef0c57ad15ae757f5bff030882c626ab011))

# [1.26.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.25.1...v1.26.0) (2026-04-27)


### Features

* check in page to replace events ([5821bbe](https://github.com/mini-app-polis/deejaytools-com/commit/5821bbe39d9bd0f44ab914ef2781aeba38d43fd1))

## [1.25.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.25.0...v1.25.1) (2026-04-27)


### Bug Fixes

* ui display cleanup ([05b61b1](https://github.com/mini-app-polis/deejaytools-com/commit/05b61b194d4fd8b0e13bb967d68a353303bec535))

# [1.25.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.24.1...v1.25.0) (2026-04-27)


### Features

* adding legacy song pairing to users ([d63155d](https://github.com/mini-app-polis/deejaytools-com/commit/d63155d26d2944fbc55ce63f3b03b04eb7c73a11))

## [1.24.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.24.0...v1.24.1) (2026-04-27)


### Bug Fixes

* updating session display ([3077e09](https://github.com/mini-app-polis/deejaytools-com/commit/3077e09e9a6c8d3e809b2665f17c0ff6e6121e3f))

# [1.24.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.23.0...v1.24.0) (2026-04-27)


### Features

* making injection easier for random data, or override ([31e7f16](https://github.com/mini-app-polis/deejaytools-com/commit/31e7f16eb45563535144e18a460683e957a76b42))

# [1.23.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.6...v1.23.0) (2026-04-27)


### Features

* test data admin panel for checkin plus new endpoint ([925a0eb](https://github.com/mini-app-polis/deejaytools-com/commit/925a0eb3159a20b0c4f1131abd6d65aef72a19c5))

## [1.22.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.5...v1.22.6) (2026-04-26)


### Bug Fixes

* showing queues ([dd65e51](https://github.com/mini-app-polis/deejaytools-com/commit/dd65e512120e2de9f49c20bac139834967b66940))

## [1.22.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.4...v1.22.5) (2026-04-26)


### Bug Fixes

* adjusting check in flow ([9091352](https://github.com/mini-app-polis/deejaytools-com/commit/9091352c7cf2b2f13b32d3fb6233e78aa5539a19))

## [1.22.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.3...v1.22.4) (2026-04-26)


### Bug Fixes

* check in flow based off set up songs ([82f5590](https://github.com/mini-app-polis/deejaytools-com/commit/82f5590c205fa6c75f7c13aaa862117e0d9a098e))

## [1.22.3](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.2...v1.22.3) (2026-04-26)


### Bug Fixes

* tests update ([dc86f0a](https://github.com/mini-app-polis/deejaytools-com/commit/dc86f0a1dbfe2a4f9b09b59bde8b29d7dd88be67))
* updating stale process ([fcf5f79](https://github.com/mini-app-polis/deejaytools-com/commit/fcf5f79a53c9feaeb63445d3bc551d1f378e119c))

## [1.22.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.1...v1.22.2) (2026-04-26)


### Bug Fixes

* modifying status which is derived ([4e30b76](https://github.com/mini-app-polis/deejaytools-com/commit/4e30b7664b11087635e2fe986907c2cba105e363))

## [1.22.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.22.0...v1.22.1) (2026-04-26)


### Bug Fixes

* admin and page setup ([6cf0435](https://github.com/mini-app-polis/deejaytools-com/commit/6cf043593c706d76023c25ce90eb34d43018e7d3))

# [1.22.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.21.0...v1.22.0) (2026-04-26)


### Features

* separating admin functionality ([6317628](https://github.com/mini-app-polis/deejaytools-com/commit/6317628bd2d9e19b42a981d569ea142d97c0d98c))

# [1.21.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.20.2...v1.21.0) (2026-04-26)


### Features

* **app:** mobile-first redesign + WCS-inspired visual theme ([7bdba1a](https://github.com/mini-app-polis/deejaytools-com/commit/7bdba1a9badf764c286ec432b292520937f76461))

## [1.20.2](https://github.com/mini-app-polis/deejaytools-com/compare/v1.20.1...v1.20.2) (2026-04-26)


### Bug Fixes

* Tests: full coverage of the new endpoint ([05c24fb](https://github.com/mini-app-polis/deejaytools-com/commit/05c24fb34ef9c12f880e70d571e3ca56d1ffe8eb))

## [1.20.1](https://github.com/mini-app-polis/deejaytools-com/compare/v1.20.0...v1.20.1) (2026-04-26)


### Bug Fixes

* update versioning of songs ([bcdf710](https://github.com/mini-app-polis/deejaytools-com/commit/bcdf710e23e722b3fbf7d7fe982d5cc3e92ea8a7))

# [1.20.0](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.6...v1.20.0) (2026-04-26)


### Features

* major checkpoint, sessions in, model updated, uploads fixed ([ec69e68](https://github.com/mini-app-polis/deejaytools-com/commit/ec69e6875c1e9927cd12b7787f05422600d48983))

## [1.19.6](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.5...v1.19.6) (2026-04-26)


### Bug Fixes

* added hardening ([cac60a5](https://github.com/mini-app-polis/deejaytools-com/commit/cac60a5128d496c695fafc68bfc62abb983983fe))

## [1.19.5](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.4...v1.19.5) (2026-04-26)


### Bug Fixes

* upload process hardening ([4ecc555](https://github.com/mini-app-polis/deejaytools-com/commit/4ecc555d370a233822dac370c221fe5b78d1c21b))

## [1.19.4](https://github.com/mini-app-polis/deejaytools-com/compare/v1.19.3...v1.19.4) (2026-04-26)


### Bug Fixes

* resolving 500 error ([af91044](https://github.com/mini-app-polis/deejaytools-com/commit/af910445a922f6fdb4f3c7ef003befd740b9a2a5))


### Reverts

* restore simple @hono/node-server ([0c27030](https://github.com/mini-app-polis/deejaytools-com/commit/0c270304c41418ea1547c1561e106e87703354e2))

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
