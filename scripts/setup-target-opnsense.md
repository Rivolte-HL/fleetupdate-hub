# Configuration d'OPNsense pour FleetUpdate-Hub (Principe du Moindre Privilège)

Pour permettre à FleetUpdate-Hub d'interroger et de déclencher les mises à jour sans exposer les privilèges super-administrateur :

## 1. Création du Groupe Restreint
1. Rendez-vous dans l'interface Web d'OPNsense : **System** $\rightarrow$ **Access** $\rightarrow$ **Groups**.
2. Cliquez sur **+** pour ajouter un nouveau groupe :
   - **Group name** : `FleetUpdate-Admins`
   - **Description** : `Compte de service API FleetUpdate-Hub`
3. Dans la section **Assigned Privileges**, cochez simplement le privilège suivant (utilisez la barre de recherche du menu déroulant) :
   - **`System: Firmware`** *(Ce droit unique débloque l'accès complet à l'API de mise à jour `/api/core/firmware/*` : vérification, statut, déclenchement et logs)*
   - *(Optionnel)* **`Diagnostics: Reboot`** *(Si vous souhaitez autoriser le redémarrage automatique du pare-feu après mise à niveau)*
   - *(Optionnel)* **`System: Information`** ou **`GUI: Dashboard`** *(Pour la consultation de l'état système global)*
4. Cliquez sur **Save**.

## 2. Création de l'Utilisateur API
1. Rendez-vous dans **System** $\rightarrow$ **Access** $\rightarrow$ **Users**.
2. Cliquez sur **+** :
   - **Username** : `fleetupdate-svc`
   - **Password** : (Générez un mot de passe fort temporaire)
   - **Member of** : Cochez `FleetUpdate-Admins`
3. Cliquez sur **Save**.

## 3. Génération de la Paire Clé API / Secret
1. Toujours dans la fiche utilisateur `fleetupdate-svc`, descendez à la section **API Keys**.
2. Cliquez sur le bouton **+** (Create API key).
3. Votre navigateur télécharge automatiquement un fichier `API_KEY.txt` contenant :
   ```ini
   key=xxxxxxxxxxxxxxxxxxxx
   secret=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
   ```
4. Renseignez cette clé (`key`) et ce secret (`secret`) dans le coffre-fort d'identifiants de **FleetUpdate-Hub**.
