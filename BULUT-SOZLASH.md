# Qarz Daftari — bulutni sozlash (bir marta, ~15 daqiqa, bepul)

Bu sozlama **faqat bir marta** qilinadi (siz — ilova egasi). Keyin ilovani o'rnatgan har bir odam
o'zi ro'yxatdan o'tadi. Karta talab qilinmaydi.

## 1. Firebase loyihasi ochish
1. https://console.firebase.google.com ga Google akkaunt bilan kiring.
2. **Create a project** (Loyiha yaratish) → nomi: `qarz-daftari` → Continue.
3. Google Analytics so'ralsa — **o'chirib qo'ying** (kerak emas) → **Create project**.

## 2. Login-parol bilan kirishni yoqish
1. Chap menyu: **Build → Authentication** → **Get started**.
2. **Sign-in method** bo'limida **Email/Password** ni tanlang → birinchi tugmani **Enable** qiling → **Save**.

## 3. Ma'lumotlar bazasini ochish
1. Chap menyu: **Build → Firestore Database** → **Create database**.
2. Joylashuv (location): **eur3 (Europe)** yoki yaqinroq biror Yevropa hududi → Next.
3. **Start in production mode** → **Create**.
4. Yuqoridagi **Rules** bo'limiga o'ting. U yerdagi hamma matnni o'chirib,
   `firestore-qoidalar.txt` faylidagi matnni joylang → **Publish**.
   (Bu qoida har bir hisob faqat o'z ma'lumotini ko'rishini ta'minlaydi.)

## 4. Ilovani Firebase'ga ulash
1. Chap yuqorida ⚙️ → **Project settings**.
2. Pastda **Your apps** → **</>** (Web) belgisini bosing → nomi: `qarz-daftari` → **Register app**.
   ("Firebase Hosting" belgisini qo'ymang.)
3. Ekranda shunga o'xshash matn chiqadi:
   ```
   const firebaseConfig = {
     apiKey: "AIza....",
     authDomain: "qarz-daftari-xxxx.firebaseapp.com",
     ...
   };
   ```
   Faqat shu `const firebaseConfig = { ... };` qismini nusxalang.
4. GitHub'da repozitoriyingizni oching → `www` papkasi → `firebase-config.js` → ✏️ (tahrirlash) belgisi.
5. Fayldagi `const firebaseConfig = { ... "SHU_YERGA" ... };` qismining **o'rniga** nusxalagan matnni joylang →
   **Commit changes**.
6. Actions'da yangi APK yig'iladi → uni o'rnating.

> `apiKey` maxfiy parol emas — u faqat ilovani loyihangizga ulaydi. Ma'lumotni 3-bosqichdagi qoida himoya qiladi.

## Qanday ishlaydi
- Ilova ochilganda **Kirish / Ro'yxatdan o'tish** oynasi chiqadi.
- Har bir do'kon o'zi ro'yxatdan o'tadi: login + parol (kamida 6 belgi).
- Shu do'kondagi 2–3 kishi **bir xil login va parol** bilan kiradi — hammasi bitta umumiy daftarni ko'radi.
- **☑ Parolni eslab qolish** — belgilansa, keyingi safar ilova login so'ramay ochiladi.
- Internet bo'lmasa ham yozaverasiz — internet kelganda o'zi yuboriladi (tepada ⏳, yuborilgach ☁️, internet yo'q bo'lsa 📴).
- O'chirilgan mijoz yoki yozuv **Sozlama → O'chirilganlar** da 30 kun turadi va qaytarib olinadi.
- Telefonda avval yozilgan ma'lumot birinchi kirishda bulutga ko'chiriladi (ilova so'raydi).
- Login o'rniga **Gmail** yozilsa, "Parolni unutdim" orqali parolni tiklash mumkin.

## Bepul limit
Firestore bepul tarifi: 1 GiB joy, kuniga 50 000 o'qish va 20 000 yozish.
Ilova faqat o'zgargan yozuvlarni yuklaydi, shuning uchun 20–50 ta do'kon bemalol sig'adi.
Foydalanishni kuzatish: Firebase konsol → Firestore → **Usage**.
