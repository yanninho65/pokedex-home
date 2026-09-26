# Pokédex Tracker — Documentation technique

Ce document décrit **l'état actuel** du projet (pas son historique). Livrable principal : `index.html` (jamais `Pokédex.html`). La documentation reste **séparée** du HTML — ne jamais la réintégrer dans `index.html`.

> **Dépôt public** : ne jamais y faire apparaître le prénom de l'utilisateur (code, commentaires, documentation) — formulation neutre.
>
> **Priorité permanente** : zéro code mort, zéro duplication. À chaque modification, vérifier la zone touchée (fonction/état devenu inutile → supprimé ; logique ou style répété → mutualisé). Avant d'écrire un helper, un composant ou un style, vérifier dans §6 qu'un équivalent partagé n'existe pas déjà.

## 1. Format & structure

Tracker Pokédex personnel — React 18 + Babel via CDN dans un unique `index.html` autonome (aucun build), hébergé sur GitHub Pages, utilisé sur PC et mobile (Samsung Internet). Remplace un ancien classeur Excel.

**Fichiers du dépôt** : `index.html` (l'app), `README.md` (ce document), `google-apps-script.gs` (relais de synchronisation Google Drive, §10), `manifest.json`, `sw.js`, `icons/` (PWA, §11).

**Ordre des blocs dans `index.html`** :
1. `<script>` classique définissant `window.storage` (§2) ;
2. CDN React / ReactDOM / Babel standalone / SheetJS (`xlsx`) ;
3. `<script>` classique `window.DATA = {...}` — bloc JSON pur (~1 Mo), hors Babel pour ne pas le transpiler ;
4. `<script type="text/babel" data-presets="react">` — tout le code de l'app (commence par `const DATA = window.DATA;`, se termine par le bootstrap : `applyJeuVideoCustomizations()` → `applyCatalogCustomizations()` → `root.render(<App />)`) ;
5. `<script>` classique d'enregistrement du service worker.

Ajouter un jeu : la table Pokédex va dans `window.DATA`, tout le reste (`GAME_ORDER`, `JEU_VIDEO_DEFS`, filtres…) dans le bloc Babel.

## 2. Stockage

- **`window.storage`** : wrapper `localStorage` (préfixe `pkdx_`) — `get`/`set`/`delete`/`list`, tous asynchrones. `get(key)` renvoie `{ value: null }` pour une clé absente (jamais d'exception). `set` émet l'événement `pkdx-local-change` (détail = clé), écouté par la synchronisation Google Drive (§10).
- **`readJSON(key, fallback)` / `writeJSON(key, value)`** : seul point de lecture/écriture JSON à utiliser (erreurs avalées).
- **`DATA`** : purement **structurel** (disponibilité par jeu, sprites, boîtes, capacités Alpha, évolutions, Jeu vidéo) — **aucune capture réelle**. Toute possession vit dans `window.storage`.

### `DATA.nat[i]` (tableau positionnel)

```
[0]  nat        — numéro national (parfois "E-1"/"I-29", ou 0.1/0.5 pour Zygarde)
[1]  nom
[2]  forme      — null si forme normale ; parfois un nombre (Zygarde) → toujours String() avant méthode de chaîne
[3]  region
[4]  lien       — URL Poképédia
[5]  caughtAny / [6] shinyAny                     — toujours 0 dans DATA
[7]  avail[]    — dispo par jeu (indexé sur DATA.natGames) — structurel, fiable
[8]  caughtGame[] / [9] shinyGame[]               — toujours 0
[10] genericCaught / [11] genericShiny             — toujours 0 (pseudo-jeu "Forme")
[12] alphaCaughtLA / [13] alphaCaughtLZA          — toujours 0
[14] famille    — numéro de ligne d'évolution (nombre ou null), éditable en fiche
```
En mémoire uniquement : `row.__baseKey` (clé `nom|forme` d'origine) et `row.__additionId` (ligne issue de `catalog_additions`).

**Autres clés de `DATA`** : `games`, `boxGroups`, `boxPrefixDefault`, `sprites`, `spriteVariants`, `shinyCatalog`, `shinyCatches`, `nat`, `natGames`, `gameIndex`, `alphaCapable`, `evolutionMode`, `doubleCatches`, `eventCatalog`, `interjeuCatalog`, `homeDex`, `jeuVideo`, `jeuVideoNumbers`, `formTags`. Calculées en mémoire : `natSortOrder`, `__additionIdxById`.

**Règle absolue** : ne jamais lire une valeur de possession dans `DATA` (`r[5]`, `r[6]`, `r[8]`–`r[13]`, `DATA.games[…][3]`) — toujours passer par les hooks (`useCollection`, `useLiveNat`, `useShinyCatches`, `useDoubleCatches`…). Clé de correspondance partout : `nom + "|" + (forme || "")`.

### Clés `ALL_KEYS` (exportées, importées, synchronisées et réinitialisées ensemble)

`ALL_KEYS` est défini au niveau module (avant le moteur de synchronisation, qui s'en sert pour filtrer les écritures déclenchant un envoi).

| Domaine | Clés |
|---|---|
| Captures jeux | `caught_<code>` (un par `GAME_ORDER`), `alpha_caught`, `manual_caught`, `game_jeu_overrides`, `game_tab_sources` |
| Go 1 | `go1_pokedex_forms`, `go1_shiny_forms`, `go1_pokedex_unique`, `go1_shiny_unique`, `go1_chanceux`, `go1_parfait`, `go1_purifie`, `go1_obscur`, `go1_xxs`, `go1_xxl`, `go1_mega`, `go1_gmax` |
| Collections | `shiny_catches`, `double_catches`, `custom_events`, `custom_interjeu`, `home2`, `go2` |
| Listes | `custom_marques`, `custom_modes`, `custom_locations`, `custom_jeux`, `custom_details`, `mode_marques`, `detail_marques` |
| Catalogue | `catalog_overrides`, `catalog_additions`, `catalog_deletions`, `evolution_chain_overrides` |
| Boîtes | `box_settings` (ancien réglage par marque, lu seulement comme valeur de départ), `game_view_box_settings`, `box_group_overrides`, `custom_box_groups` |
| Vues Jeu | `custom_jeu_views`, `game_view_number_overrides`, `game_view_box_group_overrides` |
| Jeu vidéo | `custom_jeu_video_defs`, `custom_jeu_video_groups`, `custom_jeu_video_gens` |
| Préférences | `home2_search_suffix`, `go2_search_suffix`, `parfait_search_suffix` |

**Réinitialiser tout** : efface `ALL_KEYS` sauf `custom_marques` (`RESET_KEEP_KEYS`), réécrit `custom_events`/`custom_interjeu` à `[]` (empêche le re-seed) et supprime `jeu_options_migrated`. Un export JSON de sécurité est téléchargé juste avant.

**Métadonnées locales hors `ALL_KEYS`** (jamais exportées ni synchronisées) : `jeu_options_migrated` (migration ponctuelle Jeu-DO), et en `localStorage` brut `pkdx_drive_sync` (configuration et état de référence de la synchronisation Google Drive, §10). Les anciennes clés de sauvegarde (`pkdx_gist_*`, `pkdx_onedrive_*`, `pkdx_last_export_at`, cache MSAL) sont effacées au chargement.

**`custom_marques` auto-complétée** : à chaque chargement (`useCustomLists`, et `SettingsView.loadAll`), toute marque de `GAME_ORDER` absente y est ajoutée — sinon une marque créée par code resterait invisible dans les champs "Marque".

## 3. Catalogue Pokémon (Paramètres → Catalogue, ou crayon ✎ des fiches)

Édition via `CatalogEntryModal`, ouverte par `CatalogEditor` (Paramètres) ou `CatalogQuickEditButton` (crayon de la barre du bas des fiches). Brouillon initial : `catalogDraftForRow(idx)`.

**Champs** : Nom (+ pilule Poképédia), Forme, Numéro national + Région (même ligne), Méthode d'évolution, Famille, Alpha LA/LZA, Pokédex Home, Méga/Gmax/Gmax gène (§4), Marques possibles, Numéro spécifique par jeu, Numéro spécifique par jeu vidéo (§4), Jeu vidéo. Sections repliables, repliées à l'ouverture.

- **Clés stables** : `catalog_overrides["nom|forme d'origine"]` (`row.__baseKey`) pour une fiche existante, `catalog_additions[]` (par `id`) pour un Pokémon nouveau — `persistCatalogEdit(idx, d)` route vers l'un ou l'autre. Numéros par jeu : `gameNumbersFor(row, key)`.
- **Suppression** (`catalog_deletions`) : ne touche jamais aux captures, réversible depuis Paramètres.
- **Présentation** : en création, un **+** en médaillon ; en modification, `FicheArtworkBlock` (numéro affiché, non éditable — le champ "Numéro national" accepte des préfixes type "E-219"). Supprimer (🗑) / Annuler (×) / Enregistrer (`SaveButton`) sont dans la barre du bas (§5.6). Toute édition enregistrée recharge la page.
- `CatalogQuickEditButton` : icône seule, uniquement sur les fiches détail (jamais sur une liste), style `GLASS_ROUND_BTN`.

## 4. Jeu-DO vs Jeu vidéo

### Jeu-DO (Dresseur d'Origine)

À quel jeu précis un **exemplaire capturé** appartient (ex. "Écarlate - 139868"). Champ par capture : Shiny/Double (`rec.jeu`), Interjeu (`it.jeu`), Event (`e.jeuDO`, seulement si `e.doPerso` — distinct du champ libre `e.do`), onglets jeu (`game_jeu_overrides[jeu]["nom|forme"]`), Go 1. Filtre "Jeu - DO" sur tous les onglets sauf National, avec l'option "Jeu non indiqué" (`__none__`).

- **Valeurs possibles** : uniquement `custom_jeux` (ajouts via +) ou valeurs **découvertes** dans les captures — `orderedList(customJeux[marque], discovered)` — jamais une table figée.
- **Renommage** (Paramètres) : `cascadeRename` couvre 5 endroits — Shiny, Double, `game_jeu_overrides`, Event (`jeuDO`), Interjeu (`jeu`).

### Jeu vidéo (disponibilité structurelle)

Dans quel(s) **jeu(x) précis** d'une marque un Pokémon est disponible (ex. Écarlate vs Violet, tous deux marque Paldea). `DATA.jeuVideo["nom|forme"] = { <clé>: true | false | "note" }`, édité via `catalog_overrides`/`catalog_additions` (champ `jeuVideo`, fusionné). Helpers : `jeuVideoFor(nom, forme)`, `goSortiFor(nom, forme)`.

- **"Go sorti"** (clé `go`) = sorti dans Pokémon GO en général (filtre "Sorti"). **"Go"** (clé `goattrapable`) = cette forme précise est attrapable telle quelle dans GO, même absente de la marque Go (ex. Palkia Originel). Toujours affichées côte à côte, "Go" à gauche de "Go sorti".
- **Note de disponibilité conditionnelle** : une valeur texte (ex. `"9G+"`) remplace le booléen. `isJvTextNote(v)` la détecte ; **tout test d'inclusion dans une vue passe par `jvAvailable(v)`** (`v === true || v === undefined`) — une note compte comme **indisponible**. `AvailabilityPills` l'affiche en suffixe ("Cristal (9G+)"), pilule éteinte ; un clic la remplace par un booléen (la note ne s'édite qu'au Catalogue).

### Jeu vidéo personnalisable (Paramètres → "Jeu vidéo")

`JEU_VIDEO_DEFS` (jeux), `JEU_VIDEO_PAIRS` (groupes paire/triple à numéro partagé) et `JEU_VIDEO_GENS` (blocs de génération) sont des `let` réaffectés par `applyJeuVideoCustomizations()` avant le premier rendu, et par `SettingsView` à chaque édition (`applyJvDefs`/`applyJvGroups`/`applyJvGens`) — aucun rechargement nécessaire.

- **Stockage** : `custom_jeu_video_defs` (`[{ key, label, gen, marques }]`), `custom_jeu_video_groups` (`[{ keys, acronym }]`), `custom_jeu_video_gens` (ordre). `DEFAULT_JEU_VIDEO_DEFS/GROUPS/GENS` ne servent que de graine au tout premier chargement, puis ne sont plus relues.
- **Liste de départ** : 1G-2G (Rouge, Bleu, Jaune, Or, Argent, Cristal) · 3G (Rubis, Saphir, Émeraude, Rouge Feu, Vert Feuille) · 4G (Diamant, Perle, Platine, Or HeartGold, Argent SoulSilver) · 5G (Noir, Blanc, Noir 2, Blanc 2) · 6G (X, Y, Saphir Alpha, Rubis Oméga) · 7G (Soleil, Lune, Ultra-Soleil, Ultra-Lune) · Let's Go (Pikachu, Évoli) · 8G (Bouclier, Épée) · Legends (Arceus, Z-A) · 9G (Écarlate, Violet) · GBA (Rouge Feu Switch, Vert Feuille Switch) · 10G (Vents, Vagues) · Autre (Go sorti, Go).
- **Ajouter un jeu** : clé générée par `slugifyJeuVideoKey(label, isTaken)` (sans accents, unique par suffixe numérique), avec son propre groupe à un jeu. Même fonction à l'import Excel.
- **Groupes** : retirer un jeu (✕) ou le fusionner dans un autre groupe ("+ fusionner un jeu ici"). Acronyme par défaut `defaultJeuVideoGroupAcronym` (initiales, ex. "SARO"), librement modifiable, jamais recalculé. Il nomme les colonnes Excel `No_<ACRONYME>`.
- **Marques par jeu** (`def.marques`, `MultiPicker` sur la ligne du jeu) : purement informatif, lu par aucune autre logique.

### Numéro spécifique par jeu vidéo

Un numéro par groupe `JEU_VIDEO_PAIRS` : `DATA.jeuVideoNumbers["nom|forme"] = { <pairKey>: "numéro" }` (champ `jeuVideoNumbers` du catalogue). Information de référence pure — ne pilote ni tri ni boîtes. **Distinct** de `game_view_number_overrides` (§5.2) ; c'est lui qui alimente les colonnes `No_<ACRONYME>` de l'export National.

### Pilules Méga / Gmax / Gmax gène

Marquage **manuel uniquement** : `DATA.formTags["nom|forme"] = { mega, gmax, gmaxGene }` (champs catalogue `formMega`/`formGmax`/`formGmaxGene`), lu par `formTagsFor(nom, forme)` — **jamais déduit du texte de forme**. "Gmax gène" (porte le gène sans pouvoir Gigamaxer, ex. Crèmy) et "Gmax" s'excluent mutuellement dans la fiche ; "Méga" est indépendante. Usages :
- **Filtre Dynamax** (jeux, National, Shiny, Double, Event) : Gmax / Non Gmax / Gmax gène via `dynamaxValueFor` (le tag Gmax gène prime sur la détection texte `dynamaxInfoFor`).
- **Filtre Méga** (National) : `matchesMegaRow`.
- **Go 1 modes Méga/Gmax** (§5.1) et colonnes Excel `FormMega`/`FormGmax`/`FormGmaxGene`.

## 5. Onglets

**Barre d'onglets** (bas d'écran, centrée) : **%** · **National** · **Shiny** · **Home** (menu des jeux `GAME_ORDER`) · **Autre** (menu Double/Event/Interjeu) · **Home 2**. Les deux menus déroulants sont un seul composant, `TabGroupNavSelect` (portail, applique le choix au premier appui). En-tête : ⓘ aide contextuelle (`HelpModal`), ⚙️ Paramètres, ⋮ menu Excel/sauvegarde (§8, §10).

- **% (Progression)** : `Overview`, tableau de bord + navigation croisée. Un clic sur un jeu/Shiny/National ouvre un tableau région × statut. **Bloc Jeu - DO** : clic sur un total → popup de répartition par onglet ; clic sur un nombre → onglet filtré sur ce Jeu-DO (`openGame/openShiny/openDouble/openEvent/openInterjeu(…, jeu)`). Les events "Déjà dans une boîte de jeu" (`e.boite`) sont exclus du total. Ligne **DO Event** : events capturés, hors boîte, sans DO personnel.
- **National** : Liste/Grille ; filtres Région, Jeu (disponibilité), Taille, Dynamax, Méga, Pokédex Home, Shiny. Sélecteur global **Home / Home + Jeu** (`catchMode`). Fiche détail : §5.7.
- **Shiny** : journal de captures (doublons légitimes), vues Liste (sous-modes Home/Forme) / Boîte (30 cases) / Grille. Fiche : navigation Précédent/Suivant entre captures d'un même Pokémon (clic uniquement), pilules Détail 2 par ligne.
- **Double** : même patron que Shiny, une ligne par capture.
- **Event** : catalogue éditable, champs DO personnel + Jeu - DO (restreint par marque, visible si DO personnel). Filtres DO personnel et Jeu - DO.
- **Interjeu** : transferts Home ↔ jeu, lien bidirectionnel avec Shiny/Double (`fromInterjeu`). Badge "Home 2" dans l'en-tête si des entrées y sont.
- **Badges "boîtes"** : Home/vues jeu/Shiny comptent toutes les boîtes (même vides) ; Interjeu/Double/Event seulement celles qui ont du contenu en Home 1.
- **Onglets jeu** (`GameView`) : Liste/Boîte/Grille ; filtres Statut, Région, Groupe de boîte, Jeu - DO, **Taille** (LA/LZA seulement), **Dynamax** (si la marque contient des formes Gmax/Non Gmax ou taguées Gmax gène : `hasGmaxForms`/`hasGmaxGeneForms`). Marque Go : filtre **Sorti**. Menu Vue : cases "Afficher le groupe / le nom de boîte / le Jeu - DO", et "Afficher les Shiny / Event" de la marque (entrées absentes de la marque, en fin de liste). Marques avec vues configurées : §5.2.
- **Paramètres** (`SettingsView`) : listes éditables en glisser-déposer (Marque, Méthode, Détail, Emplacement, Jeu par marque, Groupe de boîte), disponibilité Méthode/Détail par marque, Jeu vidéo, Catalogue, Synchronisation Google Drive (`DriveSyncSection`, §10).

### 5.1 Go 1 (dans l'onglet de la marque Go)

Menu **Mode** de la marque Go → Go 1, puis l'un des 10 sous-modes `GO1_MODES` affichés dans le même panneau. `GameView` délègue le rendu à `Go1View` (mode piloté par `GameView` via `go1Mode`, menu injecté par `modeMenuItem`). Pas de vue Boîte.

- **Modes** : Pokédex, Shiny (sous-vue **Toutes formes**, clé `nom|forme`, ou **Forme unique**, clé = numéro national), Méga, Gmax (toujours par forme, `GO1_FORM_ONLY_MODES`, source = tout `NAT_ALL_FORMS` filtré sur `formTagsFor`), Chanceux, Parfait, Purifié, Obscur, XXS, XXL (forme unique). Stockage : `GO1_UNIQUE_STORAGE_KEYS`, `go1_*_forms`, `go1_mega`, `go1_gmax`.
- **Cascade** (jamais pour Méga/Gmax, jamais au décochage) : cocher une forme ou un mode forme unique écrit `go1_pokedex_unique[nat] = 1` (`go1CascadeToPokedexUnique`) ; Shiny cascade vers `go1_shiny_unique` ; une espèce à forme unique redescend vers la case "toutes formes" (`go1CascadeSingleForm`).
- **Source des formes** (`go1AllFormsSorted`) : membres de `DATA.games["Go"]` + formes marquées `goattrapable` seules (mémoïsées, `go1AttrapableOnlyForms`).
- **Fiche** `Go1SpeciesModal` : "Disponible dans" (Home / Go / Go sorti) puis statuts en `TogglePill` 2 par ligne ; Méga/Gmax seulement si la forme porte le tag.
- **Affichage** : Liste/Grille (`Go1Body`, grille groupée par région, 4 colonnes par défaut). Filtres Région, Sorti, Statut. Bouton + : recherche et marque capturé.
- **Menu "Familles Parfait"** (mode Parfait) : `FamilyNumbersPanel` (§6) sur les familles des espèces Parfait (membres déjà Parfait inclus), suffixe `parfait_search_suffix`, sans filtre automatique.

### 5.2 Vues Jeu (Home vs "en jeu")

Suivi de la possession **dans un jeu précis**, en plus de Pokémon Home, dans l'onglet de la marque (`GameView`).

- **Vues** : `custom_jeu_views = { [marque]: [{ key, label, jeuKeys }] }` (hook `useJeuViews`, graine unique `DEFAULT_JEU_VIEWS`). Création/édition : menu Mode → ⚙️ → "Vues Jeu" (`JeuViewsSettingsModal`), préréglages `JEU_VIEW_PRESETS` ou "Personnalisé…".
- **Trois modes** (menu Mode) :
  1. **Home** : flag `caught_<marque>` seul. Fiche `BoxGroupModal`.
  2. **Home + jeu** : coche verte si attrapé sur Home, violette (`PURPLE`) si seulement en jeu (`isSourcedOnly`). Fiche `JeuMultiSourceModal` (section "Attrapé dans" : Home + une pilule par vue, 2 par ligne).
  3. **Vue précise** (`PairModeBlock`) : liste propre à la vue (filtrée par `jvAvailable` sur ses jeux), coche = attrapé dans cette vue. Mêmes filtres/vues que Home, sans les cases Shiny/Event.
- **Filtre Disponibilité** : Home + chaque jeu des vues + chaque note texte trouvée ; union des choix.
- **Stockage "en jeu"** : `game_tab_sources = { [marque]: { "nom|forme": [clé de vue…] } }` — par **vue**, jamais par jeu individuel (la distinction fine passe par le Jeu-DO). `useGameTabSources` : `setSource`, `setAllSources`.
- **Pokémon "jeu seulement"** (ex. dominants Alola) : absents de `DATA.games[marque]` mais `jeuVideoFor(...)[clé] === true` (strict). `jeuOnlyFormsFor` les ajoute **en fin** de liste (`extendedRows`) en Home + jeu et en vue précise ; un index `>= rows.length` route toujours vers `game_tab_sources`, jamais vers le flag Home.
- **Menu Mode** : ouverture automatique à l'arrivée depuis le menu Home (`cameFromMarqueSwitch`) ou après le clic "Go 1" (`hasUserInteractedRef`) ; le mode choisi est mémorisé par marque (`viMode`/`goSubView`, `useCachedState`).
- **Marque Go** : mêmes options + Go 1 / Go 2 ; `goSubView` est testé avant toute vue.
- **Marques GBA et VV** : sans données structurelles dans `DATA` — bootstrap vide au chargement, Pokémon ajoutés via le Catalogue.

**Fiche de capture** (`BoxGroupModal` / `JeuMultiSourceModal`) :
1. `FicheArtworkBlock` : numéro **dans la marque/vue** (badge éditable, jamais le national) + badge Attrapé/Manquant cliquable (écriture immédiate dans `BoxGroupModal`, à l'Enregistrer dans `JeuMultiSourceModal`).
2. `FicheNameRow` (nom + Poképédia — lien vers la section Localisations de la génération via `MARQUE_POKEPEDIA_GEN` quand elle est connue), `FicheFormeEvoRow`.
3. Groupe de boîte (`NumeroGroupeRow`, `showNumber={false}`).
4. **Disponible dans** (`AvailabilityPills`, prop `marque` obligatoire) : pilule **Home** = appartenance à la marque (`patchMarqueMembership`) ; autres pilules = `jeuVideo` (`patchJeuVideo`) ; localisation PokeAPI en face de chaque jeu coché (`fetchEncountersByVersion`, `JEU_VIDEO_KEY_TO_POKEAPI_VERSION`) ; champ Jeu - DO sur la ligne Home. En vue précise, seuls les jeux de la vue ; sinon l'union des vues (`allMarqueGames`, qui insère "Go" avant "Go sorti"). Chaque bascule incrémente `jeuVideoVersion` pour rafraîchir les listes.
5. Champs sans cadre (`plainPickerStyle`/`numeroFieldStyle`). `Picker align="right"` pour les listes collées au bord droit.

**Numéro et groupe de boîte par vue** — tri commun : groupe de boîte (ordre Paramètres) puis numéro sans lettres (`parseGameNumber`).
- Numéro : `game_view_number_overrides[marque][vueKey]["nom|forme"]` (`useGameViewNumberOverrides`), clé `"__home__"` pour Home/Home + jeu. Édité seulement depuis le badge de la fiche. Utilisé pour le tri **et** le nommage des boîtes en vue précise seulement ; en Home/Home + jeu, affiché mais sans effet sur le tri.
- Groupe de boîte : `game_view_box_group_overrides` (`useGameViewBoxGroupOverrides`), vue précise uniquement, fusionné par-dessus ceux de la marque.

**Réglages de boîte par vue** : `game_view_box_settings[marque][viewKey] = { rows, cols, prefix, gridCols }` (`viewKey` = `"__home__"`, `"__home_jeu__"` ou clé de vue) via `useGameViewBoxSettings` (une instance par `GameView`, partagée avec `PairModeBlock` et `JeuViewsSettingsModal`). Capacité = `rows × cols`, toujours identique à la grille affichée (`BoxGrid fixedRows/fixedCols`). Défaut 5 × 6, grille 6 par ligne ; `box_settings` éventuel sert de valeur de départ (`defaultBoxViewSettings`). Édition : ⚙️ "Vues Jeu", entrées fixes Home et Home + Jeu puis vues (`BoxSettingsFields`). JSON uniquement, pas de feuille Excel.

### 5.3 Home 2

Complétion indépendante d'un second stockage Pokémon Home.
- **Catalogue** = exactement les formes `DATA.homeDex` (pilule "Pokédex Home" du Catalogue). Pour ajouter un Pokémon : cocher cette pilule. Anciennes entrées `home2.extra` migrées vers `homeDex` au chargement (`useHome2`).
- **Mode** Par forme / Par Pokémon (`speciesRepresentatives(formeCatalog)`) ; **Vue** Liste/Grille (3 par ligne) ; filtres Statut + Région. Corps d'affichage `ChecklistBody` (§6).
- **Familles manquantes** : `FamilyNumbersPanel` sur les **formes** non cochées (une espèce n'est complète que si toutes ses formes le sont), bascule le filtre sur Manquant, suffixe `home2_search_suffix`.
- **Stockage** : `home2 = { caught: {"nom|forme": 1} }`.

### 5.4 Go 2 (dans l'onglet de la marque Go)

Variante par **espèce** : `speciesRepresentatives()` (forme au plus petit numéro national), moins les espèces exclues. Grille 7 par ligne. Clic sur une ligne → `Go2ExcludeModal` (exclusion de l'espèce entière) ; "🚫 Gérer les exclusions" (menu Vue) → `Go2ExclusionsManager`. Familles manquantes : comme Home 2, sur le catalogue par espèce, suffixe `go2_search_suffix`. Stockage `go2 = { caught: {"nom|forme": 1}, excluded: {"nom": 1} }`.

### 5.5 Chaîne d'évolution

`EvolutionChainModal`, ouverte par `EvolutionLabelButton` (fiches National, Shiny, Double, Event, Interjeu, jeux).
- **Résolution** (`resolveEvolutionChain`) : PokeAPI `pokemon-species` → `evolution-chain`, arbre `buildNativeEvolutionTree`, cache de session par `"nat|regionTag"`. Branches filtrées par région quand elle est non ambiguë (`childrenToShow`). Forme locale par défaut : `pickLocalForm` (préfère la forme de base).
- **Méga / Gigantamax** : détectés localement (`isMegaOrGmaxForme`) et greffés comme enfants normaux.
- **Nom français** : forme locale, sinon `fetchFrenchSpeciesName`, sinon slug mis en forme.
- **Édition** ("Modifier") : "+ Évolution" (membres de la famille, `familyMembersOf`), ✎ par lien (méthode ou masquage), suppression des liens ajoutés (en cascade).
- **Stockage** : `evolution_chain_overrides = { [chainId]: { added: [{ key, nom, forme, parentKey, method }], linkOverrides: { "<parent>>>><enfant>": { method, hidden } } } }`, appliqué à l'affichage (`applyChainOverrides`).

### 5.6 Fiches modales — patron commun

Concerne National, Shiny, Double, Event, Interjeu, `BoxGroupModal`, `JeuMultiSourceModal` (et `CatalogEntryModal` pour la barre du bas).

- **Fenêtre** : `FICHE_OVERLAY_STYLE` (fond assombri, `zIndex: 100`, alignée en **haut** d'écran, marge basse 150 px au-dessus des flèches) + `fichePanelStyle(borderColor, maxWidth)` (`maxHeight: 75vh`, scroll interne).
- **En-tête** : `FicheArtworkBlock` (artwork 96 px, numéro en haut à gauche, badge Attrapé/Manquant en bas à droite via `caught`/`onToggleCaught` — `<span>` si lecture seule), `FicheNameRow` (nom + pilule Poképédia, slot `extra`), `FicheFormeEvoRow` (forme + Évolution). Interjeu affiche "avant → après".
- **Badge Attrapé** : cliquable sur Event, `BoxGroupModal`, `JeuMultiSourceModal` ; lecture seule sur National (statut agrégé) et Shiny ; absent de Double et Interjeu (pas de statut binaire non ambigu — comportement à confirmer).
- **Barre du bas** : `FloatingCardNav` toujours monté (`zIndex: 105`), flèches ‹ › affichées seulement si une navigation existe, slot `center` : **Modifier** (`CatalogQuickEditButton`) → **+ Capture** (Shiny) ou **bascule Attrapé** (Event, `BoxGroupModal`, `JeuMultiSourceModal` ; vert `✓` / jaune `+`) → **Fermer** (×) → **Enregistrer** (`SaveButton`, fond `ACCENT` si modifications non enregistrées, `disabled` prioritaire). Boutons ronds `GLASS_ROUND_BTN`.
- **Navigation entre Pokémon** : `useCardSwipeNav(active, onPrev, onNext)` — clavier ←/→ (hors champ de saisie), swipe horizontal (seuil 40 px), flèches. Parcourt la liste **affichée** (filtres/tri respectés). Les fiches `BoxGroupModal`/`JeuMultiSourceModal` reçoivent `navIndex/navTotal/onNavPrev/onNavNext` et un `key={nom|forme}` pour se remonter à chaque Pokémon. La navigation Précédent/Suivant entre formes/captures d'un même Pokémon (`cardPos`, National/Shiny) reste au clic uniquement.
- **Scroll bloqué** : `useLockBodyScroll(active)` dans chaque fiche, indépendamment de la navigation.

### 5.7 Fiche National — spécificités

- En-tête : bouton Poképédia sur la ligne du nom ; Forme + Évolution sous le nom (calculées via `currentForm`/`currentCp`) ; région non affichée ; second artwork shiny (96 px) si une forme shiny existe. "Voir toutes les formes" masqué en vue "Par forme".
- **`catchMode`** (menu Vue, Home / Home + Jeu, mémorisé) : statut via `marqueCaughtWithMode`/`marqueCaught`/`isCaughtEff` partout (liste, filtres, anneau, `marksOf`) ; lit `game_tab_sources` via `useAllGameTabSourcesEditable()`.
- **`cardMode`** (par fiche : Home / Home + Jeu / Jeu, mémorisé) sur la ligne "x/x" de chaque bloc de marque. Home / Home + Jeu : blocs en pilule avec boutons ronds (coche, α, ✦), coche verte ou violette (`marqueCaughtInfo`), le clic ne bascule que le flag Home. **Jeu** : liste des vues de la marque (`jeuViewsFor`), clic = bascule `game_tab_sources` (`toggleGameTabSource`).
- **Navigation bloquée pendant l'édition** : `catalogEditOpen` (via `onOpenChange` de `CatalogQuickEditButton`) et `evoChainEditOpen` (via `onEditModeChange` de `EvolutionChainModal`), remis à `false` au changement de fiche.
- Hooks : `useAllGameTabSourcesEditable()` (lecture/écriture, toutes marques), `useAllJeuViewsData()` (lecture des vues) ; `useAllGameTabSources` (lecture seule) est réservé à Progression.

### 5.8 "Ajouter un shiny" (National) = saisie Shiny

`ShinyRecordFields` est l'unique définition des champs d'une capture Shiny (Marque avec avertissement `isFormeAvailableInGame`, Date, Jeu, Méthode, Emplacement — tous `Picker` —, Détail, Alpha LA/LZA, Gmax tri-état). Utilisé par `ShinyView` (édition) et `NationalView` (création via `promptRec`, `addShinyForGame(nom, forme, rec)`). Les actions propres à une capture existante (Interjeu, suppression) restent dans `ShinyView`.

## 6. Composants & helpers partagés (à réutiliser, ne pas redupliquer)

| Besoin | Élément partagé |
|---|---|
| Lecture/écriture JSON | `readJSON`, `writeJSON` |
| Tri par numéro national | `natSortValue(n)` (texte → chiffres, sans chiffre → 999999) |
| Une ligne par espèce | `speciesRepresentatives(forms = NAT_ALL_FORMS)` |
| Numéro national d'une espèce | `speciesNationalNumber(nom)` (repli si pas de forme vide) |
| Familles d'évolution → numéros | `familyNumbersFor(entries)` → `{ numbers, familyCount }` |
| Panneau "Familles" (copie + suffixe) | `useFamilyNumbersCopy(suffixKey, numbers)` + `FamilyNumbersPanel`, résumé `missingFamiliesSummary` |
| Liste/Grille à cocher (Home 2, Go 2) | `ChecklistBody`, `ChecklistProgressHeader` |
| Bouton "Afficher plus" | `ShowMoreButton({ total, limit, setLimit })` (défilement infini : `useInfiniteScroll`) |
| Case à cocher de menu | `CheckboxRow` |
| Pilule sélectionnable | `TogglePill` |
| Sélecteur d'onglet groupé | `TabGroupNavSelect`, style `pillStyle(active, color)` |
| Colonnes de grille | `GridColsStepper`, `effectiveGridCols` |
| Fiche modale | `FICHE_OVERLAY_STYLE`, `fichePanelStyle`, `FicheArtworkBlock`, `FicheNameRow`, `FicheFormeEvoRow`, `FloatingCardNav`, `SaveButton`, `GLASS_ROUND_BTN`, `useCardSwipeNav`, `useLockBodyScroll` |
| Barre flottante | `FloatingActionBar` (menus `{ key, title, icon, active, render }`, `autoOpenKey`), `ViewToggle`, `StatusFilterPills`, `MultiSelectFilter`, `Picker`, `MultiPicker` |
| Filtres mémorisés par onglet | `useCachedState(filterCache, bucket, champ, défaut)` |
| Listes utilisateur | `useCustomLists`, `orderedList(custom, découvertes)` |
| Numéros par jeu (catalogue) | `gameNumbersFor(row, key)`, brouillon `catalogDraftForRow(idx)` |
| Clé de jeu vidéo | `slugifyJeuVideoKey(label, isTaken)` |
| Presse-papier | `copyToClipboard(str)` (jamais `navigator.clipboard` directement) |
| Sauvegarde complète | `ALL_KEYS` (module), `buildExportOut`, `applyImportedObject` (import JSON + récupération Drive), `openExcelImport` (import Excel local ou depuis le Drive) |
| Synchronisation Google Drive | `useDriveSync()`, `driveStatus`, `DRIVE_STATUS_META`, actions `driveSmartSync`/`driveForcePush`/`driveForcePull`/`drivePushExcelNow`/`driveImportExcel` |
| Enregistrement d'une collection | `persist = (value) => writeJSON(storageKey, value)` dans `useShinyCatches`, `useDoubleCatches`, `useCustomEvents`, `useCustomInterjeu` |

## 7. Règles métier & pièges

- **React** : tous les hooks avant le premier `return` conditionnel (sinon écran noir). Composants toujours au niveau module (un composant défini dans un render se remonte à chaque frappe → perte de focus).
- **Validation** : `ts.transpileModule` ne détecte ni un `const` redéclaré ni un `ReferenceError` — toujours valider aussi avec `@babel/standalone` en runtime `"classic"` (§10).
- **Codes de jeu** (`IàV, VI, Alola, GB, LG, Go, DEPS, Galar, LA, Paldea, LZA, GBA, VV`) = clés de stockage (`caught_<code>`, `DATA.games`…) — ne jamais les renommer sans migration.
- **Trois notions "Home" distinctes** : (1) appartenance à la marque (`DATA.games[marque]`, `patchMarqueMembership`) ; (2) `DATA.homeDex` = pilule "Pokédex Home" (National, Home 2) ; (3) emplacement physique "Home 1"/"Home 2" (`ou`/`catchLocation`) — comparer en égalité **stricte** avec `DEFAULT_LOCATION`/"Home 2", jamais `/^Home/i`.
- **`extendedRows`** : entrées "jeu seulement" toujours **en fin** ; `effective`/`flags`/`persist` restent positionnels sur `rows`.
- **Alpha** : capacité = colonnes `Alpha_LA`/`Alpha_LZA` (`== 1` strict) ; affichage limité au signe **α**.
- **Pseudo-jeu "Forme"** : formes absentes de tout jeu listé (Méga…), cochées manuellement.
- **Listes `Picker`/`MultiSelectFilter`** : toujours `orderedList(customXxx, découvertes)`, jamais `customXxx` seul.
- **Clés catalogue** : `catalog_overrides` par `row.__baseKey` (`nom|forme` d'origine), jamais positionnel ; ajouts par `catalog_additions[].id`.
- **Zygarde** : formes numériques → `String()` avant `.trim()`/`.toLowerCase()`.
- **`transform` et `position: fixed`** : un `transform` sur un ancêtre capture les descendants `fixed` (une modale ouverte depuis ce contenu se retrouve minuscule). Centrer par flexbox pleine largeur (`left: 0, right: 0, justifyContent: "center"`, `pointerEvents: "none"` sur la bande, `"auto"` sur le contenu).
- **z-index** : barre d'onglets 30, menus de sélecteur 45, `FloatingBackButton` 55, en-têtes collants 20, fiches modales 100, `FloatingCardNav` 105. Ne jamais monter la barre d'onglets au-dessus de 100.
- **Champs contextuels** : ne pas ajouter un champ à tous les onglets si son sens diffère (ex. Méthode/Détail d'Interjeu n'existent que dans `sentInfo`, synchronisé depuis Shiny/Double).
- **Version figée à l'écran** : le service worker sert le cache — vérifier l'`APP_VERSION` affichée et que `CACHE_VERSION` de `sw.js` a bien changé avant de chercher un bug.
- **`AvailabilityPills`** : toujours passer `marque` (sinon la pilule Home ne fait rien, silencieusement).
- **`Picker` près du bord droit** : `align="right"`, sans changer le défaut.
- **Mots "non méga"/"non gmax"** : de nombreuses formes de base s'appellent "Non Gmax", "Kanto non méga"… — retirer ces négations avant de chercher "méga"/"gmax" (`isMegaOrGmaxForme`).
- **Pilules Méga/Gmax/Gmax gène** : jamais fusionnées avec une détection par texte.
- **`natInfoFor(nom, null)`** échoue (n = 999999) pour une espèce sans forme vide (ex. Floette) → utiliser `speciesNationalNumber(nom)`.
- **Lecture puis écriture dans un même `try`** : si un `set()` semble ne rien faire, vérifier qu'aucune exception de lecture n'annule l'écriture.
- **Boîtes** : capacité et grille (`fixedRows`/`fixedCols`) toujours dérivées de la même source (`rows × cols`).
- **Numéro national ≠ numéro de marque** : `natInfoFor(...).n` (National, Shiny, Double, Event, Interjeu) vs `DATA.games[marque][i][0]` + `game_view_number_overrides` (fiches jeux).
- **`spriteCandidates`** : ordre de repli artwork dédié → artwork suffixé → pixel dédié → pixel suffixé → forme de base, pour ne jamais afficher un autre Pokémon.
- **`buildFullCatalogOverrides()`** (export JSON **et** synchronisation Google Drive) **remplace** la valeur stockée : tout champ catalogue absent de cette reconstruction disparaît des exports.
- **Formulaire identique à deux endroits** : extraire un composant module-level (modèle `ShinyRecordFields`) ; les actions propres à un contexte restent chez l'appelant.
- **Style d'un composant partagé** : prop `style` fusionnée par-dessus le défaut (`{...defaultStyle, ...(style || {})}`), jamais modifier le défaut.
- **Nouvel écouteur clavier/swipe** : vérifier qu'aucun autre écouteur du même événement n'est actif dans le même composant.
- **Code mort** : une fonction top-level dont le nom n'apparaît qu'une fois dans le fichier est un candidat quasi certain.

## 8. Export / Import Excel (menu ⋮)

Classeur `Pokédex export.xlsx` (SheetJS, `EXCEL_SHEETS`) : une feuille par entrée cochée dans `ExcelExportModal`. Nom + Forme toujours en premières colonnes (forme vide = `-`), dates en vraies dates Excel `dd/mm/yyyy` (`excelDateCell`/`excelParseDateFR`, UTC). Import (`ExcelImportModal`) en mode **Ajouter** ou **Remplacer** ; une colonne absente = donnée non touchée ; rechargement après import. Pas de style de cellule possible (SheetJS gratuit) : les colonnes vides servent de séparateurs.

| Feuille | Contenu |
|---|---|
| **National** | Catalogue : `Nom, Forme, Numero, Region, Evolution, AlphaLA, AlphaLZA, HomeDex, FormMega, FormGmax, FormGmaxGene`, une colonne par jeu `GAME_ORDER` (numéro dans ce jeu — prise en compte seulement si le jeu de colonnes est complet) ; puis `Dispo_<jeu>` (informatif), `Forme(manuel)` ; puis par groupe `JEU_VIDEO_PAIRS` : `No_<ACRONYME>`, `JV_<clé>`… (`0`/`1` ou note texte), colonne vide. `AlphaLA/LZA` et `Dispo_*` ignorés à l'import ; aucune suppression via cette feuille. Une ancienne feuille "Paramètres" séparée reste importable. |
| **Jeu vidéo** | `Cle, Nom, Generation, Marques, Groupe` (acronyme du groupe) — Cle inconnue ou absente = nouveau jeu (`slugifyJeuVideoKey`). Jamais de suppression. |
| **Générations JV** | Une ligne par bloc ; Remplacer = liste exacte, Ajouter = à la suite. |
| **Home 2** | `Nom, Forme, Attrape` (formes `homeDex`). |
| **Go 2** | `Nom, Forme, Attrape, Exclu` — toutes les espèces ; seul le Nom fait foi à l'import. |
| **Shiny** | `Nom, Forme, Attrape, Marque, Mode, Detail, Date, Jeu, Gmax, Alpha, NomBoite`. |
| **Double** | `Nom, Forme, Attrape, Marque, Mode, Detail, Date, Shiny, Jeu, Alpha, Gmax, FromInterjeu` (Attrape = 1 pour Home 1, sinon texte du jeu). |
| **Event / Interjeu** | Catalogues complets (dont `DOPersonnel`/`JeuDO`, `FromInterjeu` en JSON texte). |
| **Listes, Jeu par marque, Groupe de boîte, Disponibilité** | Listes utilisateur, `custom_jeux`, `custom_box_groups` (+ taille/préfixe), `mode_marques`/`detail_marques` — calculées avec `orderedList` pour inclure les valeurs découvertes. |
| **Vues Jeu** | `Marque, Nom, Jeux` — une vue reconnue garde sa clé interne. |
| **Go 1** | `Nom, Forme, Numero, Pokedex, Shiny, Mega, Gmax, PokedexUnique, ShinyUnique, Chanceux, Parfait, Purifie, Obscur, XXS, XXL` — cascade rejouée à l'import (sauf Méga/Gmax). |
| **Chaînes évolution** | `ChainId, Type (Ajout/Lien), ParentNom, ParentForme, Nom, Forme, Methode, Masque` — une chaîne présente remplace entièrement ses overrides. |
| **Une feuille par jeu** (`GAME_ORDER`) | Capture/possession + pour les marques à vues : `EnJeu_<vue>` (1/0) et `GroupeVue_<vue>`. Une ancienne colonne `NumeroVue_<vue>` est encore lue. |

Toute nouvelle clé `ALL_KEYS` doit recevoir sa feuille, à l'export comme à l'import.

## 9. Sauvegarde JSON

Menu ⋮ → **Exporter sauvegarde** (`buildExportOut`, toutes les `ALL_KEYS`, catalogue reconstruit par `buildFullCatalogOverrides`) / **Importer sauvegarde** (`applyImportedObject` : écrit chaque clé présente, puis recharge — même fonction que la récupération depuis Google Drive) / **Réinitialiser** (§2).

## 10. En-tête, synchronisation Google Drive, livraison

- **En-tête** : logo, `APP_VERSION`, message d'état ponctuel (`ioMsg`), `DriveSyncButton`, ⓘ, ⚙️, ⋮.

### Synchronisation Google Drive

**Relais** : `google-apps-script.gs`, déployé par l'utilisateur dans son compte Google en *application Web* (exécuter en tant que : Moi ; accès : Tout le monde). Appels `POST` `text/plain` (sans pré-vol CORS), clé secrète dans le corps ; réponse `{ ok, … }` / `{ ok: false, error }`. Actions `ping`, `getJson`, `putJson`, `getExcel`, `putExcel`. Dossier **Pokédex** à la racine du Drive, fichiers remplacés en place (même ID, historique Drive conservé) : `pokedex.json` (**source de vérité**, contenu de `buildExportOut`) et `pokedex.xlsx` (**miroir** de tous les `EXCEL_SHEETS`, jamais relu automatiquement). Script **100 % ASCII** (dossier écrit `Pok\u00e9dex`) : un caractère spécial abîmé au copier-coller casse la syntaxe dans l'éditeur Apps Script. Toute modification du script exige *Gérer les déploiements → Nouvelle version*.

**Moteur** (niveau module, préfixe `drive…`) : instantané `driveSnap` lu par `useDriveSync()` (`useSyncExternalStore`) ; `App` fournit à chaque rendu via `driveRegister` : `buildPayload`, `applyPayload`, `buildExcelB64`, `openExcelWorkbook`, `notify` ; `driveStart()` une fois au montage. Configuration et état de référence (`url`, `key`, `lastSyncedHash`, `lastRemoteHash`, `lastSyncedAt`, `lastExcelHash`, `lastExcelAt`, `rebaseline`) en `localStorage` brut `pkdx_drive_sync` (n'émet pas `pkdx-local-change`).

**Décision (`driveSmartSync`)** : compare hash local (`hashBackup`, indépendant de l'ordre des clés), hash distant et état de référence. « Vide » (`backupIsEmpty`) = aucune donnée hors `DRIVE_STRUCTURAL_KEYS` (`catalog_overrides`, `box_group_overrides`, `custom_marques`).

| Situation | Action |
|---|---|
| Aucun `pokedex.json` | Envoi (création) + premier Excel immédiat |
| Hashes égaux, ou aucun côté changé | Rien (état de référence mis à jour) |
| Seul le Drive a changé, ou appareil vide jamais synchronisé face à un Drive rempli | Récupération (`applyImportedObject`) puis rechargement |
| Seul l'appareil a changé | Envoi |
| Appareil vidé face à un Drive rempli | Jamais d'envoi → conflit |
| Les deux ont changé, ou appareil jamais synchronisé avec des données | Conflit : `DriveConflictModal` (Utiliser Google Drive / Garder cet appareil / Annuler). En automatique : signalé seulement (⚠️), synchro auto suspendue jusqu'au choix |

Après une récupération, le hash local de référence est recalculé à la synchro suivant le rechargement (`rebaseline` — la reconstruction du catalogue peut normaliser le contenu) ; l'Excel n'est pas redéposé.

**Déclencheurs** (`driveStart`, jamais hors ligne, pendant un conflit ou un rechargement) : démarrage (+1,5 s, puis rattrapage Excel) ; écriture d'une clé `ALL_KEYS` → envoi 30 s après la dernière (`DRIVE_AUTO_DELAY_MS`, sans appel réseau si le hash n'a pas changé) ; retour sur l'app (≥ 1 min d'écart, `DRIVE_RESUME_MIN_GAP_MS`) ; retour du réseau ; arrière-plan/`pagehide` → envoi immédiat du JSON en attente puis Excel.

**Excel** : dépôt automatique en arrière-plan si les données synchronisées ont changé depuis le dernier dépôt, au plus une fois par heure (`DRIVE_EXCEL_MIN_GAP_MS`) ; une erreur Excel n'invalide jamais la synchro JSON. Manuel : « Mettre à jour l'Excel », « Importer l'Excel » (flux d'import habituel — seul retour possible d'une modification faite dans l'Excel).

**Interface** : `DriveSyncButton` (☁️ estompé = non configuré → Paramètres ; 🔄 = en cours ; pastille verte = synchronisé, orange = envoi en attente ; ⚠️ = erreur/conflit ; appui = synchro immédiate). `DriveSyncSection` (Paramètres) : état, « Synchroniser maintenant », « Forcer récupération » (confirmation) / « Forcer sauvegarde », bloc Excel, URL `…/exec` + clé ; une nouvelle URL/clé remet l'état de référence à zéro ; « Déconnecter » n'efface que la configuration locale.

### Workflow de livraison

1. Modifier `index.html` directement (remplacements avec un contexte suffisant pour être uniques).
2. Extraire le bloc `<script type="text/babel" data-presets="react">` et le valider avec **`ts.transpileModule`** (JSX React) **et** **`Babel.transform(code, { presets: [["react", { runtime: "classic" }]] })`**. Le bloc `window.DATA` n'a pas besoin de validation Babel ; s'il est modifié, vérifier qu'il reste un JSON strictement valide.
3. Zone touchée : supprimer le code rendu inutile, réutiliser les éléments de §6.
4. Mettre à jour `APP_VERSION` (`année.mois.jour.heure.minute`, heure réelle, 24 h) et, si l'app shell change, `CACHE_VERSION` de `sw.js`.
5. Livrer le fichier complet nommé `index.html`, plus `sw.js` et/ou `google-apps-script.gs` s'ils ont changé. Le dépôt GitHub est mis à jour par l'utilisateur lui-même (pas de push).
6. Ne modifier cette documentation que sur demande explicite.

## 11. PWA — installabilité & hors-ligne

- `manifest.json` + `<link rel="manifest">`, `<meta name="theme-color">` ; icônes `icons/` (192/512 "any" et "maskable").
- `sw.js` : met en cache l'app shell (`APP_SHELL` : `index.html`, manifest, icônes, CDN React/ReactDOM/Babel/XLSX), stratégie cache-first avec revalidation réseau en arrière-plan ; le relais Apps Script (`script.google.com`, et `script.googleusercontent.com` où la réponse est servie après redirection) et `pokeapi.co` jamais interceptés.
- Chemins **relatifs** partout (`./…`) : le site est servi depuis un sous-chemin GitHub Pages.
- **`CACHE_VERSION`** à synchroniser avec `APP_VERSION` à chaque livraison touchant l'app shell — c'est ce qui invalide l'ancien cache.
- Installation : Chrome PC (icône de la barre d'adresse ou ⋮ → Installer) ; Samsung Internet (⋮ → Ajouter à l'écran d'accueil).
