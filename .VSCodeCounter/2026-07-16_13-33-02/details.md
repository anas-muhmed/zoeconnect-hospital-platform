# Details

Date : 2026-07-16 13:33:02

Directory d:\\HDSP_HYBRID\\vendor-portal

Total : 62 files,  14391 codes, 360 comments, 871 blanks, all 15622 lines

[Summary](results.md) / Details / [Diff Summary](diff.md) / [Diff Details](diff-details.md)

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [vendor-portal/SETUP.md](/vendor-portal/SETUP.md) | Markdown | 82 | 0 | 35 | 117 |
| [vendor-portal/backend/Dockerfile](/vendor-portal/backend/Dockerfile) | Docker | 13 | 0 | 2 | 15 |
| [vendor-portal/backend/package-lock.json](/vendor-portal/backend/package-lock.json) | JSON | 5,888 | 0 | 1 | 5,889 |
| [vendor-portal/backend/package.json](/vendor-portal/backend/package.json) | JSON | 42 | 0 | 1 | 43 |
| [vendor-portal/backend/src/app.module.ts](/vendor-portal/backend/src/app.module.ts) | TypeScript | 33 | 0 | 2 | 35 |
| [vendor-portal/backend/src/config/database.config.ts](/vendor-portal/backend/src/config/database.config.ts) | TypeScript | 23 | 0 | 3 | 26 |
| [vendor-portal/backend/src/database/migrations/1783325049767-RenameWebhookSecret.ts](/vendor-portal/backend/src/database/migrations/1783325049767-RenameWebhookSecret.ts) | TypeScript | 10 | 0 | 5 | 15 |
| [vendor-portal/backend/src/database/migrations/1783341244304-AddInstanceSecretToHospital.ts](/vendor-portal/backend/src/database/migrations/1783341244304-AddInstanceSecretToHospital.ts) | TypeScript | 9 | 0 | 5 | 14 |
| [vendor-portal/backend/src/database/migrations/1783347106019-CreateHospitalSettings.ts](/vendor-portal/backend/src/database/migrations/1783347106019-CreateHospitalSettings.ts) | TypeScript | 14 | 0 | 5 | 19 |
| [vendor-portal/backend/src/main.ts](/vendor-portal/backend/src/main.ts) | TypeScript | 27 | 0 | 7 | 34 |
| [vendor-portal/backend/src/modules/auth/auth.controller.ts](/vendor-portal/backend/src/modules/auth/auth.controller.ts) | TypeScript | 31 | 9 | 6 | 46 |
| [vendor-portal/backend/src/modules/auth/auth.module.ts](/vendor-portal/backend/src/modules/auth/auth.module.ts) | TypeScript | 22 | 0 | 2 | 24 |
| [vendor-portal/backend/src/modules/auth/auth.service.ts](/vendor-portal/backend/src/modules/auth/auth.service.ts) | TypeScript | 92 | 13 | 17 | 122 |
| [vendor-portal/backend/src/modules/auth/decorators/public.decorator.ts](/vendor-portal/backend/src/modules/auth/decorators/public.decorator.ts) | TypeScript | 3 | 0 | 1 | 4 |
| [vendor-portal/backend/src/modules/auth/entities/vendor-user.entity.ts](/vendor-portal/backend/src/modules/auth/entities/vendor-user.entity.ts) | TypeScript | 26 | 2 | 11 | 39 |
| [vendor-portal/backend/src/modules/auth/guards/jwt-auth.guard.ts](/vendor-portal/backend/src/modules/auth/guards/jwt-auth.guard.ts) | TypeScript | 19 | 0 | 4 | 23 |
| [vendor-portal/backend/src/modules/auth/strategies/jwt.strategy.ts](/vendor-portal/backend/src/modules/auth/strategies/jwt.strategy.ts) | TypeScript | 19 | 0 | 3 | 22 |
| [vendor-portal/backend/src/modules/hospitals/entities/hdsp-user.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/hdsp-user.entity.ts) | TypeScript | 31 | 6 | 12 | 49 |
| [vendor-portal/backend/src/modules/hospitals/entities/his-config-template.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/his-config-template.entity.ts) | TypeScript | 19 | 9 | 7 | 35 |
| [vendor-portal/backend/src/modules/hospitals/entities/his-schema-config.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/his-schema-config.entity.ts) | TypeScript | 32 | 18 | 12 | 62 |
| [vendor-portal/backend/src/modules/hospitals/entities/hospital-setting.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/hospital-setting.entity.ts) | TypeScript | 26 | 8 | 9 | 43 |
| [vendor-portal/backend/src/modules/hospitals/entities/hospital.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/hospital.entity.ts) | TypeScript | 47 | 0 | 20 | 67 |
| [vendor-portal/backend/src/modules/hospitals/entities/issued-license.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/issued-license.entity.ts) | TypeScript | 45 | 0 | 19 | 64 |
| [vendor-portal/backend/src/modules/hospitals/entities/license-request.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/license-request.entity.ts) | TypeScript | 40 | 0 | 17 | 57 |
| [vendor-portal/backend/src/modules/hospitals/entities/password-reset.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/password-reset.entity.ts) | TypeScript | 35 | 0 | 14 | 49 |
| [vendor-portal/backend/src/modules/hospitals/entities/revocation-event.entity.ts](/vendor-portal/backend/src/modules/hospitals/entities/revocation-event.entity.ts) | TypeScript | 35 | 0 | 14 | 49 |
| [vendor-portal/backend/src/modules/hospitals/his-schema-defaults.ts](/vendor-portal/backend/src/modules/hospitals/his-schema-defaults.ts) | TypeScript | 179 | 41 | 24 | 244 |
| [vendor-portal/backend/src/modules/hospitals/hospitals.controller.ts](/vendor-portal/backend/src/modules/hospitals/hospitals.controller.ts) | TypeScript | 249 | 53 | 47 | 349 |
| [vendor-portal/backend/src/modules/hospitals/hospitals.module.ts](/vendor-portal/backend/src/modules/hospitals/hospitals.module.ts) | TypeScript | 26 | 0 | 3 | 29 |
| [vendor-portal/backend/src/modules/hospitals/hospitals.service.ts](/vendor-portal/backend/src/modules/hospitals/hospitals.service.ts) | TypeScript | 582 | 69 | 115 | 766 |
| [vendor-portal/backend/src/modules/signing/signing.service.ts](/vendor-portal/backend/src/modules/signing/signing.service.ts) | TypeScript | 59 | 2 | 12 | 73 |
| [vendor-portal/backend/src/modules/vendor-gateway/vendor-gateway.controller.ts](/vendor-portal/backend/src/modules/vendor-gateway/vendor-gateway.controller.ts) | TypeScript | 89 | 1 | 13 | 103 |
| [vendor-portal/backend/src/modules/vendor-gateway/vendor-gateway.module.ts](/vendor-portal/backend/src/modules/vendor-gateway/vendor-gateway.module.ts) | TypeScript | 15 | 0 | 3 | 18 |
| [vendor-portal/backend/src/modules/vendor-gateway/vendor-gateway.service.ts](/vendor-portal/backend/src/modules/vendor-gateway/vendor-gateway.service.ts) | TypeScript | 135 | 1 | 29 | 165 |
| [vendor-portal/backend/src/modules/webhook/webhook.service.ts](/vendor-portal/backend/src/modules/webhook/webhook.service.ts) | TypeScript | 65 | 0 | 10 | 75 |
| [vendor-portal/backend/tsconfig.json](/vendor-portal/backend/tsconfig.json) | JSON with Comments | 18 | 0 | 1 | 19 |
| [vendor-portal/docker-compose.yml](/vendor-portal/docker-compose.yml) | YAML | 62 | 0 | 5 | 67 |
| [vendor-portal/frontend/Dockerfile](/vendor-portal/frontend/Dockerfile) | Docker | 14 | 0 | 2 | 16 |
| [vendor-portal/frontend/next-env.d.ts](/vendor-portal/frontend/next-env.d.ts) | TypeScript | 0 | 4 | 2 | 6 |
| [vendor-portal/frontend/next.config.js](/vendor-portal/frontend/next.config.js) | JavaScript | 5 | 1 | 1 | 7 |
| [vendor-portal/frontend/package-lock.json](/vendor-portal/frontend/package-lock.json) | JSON | 1,819 | 0 | 1 | 1,820 |
| [vendor-portal/frontend/package.json](/vendor-portal/frontend/package.json) | JSON | 29 | 0 | 1 | 30 |
| [vendor-portal/frontend/src/app/(vendor)/history/page.tsx](/vendor-portal/frontend/src/app/(vendor)/history/page.tsx) | TypeScript JSX | 159 | 0 | 8 | 167 |
| [vendor-portal/frontend/src/app/(vendor)/hospitals/\[id\]/hdsp-users/page.tsx](/vendor-portal/frontend/src/app/(vendor)/hospitals/%5Bid%5D/hdsp-users/page.tsx) | TypeScript JSX | 437 | 14 | 32 | 483 |
| [vendor-portal/frontend/src/app/(vendor)/hospitals/\[id\]/his-config/page.tsx](/vendor-portal/frontend/src/app/(vendor)/hospitals/%5Bid%5D/his-config/page.tsx) | TypeScript JSX | 1,168 | 36 | 73 | 1,277 |
| [vendor-portal/frontend/src/app/(vendor)/hospitals/\[id\]/security/PasswordResetRequests.tsx](/vendor-portal/frontend/src/app/(vendor)/hospitals/%5Bid%5D/security/PasswordResetRequests.tsx) | TypeScript JSX | 314 | 1 | 19 | 334 |
| [vendor-portal/frontend/src/app/(vendor)/hospitals/\[id\]/security/page.tsx](/vendor-portal/frontend/src/app/(vendor)/hospitals/%5Bid%5D/security/page.tsx) | TypeScript JSX | 239 | 2 | 18 | 259 |
| [vendor-portal/frontend/src/app/(vendor)/hospitals/\[id\]/settings/page.tsx](/vendor-portal/frontend/src/app/(vendor)/hospitals/%5Bid%5D/settings/page.tsx) | TypeScript JSX | 133 | 0 | 15 | 148 |
| [vendor-portal/frontend/src/app/(vendor)/hospitals/page.tsx](/vendor-portal/frontend/src/app/(vendor)/hospitals/page.tsx) | TypeScript JSX | 472 | 22 | 33 | 527 |
| [vendor-portal/frontend/src/app/(vendor)/layout.tsx](/vendor-portal/frontend/src/app/(vendor)/layout.tsx) | TypeScript JSX | 118 | 2 | 14 | 134 |
| [vendor-portal/frontend/src/app/(vendor)/licenses/page.tsx](/vendor-portal/frontend/src/app/(vendor)/licenses/page.tsx) | TypeScript JSX | 125 | 0 | 9 | 134 |
| [vendor-portal/frontend/src/app/(vendor)/logs/page.tsx](/vendor-portal/frontend/src/app/(vendor)/logs/page.tsx) | TypeScript JSX | 147 | 0 | 7 | 154 |
| [vendor-portal/frontend/src/app/(vendor)/requests/\[id\]/page.tsx](/vendor-portal/frontend/src/app/(vendor)/requests/%5Bid%5D/page.tsx) | TypeScript JSX | 309 | 21 | 27 | 357 |
| [vendor-portal/frontend/src/app/(vendor)/requests/page.tsx](/vendor-portal/frontend/src/app/(vendor)/requests/page.tsx) | TypeScript JSX | 129 | 0 | 8 | 137 |
| [vendor-portal/frontend/src/app/forgot-password/page.tsx](/vendor-portal/frontend/src/app/forgot-password/page.tsx) | TypeScript JSX | 119 | 1 | 13 | 133 |
| [vendor-portal/frontend/src/app/layout.tsx](/vendor-portal/frontend/src/app/layout.tsx) | TypeScript JSX | 34 | 0 | 5 | 39 |
| [vendor-portal/frontend/src/app/login/page.tsx](/vendor-portal/frontend/src/app/login/page.tsx) | TypeScript JSX | 71 | 0 | 8 | 79 |
| [vendor-portal/frontend/src/app/page.tsx](/vendor-portal/frontend/src/app/page.tsx) | TypeScript JSX | 2 | 0 | 1 | 3 |
| [vendor-portal/frontend/src/app/reset-password/page.tsx](/vendor-portal/frontend/src/app/reset-password/page.tsx) | TypeScript JSX | 123 | 0 | 14 | 137 |
| [vendor-portal/frontend/src/lib/api/client.ts](/vendor-portal/frontend/src/lib/api/client.ts) | TypeScript | 22 | 2 | 4 | 28 |
| [vendor-portal/frontend/src/lib/api/vendor.api.ts](/vendor-portal/frontend/src/lib/api/vendor.api.ts) | TypeScript | 224 | 22 | 59 | 305 |
| [vendor-portal/frontend/tsconfig.json](/vendor-portal/frontend/tsconfig.json) | JSON with Comments | 37 | 0 | 1 | 38 |

[Summary](results.md) / Details / [Diff Summary](diff.md) / [Diff Details](diff-details.md)