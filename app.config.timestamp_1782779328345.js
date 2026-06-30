// app.config.ts
import { defineConfig } from "@tanstack/react-start/config";
var app_config_default = defineConfig({
  nitro: {
    preset: "vercel"
  }
});
export {
  app_config_default as default
};
