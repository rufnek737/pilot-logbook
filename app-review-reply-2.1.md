# App Review 회신문 (Guideline 2.1 — Information Needed)

제출 ID `2c6c1640-c59c-4855-ba32-0732411d54f6` · 2026-10-26 거절

아래 영문 전체를 **① App Store Connect "앱 심사에 회신"** 과
**② 앱 심사 정보 > 비고(Notes)** 양쪽에 붙여넣는다. (애플이 양쪽에 넣으라고 명시함)

---

Thank you for the review. Please find the requested information below. The same
information has been added to the Notes field of the App Review Information section.

**2. Purpose and target audience**

FlyRecord (날고적고) is a personal electronic flight logbook for airline pilots. Pilots
are required to keep a record of every flight they operate — flight number, route, block
times, role (PIC/SIC), night and instrument time, landing type and recency — and today
most of them maintain this by hand in paper logbooks or spreadsheets, re-typing data that
already exists in their roster. That is slow and error-prone, and mistakes matter because
the log is used for licence renewals, recency checks and job applications.

FlyRecord solves this by letting the pilot record a flight in one screen, calculating
credited time automatically from duty codes, summing any date range, flagging entries that
would distort those totals (missing instrument time, duplicates), and tracking landing
recency and licence expiry dates. The target audience is commercial airline pilots; the
user interface is Korean, and the initial target market is pilots based in South Korea.

The app is an independent personal record-keeping tool. It is not affiliated with,
endorsed by, or operated on behalf of any airline or civil aviation authority, and the app
states in its Terms and in the app itself that it is a supporting tool and not an official
record issued by an airline or an aviation authority.

**3. Setting up and accessing the main features**

A demo account is provided in the App Review Information section. Sign in with that
account on the login screen (email and password), then:

- **Flight log (home)** — the list of recorded flights. Tap a card to open and edit it.
- **Add a flight manually** — tap the "+" button. This is the primary flow and requires no
  external service.
- **Import from a file** — menu (☰) > Excel/CSV import. A sample file can be provided on
  request.
- **Statistics and credited time** — menu (☰) > statistics. Totals by date range and by
  duty code.
- **Record check** — finds missing instrument time and duplicate entries.
- **Currency / licence tracking** — recent take-offs and landings, and licence expiry.
- **Account deletion** — tap the profile chip in the top right (or menu (☰) > 계정 및
  도움말) > 회원 탈퇴. Confirmation requires re-entering the password and typing the word
  "탈퇴". This permanently deletes the account and all synced records.

**4. External services, tools and platforms**

- **Firebase Authentication** (Google LLC) — email/password and Google sign-in.
- **Cloud Firestore** (Google LLC) — synchronisation of the user's own flight records.
- **Cloudflare Workers** (own backend, `crewconnex.tae26001.workers.dev`) — performs the
  roster retrieval described below on the user's behalf, and verifies In-App Purchase
  receipts.
- **App Store Server API** (Apple) — server-side verification of the In-App Purchase.
- **Google Play Developer API** (Google) — the equivalent verification on Android.
- **CrewConnex** — the crew scheduling portal of the user's own airline. See item 6.

The app contains no advertising SDK, no analytics SDK, no AI service, and does not use the
advertising identifier. Attachments the user adds as evidence of past experience are stored
only on the device and are never uploaded.

**5. Regional differences**

There are none. The app behaves identically in every region and the content is the same
everywhere; the interface is available in Korean only. The optional roster import described
in item 6 can only be used by pilots who hold an account with the supported airline, but
that is a property of the user's employment, not of the region the user is in. All other
features, and the In-App Purchase, work the same way worldwide.

**6. Regulated industry and third-party material**

FlyRecord does not provide any aviation service and does not issue, certify or replace any
official document. It records and totals data that the pilot already possesses, in the same
way a paper logbook does. No licence or authorisation is required to publish it, and the
app carries an explicit disclaimer to that effect.

One optional convenience feature deserves explanation. Pilots at the supported airline can
choose to import their own recent flights instead of typing them. When the user explicitly
requests an import, the user enters their own employee credentials for their airline's crew
portal (CrewConnex), and the app's backend signs in **as that user** and retrieves **only
that user's own duty roster**. The credentials are used for that single request and are not
stored. No airline proprietary content is copied, reproduced or redistributed, and nothing
is retrieved for any person other than the user.

The demo account provided to App Review is not an airline employee account, so this one
feature cannot be exercised during review. Every other feature — manual entry, file import,
statistics, credited time, record check, currency tracking, backup, printing — is fully
available with the demo account and does not depend on any third party.

**7. In-App Purchase**

There is a single In-App Purchase:

- **Product:** 자동 가져오기 평생 이용권 (Auto-import Lifetime Pass)
- **Product ID:** `com.rufnekcrew.flylog.autoimport.lifetime`
- **Type:** Non-consumable, one-time payment (KRW 9,900). It is not a subscription and does
  not auto-renew.
- **What it unlocks:** unlimited use of the optional roster import described in item 6. The
  first 50 imported flights are free on every account; after that, the pass removes the
  limit permanently.
- **What stays free:** everything else — manual entry, file import, viewing and editing
  existing records, statistics, credited time, record check, currency tracking, backup,
  printing and PDF. Existing records are never locked behind the purchase.

To reach the purchase flow: open the menu (☰) and tap **이용권 현황**, or tap the usage card
on the home screen, or open 계정 및 도움말 and tap **자동 가져오기 이용권**. The sheet shows
the current usage and a **평생 이용권** button that starts the standard StoreKit purchase.
**이전 구매 복원** restores the purchase on a new device or after reinstalling.

**1. Screen recording**

A screen recording captured on a physical iPhone running the latest iOS is attached. It
begins with launching the app and shows, in order: sign-in with the demo account, the
flight log list, opening a record, adding a flight manually and saving it, the statistics
screen, the currency/recency screen, the In-App Purchase sheet, and the account deletion
flow (shown up to the final confirmation, which was not completed so the demo account
remains available to App Review).

The recording was made with build 4, which is identical to the submitted build except for
two corrections made after the previous submission: the launch screen now shows the app's
current name (FlyRecord / 날고적고) instead of an outdated working title, and a watermark
left over from a stock video asset was removed from the sign-in background.

Please let us know if any further information would be helpful.
