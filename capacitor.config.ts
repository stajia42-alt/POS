import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mx.aviles.pos',
  appName: 'AVILES POS',
  webDir: 'dist',
  android: { allowMixedContent: false, backgroundColor: '#f3f4f3' },
  plugins: { CapacitorSQLite: { androidIsEncryption: false } },
};
export default config;
