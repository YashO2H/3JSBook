// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     host: '0.0.0.0',        // So it can be accessed from other devices
//     port: 3000,
//     headers: {
//       'Access-Control-Allow-Origin': '*',
//       'X-Frame-Options': 'ALLOWALL',
//     },
//   },
// })


// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    // library mode!
    lib: {
      entry: path.resolve(__dirname, 'src/components/MountBookViewer.jsx'), // your mountBookViewer entry
      name: 'bookViewer',                             // global var name if UMD (you’re only doing ESM though)
      formats: ['es'],                                // output only ES module
      fileName: (format) => `bookViewer.bundle.${format}.js`
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'three', '@react-three/fiber'],
    },
    outDir: 'dist'
  },
  server: {
    cors: true,
  }
})

