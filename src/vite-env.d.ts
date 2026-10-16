/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_TOKEN?: string;
  readonly VITE_APRYSE_LICENSE_KEY?: string;
  readonly VITE_CACHE_LIMIT_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
