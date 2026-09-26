# FleetUpdate-Hub Guidelines

Consultez les règles d'or et de sécurité dans [.agents/rules/fleetupdate-rules.md](file:///.agents/rules/fleetupdate-rules.md).

## Directives Clés pour l'Assistant
- **Sécurité** : Ne divulguez jamais de secrets ou clés privées dans les logs ou le chat.
- **Cryptographie** : Vérifiez toujours l'implémentation AES-256-GCM (IV aléatoire 96 bits, Auth Tag 128 bits, timingSafeEqual).
- **Adaptateurs** : Respectez scrupuleusement le contrat `BaseServiceAdapter`.
- **Pipeline** : Aucune mise à jour sans sauvegarde/snapshot préalable réussie. Rollback automatique immédiat si le healthcheck échoue.
- **Typage** : TypeScript strict sans `any`. Validation Zod sur chaque endpoint.
