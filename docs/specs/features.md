# daily-time-tracker — Spec MVP

Extension GNOME Shell de **saisie manuelle** du temps de travail quotidien, pour
préparer une facturation à l'heure.

- **Statut** : draft
- **Date** : 2026-11-09
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

### Quelques projets, rien de plus

Une même journée peut être partagée entre plusieurs missions facturées séparément.
L'extension gère donc **jusqu'à 4 projets** (§3.3). Un projet, c'est **un nom et
une couleur**, rien d'autre :

- pas de client, pas de taux, pas de hiérarchie, pas de tags, pas de description ;
- la couleur n'est **pas un réglage** : elle dépend de la position du projet (§3.3) ;
- le sélecteur est **toujours affiché**, même avec un seul projet. Un affichage
  conditionnel coûterait un second chemin dans le code et cacherait le moyen de créer
  un projet.

Le plafond de 4 projets est voulu. Il garantit que le sélecteur tient sur une ligne
du popup. Il marque aussi la limite de l'outil : au-delà, il faut un vrai logiciel de
suivi d'activité.

---

## 2. Non-objectifs (MVP)

Explicitement hors périmètre, pour garder l'outil simple :

- Chronomètre / start-stop / détection d'inactivité.
- Plus de 4 projets, clients, sous-projets, catégories, tags, descriptions
  d'activité, couleur choisie à la main, réordonnancement des projets.
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
  - **Orange** : le jour courant est à 0 sur **tous** les projets, rien n'est saisi.
  - **Vert** : le jour courant porte une valeur > 0 sur **au moins un** projet. La
    question est « ai-je saisi ma journée ? », pas « ai-je saisi ce projet ? ».
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
│  (■ Default)  ( Client A )  ( + )                  │   (1b)
├────────────────────────────────────────────────────┤
│   Lun    Mar    Mer    Jeu   [VEN]    Sam    Dim   │   (2)
│   07     08     09     10     11      12     13    │
│                                                    │
│  [ + ]  [ + ]  [ + ]  [ + ]  [ + ]  [ + ]  [ + ]   │   (3)
│   8 h    7 h    4 h    8 h    4 h    0 h    0 h    │   (4)
│  [ − ]  [ − ]  [ − ]  [ − ]  [ − ]  [ − ]  [ − ]   │   (3)
│                +3.5                 +2             │   (4b)
├────────────────────────────────────────────────────┤
│  Septembre 2026                                    │   (5)
│  ■ Default                               34.5 h    │
│  ■ Client A                               12 h     │
├────────────────────────────────────────────────────┤
│                            [ Export CSV ]  [ ⚙ ]   │   (6)
└────────────────────────────────────────────────────┘

  ■ Default = projet actif (pastille pleine, à sa couleur)
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
  ni dans l'autre : le futur est éditable (§4.4), il n'y a donc plus de raison de
  bloquer la navigation avant.
- **Chaque ouverture du popup repart sur la semaine courante** : la navigation n'est
  pas mémorisée d'une ouverture à l'autre. Le popup répond d'abord à « combien
  aujourd'hui / cette semaine ».
- **Aujourd'hui** : ramène la fenêtre sur la semaine courante. Désactivé quand elle
  y est déjà. Il vit ici, avec les dates et les flèches, parce qu'il navigue — pas
  dans la barre d'actions du bas, qui porte les commandes globales.

**(1b) Sélecteur de projet**

- Une pastille par projet, dans l'ordre du fichier de données, à la couleur du
  projet. Le **projet actif** a sa pastille pleine, les autres sont en contour.
- Clic sur une pastille inactive : elle devient le projet actif. Toute la grille
  (3), (4) et la molette agissent alors sur ce projet.
- Le projet actif est **mémorisé** d'une ouverture à l'autre (§6), contrairement à
  la semaine : on enchaîne souvent plusieurs jours sur la même mission.
- La gestion des projets (création, renommage, suppression) est décrite en §3.3.

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
     de 2 px) : un simple filet se lit comme une bordure, pas comme une rupture. Le
     trait est un **élément à part**, pas la bordure de la colonne : l'opacité des
     jours atténués et les coins arrondis le faisaient disparaître, il ne restait
     qu'un trou dans la grille ;
  3. les jours d'un **mois différent** de celui du total affiché (5) sont nettement
     **atténués** — ils ne comptent pas dans ce total.

**(3) Boutons + / −**

- Disposition **verticale** par colonne : `+` au-dessus de la valeur, `−` en dessous.
- Chaque clic modifie la valeur du jour de la colonne, **pour le projet actif**, d'un
  **pas configurable**
  (**0.5 / 1 / 2 / 4 h**, défaut **0.5 h**, cf. §6).
- Effet **immédiat** : mise à jour de la valeur, du total du mois et de la couleur de
  l'icône, puis persistance (§4.2). Pas de bouton « valider ».
- `−` est désactivé quand la valeur est à 0 ; `+` est désactivé au **plafond
  journalier** configurable (§6, défaut **12 h**). Une valeur saisie au clavier est
  elle aussi ramenée à ce plafond. Le plafond s'applique **par projet** : les autres
  projets du même jour ne bloquent jamais `+`.
- **Molette** sur la colonne : équivalent à `+` / `−` (raccourci ergonomique).

**(4) Valeur du jour**

- Format `N h`, **jusqu'à deux décimales** — le pas de 0.25 h l'impose (`8 h`,
  `7.5 h`, `7.25 h`). Les zéros de fin ne sont jamais affichés.
- Clic sur la valeur : passe en **saisie directe** au clavier (champ éditable),
  pour corriger un jour sans cliquer 16 fois. Validation à `Entrée`, annulation à
  `Échap`. Accepte `7.5`, `7,5` et `7h30`.
- La valeur est la part du **projet actif**. Elle est affichée **à la couleur du
  projet**, pour qu'on voie toujours sur quel projet on saisit.

**(4b) Heures des autres projets**

- Sous chaque colonne, en petit et grisé : la **somme des autres projets** ce jour-là
  (`+3.5`), et rien quand elle est nulle.
- Ce n'est pas éditable. Cette ligne sert de garde-fou contre la saisie sur le
  mauvais projet : un jour déjà rempli ailleurs se voit avant de cliquer.

**(5) Total du mois**

- Libellé du mois affiché dans la fenêtre + **somme des heures de ce mois calendaire**
  (tous les jours du mois, pas seulement les 7 affichés).
- **Une ligne par projet**, avec sa pastille de couleur et
  son total du mois. Le projet actif est en gras. Les projets à 0 h ce mois-là sont
  affichés eux aussi : la liste ne dépasse jamais 4 lignes et ne doit pas bouger
  d'un mois à l'autre. Il n'y a **pas de total tous projets** : on facture projet par
  projet.
- Si la semaine chevauche deux mois, le mois retenu est :
  - sur la **semaine courante**, le **mois d'aujourd'hui** — le 29 septembre, la
    semaine du 28 septembre au 4 octobre totalise septembre, pas octobre ;
  - sur toute autre semaine, celui du **dernier jour affiché** — le bord droit de la
    grille.
- Le total du **mois précédent** se retrouve avec `‹` : la semaine d'avant est
  entièrement dans ce mois (ou le chevauche, et c'est alors son dernier jour qui
  compte).
- Ce mois de référence sert aussi à l'atténuation des jours « d'un autre mois » et à
  l'export (§5) : total, grisé et CSV restent cohérents, y compris quand les
  week-ends sont masqués. Aujourd'hui n'est donc jamais grisé.
- **Les week-ends masqués restent comptés.** Masquer les samedis est un choix
  d'affichage, pas une affirmation qu'un samedi déjà saisi n'a pas été travaillé :
  des heures ne doivent jamais disparaître d'un total à cause d'une préférence.

**(6) Actions**

- **Export CSV** : exporte le mois du total affiché (5), cf. §5.
- **⚙** : ouvre la fenêtre de préférences (`extension.openPreferences()`) et ferme le
  popup. Évite le détour par l'application Extensions pour changer un réglage.

### 3.3 Gestion des projets

Tout se passe **dans le popup**, pas dans les préférences. Les noms de projets vivent
dans le fichier de données (§4.1), et seul le process du shell écrit ce fichier. Si
`prefs.js`, qui tourne dans un autre process, renommait un projet, il entrerait en
concurrence avec l'écriture debouncée du shell (§4.2).

- **Créer** : la pastille `+` en bout de sélecteur. Elle ouvre un champ de saisie du
  nom (`Entrée` valide, `Échap` annule), et le nouveau projet devient actif. Elle
  disparaît à 4 projets.
- **Renommer** : clic sur la pastille du projet **déjà actif**. Elle passe en champ
  de saisie, comme la valeur d'un jour (4). Le projet migré s'appelle `Default` et
  se renomme ainsi.
- **Nom** : non vide après `trim`, et unique sans tenir compte de la casse. Les noms
  `date`, `day` et `total` sont **réservés**, sans tenir compte de la casse : ce sont
  des en-têtes du CSV (§5), et une colonne en double rendrait le fichier ambigu. Un
  nom refusé garde le champ ouvert en erreur, sans valeur de repli silencieuse.
- **Supprimer** : on renomme le projet avec un nom vide. Ce n'est accepté que si le
  projet n'a **aucune heure, tous mois confondus**. Sinon, c'est refusé : supprimer
  des heures, c'est détruire de la preuve de facturation (§4.2), et le JSON reste
  éditable à la main pour qui le veut vraiment. Le dernier projet ne se supprime
  jamais.
- **Couleur** : fixée par la **position** du projet dans la liste, dans une palette
  de 4 couleurs qui évite l'orange et le vert de l'icône (§3.1) : **bleu, jaune,
  violet, rouge**, pris dans la palette GNOME. Les teintes doivent être **éloignées
  sur le cercle chromatique** : un premier essai bleu / violet / rose / brun donnait
  trois couleurs indiscernables. Toutes sont assez claires pour un texte sombre sur la
  pastille active. Supprimer un projet décale la couleur des suivants, ce qui est rare
  et assumé.

### 3.4 Ce qu'il n'y a pas

Pas de « reset de fin de mois ». Les données restent, l'affichage et l'export sont
**bornés au mois** — c'est le bornage qui remplace le reset. Un reset détruirait la
preuve en cas de contestation d'une facture.

---

## 4. Données

### 4.1 Modèle

Un projet = **un nom** + ses jours. Une entrée = **une date** + **une durée en
heures**. Rien d'autre.

```json
{
  "version": 2,
  "projects": [
    {
      "name": "Default",
      "days": {
        "2026-09-08": 7,
        "2026-09-09": 4,
        "2026-09-10": 8
      }
    },
    {
      "name": "Client A",
      "days": {
        "2026-09-09": 3.5
      }
    }
  ]
}
```

- `projects` est une **liste**, pas un objet : son ordre donne l'ordre des pastilles
  et la couleur (§3.3), et il doit survivre à un aller-retour JSON.
- Le nom est la seule identité d'un projet, sans identifiant technique. Le fichier
  reste ainsi lisible tel quel pour qui le relit en cas de litige.
- Un fichier **relu** (édité à la main) avec plus de 4 projets ou des noms en double
  est chargé tel quel, sans rien perdre. Les règles de §3.3 ne s'appliquent qu'aux
  saisies faites dans le popup.
- Une liste vide ou absente redonne un projet `Default` vide.

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

### 4.3 Migration depuis la version 1

Le format v1 (`{"version": 1, "days": {…}}`) reste **lu indéfiniment** :

- au chargement, un fichier v1 devient **un projet unique nommé `Default`** qui porte
  tous ses jours, sans aucune perte ;
- **avant la première écriture v2**, le fichier d'origine est copié à côté, en
  `data.json.v1`, une fois pour toutes. Si cette copie existe déjà, elle n'est
  jamais écrasée. Si la copie échoue, l'écriture se désactive, comme pour un fichier
  corrompu (§4.2) ;
- un fichier sans champ `version` est traité comme du v1 ;
- une **version inconnue** (> 2), écrite par une version future de l'extension, est
  traitée comme un fichier illisible : il est sauvegardé et n'est pas écrasé.

⚠️ **Le retour à une version antérieure de l'extension n'est pas supporté.** Une v1
lirait un fichier v2 comme vide, puis l'écraserait au premier clic. Le filet de
sécurité, c'est `data.json.v1`, qui contient les heures d'avant la migration.

### 4.4 Règles de validation

- Valeur bornée à **[0, `max-hours`]** heures **par projet**, `max-hours` ≤ 24
  (§6). La borne dure de 24 h reste dans le stockage, elle aussi par projet. La somme
  de plusieurs projets sur un même jour n'est **pas** bornée : c'est volontaire, pour
  rester simple.
- Arrondi au **multiple de 0.25 h** le plus proche à la saisie directe.
- **Le futur est autorisé** : un jour à venir se saisit comme un autre, il est
  seulement grisé (§3.2). Pas de borne à la navigation, ni dans le passé ni dans le
  futur.
- Baisser `max-hours` **ne réécrit pas** les valeurs déjà enregistrées : cela borne
  `+` et la saisie clavier. Une journée à 14 h déjà saisie reste à 14 h (et `−`
  permet de la redescendre).

---

## 5. Export CSV

- Déclenché par le bouton **Export CSV**, exporte le **mois du total affiché**
  (§3.2 (5)).
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
- **Un seul fichier pour le mois, tous projets confondus**, avec **une colonne par
  projet ayant au moins une heure ce mois-là**. Les projets à 0 h sont omis. Si aucun
  projet n'a d'heure, il ne reste que `date,day,total`, à 0.
- Les colonnes projet suivent l'ordre du fichier de données. Leur en-tête est le
  **nom du projet**, échappé en CSV (RFC 4180 : entre guillemets s'il contient `,`,
  `"` ou un retour à la ligne, et `"` doublé).
- Une **dernière colonne `total`** donne la somme des projets du jour. Le plafond
  étant par projet (§4.4), c'est elle qui fait ressortir une journée trop chargée à
  la relecture. Le popup n'affiche toujours pas de total tous projets (§3.2 (5)) :
  on facture projet par projet, ce total ne sert qu'à se relire.
- **En-têtes fixes en anglais** (`date`, `day`, `total`, `TOTAL`), volontairement **non
  traduits** : le fichier est relu par un tableur ou un script, ses colonnes ne
  doivent pas changer avec la locale. Les **noms de jours**, eux, suivent la locale.
- **Tous les jours du mois** sont émis, y compris ceux à 0 — une facture se relit
  plus facilement avec les jours non travaillés visibles. Les week-ends masqués sont
  exportés eux aussi.
- Une **ligne de total** en fin de fichier, avec un total par colonne projet et le
  total général dans la colonne `total`.

```csv
date,day,Default,Client A,total
2026-09-01,mardi,8,0,8
2026-09-02,mercredi,4,3.5,7.5
2026-09-03,jeudi,0,0,0
...
2026-09-30,mercredi,6,0,6
TOTAL,,142.5,12,154.5
```

⚠️ Le format change par rapport à la version 1 : la colonne `hours` devient une
colonne par projet, suivie de `total`. Un script qui lisait `hours` doit être
adapté.

- Succès : notification GNOME avec le chemin complet et le total exporté par
  projet. **Un clic
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
| `active-project`   | int    | `0`       | Position du projet actif dans `projects` (§4.1), sans UI : mémorisé par le popup      |

Les préférences vivent dans **GSettings** ; **les données de facturation n'y vivent
pas** (cf. §4.2). Les **noms de projets** non plus : ils sont dans le fichier de
données (§3.3). `max-hours` est un plafond **par projet** (§4.4). Un
`active-project` hors limites retombe sur `0`.

### Masquage des week-ends

- Masquer les week-ends est un choix d'**affichage**, jamais de donnée : les jours
  masqués conservent leurs heures, et ces heures continuent de compter dans le total
  du mois (§3.2) et dans l'export CSV (§5).
- Un jour masqué rend l'icône du panel **neutre** plutôt qu'orange (§3.1), et le
  rappel reste muet.

### Rappel quotidien

- **Désactivé par défaut** : l'extension ne notifie rien tant qu'on ne l'a pas demandé.
- Une fois activé : **une** notification par jour à `reminder-time`, dont le corps
  rappelle le total déjà saisi aujourd'hui, **tous projets confondus**. Il n'y a
  jamais de rappel par projet (§2). **Un clic dessus ouvre le popup.**
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
- [ ] Semaine courante à cheval sur deux mois : total et export du mois d'aujourd'hui.
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
- [ ] Un `data.json` v1 s'ouvre sur un projet `Default` portant toutes ses heures.
- [ ] La première écriture v2 laisse une copie `data.json.v1` intacte, jamais écrasée.
- [ ] Une version de fichier inconnue (> 2) n'est jamais écrasée.
- [ ] `+` / `−`, molette et saisie clavier n'agissent que sur le projet actif.
- [ ] Le projet actif est mémorisé d'une ouverture du popup à l'autre.
- [ ] Les valeurs du jour sont affichées à la couleur du projet actif.
- [ ] Chaque colonne affiche la somme des autres projets du jour, rien si elle est 0.
- [ ] L'icône est verte dès qu'un projet quelconque a des heures aujourd'hui.
- [ ] Le plafond `max-hours` s'applique par projet.
- [ ] La pastille `+` crée un projet, et disparaît à 4 projets.
- [ ] Un projet se renomme ; un nom vide, en double ou réservé (`date`, `day`,
      `total`) est refusé.
- [ ] Un projet portant des heures ne peut pas être supprimé ; le dernier non plus.
- [ ] Le CSV a une colonne par projet ayant des heures ce mois-là, puis une colonne
      `total` par jour, et un TOTAL par colonne.
- [ ] Un nom de projet contenant `,` ou `"` produit un CSV valide.

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
6. **Archivage d'un projet terminé** : un projet fini mais avec des heures ne peut
   pas être supprimé (§3.3), il occupe donc une des 4 places pour toujours. Faut-il
   un état « archivé » (exclu du sélecteur, toujours exporté) ? Pour l'instant, on
   le renomme et on le réutilise, ou on édite le JSON à la main.
