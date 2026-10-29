import {defineConfig} from 'vite';
export default defineConfig({base:process.env.PAGES_BASE||'./',build:{outDir:'dist'},server:{host:'127.0.0.1',port:3000}});
