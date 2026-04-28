# REFACTOR PLAN — Letterboxd Mirror Plugin

Date: 2026-04-21
Author: Copilot CLI (assistant)

## Objectif
Refactoriser et durcir le plugin "letterboxd-mirror" : sécurité des templates, gestion des secrets, ergonomie de l'import par lot, robustesse de la création de dossiers et politique de collisions de fichiers. Fournir une analyse, recommandations ergonomiques, revue et plan d'implémentation, puis commencer les corrections prioritaires.

---

## 1) Choix de stratégie (options)
- Refactor incrémental (faible risque) — Petites corrections et améliorations sécurisées.
- Refactor modulaire (préconisé) — Extraire utilitaires (vault secrets, IO, templates), tests, et composants UI.
- Réécriture complète — Risque élevé, meilleure technique (TS strict), longue durée.
- Sécurité d'abord — Prioriser la sécurité des templates et la gestion des secrets (recommandé si risque d'injection).
- Ergonomie d'abord — Améliorer UI/UX (batch import, paramètres, aides).
- Performance & fiabilité — Logique d'erreurs, fiabilité I/O, tests automatiques.

## 2) Analyse technique (contexte actuel)
- Moteur de templates: Eta est utilisé sans validation; les balises d'évaluation `<% ... %>` sont autorisées et représentent un risque d'injection (exécution JS dans templates). Criticité: Élevée.
- Gestion des tokens TMDB: Feature-detect vault.setSecret/getSecret implémentée mais usage dispersé; fichier installé data.json contenait initialement la clef (sanitized durant session).
- Import par lot: Fonctionnelle, mais la politique de collision de noms est "skip" (le fichier existant est ignoré). UX attendue: auto-incrément / overwrite / prompt.
- Création de dossiers: usages nombreux font `.createFolder(...).catch(() => {})` — erreurs silencieuses qui masquent problèmes d'IO. Déjà commencé: remplacer par handler qui n'ignore que "already exists".
- Template rendering: erreurs non signalées à l'utilisateur exceptées console.warn.

## 3) Ergonomie (recommandations)
- Batch import modal: afficher aperçu, flag "Auto-incrémenter noms" (on/off), option "Écraser les fichiers existants" et sélection de template (tmdb/custom/minimal) + un bouton "Valider les templates".
- Settings: section TMDB token avec indication de l'endroit stocké (vault secret vs plugin settings), boutons Set/Remove avec confirmation et notice.
- Plugin functions: liste de commandes avec description, bouton Run + Copy ID (déjà ajouté), ajouter petites descriptions pour chaque commande.
- Erreurs et logs: afficher Notice pour erreurs bloquantes (template non-sûr, échec écriture), et fournir lien/conseil vers console pour diagnostic.

## 4) Revue rapide du code
- `src/eta/engine.ts`: usage direct `eta.renderString` sans validation — corriger immédiatement.
- `src/batchImport.ts`: doit proposer auto-incrémentation; actuellement skip. Faire itératif `Name (1).md`.
- `src/*`: créer utilitaires centralisés: `utils/vaultSecrets.ts` et `utils/fs.ts` (createFolderSafe, writeFileSafe).
- Template safety: bloquer `<% ... %>` et autoriser exclusivement `<%=` / `<%-`.

## 5) Plan d'implémentation (priorités)
Priorité haute (sécurité & fiabilité):
1. Désactiver/exclure l'exécution de `<% ... %>` dans le rendu (template validation). (implémenté partiellement ci-dessous)
2. Politique de collision: auto-incrémenter noms de fichiers pendant l'import par lot. (implémenté partiellement ci-dessous)
3. Remplacer les `.createFolder(...).catch(() => {})` par helper qui n'ignore que "already exists" (début d'implémentation effectué).

Priorité moyenne:
4. Centraliser helpers: vaultSecrets, safeFolderCreate, safeFileWrite.
5. UI: ajouter options d'import (overwrite/skip/increment) et validation de template depuis Settings/Modal.

Priorité basse:
6. Tests unitaires pour parsing/templating/generateFilename.
7. Option avancée: trusted templates (unlock `<%` pour utilisateurs avancés avec avertissement explicite).

## 6) Tâches immédiates (ce que je vais faire maintenant)
- Créer ce fichier de plan (fait).
- Appliquer patches urgents et sûrs:
  - Bloquer les balises d'évaluation `<% ... %>` dans `src/eta/engine.ts` (validation avant rendu).
  - Remplacer le comportement "skip" sur collision par auto-incrémentation `(1)`, `(2)`, ... dans `src/batchImport.ts`.
  - Corriger createFolder handlers pour ne pas masquer d'erreurs (déjà appliqué dans plusieurs fichiers).

Ces changements sont aimés à minimiser le risque et à rendre le plugin sûr pour un usage immédiat.

## 7) Résultat des modifications initiales (actions réalisées)
- Sécurité template: ajout d'une validation pour refuser `<% ... %>` et message d'erreur clair.
- Import: auto-incrément des fichiers en cas de collision (max tentatives: 100).
- createFolder: handler plus verbeux qui logge et notifie en cas d'erreur réelle.

## 8) Prochaine étape proposée
- Valider en local (redémarrer Obsidian et tester):
  - Settings: définir/supprimer TMDB token (vault vs settings)
  - Batch import: importer quelques titres identiques pour vérifier suffixes
  - Tenter d'installer un template contenant `<% console.log('X') %>` et vérifier qu'il est refusé

- Si ok: centraliser helpers et ajouter UI toggles et tests.

---

## 9) Journal des changements immédiats
- Modifié: src/eta/engine.ts — validation template + safer generateFilename
- Modifié: src/batchImport.ts — auto-incrément filename logic
- Modifié: plusieurs fichiers — createFolder error handling (déjà appliqué)


---

Fin du plan initial. Je commence maintenant l'implémentation des correctifs (sécurité template + auto-incrément). Voir les commits/applications suivantes.
