import { defineConfig } from 'vite';

// GitHub Pages ではリポジトリ名がサブパスになるため、CI から BASE_PATH を渡す。
// ローカル開発・テストでは従来どおり '/' を使う。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
