// Fonts are bundled, not fetched: the app is an offline PWA and nothing may
// depend on a CDN. Latin subsets cover Spanish. See docs/DESIGN.md.
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'

import './ui/styles.css'
import './ui/app'

// Take the shell offline. A new build replaces the old one on the next
// launch; the game itself lives in localStorage and survives either way.
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })
