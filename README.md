# রক্তদাতা নেটওয়ার্ক বাংলাদেশ (Bangladesh National Blood Donor Network)

React + TypeScript + Vite + Tailwind CSS ফ্রন্টএন্ড, Supabase ব্যাকএন্ড (PostgreSQL + PostGIS, Auth, Storage)।
লগইন: **শুধু Email OTP** (SMS সম্পূর্ণ বাদ)।

## ১. যা তৈরি হয়েছে / হয়নি

| তৈরি | অবস্থা |
|---|---|
| Email OTP লগইন/রেজিস্ট্রেশন (৬ সংখ্যা, রিসেন্ড কাউন্টডাউন, মেয়াদ-উত্তীর্ণ/ভুল কোড, লোডিং, বাংলা-ইংরেজি) | ✅ |
| লগআউট ও স্থায়ী সেশন (Supabase session persist) | ✅ কোডে আছে |
| প্রোফাইলে ইমেইল ও যাচাই-অবস্থা; ফোন শুধু ঐচ্ছিক, **কখনও "যাচাইকৃত" নয়** | ✅ |
| প্রোফাইল, ডোনার, ব্লাড গ্রুপ, বিভাগ→জেলা→উপজেলা→ইউনিয়ন, GPS, ছবি আপলোড | ✅ (আগের মতোই) |
| **রক্তের অনুরোধ** জমা, তালিকা (ফিল্টার, পেজিনেশন), বিস্তারিত, সাড়া দেওয়া, সম্পন্ন/বাতিল | ✅ নতুন |
| **ডোনার খোঁজা** (ব্লাড গ্রুপ + ৫/১০/২৫/৫০/কাস্টম কিমি বা জেলা/উপজেলা) | ✅ নতুন |
| **ফোনের গোপনীয়তা:** সাড়া দেওয়ার আগে কেউ ফোন নম্বর দেখে না; ডোনার চাইলে শেয়ার বন্ধ করতে পারে | ✅ |
| **বেসিক অ্যাডমিন প্যানেল** (সারসংক্ষেপ, ব্যবহারকারী তালিকা/ব্লক, অনুরোধ স্ট্যাটাস) | ✅ নতুন |
| PWA ম্যানিফেস্ট ও আইকন (ফোনে ইনস্টল) | ✅ |

| **তৈরি হয়নি** | |
|---|---|
| Push Notification (FCM), Edge Functions, স্বয়ংক্রিয় ডোনার-সতর্কতা | ❌ (ডোনারদের অনুরোধ তালিকা নিজে দেখতে হয়) |
| ইন-অ্যাপ মেসেজিং, রক্তদান নিশ্চিতকরণ/`donation_history` ও `total_donations` আপডেট | ❌ |
| Fake-request শনাক্তকরণ, রিপোর্ট/অভিযোগ, Favorite, Feedback, Help/Privacy/Terms পেজ, অ্যাকাউন্ট ডিলিট, Dark mode | ❌ |
| CAPTCHA, অফলাইন/Service Worker | ❌ |
| `package-lock.json` | ❌ (নিচে কারণ) |

## ২. যা যাচাই হয়েছে (সৎ হিসাব)

| পরীক্ষা | ফলাফল |
|---|---|
| `npm install` | ❌ **চালানো যায়নি।** কারণ: এই পরিবেশে `registry.npmjs.org` DNS-এ মেলে না, আর প্রক্সি দিয়ে গেলে নীতি-অনুযায়ী `403` আসে। প্যাকেজ বা ভার্সনের সমস্যা নয় |
| `npm ci` | ❌ চালানো যায়নি (`package-lock.json` নেই; লক ফাইল তৈরি করতে `npm install` লাগে) |
| `npm run typecheck` / `npm run build` | ❌ চালানো যায়নি। শুধু আংশিক টাইপচেক হয়েছে (React/Vite টাইপ ছাড়া); কোডের নিজস্ব কোনো টাইপ এরর পাইনি, বাকি এরর শুধু অনুপস্থিত `@types/react`/`vite/client`-এর |
| `npm test` (আসল vitest) | ❌ চালানো যায়নি। একই ২৪টি টেস্ট `tsc` দিয়ে কম্পাইল করে ছোট শিমে চালিয়েছি: ✅ ২৪ পাস |
| Migration ০১–০৮ অস্থায়ী PostgreSQL 16-এ (PostGIS ছাড়া) | ✅ চলেছে; ফোন-নিয়ম, ইমেইল জাল প্রতিরোধ, অনুরোধ তৈরি/সাড়া/বন্ধ, গোপনীয়তা পরীক্ষিত |
| ব্লাড-রিকোয়েস্টে ২৪ ঘণ্টায় ৫টির সীমা (এই ধাপে) | ⚠️ পরীক্ষা অসম্পূর্ণ (আমার টেস্ট-কুয়েরির ভুলে চলেনি; trigger আগের ধাপেরই) |
| আসল Supabase-এ Email OTP, ইমেইল টেমপ্লেট, লগআউট/সেশন, ব্রাউজারে UI, মোবাইল রেসপন্সিভ, কনসোল এরর, PostGIS কোয়েরি | ❌ **পরীক্ষা হয়নি** (আপনার প্রজেক্টে প্রবেশাধিকার নেই, ইচ্ছাকৃতভাবে; ব্রাউজার চালানো হয়নি) |
| Deploy | ❌ করা হয়নি |

**আপনার মেশিনে প্রথমে (Node 20+):**
```bash
npm install            # package-lock.json তৈরি হবে → commit করুন
npm run typecheck && npm test && npm run build
npm ci                 # লক ফাইল থেকে পরিষ্কার ইনস্টল যাচাই
```
কোনো এরর এলে ঠিক করে তবেই deploy করুন (`npm run build` টাইপ এররে ফেল করে, ইচ্ছাকৃত)।

## ৩. ⚠️ SMS বাদ দেওয়ার ফল: পুরনো ফোন-অ্যাকাউন্ট

যারা আগে শুধু মোবাইল OTP দিয়ে রেজিস্টার করেছেন, তাদের অ্যাকাউন্টে ইমেইল নেই। SMS লগইন বন্ধ, তাই তারা ঢুকতে পারবেন না। তাদের ডোনার প্রোফাইল ডাটাবেজে অক্ষত আছে। পুনরুদ্ধার:
Supabase Dashboard → Authentication → Users → ব্যবহারকারী → তার ইমেইল যোগ করে "confirmed" করুন; এরপর তিনি ওই ইমেইলে OTP নিয়ে একই প্রোফাইলে ঢুকবেন। (অন্য ইমেইলে নতুন অ্যাকাউন্ট খুললে সেটি আলাদা প্রোফাইল হবে; অ্যাপ কখনও দুটি অ্যাকাউন্ট নিজে জোড়া লাগায় না।) আপনার প্রজেক্টে এমন ব্যবহারকারী আছে কিনা: `select id, phone from auth.users where email is null;`

## ৪. Supabase সেটআপ (আমি আপনার প্রজেক্টে কিছু বদলাইনি)

**Database**
1. Extensions → **PostGIS** চালু করুন।
2. `supabase/migrations/`-এর সব ফাইল নাম-ক্রমে চালান: `20261103000001` … `20261103000006`, `20261104000001`, **`20261104000002_email_only_and_requests.sql`**। পুরনো migration এডিট করবেন না।
   - ০৮ নম্বর: ফোনকে অযাচাইকৃত যোগাযোগ-তথ্য করে (সব `phone_verified` = false; `profiles.phone`-এর unique সীমা তোলে, কারণ অযাচাইকৃত নম্বরে uniqueness নিরাপদ নয়), এবং `create_blood_request`, `respond_to_request`, `close_request` যোগ করে। কোনো টেবিল/সারি মোছে না।
3. প্রথম Super Admin (নিজে একবার লগইন করার পর):
   ```sql
   insert into public.admin_roles (user_id, role) values ('<আপনার-user-id>', 'super_admin');
   ```

**Authentication → Sign In / Providers**
- **Email: ON**, **Confirm email: ON**, নতুন ব্যবহারকারীর সাইন-আপ **ON**, Email OTP length **6**।
- **Phone provider: OFF** রাখুন (কোনো SMS প্রোভাইডার বা খরচ লাগবে না)।

**Authentication → Email Templates** (OTP কোডের জন্য জরুরি; ডিফল্টে লিংক থাকে)
| Supabase টেমপ্লেট | ফাইল |
|---|---|
| **Confirm sign up** (নতুন ব্যবহারকারী) | `supabase/email-templates/confirm-signup.html` |
| **Magic Link** (পুরনো ব্যবহারকারী) | `supabase/email-templates/magic-link.html` |

পুরো HTML পেস্ট করুন; মূল অংশ `{{ .Token }}` (৬ সংখ্যার কোড)। Subject: `SUBJECTS.txt`।

**Custom SMTP (প্রোডাকশনে প্রয়োজন):** Supabase-এর বিল্ট-ইন ইমেইলে ডিফল্ট সীমা ঘণ্টায় ২টি ([সূত্র](https://supabase.com/docs/guides/auth/rate-limits))। Project Settings → Authentication → SMTP-এ নিজের SMTP (Resend/Brevo/SES ইত্যাদি) দিন; পাসওয়ার্ড শুধু Dashboard-এ। ডোমেইনে SPF/DKIM সেট করুন।

**সীমা:** ডিফল্টে OTP অনুরোধ/যাচাই প্রতি IP-তে ৫ মিনিটে ৩০টি, একই ব্যবহারকারীর নতুন কোডের মধ্যে ৬০ সেকেন্ড। অ্যাপ ৬০ সেকেন্ড কাউন্টডাউন ও ৫ বার ভুলে লক দেখায় (UX); আসল সীমা সার্ভারে।

⚠️ **CAPTCHA (Attack Protection) এখনই চালু করবেন না:** ফ্রন্টএন্ড CAPTCHA টোকেন পাঠায় না; চালু করলে সব OTP অনুরোধ ব্যর্থ হবে।

**URL Configuration:** Site URL = আপনার প্রোডাকশন ডোমেইন; Redirect URLs-এ `http://localhost:5173/**`।

## ৫. Environment Variables

| নাম | কোথায় | মান |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` ও Vercel | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` ও Vercel | **anon (public)** key |

আর কিছু লাগে না। SMS-সংক্রান্ত কোনো ভ্যারিয়েবল নেই। `service_role` key বা SMTP পাসওয়ার্ড কখনও কোডে বা `VITE_` ভ্যারিয়েবলে দেবেন না (`VITE_` সবকিছু ব্রাউজারে প্রকাশ পায়)।

## ৬. GitHub ও Vercel-এ publish (আমি কিছু deploy/push করিনি)

```bash
npm install && npm run typecheck && npm test && npm run build   # আগে নিজের মেশিনে পাস করান
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<আপনার-ইউজার>/<রিপো>.git
git push -u origin main
```
1. vercel.com → Add New → Project → GitHub রিপো Import। Framework: **Vite** (স্বয়ংক্রিয়)। Build: `npm run build`, Output: `dist` (`vercel.json`-এ আছে)।
2. Environment Variables-এ ওপরের দুটি (Production ও Preview) দিন → Deploy।
3. `vercel.json` সব রুটকে `index.html`-এ পাঠায়, তাই `/requests/...` রিফ্রেশে 404 হয় না।
4. Deploy-এর পর Vercel URL Supabase → Authentication → URL Configuration-এর **Site URL**-এ দিন। তারপর নিজের ইমেইলে OTP লগইন পরীক্ষা করুন।

**কাস্টম ডোমেইন:** Vercel → Project → Settings → Domains → ডোমেইন যোগ করুন। Vercel যে DNS রেকর্ড দেখায় (সাধারণত root-এর জন্য A, `www`-এর জন্য CNAME) ডোমেইন রেজিস্ট্রারের DNS-এ সেটি হুবহু বসান; HTTPS স্বয়ংক্রিয়। সক্রিয় হলে Supabase **Site URL** ও Redirect URLs নতুন ডোমেইনে বদলান।

## ৭. Android ফোনে ব্যবহার/ইনস্টল

1. Deploy করা HTTPS ঠিকানা Android-এ **Chrome**-এ খুলুন।
2. ইমেইল OTP দিয়ে লগইন করুন।
3. Chrome মেনু (⋮) → **Install app** / **Add to Home screen** → নিশ্চিত করুন। হোম স্ক্রিনে আইকন আসবে এবং অ্যাপের মতো পূর্ণ-পর্দায় খুলবে (`public/manifest.webmanifest`)।
4. লোকেশন লাগলে Chrome-এ অনুমতি দিন (GPS শুধু HTTPS-এ কাজ করে)।
- এটি PWA; Play Store অ্যাপ নয়, আর এখনও আমি ফোনে এটি চালিয়ে পরীক্ষা করিনি। Service Worker/অফলাইন/Push নেই। Play Store অ্যাপ লাগলে পরে Capacitor ইত্যাদি দিয়ে করতে হবে (বাকি কাজ)।

## ৮. ফোল্ডার কাঠামো

```
index.html, vite.config.ts, vitest.config.ts, tsconfig.json, vercel.json, .env.example, package.json
public/                 favicon, আইকন, manifest.webmanifest
src/pages/              Login, Home, Profile, Donor, Requests, RequestNew, RequestDetail, DonorSearch, Admin
src/lib/                supabase, authFlows/authErrors/authApi, requestsApi/requestsMeta, validation, types…
src/components/         OtpForm, EmailStatus, LocationPicker…
tests/auth.test.ts      লগইন, ত্রুটি, কাউন্টডাউন, "SMS নেই", অনুবাদ পরীক্ষা
supabase/migrations/    SQL (ক্রমে চালান)      supabase/email-templates/   OTP ইমেইল
docs/ARCHITECTURE.md
```

## ৯. অন্যান্য সীমাবদ্ধতা

- রক্তদানের ১২০ দিনের হিসাব অস্থায়ী; চিকিৎসক দিয়ে যাচাই করান। অ্যাপ চিকিৎসাগত যোগ্যতা নিশ্চিত করে না।
- Location ডেটা: [nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode) (MIT); উপজেলা ৪৯৪টি (সরকারি ৪৯৫) — প্রকাশের আগে যাচাই করুন।
- PostGIS দূরত্ব-কোয়েরি আসল Supabase-এ পরীক্ষা হয়নি।
- `components/AvatarUpload.tsx`, `GpsLocation.tsx`, `LocationSelect.tsx` কোথাও ব্যবহৃত হয় না (মুছিনি)।
- আসল ডোনার/অনুরোধ ডেটা ছাড়া কোনো ডামি ডেটা নেই; খালি অবস্থায় "কিছু পাওয়া যায়নি" দেখায়।
