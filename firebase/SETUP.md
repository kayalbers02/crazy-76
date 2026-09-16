# Crazy 76 koppelen aan Firebase

De teamapp en het begeleidersdashboard delen één Firebase-project: Firestore voor de stand en
Storage voor de foto's en video's.

## Eén keer instellen

1. Maak op https://console.firebase.google.com een project `crazy-76` (Analytics uit).
2. Zet het project op de **Blaze**-bundel (nodig voor Storage; kosten voor een weekend ≈ €0–1).
3. **Build › Firestore Database › Database maken** (locatie eur3, productiemodus).
4. **Build › Storage › Aan de slag** (productiemodus).
5. **Projectinstellingen › Je apps › `</>`** → web-app `crazy-76` registreren → het `firebaseConfig`-blok
   kopiëren naar `shared/config.js` (vervang `firebase: null`).
6. **Firestore Database › Regels**: plak de inhoud van `firestore.rules` en publiceer.
7. **Storage › Regels**: plak de inhoud van `storage.rules` en publiceer.

Daarna: commit, push, en de apps op https://kayalbers02.github.io/crazy-76/ werken voor iedereen.

## Tijdens het spel

- Teams: `https://kayalbers02.github.io/crazy-76/` (teamcodes standaard 1010 en 2020).
- Begeleiders: `https://kayalbers02.github.io/crazy-76/begeleiders/` (pincode standaard 7676).
- Codes en pincode aanpassen: dashboard › Meer.

## Oefenen zonder Firebase

Zet `?mock=1` achter het adres; alles blijft dan in die browser (ook tussen tabbladen).
