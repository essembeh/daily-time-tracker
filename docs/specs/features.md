# daily-time-tracker — Spec MVP

Extension GNOME Shell de **saisie manuelle** du temps de travail quotidien, pour
préparer une facturation à l'heure.

- **Statut** : draft
- **Date** : 2026-09-12
- **Cible** : GNOME Shell 50 (NixOS 26.05)

> Cette spec est rédigée et itérée **en français**. Le reste du dépôt (code,
> commentaires, commits, README) est **en anglais**.

---

## 0. Principe directeur — KISS

**Peu de réglages, peu de code, aucune dépendance.** Cette section est la
constitution du projet : en cas de doute entre une fonctionnalité et la simplicité,
c'est la simplicité qui gagne.

- **Tout est local.** Pas de synchro, pas de cloud, pas d'API, pas de réseau — le
  fichier de données ne quitte jamais la machine.
- **La donnée reste lisible.** JSON plain text, éditable à la main, versionnable :
  la donnée de facturation ne doit jamais être prisonnière de l'extension.
- **Chaque réglage doit se justifier.** Un défaut correct vaut mieux qu'une option
  de plus (§6).
- **Chaque fonctionnalité se paie en maintenance.** Toute API GNOME privée ou
  instable utilisée devra être réparée à chaque version du shell : le §2
  (non-objectifs) est ce qui protège l'extension du temps qui passe.

---

## 1. Besoin

**Saisir et consulter rapidement** le nombre d'heures travaillées par jour, puis
**extraire le total du mois** pour établir une facture.

Concrètement :

- Une icône dans la barre du haut, accessible en permanence, dont la **couleur**
  dit si la journée est saisie.
- Saisir les heures du jour en **deux clics maximum**, sans quitter le contexte courant.
- Voir d'un coup d'œil la **semaine en cours** pour rattraper un jour oublié.
- Un **total du mois en cours** visible dans le popup.
- Un **export CSV** du mois pour alimenter la facturation.

### Pourquoi pas un chronomètre

La saisie est **manuelle et déclarative**, pas chronométrée : ni start/stop, ni
détection d'activité. Un chrono produit des valeurs précises mais fausses (pauses,
réunions hors poste, oublis d'arrêt) et impose une discipline coûteuse ; la valeur
facturée est connue à la fin d'une demi-journée, c'est elle qu'on saisit.

### Un seul jeu de données

L'extension **ne gère ni projets, ni clients, ni tags** : toutes les heures saisies
appartiennent à un unique jeu de données, local à la session.

---

## 2. Non-objectifs (MVP)

Explicitement hors périmètre, pour garder l'outil simple :

- Chronomètre / start-stop / détection d'inactivité.
- Multi-projets, multi-clients, catégories, tags, descriptions d'activité.
- Taux horaire, montants, génération de facture.
- Synchronisation, cloud, API, intégration Kimai/Toggl/Redmine.
- Objectifs journaliers, alertes de dépassement, statistiques.
- Toute notification autre que **le rappel quotidien unique** (§6) et la
  confirmation d'export — pas de relance, pas d'escalade, pas de badge.
- Édition de plages horaires (début/fin) — on saisit une **durée**, pas des créneaux.
- Reporting avancé (graphes, moyennes, comparaisons de mois).

---

## 3. UX

### 3.1 Indicateur (panel)

- Une **icône** dans la zone de droite de la barre du haut (status area).
- **Aucun compteur dans la barre.** L'information tient dans la **couleur de
  l'icône**, et elle répond à la seule question qui compte d'un coup d'œil —
  *ai-je saisi ma journée ?*
  - **Orange** : le jour courant est à 0, rien n'est saisi.
  - **Vert** : le jour courant porte une valeur > 0.
  - **Neutre** (couleur du panel) : le jour courant n'est pas affiché du tout — un
    week-end alors que les week-ends sont masqués (§6). Un jour non travaillé n'a
    pas à être réclamé.
- La couleur est recalculée à chaque modification et au passage de minuit.
- Clic gauche : ouvre/ferme le popup.

### 3.2 Popup

```
┌────────────────────────────────────────────────────┐
│  ‹      7 – 13 septembre 2026     ›  [ Today ]     │   (1)
├────────────────────────────────────────────────────┤
│   Lun    Mar    Mer    Jeu   [VEN]    Sam    Dim   │   (2)
│   07     08     09     10     11      12     13    │
│                                                    │
│  [ + ]  [ + ]  [ + ]  [ + ]  [ + ]  [ + ]  [ + ]   │   (3)
│   8 h    7 h   7.5h    8 h    4 h    0 h    0 h    │   (4)
│  [ − ]  [ − ]  [ − ]  [ − ]  [ − ]  [ − ]  [ − ]   │   (3)
├────────────────────────────────────────────────────┤
│  Septembre 2026                          34.5 h    │   (5)
├────────────────────────────────────────────────────┤
│                            [ Export CSV ]  [ ⚙ ]   │   (6)
└────────────────────────────────────────────────────┘

  VEN = aujourd'hui (mis en évidence)
  Sam, Dim = jours futurs : grisés, mais éditables comme les autres
```

> Les dates et noms de jours sont **localisés** (`GLib.DateTime.format`). Les
> libellés des boutons sont des chaînes source **en anglais** passées à `gettext` :
> ils s'afficheront en français dès qu'une traduction sera fournie.

**(1) En-tête — semaine et navigation**

- Affiche la **plage de la semaine affichée**, sous forme compacte et localisée :
  `7 – 13 septembre 2026`, ou `28 septembre – 4 octobre 2026` à cheval sur deux mois,
  avec les deux années si la semaine change d'année.
- `‹` recule d'une semaine, `›` avance d'une semaine. **Aucune borne** dans un sens
  ni dans l'autre : le futur est éditable (§4.3), il n'y a donc plus de raison de
  bloquer la navigation avant.
- **Chaque ouverture du popup repart sur la semaine courante** : la navigation n'est
  pas mémorisée d'une ouverture à l'autre. Le popup répond d'abord à « combien
  aujourd'hui / cette semaine ».
- **Aujourd'hui** : ramène la fenêtre sur la semaine courante. Désactivé quand elle
  y est déjà. Il vit ici, avec les dates et les flèches, parce qu'il navigue — pas
  dans la barre d'actions du bas, qui porte les commandes globales.

**(2) Bandeau de la semaine**

- **Une semaine calendaire par écran**, du premier au dernier jour de la semaine.
- Le **premier jour de la semaine suit la locale** : lundi en `fr`, dimanche en
  `en_US`. Il est lu via `Shell.util_get_week_start()`, la même source que le
  calendrier de GNOME — jamais codé en dur.
- Chaque colonne affiche le **nom court du jour** (localisé, sans son point : `Sam`)
  et le **numéro de jour**.
- Le **jour courant** est mis en évidence (fond ou gras).
- Les **jours futurs** de la semaine sont **grisés mais pleinement éditables** :
  boutons `+` / `−`, molette et saisie clavier fonctionnent normalement. Noter une
  journée à venir est de la planification, pas une anomalie — et un vendredi saisi
  le mercredi reste corrigeable le vendredi.
- Les **week-ends peuvent être masqués** (§6) : la semaine passe alors à
  **5 colonnes**.
- **La bascule de mois doit sauter aux yeux** pendant la navigation. Trois signaux
  cumulés, pas un seul :
  1. le **premier jour de chaque mois** de la fenêtre porte un **marqueur de mois de
     3 lettres majuscules** au-dessus du jour (`OCT`), coloré comme l'icône du panel
     — les autres colonnes gardent la place vide pour ne pas décaler la grille.
     **3 lettres, pas le nom localisé** : une colonne fait ~50 px et St **tronque**
     au lieu d'ellipser, donc `septembre` ou même `sept.` ne tient pas. Même raison
     pour le nom de jour, affiché sans son point (`Sam`) ;
  2. une **gouttière** s'ouvre à gauche de cette colonne (marge + trait vertical
     de 2 px) : un simple filet se lit comme une bordure, pas comme une rupture ;
  3. les jours d'un **mois différent** de celui du total affiché (5) sont nettement
     **atténués** — ils ne comptent pas dans ce total.

**(3) Boutons + / −**

- Disposition **verticale** par colonne : `+` au-dessus de la valeur, `−` en dessous.
- Chaque clic modifie la valeur du jour de la colonne d'un **pas configurable**
  (**0.5 / 1 / 2 / 4 h**, défaut **0.5 h**, cf. §6).
- Effet **immédiat** : mise à jour de la valeur, du total du mois et de la couleur de
  l'icône, puis persistance (§4.2). Pas de bouton « valider ».
- `−` est désactivé quand la valeur est à 0 ; `+` est désactivé au **plafond
  journalier** configurable (§6, défaut **12 h**). Une valeur saisie au clavier est
  elle aussi ramenée à ce plafond.
- **Molette** sur la colonne : équivalent à `+` / `−` (raccourci ergonomique).

**(4) Valeur du jour**

- Format `N h`, **jusqu'à deux décimales** — le pas de 0.25 h l'impose (`8 h`,
  `7.5 h`, `7.25 h`). Les zéros de fin ne sont jamais affichés.
- Clic sur la valeur : passe en **saisie directe** au clavier (champ éditable),
  pour corriger un jour sans cliquer 16 fois. Validation à `Entrée`, annulation à
  `Échap`. Accepte `7.5`, `7,5` et `7h30`.

**(5) Total du mois**

- Libellé du mois affiché dans la fenêtre + **somme des heures de ce mois calendaire**
  (tous les jours du mois, pas seulement les 7 affichés).
- Si la semaine chevauche deux mois, le mois retenu est celui du **dernier jour
  affiché** — le bord droit de la grille. C'est le même mois qui sert de référence à
  l'atténuation des jours « d'un autre mois », les deux restent donc cohérents, y
  compris quand les week-ends sont masqués.
- **Les week-ends masqués restent comptés.** Masquer les samedis est un choix
  d'affichage, pas une affirmation qu'un samedi déjà saisi n'a pas été travaillé :
  des heures ne doivent jamais disparaître d'un total à cause d'une préférence.

**(6) Actions**

- **Export CSV** : exporte le mois affiché (§5).
- **⚙** : ouvre la fenêtre de préférences (`extension.openPreferences()`) et ferme le
  popup. Évite le détour par l'application Extensions pour changer un réglage.

### 3.3 Ce qu'il n'y a pas

Pas de « reset de fin de mois ». Les données restent, l'affichage et l'export sont
**bornés au mois** — c'est le bornage qui remplace le reset. Un reset détruirait la
preuve en cas de contestation d'une facture.

---

## 4. Données

### 4.1 Modèle

Une entrée = **une date** + **une durée en heures**. Rien d'autre.

```json
{
  "version": 1,
  "days": {
    "2026-09-08": 7,
    "2026-09-09": 7.5,
    "2026-09-10": 8,
    "2026-09-11": 4,
    "2026-09-12": 2
  }
}
```

- Clé : date ISO `YYYY-MM-DD`, en **heure locale** (pas d'UTC : un jour de travail
  est une notion locale).
- Valeur : nombre d'heures, `float`, pas de 0.25 minimum.
- Les jours à 0 ne sont **pas stockés** (absence = 0).

### 4.2 Stockage

- Fichier JSON : `$XDG_DATA_HOME/daily-time-tracker/data.json`
  (défaut `~/.local/share/daily-time-tracker/data.json`).
- **Plain text, lisible, éditable à la main, versionnable dans git.** C'est
  volontaire : la donnée de facturation ne doit pas être prisonnière d'une base
  binaire ou de `dconf`.
- Écriture **atomique** (fichier temporaire + `rename`) pour ne pas corrompre le
  fichier si le shell est tué pendant une écriture.
- Écriture **debouncée** (~500 ms) : une rafale de clics sur `+` ne produit qu'une
  écriture.
- Fichier absent ou illisible au démarrage : l'extension démarre avec un jeu vide
  et **log un avertissement** ; elle ne doit jamais écraser silencieusement un
  fichier qu'elle n'a pas su parser (le sauvegarder en `.corrupt-<timestamp>`). Si
  même cette copie échoue, l'écriture se désactive plutôt que de détruire quoi que
  ce soit.

### 4.3 Règles de validation

- Valeur bornée à **[0, `max-hours`]** heures, `max-hours` ≤ 24 (§6). La borne
  dure de 24 h reste dans le stockage : un jour ne peut pas dépasser 24 h.
- Arrondi au **multiple de 0.25 h** le plus proche à la saisie directe.
- **Le futur est autorisé** : un jour à venir se saisit comme un autre, il est
  seulement grisé (§3.2). Pas de borne à la navigation, ni dans le passé ni dans le
  futur.
- Baisser `max-hours` **ne réécrit pas** les valeurs déjà enregistrées : cela borne
  `+` et la saisie clavier. Une journée à 14 h déjà saisie reste à 14 h (et `−`
  permet de la redescendre).

---

## 5. Export CSV

- Déclenché par le bouton **Export CSV**, exporte le **mois affiché**.
- Destination : **un dossier choisi une fois dans les préférences** (`export-dir`,
  défaut : répertoire Documents), sous le nom `YYYY-MM Daily time tracker.csv`
  (écrasé s'il existe). Le dossier est créé s'il n'existe pas.
- **Pas de dialogue « enregistrer sous » à chaque export.** Deux raisons :
  1. `Gtk` n'existe pas dans le process `gnome-shell` — il faudrait passer par le
     portal XDG en D-Bus (souscription au signal `Response` d'un objet `Request`,
     chemin dérivé du `handle_token`, gestion du repli si le portal est absent) :
     ~55 lignes de plomberie pour une action **mensuelle** (§0) ;
  2. le choix du dossier est **stable dans le temps** — on exporte tous les mois au
     même endroit. En faire une préférence supprime un dialogue par export au lieu
     d'en imposer un.
- Le **choix du dossier** se fait donc dans `prefs.js`, qui est un **vrai process
  Gtk** : `Gtk.FileDialog.select_folder()`, sans portal.
- Séparateur `,`, encodage UTF-8, fin de ligne `\n`, en-tête inclus.
- **En-tête en anglais** (`date,day,hours`), volontairement **non traduit** : le
  fichier est relu par un tableur ou un script, ses colonnes ne doivent pas changer
  avec la locale. Les **noms de jours**, eux, suivent la locale.
- **Tous les jours du mois** sont émis, y compris ceux à 0 — une facture se relit
  plus facilement avec les jours non travaillés visibles. Les week-ends masqués sont
  exportés eux aussi.
- Une **ligne de total** en fin de fichier.

```csv
date,day,hours
2026-09-01,mardi,8
2026-09-02,mercredi,7.5
2026-09-03,jeudi,0
...
2026-09-30,mercredi,6
TOTAL,,142.5
```

- Succès : notification GNOME avec le chemin complet et le total exporté. **Un clic
  sur la notification ouvre le dossier.**

---

## 6. Préférences

Fenêtre de préférences (`prefs.js`, Adw) :

| Clé                | Type   | Défaut    | Description                                                                           |
| ------------------ | ------ | --------- | ------------------------------------------------------------------------------------- |
| `step-hours`       | double | `0.5`     | Pas des boutons `+` / `−` — choix : 0.5 / 1 / 2 / 4                                   |
| `max-hours`        | double | `12`      | Plafond d'une journée, réglé par pas de 1 h : `+` s'y arrête, la saisie y est ramenée |
| `show-weekends`    | bool   | `true`    | Afficher samedis et dimanches ; sinon masqués et rappel muet ces jours-là             |
| `reminder-enabled` | bool   | `false`   | Rappel quotidien — **désactivé par défaut**                                           |
| `reminder-time`    | string | `'18:00'` | Heure du rappel, `HH:MM` en heure locale                                              |
| `export-dir`       | string | `''`      | Dossier de l'export CSV (vide = Documents)                                            |
| `data-path`        | string | `''`      | Chemin du fichier de données (vide = défaut XDG)                                      |

Les préférences vivent dans **GSettings** ; **les données de facturation n'y vivent
pas** (cf. §4.2).

### Masquage des week-ends

- Masquer les week-ends est un choix d'**affichage**, jamais de donnée : les jours
  masqués conservent leurs heures, et ces heures continuent de compter dans le total
  du mois (§3.2) et dans l'export CSV (§5).
- Un jour masqué rend l'icône du panel **neutre** plutôt qu'orange (§3.1), et le
  rappel reste muet.

### Rappel quotidien

- **Désactivé par défaut** : l'extension ne notifie rien tant qu'on ne l'a pas demandé.
- Une fois activé : **une** notification par jour à `reminder-time`, dont le corps
  rappelle le total déjà saisi aujourd'hui. **Un clic dessus ouvre le popup.**
- Le timer est **réarmé sur l'horloge murale** après chaque déclenchement : la dérive
  ne s'accumule pas. Une machine suspendue à l'heure du rappel le reçoit **en retard**
  au réveil — c'est assumé, un rappel tardif vaut mieux qu'un rappel perdu.
- Le rappel est envoyé **même si la journée est déjà saisie** (il fait alors office de
  confirmation). Le rendre silencieux dans ce cas est une évolution possible.

---

## 7. Contraintes techniques

- **GNOME Shell 50**, extension ESM (`import`/`export`), `metadata.json` avec
  `"shell-version": ["50"]`.
- Structure inspirée de **`minibar`** (mise en page du dépôt, tooling, build, lint,
  packaging).
- **i18n** : tous les libellés passent par `gettext`. Dates et noms de jours/mois
  formatés via `GLib.DateTime.format` avec la locale courante (pas de tableau de
  noms de jours en dur).
- Aucune dépendance runtime hors GNOME/GJS.
- Packaging **Nix** : dérivation installable en `gnomeExtensions.*` local
  (home-manager).

---

## 8. Critères d'acceptation

- [ ] L'icône est orange quand le jour courant est vide, verte dès qu'il est saisi.
- [ ] Le popup affiche la semaine calendaire courante, aujourd'hui mis en évidence.
- [ ] `+` / `−` modifient la valeur du bon jour du pas configuré et persistent.
- [ ] `−` est inactif à 0 h, `+` inactif au plafond journalier configuré.
- [ ] Clic sur une valeur permet la saisie clavier (`7.5`, `7,5`, `7h30`).
- [ ] `‹` / `›` décalent d'une semaine, sans borne.
- [ ] Un jour futur est grisé mais reste modifiable (`+`, molette, clavier).
- [ ] Le total du mois correspond à la somme de tous les jours du mois affiché.
- [ ] Week-ends masqués : 5 colonnes, icône neutre le samedi, aucun rappel.
- [ ] Le premier jour de semaine suit la locale (lundi en `fr`).
- [ ] Les week-ends masqués comptent toujours dans le total du mois et dans le CSV.
- [ ] La bascule de mois est visible dans le bandeau (nom du mois + séparateur).
- [ ] Le bouton ⚙ du popup ouvre la fenêtre de préférences.
- [ ] L'export CSV écrit dans le dossier configuré, Documents par défaut.
- [ ] L'export CSV produit tous les jours du mois + une ligne TOTAL cohérente.
- [ ] Rappel désactivé : aucune notification. Activé : une notification à l'heure.
- [ ] Les données survivent à un redémarrage du shell et à une déconnexion.
- [ ] Un fichier de données corrompu ne fait pas planter le shell et n'est pas écrasé.
- [ ] Le changement de jour à minuit met à jour l'affichage sans redémarrage.

---

## 9. Questions ouvertes

1. ~~Structure à recopier de `minibar`.~~ **Tranché** : JS/ESM pur (pas de
   TypeScript, pas de `@girs`), aucune étape de build, `src/` + `tests/nested.sh` +
   CI GitHub (syntax check `node --input-type=module --check`, tests unitaires,
   `glib-compile-schemas`, zip, release sur tag `v*`). Cf. `CLAUDE.md`.
2. **Pas par défaut** : 0.5 h est-il le bon défaut, ou plutôt 0.25 h ?
3. ~~Changement de jour à minuit.~~ **Tranché** : recalcul silencieux via un timer
   armé sur le prochain minuit. La vue **bascule sur la semaine suivante** seulement
   si elle affichait la semaine courante, et reste où elle est sinon (on ne déplace
   pas sous les doigts de quelqu'un en train de corriger la semaine passée).
4. **Sauvegarde** : faut-il un `git commit` automatique du fichier de données, ou
   une copie datée mensuelle, pour se prémunir d'une erreur de manipulation ?
5. **Jours fériés** : les griser dans le bandeau comme les week-ends, ou les traiter
   exactement comme les autres jours ?
