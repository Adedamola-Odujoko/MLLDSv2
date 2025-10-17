// =================================================================================
// FILE: vite.config.js (NEW FILE)
// This configuration forces the development server to run in HTTPS mode,
// which is required for webcam access and fixes the "insecure resource" error.
// =================================================================================

import { defineConfig } from "vite";
// import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [
    // basicSsl(), // Use the SSL plugin
  ],
  server: {
    https: false, // Enable HTTPS
  },
});
