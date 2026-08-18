# Intégration Home Assistant — FleetUpdate-Hub

Ce guide explique comment connecter votre instance **Home Assistant** (Home Assistant OS, Supervised ou Container) à FleetUpdate-Hub.

---

## 1. Génération du Jeton d'Accès Longue Durée (LLAT)

1. Connectez-vous à votre interface Home Assistant (généralement `http://homeassistant.local:8123` ou `http://<IP_HA>:8123`).
2. Cliquez sur votre **Profil utilisateur** (en bas à gauche de la barre latérale).
3. Faites défiler jusqu'à la section **« Jetons d'accès longue durée »** (Long-Lived Access Tokens).
4. Cliquez sur **Créer un jeton** :
   - Nom : `FleetUpdate-Hub`
   - Copiez le jeton généré (`eyJhbGciOi...`).

---

## 2. Configuration dans FleetUpdate-Hub

Dans l'interface FleetUpdate-Hub, ajoutez un nouvel hôte :

- **Nom** : `Home Assistant Production`
- **Type** : `HOME_ASSISTANT`
- **URL Endpoint** : `http://192.168.1.100:8123` (ou `https://` si SSL/Nabu Casa configuré)
- **Jeton d’accès (Access Token)** : Collez votre jeton généré à l'étape 1.
- **Entity ID Cible (Optionnel)** : 
  - Laisser vide pour mettre à jour automatiquement l'ensemble des composants natifs en attente (Core, OS, Supervisor, Add-ons, HACS).
  - Ou cibler une entité spécifique (ex: `update.home_assistant_core_update`).

---

## 3. Fonctionnalités Gérées par l'Adaptateur

- **Filtrage Intelligent des Entités** :
  - Distingue les composants natifs Home Assistant (`Core`, `OS`, `Supervisor`, `Add-ons`, `HACS`) des capteurs de conteneurs Docker externes (WUD / What's Up Docker / Portainer).
- **Sauvegarde Automatique Pré-mise à jour** :
  - Déclenche un backup natif Supervisor avant toute mise à niveau si supporté.
- **Détection des Redémarrages Requis** :
  - Détecte si la mise à jour concerne Core ou OS nécessitant un cycle de redémarrage.
