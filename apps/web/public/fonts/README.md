# Self-hosted font assets

- `spoqa/`: Spoqa Han Sans Neo subset `woff2` files from `SpoqaHanSansNeo_all.zip`.
- `space-grotesk/`: Space Grotesk `woff2` files downloaded from Google Fonts for local hosting.
- `jetbrains-mono/`: JetBrains Mono `woff2` files downloaded from Google Fonts for local hosting.

The app references these files through local `@font-face` rules in `apps/web/app/globals.css`.
Do not add runtime Google Fonts imports for this redesign.
